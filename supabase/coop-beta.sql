-- EXPERIMENTAL HOST-CLIENT BETA ONLY. No rewards, referee credential, save writes or save-policy changes.
-- Apply once after preflight/review. One globally admitted active room.
begin;
create table public.coop_beta_room (
  singleton boolean primary key default true check(singleton),
  id uuid not null unique default gen_random_uuid(),
  invite uuid not null unique default gen_random_uuid(),
  epoch uuid not null default gen_random_uuid(),
  phase text not null default 'lobby' check(phase in ('lobby','fight','ended')),
  reason text not null default '',
  created timestamptz not null default now(),
  deadline timestamptz not null default now()+interval '10 minutes',
  host_id uuid not null references auth.users on delete cascade,
  guest_id uuid references auth.users on delete cascade,
  host_lease uuid not null,
  guest_lease uuid,
  host_seen timestamptz not null default now(),
  guest_seen timestamptz,
  host_ready boolean not null default false,
  guest_ready boolean not null default false,
  host_snapshot jsonb not null,
  guest_snapshot jsonb,
  host_bar jsonb,
  guest_bar jsonb,
  check(guest_id is null or guest_id<>host_id)
);
alter table public.coop_beta_room enable row level security;
revoke all on public.coop_beta_room from public,anon,authenticated;

