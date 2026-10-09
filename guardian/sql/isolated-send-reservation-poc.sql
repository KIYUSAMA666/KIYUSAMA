-- ISOLATED DRAFT ONLY. Do not apply to production without explicit approval.
-- The reservation is permanent for a given operation key: expiry is NOT a
-- reason to grant a second SEND. A crashed worker remains UNKNOWN/HOLD.
CREATE SCHEMA IF NOT EXISTS guardian_send_poc;

CREATE TABLE IF NOT EXISTS guardian_send_poc.send_reservations (
  operation_key text PRIMARY KEY,
  root_task_id bigint NOT NULL,
  body_id text NOT NULL,
  work_id text NOT NULL,
  expected_user_turn_id text NOT NULL,
  lease_owner text NOT NULL,
  lease_generation bigint NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  send_started boolean NOT NULL DEFAULT true CHECK (send_started)
);

CREATE OR REPLACE FUNCTION guardian_send_poc.reserve_send_once(
  p_operation_key text,
  p_root_task_id bigint,
  p_body_id text,
  p_work_id text,
  p_expected_user_turn_id text,
  p_lease_owner text,
  p_lease_generation bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, guardian_send_poc
AS $$
DECLARE v_key text;
BEGIN
  IF nullif(btrim(p_operation_key),'') IS NULL OR
     nullif(btrim(p_body_id),'') IS NULL OR
     nullif(btrim(p_work_id),'') IS NULL OR
     nullif(btrim(p_expected_user_turn_id),'') IS NULL OR
     nullif(btrim(p_lease_owner),'') IS NULL OR
     p_root_task_id IS NULL OR p_lease_generation IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','INVALID_COORDINATES');
  END IF;
  -- Caller must validate current lease ownership, token, generation and
  -- expiry atomically with this insert before production use. This isolated
  -- function does NOT grant production SEND authority.
  INSERT INTO guardian_send_poc.send_reservations
    (operation_key,root_task_id,body_id,work_id,expected_user_turn_id,lease_owner,lease_generation)
  VALUES
    (p_operation_key,p_root_task_id,p_body_id,p_work_id,p_expected_user_turn_id,p_lease_owner,p_lease_generation)
  ON CONFLICT (operation_key) DO NOTHING
  RETURNING operation_key INTO v_key;
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','SEND_ALREADY_RESERVED');
  END IF;
  RETURN jsonb_build_object('ok',true,'reserved',true,'operation_key',v_key);
END;
$$;

-- Production promotion requires: same-transaction authoritative lease
-- validation (including token + expiry), isolation grants/RLS review,
-- atomic crash/replay tests, and an explicit deployment approval.
