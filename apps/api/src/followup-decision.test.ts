import { describe, expect, it } from "vitest";
import { decideNextAction } from "./followup-decision.js";

const base = { touchCount: 0, maxTouches: 8, intervalMs: 60_000, now: new Date("2026-06-15T00:00:00Z") };

describe("decideNextAction", () => {
  it("discovered → contacting 且发送", () => {
    const d = decideNextAction({ ...base, status: "discovered", hasNewInbound: false, outcome: null });
    expect(d).toEqual({ nextStatus: "contacting", nextActionAt: new Date("2026-06-15T00:01:00Z"), shouldSend: true });
  });

  it("contacting 无回复 → 继续轮询不发", () => {
    const d = decideNextAction({ ...base, status: "contacting", hasNewInbound: false, outcome: null });
    expect(d).toEqual({ nextStatus: "contacting", nextActionAt: new Date("2026-06-15T00:01:00Z"), shouldSend: false });
  });

  it("contacting + 回复 + continue → 继续并发送", () => {
    const d = decideNextAction({ ...base, status: "contacting", hasNewInbound: true, outcome: "continue" });
    expect(d).toEqual({ nextStatus: "contacting", nextActionAt: new Date("2026-06-15T00:01:00Z"), shouldSend: true });
  });

  it("contacting + 回复 + goal_reached → converted 终态并发送收尾", () => {
    const d = decideNextAction({ ...base, status: "contacting", hasNewInbound: true, outcome: "goal_reached" });
    expect(d).toEqual({ nextStatus: "converted", nextActionAt: null, shouldSend: true });
  });

  it("contacting + 回复 + rejected → lost 终态且不发送", () => {
    const d = decideNextAction({ ...base, status: "contacting", hasNewInbound: true, outcome: "rejected" });
    expect(d).toEqual({ nextStatus: "lost", nextActionAt: null, shouldSend: false });
  });

  it("continue 但发完达到 maxTouches → paused", () => {
    const d = decideNextAction({ ...base, status: "contacting", hasNewInbound: true, outcome: "continue", touchCount: 7, maxTouches: 8 });
    expect(d).toEqual({ nextStatus: "paused", nextActionAt: null, shouldSend: true });
  });
});
