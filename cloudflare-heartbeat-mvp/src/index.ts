import {
  Agent,
  routeAgentRequest,
  type FiberContext,
  type FiberRecoveryContext,
  type FiberRecoveryResult,
} from "agents";
import { EVENT_ORDER, validRunId, type EventName } from "./events";

interface Env {
  HeartbeatAgent: DurableObjectNamespace<HeartbeatAgent>;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
}

interface EventRow {
  run_id: string;
  event_name: EventName;
  provider: string;
  step_no: number;
  created_at: string;
  recovery_count: number;
}

const EVENT_META: Record<EventName, { provider: string; step: number }> = {
  EVENT_RECEIVED: { provider: "SYSTEM", step: 0 },
  SORA_1_DONE: { provider: "OPENAI", step: 1 },
  KIRA_DONE: { provider: "ANTHROPIC", step: 2 },
  SORA_2_DONE: { provider: "OPENAI", step: 3 },
  E2E_COMPLETE: { provider: "SYSTEM", step: 4 },
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export class HeartbeatAgent extends Agent<Env> {
  async onStart(): Promise<void> {
    this.sql`CREATE TABLE IF NOT EXISTS heartbeat_events (
      run_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      step_no INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      recovery_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (run_id, event_name)
    )`;
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const runId = decodeURIComponent(url.pathname.split("/").at(-2) ?? "");

    if (!validRunId(runId)) return json({ error: "invalid run_id" }, 400);

    if (request.method === "POST" && url.pathname.endsWith("/trigger")) {
      this.record(runId, "EVENT_RECEIVED");
      const receipt = await this.startFiber(
        `heartbeat:${runId}`,
        async (ctx: FiberContext) => {
          ctx.stash({ runId, lastCompleted: "EVENT_RECEIVED" });
          await this.resume(runId, ctx);
        },
        {
          idempotencyKey: `heartbeat:${runId}`,
          metadata: { runId },
        },
      );
      return json(
        {
          run_id: runId,
          accepted: receipt.accepted,
          fiber_id: receipt.fiberId,
          status: receipt.status,
        },
        receipt.accepted ? 202 : 200,
      );
    }

    if (request.method === "GET" && url.pathname.endsWith("/evidence")) {
      const events = [...this.sql<EventRow>`
        SELECT run_id, event_name, provider, step_no, created_at, recovery_count
        FROM heartbeat_events WHERE run_id = ${runId}
        ORDER BY step_no
      `];
      return json({
        run_id: runId,
        complete: events.some((event) => event.event_name === "E2E_COMPLETE"),
        expected_order: EVENT_ORDER,
        events,
      });
    }

    return json({ error: "not found" }, 404);
  }

  async onFiberRecovered(ctx: FiberRecoveryContext): Promise<void | FiberRecoveryResult> {
    if (ctx.name.startsWith("heartbeat:") === false) return;
    const snapshot = ctx.snapshot as { runId?: string; lastCompleted?: EventName } | null;
    const runId = snapshot?.runId ?? ctx.name.slice("heartbeat:".length);
    if (!validRunId(runId)) {
      return { status: "error", snapshot: { error: "invalid run_id during recovery" } };
    }

    this.incrementRecovery(runId, snapshot?.lastCompleted ?? "EVENT_RECEIVED");
    await this.resume(runId);
    return { status: "completed", snapshot: { runId, recovered: true } };
  }

  private async resume(runId: string, ctx?: FiberContext): Promise<void> {
    let recorded = this.recorded(runId);

    if (!recorded.has("SORA_1_DONE")) {
      await this.openAI("Return exactly: SORA_1_DONE");
      this.record(runId, "SORA_1_DONE");
      ctx?.stash({ runId, lastCompleted: "SORA_1_DONE" });
    }

    recorded = this.recorded(runId);
    if (!recorded.has("KIRA_DONE")) {
      await this.anthropic("Return exactly: KIRA_DONE");
      this.record(runId, "KIRA_DONE");
      ctx?.stash({ runId, lastCompleted: "KIRA_DONE" });
    }

    recorded = this.recorded(runId);
    if (!recorded.has("SORA_2_DONE")) {
      await this.openAI("Return exactly: SORA_2_DONE");
      this.record(runId, "SORA_2_DONE");
      ctx?.stash({ runId, lastCompleted: "SORA_2_DONE" });
    }

    this.record(runId, "E2E_COMPLETE");
    ctx?.stash({ runId, lastCompleted: "E2E_COMPLETE" });
  }

  private recorded(runId: string): Set<string> {
    return new Set(
      [...this.sql<{ event_name: string }>`
        SELECT event_name FROM heartbeat_events WHERE run_id = ${runId}
      `].map((row) => row.event_name),
    );
  }

  private record(runId: string, event: EventName): boolean {
    const meta = EVENT_META[event];
    this.sql`INSERT OR IGNORE INTO heartbeat_events (run_id, event_name, provider, step_no)
      VALUES (${runId}, ${event}, ${meta.provider}, ${meta.step})`;
    return [...this.sql<{ changed: number }>`SELECT changes() AS changed`][0]?.changed === 1;
  }

  private incrementRecovery(runId: string, event: EventName): void {
    this.sql`UPDATE heartbeat_events
      SET recovery_count = recovery_count + 1
      WHERE run_id = ${runId} AND event_name = ${event}`;
  }

  private async openAI(prompt: string): Promise<void> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-5-mini", input: prompt, max_output_tokens: 20 }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    await response.body?.cancel();
  }

  private async anthropic(prompt: string): Promise<void> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 20,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic request failed (${response.status})`);
    await response.body?.cancel();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/runs\/([^/]+)\/(trigger|evidence)$/);
    if (!match) return json({ error: "not found" }, 404);
    if (
      (match[2] === "trigger" && request.method !== "POST") ||
      (match[2] === "evidence" && request.method !== "GET")
    ) {
      return json({ error: "method not allowed" }, 405);
    }
    url.pathname = `/agents/heartbeat-agent/${encodeURIComponent(match[1])}/${match[2]}`;
    return (await routeAgentRequest(new Request(url, request), env)) ?? json({ error: "agent not found" }, 404);
  },
};
