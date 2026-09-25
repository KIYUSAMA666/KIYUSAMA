import { watch } from "node:fs";
import { readFile } from "node:fs/promises";

export type WakeEvent = {
  eventId: string;
  targetConversationId: string;
  payload: string;
};

export type WakeWatchResult =
  | { status: "MATCHED"; event: WakeEvent; observedAt: string }
  | { status: "TIMEOUT"; observedAt: string };

export const TARGET_CONVERSATION_ID =
  "b2ed0bb2-82f9-4d4e-8fe8-5626023086dc";

/**
 * ASTRA 7 / Step 6.
 *
 * Proven repair boundary from anthropics/claude-code#86029:
 * durable file bus -> TARGET-owned background watcher -> watcher exits ->
 * native completion notification -> SAME SESSION self-wake.
 *
 * The watcher MUST terminate. A never-ending background watcher cannot emit
 * its completion notification, so timeout is an evidence-bearing terminal
 * result rather than silent waiting.
 */
export async function waitForExternalWake(
  busFile: string,
  timeoutMs = 30 * 60 * 1000,
): Promise<WakeWatchResult> {
  return new Promise<WakeWatchResult>((resolve, reject) => {
    let settled = false;

    const settle = (result: WakeWatchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      watcher.close();
      resolve(result);
    };

    const check = async () => {
      try {
        const raw = await readFile(busFile, "utf8");
        const event = JSON.parse(raw) as WakeEvent;

        if (
          event.eventId &&
          event.targetConversationId === TARGET_CONVERSATION_ID
        ) {
          settle({
            status: "MATCHED",
            event,
            observedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        // ENOENT / partial-write / malformed intermediate state is not
        // consumed or acknowledged. A later durable write remains retryable.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          // Keep watching until MATCHED or TIMEOUT gives a concrete coordinate.
        }
      }
    };

    const watcher = watch(busFile, () => {
      void check();
    });

    watcher.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    const timer = setTimeout(() => {
      settle({ status: "TIMEOUT", observedAt: new Date().toISOString() });
    }, timeoutMs);

    void check();
  });
}
