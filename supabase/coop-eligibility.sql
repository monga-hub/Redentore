-- Apply before coop-lfg.sql. Independent permanent boss2-only admission; no save writes.
-- Safe with an existing fight: only new create/join admission changes. Frozen beta SQL stays unchanged.
begin;
create or replace function public.coop_beta(op text, lease uuid, room uuid default null, invite uuid default null, hero text default null, payload jsonb default null)
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
      if (saved->'build'->>'xp')::numeric not between 0 and 10000000 or saved->'quest'->'boss2Dead' is distinct from 'true'::jsonb then raise exception 'Sconfiggi la Governatrice del capitolo2 e salva nel cloud'; end if;
      if jsonb_typeof(saved->'build'->'picks') is distinct from 'array' or jsonb_array_length(saved->'build'->'picks')>500
        or jsonb_typeof(coalesce(saved->'build'->'learned','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(saved->'build'->'learned','[]'::jsonb))>500 then raise exception 'Build non valida'; end if;
      snap:=jsonb_build_object('hero',hero,'build',saved->'build','gear',coalesce(saved->'gear','{}'::jsonb),'quest',jsonb_build_object('boss2Dead',true,'boss3Dead',coalesce(saved->'quest'->'boss3Dead','false'::jsonb),'boon',saved->'quest'->'boon'));
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
commit;
