# Cloudflare heartbeat MVP

Minimal Cloudflare Agent proof that accepts one durable heartbeat per `run_id`, calls OpenAI, Anthropic, then OpenAI, and records the five required SQLite evidence events. Duplicate triggers are accepted idempotently and do not start a second fiber. A recovered fiber consults the persisted checkpoints before continuing.

## Configure and run locally

Use Wrangler secrets; never put keys in this repository:

```sh
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npm test
npm run check
npx wrangler dev
```

Trigger and inspect a run:

```sh
curl -X POST http://localhost:8787/runs/demo-1/trigger
curl http://localhost:8787/runs/demo-1/evidence
```

The evidence route is read-only and returns only event names, timestamps, and recovery counters. Provider response bodies are not persisted. A `202` trigger response means newly accepted; a duplicate returns `200` with `accepted: false`.

This is an MVP, not a claim of deployed or production runtime validation. Setting a checkpoint after a provider response gives at-least-once provider-call behavior if execution fails in the narrow interval between the response and the SQLite insert.
