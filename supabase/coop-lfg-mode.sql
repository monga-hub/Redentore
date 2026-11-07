-- Apply once AFTER coop-lfg.sql and coop-lfg-build.sql. Additive and idempotent: re-running is harmless.
-- Adds the arena 1v1 queue mode beside co-op. Existing rows/clients stay 'survival' (co-op) unchanged.
-- The queue, offer, beta room, saves and Realtime policies keep exactly their current authority; only pairing,
-- listing, inspecting and inviting are restricted to players who chose the same mode.
-- No save writes, rewards or new roles. Rollback: coop-lfg-mode-rollback.sql.
begin;
select pg_advisory_xact_lock(741270044);
alter table public.coop_lfg_queue add column if not exists mode text not null default 'survival';
alter table public.coop_lfg_offer add column if not exists mode text not null default 'survival';
do $$ begin
  if not exists(select 1 from pg_constraint where conname='coop_lfg_queue_mode_check') then
    alter table public.coop_lfg_queue add constraint coop_lfg_queue_mode_check check(mode in ('survival','duel'));
  end if;
  if not exists(select 1 from pg_constraint where conname='coop_lfg_offer_mode_check') then
    alter table public.coop_lfg_offer add constraint coop_lfg_offer_mode_check check(mode in ('survival','duel'));
  end if;
end $$;
-- Same signature, owner, security definer and grants; payload.mode='duel' selects the arena queue on join.
create or replace function public.coop_lfg(op text, lease uuid, proposal uuid default null, target uuid default null, hero text default null, payload jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); wanted text:=case when payload->>'mode'='duel' then 'duel' else 'survival' end; q public.coop_lfg_queue; peer public.coop_lfg_queue;
  o public.coop_lfg_offer; a public.coop_lfg_queue; b public.coop_lfg_queue;
  result jsonb; admitted jsonb; canonical jsonb; snap jsonb; ticket uuid; host boolean; entries jsonb; inspected jsonb;
