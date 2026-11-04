-- Atomic ACL-only correction for the already-installed build-state.sql.
-- Supabase default explicit grants survive REVOKE FROM PUBLIC. No body/policy/data/default changes.
begin;
revoke all on function public.redentore_build_save(text,text,uuid,jsonb) from public,anon;
grant execute on function public.redentore_build_save(text,text,uuid,jsonb) to authenticated;
revoke all on function public.redentore_build_is_guarded(uuid,text) from public,anon;
grant execute on function public.redentore_build_is_guarded(uuid,text) to authenticated;
revoke all on function public.redentore_build_direct_guard() from public,anon,authenticated;
commit;
