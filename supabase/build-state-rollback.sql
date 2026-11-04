-- Data-preserving rollback: guards/tombstones are retained for a later reapply.
drop trigger if exists redentore_build_guard on public.saves;
drop function if exists public.redentore_build_direct_guard();
drop function if exists public.redentore_build_save(text,text,uuid,jsonb);
drop function if exists public.redentore_build_is_guarded(uuid,text);
