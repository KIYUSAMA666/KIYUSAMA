import { watch } from "node:fs";
import { readFile, appendFile } from "node:fs/promises";

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
 * durable file bus -> TARGET-owned background watcher -> watcher exits ->
 * native completion notification -> SAME SESSION self-wake.
 *
 * Every terminal watcher result is also appended to a durable evidence file.
 * That separates "notification/UI looked successful" from what the watcher
 * actually observed, preserving the failure coordinate for retry/repair.
 */
export async function waitForExternalWake(
  busFile: string,
  evidenceFile: string,
  timeoutMs = 30 * 60 * 1000,
): Promise<WakeWatchResult> {
  return new Promise<WakeWatchResult>((resolve, reject) => {
    let settled = false;

    const settle = async (result: WakeWatchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      watcher.close();

      await appendFile(
        evidenceFile,
        JSON.stringify({
          step: 6,
          targetConversationId: TARGET_CONVERSATION_ID,
          ...result,
        }) + "\n",
        "utf8",
      );

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
          await settle({
            status: "MATCHED",
            event,
            observedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          // Partial/malformed intermediate state remains retryable.
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
      void settle({ status: "TIMEOUT", observedAt: new Date().toISOString() });
    }, timeoutMs);

    void check();
  });
}
