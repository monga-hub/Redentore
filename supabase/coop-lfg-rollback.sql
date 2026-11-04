-- Drain offers/handoffs AND rooms before applying. Keeps approved boss2 eligibility.
begin;
select pg_advisory_xact_lock(741270044);
do $$ begin
  if exists(select 1 from public.coop_beta_room where phase in ('lobby','fight') and deadline>now()
    and host_seen>now()-interval '12 seconds' and (guest_id is null or guest_seen>now()-interval '12 seconds')) then
    raise exception 'Arena attiva: attendi la fine prima del rollback LFG';
  end if;
  if exists(select 1 from public.coop_lfg_offer where phase<>'active' and expires_at>now()) then
    raise exception 'Proposta attiva: attendi la scadenza prima del rollback LFG';
  end if;
end $$;
drop policy "redentore lfg receive" on realtime.messages;
drop policy "redentore lfg scope receive" on realtime.messages;
drop policy "redentore lfg scope publish" on realtime.messages;
drop function public.coop_lfg_topic(text);
drop function public.coop_lfg(text,uuid,uuid,uuid,text,jsonb);
drop function public.coop_beta(text,uuid,uuid,uuid,text,jsonb);
alter function public.coop_beta_admit(text,uuid,uuid,uuid,text,jsonb) rename to coop_beta;
grant execute on function public.coop_beta(text,uuid,uuid,uuid,text,jsonb) to authenticated;
drop function public.coop_lfg_cleanup();
drop function public.coop_lfg_cancel(text);
drop function public.coop_lfg_projection(uuid,text);
drop function public.coop_lfg_notify(uuid);
drop table public.coop_lfg_offer;
drop table public.coop_lfg_queue;
commit;
