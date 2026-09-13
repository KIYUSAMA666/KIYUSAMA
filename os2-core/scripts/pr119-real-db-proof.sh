#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"

PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At)

rpc_sql() {
  local message_id="$1"
  local trace_id="$2"
  local provider_delivery_id="$3"
  "${PSQL[@]}" <<SQL
select public.os2_bus_persist_delivered_with_transport(
  jsonb_build_object(
    'messageId','$message_id','traceId','$trace_id','kind','MESSAGE',
    'sourceAgentId','SORA','targetAgentId','KIRA','parentMessageId',null,
    'current',jsonb_build_object('stateId','state-pr119','stateRevision',119),
    'createdAt','2026-09-13T14:00:00Z',
    'payload',jsonb_build_object('purpose','pr119-real-db-proof')
  ),
  jsonb_build_object(
    'message',jsonb_build_object(
      'messageId','$message_id','traceId','$trace_id','kind','MESSAGE',
      'sourceAgentId','SORA','targetAgentId','KIRA','parentMessageId',null,
      'current',jsonb_build_object('stateId','state-pr119','stateRevision',119),
      'createdAt','2026-09-13T14:00:00Z',
      'payload',jsonb_build_object('purpose','pr119-real-db-proof')
    ),
    'status','DELIVERED','deliveredToAgentId','KIRA','acknowledgedByAgentId',null
  ),
  jsonb_build_object(
    'status','DELIVERED','messageId','$message_id','traceId','$trace_id',
    'targetAgentId','KIRA','provider','slack-local-proof',
    'providerDeliveryId','$provider_delivery_id','observedAt','2026-09-13T14:00:01Z'
  )
)::text;
SQL
}

status_of() {
  jq -r '.status' <<<"$1"
}

expect_status() {
  local label="$1" expected="$2" actual_json="$3"
  local actual
  actual="$(status_of "$actual_json")"
  if [[ "$actual" != "$expected" ]]; then
    echo "$label expected $expected but got $actual: $actual_json" >&2
    exit 1
  fi
  echo "$label=$actual"
}

echo "=== TEST 1: first exact store ==="
FIRST="$(rpc_sql pr119-main-message pr119-main-trace provider-main-001)"
expect_status TEST1 STORED "$FIRST"

echo "=== TEST 2: exact replay ==="
REPLAY="$(rpc_sql pr119-main-message pr119-main-trace provider-main-001)"
expect_status TEST2 IDEMPOTENT "$REPLAY"

echo "=== TEST 3: immutable binding conflict ==="
CONFLICT="$(rpc_sql pr119-main-message pr119-main-trace provider-main-CONFLICT)"
expect_status TEST3 BINDING_MISMATCH "$CONFLICT"

echo "=== TEST 4: atomic rollback after transport-side failure ==="
"${PSQL[@]}" <<'SQL'
create or replace function public.pr119_force_transport_failure()
returns trigger
language plpgsql
as $$
begin
  if new.provider_delivery_id = 'provider-rollback-fail' then
    raise exception 'PR119_FORCED_TRANSPORT_FAILURE';
  end if;
  return new;
end;
$$;

drop trigger if exists pr119_force_transport_failure on os2_bus_v01.transport_evidence;
create trigger pr119_force_transport_failure
before insert on os2_bus_v01.transport_evidence
for each row execute function public.pr119_force_transport_failure();
SQL

ROLLBACK_RESULT="$(rpc_sql pr119-rollback-message pr119-rollback-trace provider-rollback-fail)"
expect_status TEST4_RPC BACKEND_FAILURE "$ROLLBACK_RESULT"
ROLLBACK_ROWS="$("${PSQL[@]}" -c "select (select count(*) from os2_bus_v01.messages where message_id='pr119-rollback-message')::text || ':' || (select count(*) from os2_bus_v01.transport_evidence where message_id='pr119-rollback-message')::text;")"
if [[ "$ROLLBACK_ROWS" != "0:0" ]]; then
  echo "TEST4 rollback leaked rows: $ROLLBACK_ROWS" >&2
  exit 1
