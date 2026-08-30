import { Agent, routeAgentRequest, type Fiber } from "agents";
import { EVENT_ORDER, nextEvent, validRunId, type EventName } from "./events";

interface Env {
  HeartbeatAgent: DurableObjectNamespace<HeartbeatAgent>;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
}

interface EventRow {
  run_id: string;
  event_name: EventName;
  created_at: string;
  recovery_count: number;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export class HeartbeatAgent extends Agent<Env> {
  async onStart(): Promise<void> {
    this.sql`CREATE TABLE IF NOT EXISTS heartbeat_events (
      run_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
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
      const inserted = this.record(runId, "EVENT_RECEIVED");
      if (inserted) {
        this.startFiber(`heartbeat:${runId}`, async () => this.resume(runId));
      }
      return json({ run_id: runId, accepted: inserted }, inserted ? 202 : 200);
    }

    if (request.method === "GET" && url.pathname.endsWith("/evidence")) {
      const events = [...this.sql<EventRow>`
        SELECT run_id, event_name, created_at, recovery_count
        FROM heartbeat_events WHERE run_id = ${runId}
        ORDER BY rowid
      `];
      return json({ run_id: runId, complete: events.length === EVENT_ORDER.length, events });
    }

    return json({ error: "not found" }, 404);
  }

  async onFiberRecovered(fiber: Fiber): Promise<void> {
    const runId = fiber.name.startsWith("heartbeat:") ? fiber.name.slice(10) : "";
    if (!validRunId(runId)) return;
    const pending = nextEvent(this.recorded(runId));
    if (pending) this.sql`
      UPDATE heartbeat_events SET recovery_count = recovery_count + 1
      WHERE run_id = ${runId} AND event_name = ${this.previousEvent(pending)}
    `;
  }

  private async resume(runId: string): Promise<void> {
    let recorded = this.recorded(runId);
    if (!recorded.has("SORA_1_DONE")) {
      await this.openAI("Return exactly: SORA_1_DONE");
      this.record(runId, "SORA_1_DONE");
    }
    recorded = this.recorded(runId);
    if (!recorded.has("KIRA_DONE")) {
      await this.anthropic("Return exactly: KIRA_DONE");
      this.record(runId, "KIRA_DONE");
    }
    recorded = this.recorded(runId);
    if (!recorded.has("SORA_2_DONE")) {
      await this.openAI("Return exactly: SORA_2_DONE");
      this.record(runId, "SORA_2_DONE");
    }
    this.record(runId, "E2E_COMPLETE");
  }

  private recorded(runId: string): Set<string> {
    return new Set([...this.sql<{ event_name: string }>`
      SELECT event_name FROM heartbeat_events WHERE run_id = ${runId}
    `].map((row) => row.event_name));
  }

  private record(runId: string, event: EventName): boolean {
    this.sql`INSERT OR IGNORE INTO heartbeat_events (run_id, event_name)
      VALUES (${runId}, ${event})`;
    return [...this.sql<{ changed: number }>`SELECT changes() AS changed`][0]?.changed === 1;
  }

  private previousEvent(event: EventName): EventName {
    const index = EVENT_ORDER.indexOf(event);
    return EVENT_ORDER[Math.max(0, index - 1)];
  }

  private async openAI(prompt: string): Promise<void> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${this.env.OPENAI_API_KEY}`, "content-type": "application/json" },
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
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 20, messages: [{ role: "user", content: prompt }] }),
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
    if ((match[2] === "trigger" && request.method !== "POST") || (match[2] === "evidence" && request.method !== "GET")) {
      return json({ error: "method not allowed" }, 405);
    }
    url.pathname = `/agents/heartbeat-agent/${encodeURIComponent(match[1])}/${match[2]}`;
    return (await routeAgentRequest(new Request(url, request), env)) ?? json({ error: "agent not found" }, 404);
  },
};
