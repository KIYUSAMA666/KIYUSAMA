-- KIYUSAMA OS 2.0
-- PRODUCTION CURRENT RECOVERY READ FACADE v0.1
--
-- Exposes the private durable CURRENT through one service-role-only,
-- SECURITY INVOKER RPC. No mutation is performed.

create or replace function public.os2_storage_read_current()
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'stateId', current_state.state_id,
    'revision', current_state.revision,
    'current', current_state.current_payload,
    'commitSequence', current_state.commit_sequence
  )
  from os2_storage_v01.current_state as current_state
  where current_state.singleton_id = true;
$$;

revoke all on function public.os2_storage_read_current() from public, anon, authenticated;
grant execute on function public.os2_storage_read_current() to service_role;