begin
  if who is null or lease is null then raise exception 'Accedi con il tuo account'; end if;
  if op is null or op not in ('join','heartbeat','list','inspect','invite','accept','reject','leave','prepare','claim') then raise exception 'Operazione LFG non valida'; end if;
  if octet_length(coalesce(payload::text,''))>20480 then raise exception 'Richiesta troppo grande'; end if;
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
        update public.coop_beta_room set host_snapshot=o.host_snapshot where id=(admitted->>'room')::uuid;
        admitted:=public.coop_beta_admit('poll',lease,(admitted->>'room')::uuid);
        update public.coop_lfg_offer set room=(admitted->>'room')::uuid,host_claim=lease,host_ticket=null where singleton;
      else
        if o.room is null then return jsonb_build_object('status','claiming','expiresAt',o.expires_at,'waitingForHost',true); end if;
        admitted:=public.coop_beta_admit('join',lease,null,(select invite from public.coop_beta_room where id=o.room),o.guest_hero);
        update public.coop_beta_room set guest_snapshot=o.guest_snapshot where id=o.room;
        admitted:=public.coop_beta_admit('poll',lease,o.room);
        update public.coop_lfg_offer set guest_claim=lease,guest_ticket=null where singleton;
      end if;
      select * into o from public.coop_lfg_offer where singleton;
      if o.host_claim is not null and o.guest_claim is not null then
        update public.coop_lfg_offer set phase='active' where singleton;
        delete from public.coop_lfg_queue where user_id in (o.host_id,o.guest_id);
      end if;
      perform public.coop_lfg_notify(o.host_id); perform public.coop_lfg_notify(o.guest_id);
    end if;
    return jsonb_build_object('status','admitted','admission',admitted,'mode',o.mode);
  end if;
  if o.id is not null and o.phase='active' and who in (o.host_id,o.guest_id) then raise exception 'Sei già in arena'; end if;
  if op='join' then
    if exists(select 1 from public.coop_beta_room where who in (host_id,guest_id)) then raise exception 'Sei già in arena'; end if;
    if q.user_id is not null and q.lease<>lease then raise exception 'Coda già aperta in un’altra scheda'; end if;
    if o.id is not null and who in (o.host_id,o.guest_id) then raise exception 'Rispondi prima alla proposta'; end if;
    insert into public.coop_lfg_queue(user_id,lease,hero,projection,mode) values(who,lease,hero,public.coop_lfg_projection(who,hero),wanted)
      on conflict(user_id) do update set hero=excluded.hero,projection=excluded.projection,mode=excluded.mode,seen_at=now(),expires_at=now()+interval '35 seconds',notice='';
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
      select data into canonical from public.saves where user_id=who and game_id='redentore' and slot=q.hero;
      snap:=jsonb_build_object('hero',q.hero,'build',jsonb_build_object('xp',canonical#>'{build,xp}','picks',canonical#>'{build,picks}',
        'learned',coalesce(canonical#>'{build,learned}','[]'::jsonb),'main',coalesce(canonical#>>'{build,main}','')),
        'gear',coalesce(canonical->'gear','{}'::jsonb),'quest',jsonb_build_object('boss2Dead',true,'boon',coalesce(canonical#>>'{quest,boon}','')));
      if payload->'expected' is distinct from snap then raise exception 'La build cloud è cambiata: campagna locale conservata, riprova la ricerca'; end if;
      if host then update public.coop_lfg_offer set host_prepared=true,host_snapshot=snap where singleton;
      else update public.coop_lfg_offer set guest_prepared=true,guest_snapshot=snap where singleton; end if;
      update public.coop_lfg_offer set phase='claiming',expires_at=now()+interval '30 seconds',host_ticket=gen_random_uuid(),guest_ticket=gen_random_uuid()
        where singleton and phase='preparing' and host_prepared and guest_prepared;
    end if;
    if o.id is not null then perform public.coop_lfg_notify(o.host_id);perform public.coop_lfg_notify(o.guest_id); end if;
  end if;
  if op='invite' then
    if o.id is not null then raise exception 'Arena o proposta già riservata'; end if;
    if exists(select 1 from public.coop_beta_room) then raise exception 'Arena occupata'; end if;
    select * into peer from public.coop_lfg_queue where id=target and user_id<>who and expires_at>now() and mode=q.mode for update;
    if not found or (q.avoid_id=peer.user_id and q.avoid_until>now()) then raise exception 'Giocatore non disponibile'; end if;
    insert into public.coop_lfg_offer(host_id,guest_id,host_lease,guest_lease,host_hero,guest_hero,source,mode)
      values(who,peer.user_id,lease,peer.lease,q.hero,peer.hero,'direct',q.mode) returning * into o;
    update public.coop_lfg_queue set notice='' where user_id in (o.host_id,o.guest_id);
    perform public.coop_lfg_notify(o.host_id);perform public.coop_lfg_notify(o.guest_id);
  end if;
  -- An inspect/list request never starts an unsolicited new match. Join and heartbeat drive FIFO.
  if op in ('join','heartbeat') and not exists(select 1 from public.coop_lfg_offer) and not exists(select 1 from public.coop_beta_room) then
    for a in select * from public.coop_lfg_queue where expires_at>now() order by joined_at,id loop
      select * into b from public.coop_lfg_queue where expires_at>now() and user_id<>a.user_id and mode=a.mode
        and not coalesce(avoid_id=a.user_id and avoid_until>now(),false)
        and not coalesce(a.avoid_id=user_id and a.avoid_until>now(),false) order by joined_at,id limit 1;
      if b.user_id is not null then
        insert into public.coop_lfg_offer(host_id,guest_id,host_lease,guest_lease,host_hero,guest_hero,source,mode)
          values(a.user_id,b.user_id,a.lease,b.lease,a.hero,b.hero,'auto',a.mode) returning * into o;
        update public.coop_lfg_queue set notice='' where user_id in (o.host_id,o.guest_id);
        perform public.coop_lfg_notify(o.host_id);perform public.coop_lfg_notify(o.guest_id);exit;
      end if;
    end loop;
  end if;
  select * into o from public.coop_lfg_offer where singleton;
  select * into q from public.coop_lfg_queue where user_id=who;
  result:=jsonb_build_object('status','searching','mode',q.mode,'entry',q.id,'expiresAt',q.expires_at,'notice',q.notice,
    'arenaBusy',exists(select 1 from public.coop_beta_room));
  if o.id is not null and who in (o.host_id,o.guest_id) then
    host:=who=o.host_id;
    result:=result||jsonb_build_object('status',o.phase,'proposal',jsonb_build_object('id',o.id,'epoch',o.epoch,'mode',o.mode,'capacity',2,'source',o.source,
      'host',host,'accepted',case when host then o.host_accept else o.guest_accept end,'peerAccepted',case when host then o.guest_accept else o.host_accept end,
      'prepared',case when host then o.host_prepared else o.guest_prepared end,
      'peer',(select jsonb_build_object('id',id,'hero',coop_lfg_queue.hero,'level',projection->'level') from public.coop_lfg_queue where user_id=case when host then o.guest_id else o.host_id end),
      'expiresAt',o.expires_at));
    if o.phase='claiming' and (case when host then o.host_ticket else o.guest_ticket end) is not null then result:=result||jsonb_build_object('handoff',jsonb_build_object('proposal',o.id,'ticket',case when host then o.host_ticket else o.guest_ticket end)); end if;
  end if;
  if op='list' then
    select coalesce(jsonb_agg(row),'[]'::jsonb) into entries from (select jsonb_build_object('id',id,'hero',coop_lfg_queue.hero,'level',projection->'level','snapshotAt',projection->'snapshotAt',
      'status',case when user_id in (o.host_id,o.guest_id) then o.phase else 'searching' end) row from public.coop_lfg_queue where expires_at>now() and mode=coalesce(q.mode,wanted) order by joined_at,id limit 50) listed;
    result:=result||jsonb_build_object('entries',entries);
  elsif op='inspect' then
    select projection into inspected from public.coop_lfg_queue where id=target and expires_at>now() and mode=coalesce(q.mode,wanted);
    if inspected is null then raise exception 'Giocatore non disponibile'; end if;
    result:=result||jsonb_build_object('inspect',inspected);
  end if;
  return result;
end $$;
revoke all on function public.coop_lfg(text,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.coop_lfg(text,uuid,uuid,uuid,text,jsonb) to authenticated;
commit;
