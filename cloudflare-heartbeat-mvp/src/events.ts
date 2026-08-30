export const EVENT_ORDER = [
  "EVENT_RECEIVED",
  "SORA_1_DONE",
  "KIRA_DONE",
  "SORA_2_DONE",
  "E2E_COMPLETE",
] as const;

export type EventName = (typeof EVENT_ORDER)[number];

export function nextEvent(recorded: ReadonlySet<string>): EventName | undefined {
  return EVENT_ORDER.find((event) => !recorded.has(event));
}

export function validRunId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}
