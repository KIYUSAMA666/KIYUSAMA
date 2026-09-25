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
  payload: string;
  observedAt: string;
};

export const TARGET_CONVERSATION_ID =
  "b2ed0bb2-82f9-4d4e-8fe8-5626023086dc";

export function armExternalWakeWatcher(
  busFile: string,
  notifyCompletion: (completion: WakeCompletion) => Promise<void>,
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

      await notifyCompletion({
        eventId: event.eventId,
        targetConversationId: event.targetConversationId,
        payload: event.payload,
        observedAt: new Date().toISOString(),
      });

      lastEventId = event.eventId;
    } finally {
      processing = false;
    }
  });

  return () => watcher.close();
}
