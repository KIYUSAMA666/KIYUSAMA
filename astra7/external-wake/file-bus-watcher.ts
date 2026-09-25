import { watch } from "node:fs";
import { readFile } from "node:fs/promises";

export type WakeEvent = {
  eventId: string;
  targetConversationId: string;
  payload: string;
};

export const TARGET_CONVERSATION_ID =
  "b2ed0bb2-82f9-4d4e-8fe8-5626023086dc";

/**
 * ASTRA 7 / Step 6.
 *
 * Proven repair boundary from anthropics/claude-code#86029:
 *   durable file bus -> worker-owned background file watcher
 *   -> watcher completion notification -> SAME SESSION self-wake
 *
 * This module is ONLY the durable-event predicate used by that background
 * watcher. It deliberately does not invent a synthetic notification API.
 * The TARGET session must arm/run the watcher through its native background
 * task mechanism so the native completion notification owns the wake.
 *
 * Wake is signal-only: the external payload remains in the durable bus and is
 * read by the resumed TARGET after the native completion wakes it.
 */
export async function waitForExternalWake(busFile: string): Promise<WakeEvent> {
  return new Promise<WakeEvent>((resolve, reject) => {
    let settled = false;

    const finish = (event: WakeEvent) => {
      if (settled) return;
      settled = true;
      watcher.close();
      resolve(event);
    };

    const check = async () => {
      try {
        const raw = await readFile(busFile, "utf8");
        const event = JSON.parse(raw) as WakeEvent;
        if (
          event.eventId &&
          event.targetConversationId === TARGET_CONVERSATION_ID
        ) {
          finish(event);
        }
      } catch (error) {
        // ENOENT / partial-write / malformed intermediate state:
        // keep watching; a later durable write is the event boundary.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          // JSON parse can race an atomic replacement; do not consume/ack it.
        }
      }
    };

    const watcher = watch(busFile, () => {
      void check();
    });

    watcher.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    void check();
  });
}
