-- Apply once AFTER coop-eligibility.sql. One global offer/reservation and the existing one beta room.
-- No saves/auth/notes policy or data changes. All time/consent/admission authority remains in RPCs.
begin;
do $$ begin
  if position('boss2Dead' in pg_get_functiondef('public.coop_beta(text,uuid,uuid,uuid,text,jsonb)'::regprocedure))=0 then
    raise exception 'Apply coop-eligibility.sql first';
  end if;
end $$;
create table public.coop_lfg_queue (
  user_id uuid primary key references auth.users on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  lease uuid not null,
  hero text not null,
  projection jsonb not null,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '35 seconds',
  avoid_id uuid,
  avoid_until timestamptz,
  notice text not null default ''
);
create table public.coop_lfg_offer (
  singleton boolean primary key default true check(singleton),
  id uuid not null unique default gen_random_uuid(),
  epoch uuid not null default gen_random_uuid(),
  host_id uuid not null references auth.users on delete cascade,
  guest_id uuid not null references auth.users on delete cascade,
  host_lease uuid not null,
  guest_lease uuid not null,
  host_hero text not null,
  guest_hero text not null,
  source text not null check(source in ('auto','direct')),
  phase text not null default 'offered' check(phase in ('offered','preparing','claiming','active')),
  expires_at timestamptz not null default now()+interval '30 seconds',
  host_accept boolean not null default false,
  guest_accept boolean not null default false,
  host_prepared boolean not null default false,
  guest_prepared boolean not null default false,
  host_ticket uuid,
  guest_ticket uuid,
  host_claim uuid,
  guest_claim uuid,
  room uuid,
  check(host_id<>guest_id)
);
alter table public.coop_lfg_queue enable row level security;
alter table public.coop_lfg_offer enable row level security;
revoke all on public.coop_lfg_queue,public.coop_lfg_offer from public,anon,authenticated;

