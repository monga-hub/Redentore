-- Arena only. Existing saves policies/grants remain unchanged.
-- Operator separately enables LOGIN with a strong password for coop_referee, never in source.
begin;
create role coop_referee nologin;
grant usage on schema public to coop_referee;
create table public.coop_matches (id uuid primary key, winners jsonb not null);
alter table public.coop_matches enable row level security;
revoke all on public.coop_matches from public,anon,authenticated,coop_referee;
create table public.coop_rewards (
  match uuid not null,
  user_id uuid not null references auth.users on delete cascade,
  hero text not null check(hero in ('risorto','bortolo','fosca','tizian','zanetto')),
  item text not null,
  created timestamptz not null default now(),
  claimed timestamptz,
  primary key(match,user_id),
  check(item ~ '^pezzo-(risorto|bortolo|fosca|tizian|zanetto)-3-leggendario-(testa|spalle|torso|mani|gambe|piedi)$'),
  check(item like 'pezzo-' || hero || '-3-leggendario-%')
);
alter table public.coop_rewards enable row level security;
revoke all on public.coop_rewards from public,anon,authenticated,coop_referee;
grant select on public.coop_rewards to authenticated;
create policy "arena: own rewards" on public.coop_rewards for select to authenticated using(user_id=(select auth.uid()));
-- Only the dedicated runtime can mint. A repeated match keeps the first pair/items.
create function public.coop_award(match_id uuid, winners jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare w jsonb;
begin
  if jsonb_typeof(winners)<>'array' or jsonb_array_length(winners) not between 1 and 2 then raise exception 'Invalid winners'; end if;
  insert into public.coop_matches values(match_id,winners) on conflict do nothing;
  if not found then return; end if;
  for w in select value from jsonb_array_elements(winners) loop
    insert into public.coop_rewards(match,user_id,hero,item) values(match_id,(w->>'user')::uuid,w->>'hero',w->>'item') on conflict do nothing;
  end loop;
end $$;
revoke all on function public.coop_award(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.coop_award(uuid,jsonb) to coop_referee;
-- A normal stale upload can race a claim after CloudSync has already read its old copy.
-- Preserve receipt delivery atomically at the existing save write boundary; no RLS changes.
create function public.coop_preserve_receipts() returns trigger
language plpgsql set search_path='' as $$
declare receipts jsonb; received jsonb; items jsonb; r jsonb; e jsonb; next_items jsonb; delivered boolean;
begin
  if new.game_id<>'redentore' or old.game_id<>'redentore' or new.user_id<>old.user_id or new.slot<>old.slot then return new; end if;
  if jsonb_typeof(old.data->'arenaRewards'->'receipts') is distinct from 'array' then return new; end if;
  receipts:=coalesce(new.data->'arenaRewards'->'receipts','[]'::jsonb);
  received:=coalesce(new.data->'arenaRewards'->'received','[]'::jsonb);
  items:=coalesce(new.data->'bag'->'items','[]'::jsonb);
  if jsonb_typeof(receipts)<>'array' or jsonb_typeof(received)<>'array' or jsonb_typeof(items)<>'array' then raise exception 'Metadati premio non validi'; end if;
  for r in select value from jsonb_array_elements(old.data->'arenaRewards'->'receipts') loop
    if r->>'item' like 'pezzo-'||new.slot||'-3-leggendario-%' and r->>'item' ~ '^pezzo-(risorto|bortolo|fosca|tizian|zanetto)-3-leggendario-(testa|spalle|torso|mani|gambe|piedi)$'
      and not exists(select 1 from jsonb_array_elements(receipts) v where v->>'id'=r->>'id') then receipts:=receipts||jsonb_build_array(r); end if;
  end loop;
  for r in select value from jsonb_array_elements(receipts) loop
    if jsonb_typeof(r)<>'object' or r->>'item' is null or r->>'id' is null or r->>'item' not like 'pezzo-'||new.slot||'-3-leggendario-%' or r->>'item' !~ '^pezzo-(risorto|bortolo|fosca|tizian|zanetto)-3-leggendario-(testa|spalle|torso|mani|gambe|piedi)$' then continue; end if;
    if received @> jsonb_build_array(r->>'id') then continue; end if;
    delivered:=false;next_items:='[]'::jsonb;
    for e in select value from jsonb_array_elements(items) loop
      if not delivered and e->>0=r->>'item' and (e->>1)::integer<20 then e:=jsonb_build_array(r->>'item',(e->>1)::integer+1);delivered:=true;end if;
      next_items:=next_items||jsonb_build_array(e);
    end loop;
    if not delivered and jsonb_array_length(items)<30 then next_items:=next_items||jsonb_build_array(jsonb_build_array(r->>'item',1));delivered:=true;end if;
    if delivered then items:=next_items;received:=received||jsonb_build_array(r->>'id');end if;
  end loop;
  new.data:=jsonb_set(new.data,'{arenaRewards}',jsonb_build_object('receipts',receipts,'received',received));
  new.data:=jsonb_set(new.data,'{bag}',jsonb_build_object('gold',coalesce(new.data->'bag'->'gold','0'::jsonb),'items',items));
  return new;
end $$;
revoke all on function public.coop_preserve_receipts() from public,anon,authenticated,coop_referee;
create trigger coop_preserve_receipts before update of data on public.saves for each row execute function public.coop_preserve_receipts();

-- Caller must synchronize solo first. expected_at prevents claiming over a newer cloud run.
-- Receipt and bag mutation commit together; no capacity -> receipt stays pending.
create function public.coop_claim(match_id uuid, expected_at double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.coop_rewards; s jsonb; items jsonb; elem jsonb; next_items jsonb:='[]'; stacked boolean:=false;
begin
  select * into r from public.coop_rewards where match=match_id and user_id=auth.uid() for update;
  if not found then raise exception 'Premio non trovato'; end if;
  select data into s from public.saves where user_id=auth.uid() and game_id='redentore' and slot=r.hero for update;
  if s is null or s->>'hero' is distinct from r.hero then raise exception 'Salvataggio eroe nel cloud mancante o non corrispondente'; end if;
  if coalesce(s->'arenaRewards'->'received','[]'::jsonb) @> jsonb_build_array(match_id::text) then
    return jsonb_build_object('already',true,'hero',r.hero,'save',s);
  end if;
  if coalesce((s->>'at')::double precision,0)<>expected_at then raise exception 'Salvataggio cambiato: sincronizza e riprova'; end if;
  items:=coalesce(s->'bag'->'items','[]'::jsonb);
  if jsonb_typeof(items)<>'array' then raise exception 'Borsa non valida'; end if;
  for elem in select value from jsonb_array_elements(items) loop
    if not stacked and elem->>0=r.item and (elem->>1)::integer<20 then
      elem:=jsonb_build_array(r.item,(elem->>1)::integer+1); stacked:=true;
    end if;
    next_items:=next_items || jsonb_build_array(elem);
  end loop;
  if not stacked then
    if jsonb_array_length(items)>=30 then raise exception 'Borsa piena: il premio resta custodito'; end if;
    next_items:=next_items || jsonb_build_array(jsonb_build_array(r.item,1));
  end if;
  s:=jsonb_set(s,'{bag}',jsonb_build_object('gold',coalesce(s->'bag'->'gold','0'::jsonb),'items',next_items));
  s:=jsonb_set(s,'{arenaRewards}',jsonb_build_object(
    'receipts',coalesce(s->'arenaRewards'->'receipts','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',match_id::text,'item',r.item)),
    'received',coalesce(s->'arenaRewards'->'received','[]'::jsonb)||jsonb_build_array(match_id::text)));
  s:=jsonb_set(s,'{at}',to_jsonb(extract(epoch from clock_timestamp())*1000));
  update public.saves set data=s where user_id=auth.uid() and game_id='redentore' and slot=r.hero returning data into s;
  update public.coop_rewards set claimed=now() where match=r.match and user_id=r.user_id;
  return jsonb_build_object('already',false,'hero',r.hero,'save',s);
end $$;
revoke all on function public.coop_claim(uuid,double precision) from public,anon;
grant execute on function public.coop_claim(uuid,double precision) to authenticated;
commit;
