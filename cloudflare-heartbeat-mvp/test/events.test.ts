import { describe, expect, it } from "vitest";
import { EVENT_ORDER, nextEvent, validRunId } from "../src/events";

describe("heartbeat contract", () => {
  it("keeps the required provider/checkpoint order", () => {
    expect(EVENT_ORDER).toEqual(["EVENT_RECEIVED", "SORA_1_DONE", "KIRA_DONE", "SORA_2_DONE", "E2E_COMPLETE"]);
  });

  it("resumes at the first missing checkpoint", () => {
    expect(nextEvent(new Set(["EVENT_RECEIVED", "SORA_1_DONE"]))).toBe("KIRA_DONE");
    expect(nextEvent(new Set(EVENT_ORDER))).toBeUndefined();
  });

  it("accepts safe run ids only", () => {
    expect(validRunId("run_2026-08-30-a")).toBe(true);
    expect(validRunId("../other-agent")).toBe(false);
    expect(validRunId("")).toBe(false);
  });
});
