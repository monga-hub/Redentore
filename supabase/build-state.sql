BEGIN;
-- Redentore-only conditional save boundary. Apply before publishing the build editor.
-- Existing hub saves/RLS and other games are unchanged. No rewards or XP are granted here.
create table if not exists public.redentore_build_guard (
 user_id uuid not null references auth.users(id) on delete cascade,
 hero text not null check(hero in ('risorto','bortolo','fosca','tizian','zanetto')),
 token uuid not null default gen_random_uuid(),
 retired text[] not null default '{}',
 primary key(user_id,hero)
);
alter table public.redentore_build_guard enable row level security;
revoke all on public.redentore_build_guard from anon,authenticated;

-- A security-definer helper is needed only to read the guard, not to bypass caller identity.
create or replace function public.redentore_build_is_guarded(p_who uuid,p_hero text) returns boolean
language sql security definer set search_path=public,pg_temp as $$select exists(select 1 from public.redentore_build_guard g where p_who=auth.uid() and g.user_id=p_who and g.hero=p_hero)$$;
revoke all on function public.redentore_build_is_guarded(uuid,text) from public;
grant execute on function public.redentore_build_is_guarded(uuid,text) to authenticated;
-- The trigger itself must execute as the invoker so it distinguishes direct writes from our owner-only RPC.
create or replace function public.redentore_build_direct_guard() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if current_user in ('anon','authenticated') and
   (case when TG_OP='DELETE' then OLD.game_id else NEW.game_id end)='redentore' and
   (public.redentore_build_is_guarded(case when TG_OP='DELETE' then OLD.user_id else NEW.user_id end,case when TG_OP='DELETE' then OLD.slot else NEW.slot end)
    or (case when TG_OP='DELETE' then OLD.data else NEW.data end #> '{build,edit}') is not null)
 then raise exception 'Usa il salvataggio condizionale della build di Redentore.'; end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
drop trigger if exists redentore_build_guard on public.saves;
create trigger redentore_build_guard before insert or update or delete on public.saves for each row execute function public.redentore_build_direct_guard();

create or replace function public.redentore_build_save(op text,hero text,expected uuid default null,payload jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=auth.uid(); g public.redentore_build_guard; oldstate jsonb; b jsonb; oldedit jsonb; newedit jsonb; points integer; banked integer; lineage text; busy boolean:=false;
begin
 if who is null then raise exception 'Accedi al tuo account.'; end if;
 if hero not in ('risorto','bortolo','fosca','tizian','zanetto') or op not in ('load','save','reset') then raise exception 'Operazione non valida.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text||':redentore:'||hero,0));
 select * into g from public.redentore_build_guard where user_id=who and redentore_build_guard.hero=redentore_build_save.hero for update;
 select data into oldstate from public.saves where user_id=who and game_id='redentore' and slot=hero for update;
 if to_regclass('public.coop_beta_room') is not null then
  execute 'select exists(select 1 from public.coop_beta_room where phase in (''lobby'',''fight'') and deadline>now() and host_seen>now()-interval ''12 seconds'' and $1 in (host_id,guest_id))' into busy using who;
 end if;
 if op='load' then return jsonb_build_object('token',g.token,'state',oldstate,'busy',busy); end if;
 if g.token is distinct from expected then raise exception 'Conflitto di sincronizzazione: copia locale conservata.'; end if;
 if busy and (op='reset' or oldstate#>>'{build,edit,id}' is distinct from payload#>>'{build,edit,id}') then raise exception 'Non puoi modificare la build durante una sessione multiplayer.'; end if;
 if op='reset' then
  lineage:=oldstate#>>'{build,edit,lineage}';
  insert into public.redentore_build_guard(user_id,hero,retired) values(who,hero,case when lineage is null then '{}'::text[] else array[lineage] end)
  on conflict on constraint redentore_build_guard_pkey do update set token=gen_random_uuid(),retired=redentore_build_guard.retired||case when lineage is null then '{}'::text[] else array[lineage] end;
  delete from public.saves where user_id=who and game_id='redentore' and slot=hero;
  return jsonb_build_object('token',(select token from public.redentore_build_guard where user_id=who and redentore_build_guard.hero=redentore_build_save.hero),'state',null);
 end if;
 if payload->>'hero' is distinct from hero or payload->>'v' is distinct from '1' or jsonb_typeof(payload->'quest') is distinct from 'object' then raise exception 'Salvataggio non valido.'; end if;
 b:=payload->'build';newedit:=b->'edit';oldedit:=oldstate#>'{build,edit}';
 if newedit is not null then
  if jsonb_typeof(newedit)<>'object' or coalesce(length(newedit->>'id'),0) not between 1 and 80 or coalesce(length(newedit->>'lineage'),0) not between 1 and 80 or jsonb_typeof(newedit->'ancestors')<>'array' or jsonb_array_length(newedit->'ancestors')>256 then raise exception 'Revisione build non valida.'; end if;
  if (newedit->>'lineage')=any(coalesce(g.retired,'{}')) then raise exception 'Questa partita è stata ricominciata. Copia locale conservata.'; end if;
  if oldedit is not null then
   if (b->>'xp')::numeric < (oldstate#>>'{build,xp}')::numeric then raise exception 'Il salvataggio non può perdere esperienza.'; end if;
   if exists(select 1 from jsonb_each(oldstate->'quest') f where f.value='true'::jsonb and payload->'quest'->f.key is distinct from 'true'::jsonb)
     or not coalesce(payload#>'{quest,gates}','[]') @> coalesce(oldstate#>'{quest,gates}','[]')
     or not coalesce(payload#>'{quest,done}','[]') @> coalesce(oldstate#>'{quest,done}','[]')
     or not coalesce(payload#>'{side,done}','[]') @> coalesce(oldstate#>'{side,done}','[]') then raise exception 'Il salvataggio non può perdere missioni completate.'; end if;
   if newedit->>'lineage' is distinct from oldedit->>'lineage' then raise exception 'Partita differente: ricomincia esplicitamente.'; end if;
   if newedit->>'id'=oldedit->>'id' then
    if b-'xp'-'lv'-'main'-'edit' is distinct from (oldstate->'build')-'xp'-'lv'-'main'-'edit' then raise exception 'Build modificata senza una nuova revisione.'; end if;
   elsif not (newedit->'ancestors' ? (oldedit->>'id')) then raise exception 'Build concorrenti: copia locale conservata.'; end if;
  end if;
  if jsonb_typeof(b->'picks') is distinct from 'array' or jsonb_typeof(b->'learned') is distinct from 'array' or jsonb_typeof(b->'xp') is distinct from 'number' or (b->>'xp')::numeric < 0 then raise exception 'Budget build non valido.'; end if;
  points:=floor((1+sqrt(1+0.4*(b->>'xp')::numeric))/2)::integer-1;
  banked:=coalesce((b->>'banked')::integer,0);
  if banked<0 or jsonb_array_length(b->'picks')+banked>points then raise exception 'Punti superiori ai livelli guadagnati.'; end if;
 elsif oldedit is not null or g.token is not null then raise exception 'Un vecchio client non può sostituire questa build.';
 end if;
 insert into public.redentore_build_guard(user_id,hero) values(who,hero) on conflict on constraint redentore_build_guard_pkey do update set token=gen_random_uuid();
 insert into public.saves(user_id,game_id,slot,data) values(who,'redentore',hero,payload) on conflict(user_id,game_id,slot) do update set data=excluded.data;
 return jsonb_build_object('token',(select token from public.redentore_build_guard where user_id=who and redentore_build_guard.hero=redentore_build_save.hero),'state',payload);
end $$;
revoke all on function public.redentore_build_save(text,text,uuid,jsonb) from public;
grant execute on function public.redentore_build_save(text,text,uuid,jsonb) to authenticated;
COMMIT;
