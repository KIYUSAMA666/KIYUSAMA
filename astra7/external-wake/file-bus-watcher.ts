import { watch } from "node:fs";
import { appendFile, mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export type WakeEvent = {
  eventId: string;
  targetConversationId: string;
  payload: string;
};

export type WakeWatchResult =
  | { status: "MATCHED"; event: WakeEvent; observedAt: string }
  | { status: "TIMEOUT"; observedAt: string }
  | { status: "EVIDENCE_WRITE_FAILED"; observedAt: string; error: string };

export const TARGET_CONVERSATION_ID =
  "b2ed0bb2-82f9-4d4e-8fe8-5626023086dc";

/**
 * ASTRA 7 / Step 6.
 *
 * durable file bus -> TARGET-owned background watcher -> watcher exits ->
 * native completion notification -> SAME SESSION self-wake.
 *
 * The TARGET/main session must own the background task. Do not delegate this
 * watcher to a subagent: the native completion notification is the wake edge.
 *
 * Evidence guard: Claude Code issue #88423 measured lead-owned background
 * completions at 3/3 delivered, while subagent-owned completions were 0/32.
 * Ownership is therefore a Step-6 invariant, not an implementation preference.
 *
 * Wake primitive guard: issue #87146 measured ScheduleWakeup/Cron acceptance with
 * zero idle fires in SDK/stream-json hosts while background-task completion still
 * re-invoked the same session. Step 6 therefore waits on native task completion;
 * scheduler success/ACK must never be counted as WAKE evidence.
 *
 * Delivery guard: issue #85534 proves task-notification enqueue can occur without
 * a matching remove/attachment delivery and without model re-invocation. Step 6
 * evidence must therefore distinguish watcher exit, notification enqueue,
 * delivery/materialization, and SAME SESSION re-invocation; enqueue is not PASS.
 *
 * Success discriminator: issue #86012 reports a fixed-path 3/3 on Desktop
 * 1.34493.1 / engine 2.1.237 across cold, queued, and warm recipients. The
 * recipient transcript gained enqueue + user records, a real turn started, and
 * the warm path produced thinking/text/tool_use. Another independent probe
 * reached idle transcript -> wake -> reply -> ACK round-trip. Step 6/7 should
 * require equivalent transcript-level materialization + real turn evidence,
 * never list-events/UI-card/mtime alone.
 *
 * Continuation discriminator from #86012: the fixed path was verified in cold,
 * queued/mid-turn, and warm states. A queued ACK is therefore not enough: when
 * TARGET is busy, require the deferred send to drain, then transcript
 * materialization and a real responding turn. This closes the lost-wakeup race
 * without changing TARGET, route, or Step 6.
 *
 * The watcher is finite by design. MATCHED/TIMEOUT both terminate so the
 * runtime can emit exactly the completion notification that re-invokes the
 * owning session.
 */
export async function waitForExternalWake(
  busFile: string,
  evidenceFile: string,
  timeoutMs = 30 * 60 * 1000,
  expectedEventId: string,
): Promise<WakeWatchResult> {
  if (!expectedEventId.trim()) {
    throw new Error("expectedEventId is required for Step 6 correlation");
  }

  await mkdir(dirname(busFile), { recursive: true });
  await mkdir(dirname(evidenceFile), { recursive: true });

  // Arm safely before fs.watch: a later producer may overwrite this file.
  const handle = await open(busFile, "a");
  await handle.close();

  return new Promise<WakeWatchResult>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let watcher: ReturnType<typeof watch> | undefined;

    const writeEvidence = async (result: WakeWatchResult) => {
      const record =
        result.status === "MATCHED"
          ? {
              step: 6,
              targetConversationId: TARGET_CONVERSATION_ID,
              status: result.status,
              eventId: result.event.eventId,
              observedAt: result.observedAt,
            }
          : {
              step: 6,
              targetConversationId: TARGET_CONVERSATION_ID,
              ...result,
            };

      await appendFile(evidenceFile, JSON.stringify(record) + "\n", "utf8");
    };

    const settle = async (result: WakeWatchResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      watcher?.close();

      try {
        await writeEvidence(result);
        resolve(result);
      } catch (error) {
        const failure: WakeWatchResult = {
          status: "EVIDENCE_WRITE_FAILED",
          observedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        };
        resolve(failure);
      }
    };

    const check = async () => {
      if (settled) return;
      try {
        const raw = await readFile(busFile, "utf8");
        if (!raw.trim()) return;

        const event = JSON.parse(raw) as WakeEvent;
        if (
          event.eventId &&
          (!expectedEventId || event.eventId === expectedEventId) &&
          event.targetConversationId === TARGET_CONVERSATION_ID
        ) {
          await settle({
            status: "MATCHED",
            event,
            observedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          // Partial/malformed producer state is retryable until timeout.
        }
      }
    };

    try {
      watcher = watch(busFile, () => {
        void check();
      });
    } catch (error) {
      reject(error);
      return;
    }

    watcher.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });

    timer = setTimeout(() => {
      void settle({ status: "TIMEOUT", observedAt: new Date().toISOString() });
    }, timeoutMs);

    void check();
  });
}
