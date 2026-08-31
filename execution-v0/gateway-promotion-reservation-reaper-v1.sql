-- KIYUSAMA OS execution_v0 — stale promotion reservation reaper v1
-- DESIGN/IMPLEMENTATION CANDIDATE ONLY. Do not apply directly to production.
-- Purpose: second line of defense if receiver dies after reservation.

create or replace function execution_v0.find_stale_github_promotions_v1(
  p_older_than interval default interval '10 minutes'
)
returns table(reservation_id uuid, dispatch_id uuid, generation bigint, worker_id text, worker_epoch bigint, reserved_at timestamptz)
language sql
security definer
set search_path = execution_v0, public, pg_catalog
as $$
  select r.reservation_id, r.dispatch_id, r.generation, r.worker_id, r.worker_epoch, r.reserved_at
  from execution_v0.github_promotion_reservations_v1 r
  where r.status = 'RESERVED'
    and r.reserved_at < clock_timestamp() - p_older_than
  order by r.reserved_at;
$$;

-- Reaper must NOT auto-promote and must NOT infer external outcome.
-- Each stale reservation requires external read-back/reconciliation first.
-- If external outcome cannot be proven: HOLD, never retry mutation blindly.
