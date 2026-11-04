-- Archive/export pending receipts before rollback; this removes arena ledger only.
begin;
drop trigger if exists coop_preserve_receipts on public.saves;
drop function if exists public.coop_preserve_receipts();
drop function if exists public.coop_award(uuid,jsonb);
drop function if exists public.coop_claim(uuid,double precision);
drop table if exists public.coop_rewards;
drop table if exists public.coop_matches;
revoke usage on schema public from coop_referee;
do $$ begin execute format('revoke connect on database %I from coop_referee',current_database()); end $$;
drop role if exists coop_referee;
commit;
