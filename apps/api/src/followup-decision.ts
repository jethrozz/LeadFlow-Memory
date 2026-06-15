import type { ConversionOutcome } from "@leadflow/agents";

export type FollowupDecision = {
  nextStatus: string;
  nextActionAt: Date | null;
  shouldSend: boolean;
};

export function decideNextAction(params: {
  status: string;
  hasNewInbound: boolean;
  outcome: ConversionOutcome | null;
  touchCount: number;
  maxTouches: number;
  intervalMs: number;
  now: Date;
}): FollowupDecision {
  const { status, hasNewInbound, outcome, touchCount, maxTouches, intervalMs, now } = params;
  const next = new Date(now.getTime() + intervalMs);

  if (status === "discovered") {
    return { nextStatus: "contacting", nextActionAt: next, shouldSend: true };
  }

  if (status === "contacting") {
    if (!hasNewInbound) {
      return { nextStatus: "contacting", nextActionAt: next, shouldSend: false };
    }
    if (outcome === "goal_reached") {
      return { nextStatus: "converted", nextActionAt: null, shouldSend: true };
    }
    if (outcome === "rejected") {
      return { nextStatus: "lost", nextActionAt: null, shouldSend: false };
    }
    // continue: send reply, then check if we've hit the touch limit
    if (touchCount + 1 >= maxTouches) {
      return { nextStatus: "paused", nextActionAt: null, shouldSend: true };
    }
    return { nextStatus: "contacting", nextActionAt: next, shouldSend: true };
  }

  return { nextStatus: status, nextActionAt: null, shouldSend: false };
}
