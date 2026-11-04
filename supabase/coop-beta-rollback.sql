-- Only beta room capabilities. Existing solo/auth/notes and legendary catalogue remain unchanged.
begin;
drop policy if exists "redentore beta scope receive" on realtime.messages;
drop policy if exists "redentore beta scope publish" on realtime.messages;
drop policy if exists "redentore beta receive" on realtime.messages;
drop policy if exists "redentore beta publish" on realtime.messages;
drop function if exists public.coop_beta_topic(text,boolean,text);
drop function if exists public.coop_beta(text,uuid,uuid,uuid,text,jsonb);
drop table if exists public.coop_beta_room;
commit;
