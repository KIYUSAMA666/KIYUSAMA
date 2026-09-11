-- KIYUSAMA OS 2.0
-- PRODUCTION ASYNC COMMIT BRIDGE v0.1
--
-- Data API facade for the private os2_storage_v01 atomic primitive.
-- The storage schema stays private. This public function is SECURITY INVOKER
-- and executable only by service_role, so it does not bypass the private
-- function/table privilege boundary.

create or replace function public.os2_storage_compare_consume_and_swap(p_command jsonb)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, os2_storage_v01
as $$
  select os2_storage_v01.compare_consume_and_swap(p_command);
$$;

revoke all on function public.os2_storage_compare_consume_and_swap(jsonb) from public;
revoke all on function public.os2_storage_compare_consume_and_swap(jsonb) from anon;
revoke all on function public.os2_storage_compare_consume_and_swap(jsonb) from authenticated;
grant execute on function public.os2_storage_compare_consume_and_swap(jsonb) to service_role;
