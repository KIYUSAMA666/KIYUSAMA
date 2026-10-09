import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const sql = fs.readFileSync(new URL("./guardian-send-reserve-v1.proposal.sql", import.meta.url),"utf8");
test("CREATE and REVOKE are in same transaction",()=>{
  assert.match(sql,/begin;\s*create or replace function/i);
  assert.match(sql,/revoke all on function common_memory\.guardian_send_reserve_v1\([^)]+\) from public;\s*(?:--[^\n]*\n)*commit;/i);
});
test("locks control row before checkpoint",()=>{
  const row=sql.indexOf("for update;");
  const advisory=sql.indexOf("pg_advisory_xact_lock");
  assert.ok(row>=0 && advisory>row);
});
test("rejects stale fence and revision",()=>{
  assert.match(sql,/ctl\.lease_token is distinct from p_lease_token/);
  assert.match(sql,/ctl\.fence_epoch is distinct from p_fence_epoch/);
  assert.match(sql,/prev\.checkpoint->>\x27leaseToken\x27 is distinct from p_lease_token::text/);
  assert.match(sql,/prev\.checkpoint->>\x27fenceEpoch\x27 is distinct from p_fence_epoch::text/);
  assert.match(sql,/ctl\.lease_expires_at <= clock_timestamp\(\)/);
  assert.match(sql,/prev\.checkpoint_revision <> p_expected_revision/);
});
test("requires pre-SEND false before transition",()=>{
  assert.match(sql,/prev\.checkpoint->>'state' is distinct from 'LOCKED'/);
  assert.match(sql,/prev\.checkpoint->'sendStarted' is distinct from 'false'::jsonb/);
  assert.match(sql,/prev\.checkpoint->'preSendCommitted' is distinct from 'true'::jsonb/);
  assert.match(sql,/prev\.checkpoint->'resultCommitted' is distinct from 'false'::jsonb/);
  assert.match(sql,/jsonb_build_object\('state','SENDING','sendStarted',true/);
});
test("uses fenced checkpoint writer",()=>{
  assert.match(sql,/common_memory\.root_task_checkpoint_save_fenced_v1\(/);
});