-- Only the database emits invalidation hints. No projection or bearer material in Broadcast.
create function public.coop_lfg_notify(who uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform realtime.send(jsonb_build_object('changed',true),'changed','coop-lfg:'||who::text,true);
end $$;
revoke all on function public.coop_lfg_notify(uuid) from public,anon,authenticated;

create function public.coop_lfg_projection(who uuid, hero text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s jsonb; b jsonb; g jsonb; v jsonb; result jsonb;
begin
  if hero is null or hero not in ('risorto','bortolo','fosca','tizian','zanetto') then raise exception 'Eroe non valido'; end if;
  select data into s from public.saves where user_id=who and game_id='redentore' and slot=hero;
  b:=s->'build'; g:=coalesce(s->'gear','{}'::jsonb);
  if s is null or s->>'hero' is distinct from hero or jsonb_typeof(b->'xp') is distinct from 'number'
    or s->'quest'->'boss2Dead' is distinct from 'true'::jsonb then raise exception 'Sconfiggi la Governatrice e salva nel cloud'; end if;
  if (b->>'xp')::numeric not between 0 and 10000000 then raise exception 'XP non validi'; end if;
  if jsonb_typeof(b->'picks') is distinct from 'array' or jsonb_array_length(b->'picks')>500
    or jsonb_typeof(coalesce(b->'learned','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(b->'learned','[]'::jsonb))>500
    or jsonb_typeof(g)<>'object' then raise exception 'Build non valida'; end if;
  for v in select value from jsonb_array_elements((b->'picks')||coalesce(b->'learned','[]'::jsonb)) loop
    if jsonb_typeof(v)<>'string' or length(v#>>'{}')>80 then raise exception 'Abilità non valida'; end if;
  end loop;
  if exists(select 1 from jsonb_each(g) e where e.key not in ('abito','testa','spalle','torso','mani','gambe','piedi','arma','amuleto','anello') or jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>160) then raise exception 'Equipaggiamento non valido'; end if;
  result:=jsonb_build_object('hero',hero,'level',floor((1+sqrt(1+0.4*(b->>'xp')::numeric))/2),
    'picks',b->'picks','learned',coalesce(b->'learned','[]'::jsonb),'main',left(coalesce(b->>'main',''),80),'gear',g,'snapshotAt',now());
  if octet_length(result::text)>16384 then raise exception 'Build troppo grande'; end if;
  return result;
end $$;
revoke all on function public.coop_lfg_projection(uuid,text) from public,anon,authenticated;

create function public.coop_lfg_cancel(reason text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.coop_lfg_offer;
begin
  select * into o from public.coop_lfg_offer where singleton for update;
  if not found then return; end if;
  -- Cancelling a half-claimed lobby never cancels an active fight.
  if o.phase='active' then raise exception 'Partita già avviata'; end if;
  delete from public.coop_beta_room where id=o.room and phase='lobby';
  update public.coop_lfg_queue set avoid_id=case when user_id=o.host_id then o.guest_id else o.host_id end,
    avoid_until=now()+interval '15 seconds',notice=reason where user_id in (o.host_id,o.guest_id);
  delete from public.coop_lfg_offer where singleton;
  perform public.coop_lfg_notify(o.host_id); perform public.coop_lfg_notify(o.guest_id);
end $$;
revoke all on function public.coop_lfg_cancel(text) from public,anon,authenticated;

create function public.coop_lfg_cleanup() returns void
language plpgsql security definer set search_path='' as $$
declare o public.coop_lfg_offer;
begin
  -- Exactly the existing beta expiry rules, under the same admission lock.
  delete from public.coop_beta_room where deadline<now() or host_seen<now()-interval '12 seconds'
    or (guest_id is not null and guest_seen<now()-interval '12 seconds');
  select * into o from public.coop_lfg_offer where singleton for update;
  if found then
    if o.phase='active' then
      if not exists(select 1 from public.coop_beta_room where id=o.room) then delete from public.coop_lfg_offer where singleton; end if;
    elsif o.expires_at<=now() or (o.phase in ('offered','preparing') and
      (select count(*) from public.coop_lfg_queue where user_id in (o.host_id,o.guest_id) and expires_at>now())<>2)
      or (o.room is not null and not exists(select 1 from public.coop_beta_room where id=o.room)) then
      perform public.coop_lfg_cancel('Invito scaduto o compagno disconnesso');
    end if;
  end if;
  delete from public.coop_lfg_queue where expires_at<=now();
end $$;
revoke all on function public.coop_lfg_cleanup() from public,anon,authenticated;

-- Private internal implementation retains Auth identity but is no longer callable by browsers.
alter function public.coop_beta(text,uuid,uuid,uuid,text,jsonb) rename to coop_beta_admit;
revoke all on function public.coop_beta_admit(text,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
create function public.coop_beta(op text, lease uuid, room uuid default null, invite uuid default null, hero text default null, payload jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or lease is null then raise exception 'Accedi con il tuo account'; end if;
  perform pg_advisory_xact_lock(741270044);
  perform public.coop_lfg_cleanup();
  if op in ('create','join') then
    if exists(select 1 from public.coop_lfg_offer) then raise exception 'Arena riservata: attendi o usa la proposta LFG'; end if;
  end if;
  if op='start' and exists(select 1 from public.coop_lfg_offer o where o.room=coop_beta.room and
    (o.phase<>'active' or not o.host_accept or not o.guest_accept or not o.host_prepared or not o.guest_prepared)) then
    raise exception 'Attendi il consenso e la connessione di entrambi';
  end if;
  result:=public.coop_beta_admit(op,lease,room,invite,hero,payload);
  if op in ('create','join') then delete from public.coop_lfg_queue where user_id=auth.uid(); end if;
  return result;
end $$;
revoke all on function public.coop_beta(text,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.coop_beta(text,uuid,uuid,uuid,text,jsonb) to authenticated;

create function public.coop_lfg(op text, lease uuid, proposal uuid default null, target uuid default null, hero text default null, payload jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); q public.coop_lfg_queue; peer public.coop_lfg_queue;
  o public.coop_lfg_offer; a public.coop_lfg_queue; b public.coop_lfg_queue;
  result jsonb; admitted jsonb; ticket uuid; host boolean; entries jsonb; inspected jsonb;
begin
  if who is null or lease is null then raise exception 'Accedi con il tuo account'; end if;
  if op is null or op not in ('join','heartbeat','list','inspect','invite','accept','reject','leave','prepare','claim') then raise exception 'Operazione LFG non valida'; end if;
  if octet_length(coalesce(payload::text,''))>1024 then raise exception 'Richiesta troppo grande'; end if;
  perform pg_advisory_xact_lock(741270044);
  perform public.coop_lfg_cleanup();
  select * into q from public.coop_lfg_queue where user_id=who for update;
  select * into o from public.coop_lfg_offer where singleton for update;
  if op='claim' then
    if o.id is null or o.id is distinct from proposal or who not in (o.host_id,o.guest_id) or o.phase not in ('claiming','active') then raise exception 'Proposta non disponibile'; end if;
    host:=who=o.host_id;
    if (host and o.host_claim=lease) or (not host and o.guest_claim=lease) then
      admitted:=public.coop_beta_admit('poll',lease,o.room);
    else
      ticket:=(payload->>'ticket')::uuid;
      if ticket is null or ticket is distinct from (case when host then o.host_ticket else o.guest_ticket end)
        or (host and o.host_claim is not null) or (not host and o.guest_claim is not null) then raise exception 'Passaggio già usato o non valido'; end if;
      if host then
        admitted:=public.coop_beta_admit('create',lease,null,null,o.host_hero);
        update public.coop_lfg_offer set room=(admitted->>'room')::uuid,host_claim=lease,host_ticket=null where singleton;
      else
        if o.room is null then return jsonb_build_object('status','claiming','expiresAt',o.expires_at,'waitingForHost',true); end if;
        admitted:=public.coop_beta_admit('join',lease,null,(select invite from public.coop_beta_room where id=o.room),o.guest_hero);
        update public.coop_lfg_offer set guest_claim=lease,guest_ticket=null where singleton;
      end if;
      select * into o from public.coop_lfg_offer where singleton;
      if o.host_claim is not null and o.guest_claim is not null then
        update public.coop_lfg_offer set phase='active' where singleton;
        delete from public.coop_lfg_queue where user_id in (o.host_id,o.guest_id);
      end if;
      perform public.coop_lfg_notify(o.host_id); perform public.coop_lfg_notify(o.guest_id);
    end if;
    return jsonb_build_object('status','admitted','admission',admitted);
  end if;
  if o.id is not null and o.phase='active' and who in (o.host_id,o.guest_id) then raise exception 'Sei già in arena'; end if;
  if op='join' then
    if exists(select 1 from public.coop_beta_room where who in (host_id,guest_id)) then raise exception 'Sei già in arena'; end if;
    if q.user_id is not null and q.lease<>lease then raise exception 'Coda già aperta in un’altra scheda'; end if;
    if o.id is not null and who in (o.host_id,o.guest_id) then raise exception 'Rispondi prima alla proposta'; end if;
    insert into public.coop_lfg_queue(user_id,lease,hero,projection) values(who,lease,hero,public.coop_lfg_projection(who,hero))
      on conflict(user_id) do update set hero=excluded.hero,projection=excluded.projection,seen_at=now(),expires_at=now()+interval '35 seconds',notice='';
    select * into q from public.coop_lfg_queue where user_id=who;
  elsif q.user_id is null or q.lease<>lease then
    -- Idempotent leave on an expired entry cannot remove a newer tab's membership.
    if op='leave' and q.user_id is null then return jsonb_build_object('status','idle'); end if;
    raise exception 'Coda scaduta o scheda non autorizzata';
  end if;
  if op='leave' then
    if o.id is not null and who in (o.host_id,o.guest_id) then perform public.coop_lfg_cancel('Un giocatore ha lasciato la coda'); end if;
    delete from public.coop_lfg_queue where user_id=who;
    return jsonb_build_object('status','idle');
  end if;
  update public.coop_lfg_queue set seen_at=now(),expires_at=now()+interval '35 seconds' where user_id=who;
  if op in ('accept','reject','prepare') then
    if o.id is null or o.id is distinct from proposal or who not in (o.host_id,o.guest_id) then raise exception 'Proposta scaduta'; end if;
    host:=who=o.host_id;
    if op='reject' then perform public.coop_lfg_cancel('Invito rifiutato'); o:=null;
    elsif op='accept' then
      if o.phase not in ('offered','preparing') then raise exception 'Proposta già confermata'; end if;
      if host then update public.coop_lfg_offer set host_accept=true where singleton;
      else update public.coop_lfg_offer set guest_accept=true where singleton; end if;
      update public.coop_lfg_offer set phase='preparing',expires_at=now()+interval '30 seconds'
        where singleton and phase='offered' and host_accept and guest_accept;
    else
      if o.phase not in ('preparing','claiming') or not o.host_accept or not o.guest_accept then raise exception 'Servono due accettazioni'; end if;
      -- Local save success is the caller's declaration, never a remote campaign mutation.
      if payload->'saved' is distinct from 'true'::jsonb then raise exception 'Conserva prima la partita locale'; end if;
      perform public.coop_lfg_projection(who,q.hero);
      if host then update public.coop_lfg_offer set host_prepared=true where singleton;
      else update public.coop_lfg_offer set guest_prepared=true where singleton; end if;
      update public.coop_lfg_offer set phase='claiming',expires_at=now()+interval '30 seconds',host_ticket=gen_random_uuid(),guest_ticket=gen_random_uuid()
        where singleton and phase='preparing' and host_prepared and guest_prepared;
    end if;
    if o.id is not null then perform public.coop_lfg_notify(o.host_id);perform public.coop_lfg_notify(o.guest_id); end if;
  end if;
  if op='invite' then
    if o.id is not null then raise exception 'Arena o proposta già riservata'; end if;
    if exists(select 1 from public.coop_beta_room) then raise exception 'Arena occupata'; end if;
    select * into peer from public.coop_lfg_queue where id=target and user_id<>who and expires_at>now() for update;
    if not found or (q.avoid_id=peer.user_id and q.avoid_until>now()) then raise exception 'Giocatore non disponibile'; end if;
    insert into public.coop_lfg_offer(host_id,guest_id,host_lease,guest_lease,host_hero,guest_hero,source)
      values(who,peer.user_id,lease,peer.lease,q.hero,peer.hero,'direct') returning * into o;
    update public.coop_lfg_queue set notice='' where user_id in (o.host_id,o.guest_id);
    perform public.coop_lfg_notify(o.host_id);perform public.coop_lfg_notify(o.guest_id);
  end if;
  -- An inspect/list request never starts an unsolicited new match. Join and heartbeat drive FIFO.
  if op in ('join','heartbeat') and not exists(select 1 from public.coop_lfg_offer) and not exists(select 1 from public.coop_beta_room) then
    for a in select * from public.coop_lfg_queue where expires_at>now() order by joined_at,id loop
      select * into b from public.coop_lfg_queue where expires_at>now() and user_id<>a.user_id
        and not coalesce(avoid_id=a.user_id and avoid_until>now(),false)
        and not coalesce(a.avoid_id=user_id and a.avoid_until>now(),false) order by joined_at,id limit 1;
      if b.user_id is not null then
        insert into public.coop_lfg_offer(host_id,guest_id,host_lease,guest_lease,host_hero,guest_hero,source)
          values(a.user_id,b.user_id,a.lease,b.lease,a.hero,b.hero,'auto') returning * into o;
        update public.coop_lfg_queue set notice='' where user_id in (o.host_id,o.guest_id);
        perform public.coop_lfg_notify(o.host_id);perform public.coop_lfg_notify(o.guest_id);exit;
      end if;
    end loop;
  end if;
  select * into o from public.coop_lfg_offer where singleton;
  select * into q from public.coop_lfg_queue where user_id=who;
  result:=jsonb_build_object('status','searching','entry',q.id,'expiresAt',q.expires_at,'notice',q.notice,
    'arenaBusy',exists(select 1 from public.coop_beta_room));
  if o.id is not null and who in (o.host_id,o.guest_id) then
    host:=who=o.host_id;
    result:=result||jsonb_build_object('status',o.phase,'proposal',jsonb_build_object('id',o.id,'epoch',o.epoch,'mode','survival','capacity',2,'source',o.source,
      'host',host,'accepted',case when host then o.host_accept else o.guest_accept end,'peerAccepted',case when host then o.guest_accept else o.host_accept end,
      'prepared',case when host then o.host_prepared else o.guest_prepared end,
      'peer',(select jsonb_build_object('id',id,'hero',coop_lfg_queue.hero,'level',projection->'level') from public.coop_lfg_queue where user_id=case when host then o.guest_id else o.host_id end),
      'expiresAt',o.expires_at));
    if o.phase='claiming' and (case when host then o.host_ticket else o.guest_ticket end) is not null then result:=result||jsonb_build_object('handoff',jsonb_build_object('proposal',o.id,'ticket',case when host then o.host_ticket else o.guest_ticket end)); end if;
  end if;
  if op='list' then
    select coalesce(jsonb_agg(row),'[]'::jsonb) into entries from (select jsonb_build_object('id',id,'hero',coop_lfg_queue.hero,'level',projection->'level','snapshotAt',projection->'snapshotAt',
      'status',case when user_id in (o.host_id,o.guest_id) then o.phase else 'searching' end) row from public.coop_lfg_queue where expires_at>now() order by joined_at,id limit 50) listed;
    result:=result||jsonb_build_object('entries',entries);
  elsif op='inspect' then
    select projection into inspected from public.coop_lfg_queue where id=target and expires_at>now();
    if inspected is null then raise exception 'Giocatore non disponibile'; end if;
    result:=result||jsonb_build_object('inspect',inspected);
  end if;
  return result;
end $$;
revoke all on function public.coop_lfg(text,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.coop_lfg(text,uuid,uuid,uuid,text,jsonb) to authenticated;

create function public.coop_lfg_topic(topic text) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and topic='coop-lfg:'||auth.uid()::text
    and exists(select 1 from public.coop_lfg_queue where user_id=auth.uid() and expires_at>now())
$$;
revoke all on function public.coop_lfg_topic(text) from public,anon;
grant execute on function public.coop_lfg_topic(text) to authenticated;
create policy "redentore lfg receive" on realtime.messages for select to authenticated
  using(extension::text='broadcast' and public.coop_lfg_topic(realtime.topic()));
create policy "redentore lfg scope receive" on realtime.messages as restrictive for select to authenticated
  using(realtime.topic() not like 'coop-lfg:%' or (extension::text='broadcast' and public.coop_lfg_topic(realtime.topic())));
create policy "redentore lfg scope publish" on realtime.messages as restrictive for insert to authenticated
  with check(realtime.topic() not like 'coop-lfg:%');
commit;
