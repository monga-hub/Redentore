-- Archive/export pending receipts before rollback; this removes arena ledger only.
begin;
drop function if exists public.coop_award(uuid,jsonb);
drop function if exists public.coop_claim(uuid,double precision);
drop table if exists public.coop_rewards;
drop table if exists public.coop_matches;
revoke usage on schema public from coop_referee;
drop role if exists coop_referee;
commit;
