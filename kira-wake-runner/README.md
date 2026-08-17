# KIRA Wake Runner MVP

Provider-agnostic Linux service that turns authenticated wake events into bounded Claude Code runs. The webhook contains only a `message_id`; task content is fetched from the trusted control plane.

## Run

Python 3.11+ and the official `claude` CLI must be installed. No Python packages are required.

```sh
export WAKE_HMAC_SECRET_FILE=/run/secrets/wake_hmac
export CONTROL_PLANE_TOKEN_FILE=/run/secrets/control_plane_token
export CONTROL_PLANE_URL=https://control.example.internal
export WAKE_SENDER=kira-control-plane
export DATA_DIR=/data
python3 -m wake_runner
```

Required configuration is supplied through secret *files*, never command-line arguments. See `wake_runner/config.py`. The service binds to `127.0.0.1:8080` by default; TLS termination is expected at the provider's authenticated ingress.

`POST /v1/wake` requires `Content-Type: application/json`, `X-Wake-Sender`, and `X-Wake-Signature: sha256=<hex HMAC-SHA256 of the exact request body>`. Only `{"message_id":"..."}` is accepted. `GET /healthz` reports process health without disclosing configuration.

The control plane contract is:

- `GET /v1/messages/{message_id}` -> `{"task":"..."}`
- `POST /v1/messages/{message_id}/runner-status` with status/result/audit JSON
- `Authorization: Bearer <token>` on both requests

The runner stores its SQLite claim/session database and Claude configuration beneath `DATA_DIR`. A stale `running` lease is reclaimed on redelivery and resumes the saved Claude session when one exists. Control-plane status updates use a stable idempotency key.

## Permission boundary

Every Claude invocation configures `mcp__gatekeeper__approve` as `--permission-prompt-tool`. The bundled stdio MCP adapter calls `GATEKEEPER_URL` with the control-plane bearer token. If Gatekeeper is absent, unreachable, malformed, or denies the request, the adapter returns deny. It never grants locally. This is intentionally fail closed.

The command always supplies `--max-turns`, explicit `--allowedTools` and `--disallowedTools`, JSON output, strict MCP configuration, and never uses `--dangerously-skip-permissions`.

## Test

```sh
cd kira-wake-runner
python3 -m unittest discover -s tests -v
```