fi
echo "TEST4_ROLLBACK_ROWS=$ROLLBACK_ROWS"
"${PSQL[@]}" <<'SQL'
drop trigger if exists pr119_force_transport_failure on os2_bus_v01.transport_evidence;
drop function if exists public.pr119_force_transport_failure();
SQL

echo "=== TEST 5: concurrent first writers converge ==="
cat >/tmp/pr119-concurrent.sql <<'SQL'
select public.os2_bus_persist_delivered_with_transport(
  jsonb_build_object(
    'messageId','pr119-race-message','traceId','pr119-race-trace','kind','MESSAGE',
    'sourceAgentId','SORA','targetAgentId','KIRA','parentMessageId',null,
    'current',jsonb_build_object('stateId','state-pr119','stateRevision',119),
    'createdAt','2026-09-13T14:00:00Z','payload',jsonb_build_object('purpose','pr119-real-db-proof')
  ),
  jsonb_build_object(
    'message',jsonb_build_object(
      'messageId','pr119-race-message','traceId','pr119-race-trace','kind','MESSAGE',
      'sourceAgentId','SORA','targetAgentId','KIRA','parentMessageId',null,
      'current',jsonb_build_object('stateId','state-pr119','stateRevision',119),
      'createdAt','2026-09-13T14:00:00Z','payload',jsonb_build_object('purpose','pr119-real-db-proof')
    ),
    'status','DELIVERED','deliveredToAgentId','KIRA','acknowledgedByAgentId',null
  ),
  jsonb_build_object(
    'status','DELIVERED','messageId','pr119-race-message','traceId','pr119-race-trace',
    'targetAgentId','KIRA','provider','slack-local-proof','providerDeliveryId','provider-race-001',
    'observedAt','2026-09-13T14:00:01Z'
  )
)::text;
SQL
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atf /tmp/pr119-concurrent.sql >/tmp/pr119-race-1.out &
PID1=$!
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atf /tmp/pr119-concurrent.sql >/tmp/pr119-race-2.out &
PID2=$!
wait "$PID1"
wait "$PID2"
RACE1="$(jq -r '.status' </tmp/pr119-race-1.out)"
RACE2="$(jq -r '.status' </tmp/pr119-race-2.out)"
RACE_SORTED="$(printf '%s\n%s\n' "$RACE1" "$RACE2" | sort | tr '\n' ',' | sed 's/,$//')"
if [[ "$RACE_SORTED" != "IDEMPOTENT,STORED" ]]; then
  echo "TEST5 expected one STORED and one IDEMPOTENT, got $RACE_SORTED" >&2
  exit 1
fi
RACE_ROWS="$("${PSQL[@]}" -c "select (select count(*) from os2_bus_v01.messages where message_id='pr119-race-message')::text || ':' || (select count(*) from os2_bus_v01.transport_evidence where message_id='pr119-race-message')::text;")"
if [[ "$RACE_ROWS" != "1:1" ]]; then
  echo "TEST5 expected 1:1 durable rows, got $RACE_ROWS" >&2
  exit 1
fi
echo "TEST5_RESULTS=$RACE_SORTED"
echo "TEST5_ROWS=$RACE_ROWS"

echo "=== TEST 6: migration ordering/prerequisite is live ==="
PREREQ="$("${PSQL[@]}" -c "select case when to_regclass('os2_bus_v01.messages') is not null and to_regclass('os2_bus_v01.transport_evidence') is not null then 'PASS' else 'FAIL' end;")"
if [[ "$PREREQ" != "PASS" ]]; then
  echo "TEST6 prerequisite/migration order failed" >&2
  exit 1
fi
echo "TEST6_MIGRATION_ORDER=$PREREQ"

echo "=== TEST 7: direct DELIVERED interoperates with PENDING->DELIVERED recovery ==="
DIRECT_INTEROP="$(rpc_sql pr119-direct-interop trace-direct-interop provider-interop-direct)"
expect_status TEST7_DIRECT STORED "$DIRECT_INTEROP"

