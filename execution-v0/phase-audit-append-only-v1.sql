-- Candidate hardening. Do not apply to production without controlled migration/recount.
create or replace function common_memory.protect_phase_audit_packet_append_only_v1()
returns trigger
language plpgsql
security definer
set search_path = common_memory, pg_catalog
as $$
begin
  raise exception 'PHASE_AUDIT_PACKET_APPEND_ONLY';
end;
$$;

-- Production migration target:
-- revoke update, delete, truncate on common_memory.phase_audit_packets from non-maintenance roles;
-- create trigger trg_phase_audit_packets_append_only_v1
-- before update or delete on common_memory.phase_audit_packets
-- for each row execute function common_memory.protect_phase_audit_packet_append_only_v1();
--
-- TRUNCATE requires privilege revocation because row triggers do not protect it.
-- This protects DB immutability only; independent external sealing remains a separate requirement.
