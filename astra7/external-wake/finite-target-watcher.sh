#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.astra7/external-wake}"
EXPECTED_EVENT_ID="${2:?expectedEventId is required}"
TARGET_ID="b2ed0bb2-82f9-4d4e-8fe8-5626023086dc"
TIMEOUT_SECONDS="${ASTRA7_WAKE_TIMEOUT_SECONDS:-90}"
BUS_FILE="$ROOT/bus.json"
EVIDENCE_FILE="$ROOT/evidence.jsonl"

mkdir -p "$ROOT"
start_epoch=$(date +%s)

while :; do
  if [[ -f "$BUS_FILE" ]] && node -e '
    const fs=require("fs");
    const [file,eventId,targetId]=process.argv.slice(1);
    try {
      const x=JSON.parse(fs.readFileSync(file,"utf8"));
      process.exit(x.expectedEventId===eventId && x.targetConversationId===targetId ? 0 : 1);
    } catch { process.exit(1); }
  ' "$BUS_FILE" "$EXPECTED_EVENT_ID" "$TARGET_ID"; then
    printf '{"step":6,"status":"MATCHED","expectedEventId":"%s","targetConversationId":"%s","at":"%s"}\n'       "$EXPECTED_EVENT_ID" "$TARGET_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$EVIDENCE_FILE"
    exit 0
  fi

  now=$(date +%s)
  if (( now - start_epoch >= TIMEOUT_SECONDS )); then
    printf '{"step":6,"status":"TIMEOUT","expectedEventId":"%s","targetConversationId":"%s","at":"%s"}\n'       "$EXPECTED_EVENT_ID" "$TARGET_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$EVIDENCE_FILE"
    exit 2
  fi

  sleep 1
done