"${PSQL[@]}" <<'SQL'
select public.os2_bus_store_record(
  null,
  jsonb_build_object(
    'message',jsonb_build_object(
      'messageId','pr119-transition-interop','traceId','trace-transition-interop','kind','MESSAGE',
      'sourceAgentId','SORA','targetAgentId','KIRA','parentMessageId',null,
      'current',jsonb_build_object('stateId','state-pr119','stateRevision',119),
      'createdAt','2026-09-13T14:00:00Z','payload',jsonb_build_object('purpose','pr119-real-db-proof')
    ),
    'status','PENDING','deliveredToAgentId',null,'acknowledgedByAgentId',null,
    'attemptSequence',0,'updatedAt','2026-09-13T14:00:00Z','unknownReason',null
  )
)::text;

select public.os2_bus_store_record(
  'PENDING',
  jsonb_build_object(
    'message',jsonb_build_object(
      'messageId','pr119-transition-interop','traceId','trace-transition-interop','kind','MESSAGE',
      'sourceAgentId','SORA','targetAgentId','KIRA','parentMessageId',null,
      'current',jsonb_build_object('stateId','state-pr119','stateRevision',119),
      'createdAt','2026-09-13T14:00:00Z','payload',jsonb_build_object('purpose','pr119-real-db-proof')
    ),
    'status','DELIVERED','deliveredToAgentId','KIRA','acknowledgedByAgentId',null,
    'attemptSequence',1,'updatedAt','2026-09-13T14:00:01Z','unknownReason',null
  )
)::text;
SQL

"${PSQL[@]}" -c "select public.os2_bus_read_record('pr119-direct-interop')::text;" >/tmp/pr119-direct.json
"${PSQL[@]}" -c "select public.os2_bus_read_record('pr119-transition-interop')::text;" >/tmp/pr119-transitioned.json
node scripts/pr119-recovery-interop.mjs /tmp/pr119-direct.json /tmp/pr119-transitioned.json

echo "=== B-LAYER: PostgREST + service_role/RLS/grants ==="
cat >/tmp/pr119-rest-body.json <<'JSON'
{
  "p_message": {
    "messageId":"pr119-rest-message","traceId":"pr119-rest-trace","kind":"MESSAGE",
    "sourceAgentId":"SORA","targetAgentId":"KIRA","parentMessageId":null,
    "current":{"stateId":"state-pr119","stateRevision":119},
    "createdAt":"2026-09-13T14:00:00Z","payload":{"purpose":"pr119-rest-proof"}
  },
  "p_delivery": {
    "message": {
      "messageId":"pr119-rest-message","traceId":"pr119-rest-trace","kind":"MESSAGE",
      "sourceAgentId":"SORA","targetAgentId":"KIRA","parentMessageId":null,
      "current":{"stateId":"state-pr119","stateRevision":119},
      "createdAt":"2026-09-13T14:00:00Z","payload":{"purpose":"pr119-rest-proof"}
    },
    "status":"DELIVERED","deliveredToAgentId":"KIRA","acknowledgedByAgentId":null
  },
  "p_evidence": {
    "status":"DELIVERED","messageId":"pr119-rest-message","traceId":"pr119-rest-trace",
    "targetAgentId":"KIRA","provider":"slack-local-proof","providerDeliveryId":"provider-rest-001",
    "observedAt":"2026-09-13T14:00:01Z"
  }
}
JSON

SERVICE_BODY="$(curl --fail-with-body -sS \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data @/tmp/pr119-rest-body.json \
  "$SUPABASE_URL/rest/v1/rpc/os2_bus_persist_delivered_with_transport")"
expect_status B_LAYER_SERVICE_ROLE STORED "$SERVICE_BODY"

ANON_HTTP="$(curl -sS -o /tmp/pr119-anon-body.out -w '%{http_code}' \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H 'Content-Type: application/json' \
  --data @/tmp/pr119-rest-body.json \
  "$SUPABASE_URL/rest/v1/rpc/os2_bus_persist_delivered_with_transport")"
if [[ "$ANON_HTTP" =~ ^2 ]]; then
  echo "B_LAYER_ANON expected denial but got HTTP $ANON_HTTP: $(cat /tmp/pr119-anon-body.out)" >&2
  exit 1
fi
echo "B_LAYER_ANON_DENIED_HTTP=$ANON_HTTP"

echo "PR119_REAL_DB_PROOF=PASS"
