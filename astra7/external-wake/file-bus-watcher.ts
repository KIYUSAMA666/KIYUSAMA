import { watch } from "node:fs";
import { readFile } from "node:fs/promises";

export type WakeEvent = {
  eventId: string;
  targetConversationId: string;
  payload: string;
};

export type WakeCompletion = {
  eventId: string;
  targetConversationId: string;
  observedAt: string;
  kind: "external-wake-ready";
};

export const TARGET_CONVERSATION_ID =
  "b2ed0bb2-82f9-4d4e-8fe8-5626023086dc";

/**
 * ASTRA 7 / Step 6 repair seam.
 *
 * World evidence shows that a background-completion notification can wake the
 * existing main session into a continuation/model turn. This watcher converts
 * an external durable-file event into the structured completion that must be
 * handed to that SAME SESSION completion channel.
 *
 * IMPORTANT: externally controlled payload text is deliberately NOT forwarded
 * into the completion. The wake is a signal only; the resumed TARGET reads the
 * durable event itself after waking. This preserves the fixed TARGET boundary.
 */
export function armExternalWakeWatcher(
  busFile: string,
  notifySameSessionCompletion: (completion: WakeCompletion) => Promise<void>,
): () => void {
  let lastEventId: string | undefined;
  let processing = false;

  const watcher = watch(busFile, async () => {
    if (processing) return;
    processing = true;

    try {
      const raw = await readFile(busFile, "utf8");
      const event = JSON.parse(raw) as WakeEvent;

      if (event.targetConversationId !== TARGET_CONVERSATION_ID) return;
      if (!event.eventId || event.eventId === lastEventId) return;

      // Do not acknowledge the event until the SAME SESSION completion handoff
      // has succeeded. A failed handoff therefore remains retryable.
      await notifySameSessionCompletion({
        eventId: event.eventId,
        targetConversationId: event.targetConversationId,
        observedAt: new Date().toISOString(),
        kind: "external-wake-ready",
      });

      lastEventId = event.eventId;
    } finally {
      processing = false;
    }
  });

  return () => watcher.close();
}
