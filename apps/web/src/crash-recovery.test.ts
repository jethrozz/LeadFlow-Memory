import { describe, expect, it } from "vitest";
import {
  CRASHED_DEMO_WORKER_ID,
  findCrashRecovery,
} from "./crash-recovery";
import type { DashboardLeadDetail } from "./types";

function detail(overrides: Partial<DashboardLeadDetail> = {}): DashboardLeadDetail {
  return {
    lead: {
      id: "lead_001",
      displayName: "重庆买房小陈",
      platform: "xhs",
      intentLevel: "A",
      status: "contacting",
      summary: "预算 130 万以内，关注渝北三房。",
      updatedAt: "2026-06-19T03:00:00.000Z",
      workerId: CRASHED_DEMO_WORKER_ID,
    },
    profile: {
      summary: "",
      needs: [],
      concerns: [],
      fields: {},
    },
    conversation: { messages: [] },
    timeline: [],
    memories: [],
    artifacts: [],
    nextFollowup: null,
    ...overrides,
  };
}

describe("findCrashRecovery", () => {
  it("prefers a new handoff_recovered event when proof exists", () => {
    const result = findCrashRecovery(
      detail({
        lead: {
          ...detail().lead,
          workerId: "worker_new",
        },
        timeline: [
          {
            id: "evt_handoff",
            type: "handoff_recovered",
            summary: "已恢复客户画像与下一步",
            workerId: "worker_new",
            memoryRefs: [],
            artifactRefs: ["0xproof"],
            createdAt: "2026-06-19T03:00:03.000Z",
          },
        ],
      }),
      new Date("2026-06-19T03:00:00.000Z").getTime(),
      new Date("2026-06-19T03:00:01.000Z").getTime(),
      "fallback",
    );

    expect(result).toEqual({
      newWorker: "worker_new",
      summary: "已恢复客户画像与下一步",
    });
  });

  it("treats a post-crash real worker claim as recovery even when proof event is missing", () => {
    const result = findCrashRecovery(
      detail({
        lead: {
          ...detail().lead,
          updatedAt: "2026-06-19T03:00:05.000Z",
          workerId: "worker_new",
        },
      }),
      new Date("2026-06-19T03:00:00.000Z").getTime(),
      new Date("2026-06-19T03:00:01.000Z").getTime(),
      "聊天已恢复",
    );

    expect(result).toEqual({
      newWorker: "worker_new",
      summary: "聊天已恢复",
    });
  });

  it("keeps waiting while the demo crashed worker still owns the lead", () => {
    const result = findCrashRecovery(
      detail({
        lead: {
          ...detail().lead,
          updatedAt: "2026-06-19T03:00:05.000Z",
          workerId: CRASHED_DEMO_WORKER_ID,
        },
      }),
      new Date("2026-06-19T03:00:00.000Z").getTime(),
      new Date("2026-06-19T03:00:01.000Z").getTime(),
      "fallback",
    );

    expect(result).toBeNull();
  });
});
