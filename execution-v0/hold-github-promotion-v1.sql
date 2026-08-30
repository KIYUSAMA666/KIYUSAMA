-- Candidate DB primitive for post-write uncertainty. NOT applied to production.
create or replace function execution_v0.hold_github_promotion_v1(p_reservation_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = execution_v0, public, pg_catalog
as $$
declare r execution_v0.github_promotion_reservations_v1%rowtype;
begin
  select * into r from execution_v0.github_promotion_reservations_v1 where reservation_id=p_reservation_id for update;
  if not found then return jsonb_build_object('ok',false,'error','RESERVATION_NOT_FOUND'); end if;
  if r.status='CONFIRMED' then return jsonb_build_object('ok',true,'status','ALREADY_CONFIRMED','reservation_id',r.reservation_id); end if;
  if r.status='HOLD' then return jsonb_build_object('ok',true,'status','ALREADY_HOLD','reservation_id',r.reservation_id); end if;
  if r.status<>'RESERVED' then return jsonb_build_object('ok',false,'error','RESERVATION_NOT_ACTIVE','status',r.status); end if;
  update execution_v0.github_promotion_reservations_v1
     set status='HOLD', finalized_at=clock_timestamp(),
         evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('hold_reason',left(coalesce(p_reason,'UNSPECIFIED'),200),'reconciliation_required',true,'held_at',clock_timestamp())
   where reservation_id=r.reservation_id;
  return jsonb_build_object('ok',true,'status','HOLD','reservation_id',r.reservation_id,'reconciliation_required',true);
end;
$$;