create function public.coop_beta(op text, lease uuid, room uuid default null, invite uuid default null, hero text default null, payload jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); r public.coop_beta_room; saved jsonb; snap jsonb; mine integer; elem jsonb;
begin
  if who is null or lease is null then raise exception 'Accedi con il tuo account Mongames'; end if;
  if op is null or op not in ('create','join','poll','ready','equip','start','leave','finish') then raise exception 'Operazione arena non valida'; end if;
  if octet_length(coalesce(payload::text,''))>2048 then raise exception 'Richiesta troppo grande'; end if;
  perform pg_advisory_xact_lock(741270044); -- serializes create/join across all hosts
  select * into r from public.coop_beta_room where singleton for update;
  if found and (r.deadline<now() or r.host_seen<now()-interval '12 seconds' or (r.guest_id is not null and r.guest_seen<now()-interval '12 seconds')) then
    delete from public.coop_beta_room where singleton; r:=null;
  end if;
  if op in ('create','join') then
    if r.id is not null and who in (r.host_id,r.guest_id) then
      if (who=r.host_id and lease=r.host_lease) or (who=r.guest_id and lease=r.guest_lease) then
        -- Same tab lease resumes the existing identity, never allocates another slot.
        if r.phase='ended' then raise exception 'Partita terminata: lascia la stanza prima di riprovare'; end if;
      else raise exception 'Account già presente in un’altra scheda'; end if;
    else
      if op='create' and r.id is not null then raise exception 'Arena beta occupata: una sola stanza alla volta'; end if;
      if op='join' and (r.id is null or r.invite is distinct from invite or r.phase<>'lobby') then raise exception 'Invito scaduto, non valido o partita già iniziata'; end if;
      if op='join' and r.guest_id is not null then raise exception 'Stanza piena: massimo due giocatori'; end if;
      if hero is null or hero not in ('risorto','bortolo','fosca','tizian','zanetto') then raise exception 'Eroe non valido'; end if;
      select data into saved from public.saves where user_id=who and game_id='redentore' and slot=hero;
      if saved is null or saved->>'hero' is distinct from hero or jsonb_typeof(saved->'build'->'xp') is distinct from 'number' then raise exception 'Salva questo eroe nel cloud prima di entrare'; end if;
      if (saved->'build'->>'xp')::numeric not between 9300 and 10000000 or saved->'quest'->'boss3Dead' is distinct from 'true'::jsonb then raise exception 'Servono livello31 e vittoria sull’Abate del capitolo3'; end if;
      if jsonb_typeof(saved->'build'->'picks') is distinct from 'array' or jsonb_array_length(saved->'build'->'picks')>500
        or jsonb_typeof(coalesce(saved->'build'->'learned','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(saved->'build'->'learned','[]'::jsonb))>500 then raise exception 'Build non valida'; end if;
      snap:=jsonb_build_object('hero',hero,'build',saved->'build','gear',coalesce(saved->'gear','{}'::jsonb),'quest',jsonb_build_object('boss3Dead',true,'boon',saved->'quest'->'boon'));
      if octet_length(snap::text)>16384 then raise exception 'Build troppo grande'; end if;
      if op='create' then
        insert into public.coop_beta_room(host_id,host_lease,host_snapshot) values(who,lease,snap) returning * into r;
      else
        update public.coop_beta_room set guest_id=who,guest_lease=lease,guest_seen=now(),guest_snapshot=snap where singleton returning * into r;
      end if;
    end if;
  elsif r.id is null or r.id is distinct from room then raise exception 'Stanza scaduta'; end if;
  if who=r.host_id and lease=r.host_lease then mine:=0;
  elsif who=r.guest_id and lease=r.guest_lease then mine:=1;
  else raise exception 'Non appartieni a questa stanza o scheda'; end if;
  if op='leave' then r.phase:='ended';r.reason:='Un giocatore ha lasciato o sospeso la partita'; end if;
  if op='finish' then
    if mine<>0 then raise exception 'Solo il browser host può terminare la simulazione'; end if;
    r.phase:='ended';r.reason:='Partita conclusa. Beta sperimentale: nessun premio persistente';
  end if;
  if op='equip' then
    if r.phase<>'lobby' or jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload)<>9 then raise exception 'Barra non valida'; end if;
    for elem in select value from jsonb_array_elements(payload) loop
      if elem<>'null'::jsonb and (jsonb_typeof(elem)<>'string' or length(elem#>>'{}')>80) then raise exception 'Abilità non valida'; end if;
    end loop;
    if mine=0 then r.host_bar:=payload;r.host_ready:=false;else r.guest_bar:=payload;r.guest_ready:=false;end if;
  end if;
  if op='ready' then
    if r.phase<>'lobby' then raise exception 'La partita è già iniziata'; end if;
    if mine=0 then r.host_ready:=true;else r.guest_ready:=true;end if;
  end if;
  if op='start' then
    if mine<>0 or r.phase<>'lobby' or r.guest_id is null or not r.host_ready or not r.guest_ready or r.guest_seen<now()-interval '8 seconds' then raise exception 'Entrambi devono essere presenti e pronti'; end if;
    r.phase:='fight';r.deadline:=now()+interval '6 minutes';
  end if;
  if mine=0 then r.host_seen:=now();else r.guest_seen:=now();end if;
  update public.coop_beta_room set phase=r.phase,reason=r.reason,deadline=r.deadline,host_seen=r.host_seen,guest_seen=r.guest_seen,
    host_ready=r.host_ready,guest_ready=r.guest_ready,host_bar=r.host_bar,guest_bar=r.guest_bar where singleton;
  -- An ended room remains readable to the peer until it polls/leaves; admission resumes after12s.
  return jsonb_build_object('room',r.id,'invite',r.invite,'epoch',r.epoch,'phase',r.phase,'reason',r.reason,'slot',mine,
    'members',jsonb_build_array(jsonb_build_object('snapshot',r.host_snapshot,'bar',r.host_bar,'ready',r.host_ready),
      case when r.guest_id is null then null else jsonb_build_object('snapshot',r.guest_snapshot,'bar',r.guest_bar,'ready',r.guest_ready) end));
end $$;
revoke all on function public.coop_beta(text,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.coop_beta(text,uuid,uuid,uuid,text,jsonb) to authenticated;

-- Separate authenticated publish authority. A guest cannot forge host state by setting a userId field.
create function public.coop_beta_topic(topic text, writing boolean, feature text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.coop_beta_room r where r.phase in ('lobby','fight') and r.deadline>now()
    and r.host_seen>now()-interval '12 seconds' and auth.uid() in (r.host_id,r.guest_id)
    and ((feature='broadcast' and topic='coop-beta:'||r.id||':'||r.epoch||':state' and (not writing or auth.uid()=r.host_id))
      or (feature='broadcast' and topic='coop-beta:'||r.id||':'||r.epoch||':input' and (not writing or auth.uid()=r.guest_id))
      or (feature='presence' and topic='coop-beta:'||r.id||':'||r.epoch||':presence')))
$$;
revoke all on function public.coop_beta_topic(text,boolean,text) from public,anon;
grant execute on function public.coop_beta_topic(text,boolean,text) to authenticated;
-- realtime.messages already has RLS. Do not ALTER its ownership/schema/RLS or touch existing hub policies.
create policy "redentore beta receive" on realtime.messages for select to authenticated
  using(public.coop_beta_topic(realtime.topic(),false,extension::text));
create policy "redentore beta publish" on realtime.messages for insert to authenticated
  with check(public.coop_beta_topic(realtime.topic(),true,extension::text));
-- Restrictive guards prevent an existing permissive hub policy from bypassing this reserved prefix.
-- Other topics keep exactly their existing authorization behavior.
create policy "redentore beta scope receive" on realtime.messages as restrictive for select to authenticated
  using(realtime.topic() not like 'coop-beta:%' or public.coop_beta_topic(realtime.topic(),false,extension::text));
create policy "redentore beta scope publish" on realtime.messages as restrictive for insert to authenticated
  with check(realtime.topic() not like 'coop-beta:%' or public.coop_beta_topic(realtime.topic(),true,extension::text));
commit;
