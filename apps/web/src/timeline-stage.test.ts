import { describe, expect, it } from "vitest";
import { TIMELINE_STAGES, currentStageIndex } from "./timeline-stage";

describe("timeline-stage", () => {
  it("暴露 6 个有序阶段", () => {
    expect(TIMELINE_STAGES.map((s) => s.key)).toEqual([
      "discovered",
      "scored",
      "contacted",
      "replied",
      "updated",
      "handoff",
    ]);
  });

  it("空时间线返回 -1（未开始）", () => {
    expect(currentStageIndex([])).toBe(-1);
  });

  it("最新事件 customer_replied 映射到 replied 阶段(索引 3)", () => {
    const idx = currentStageIndex([
      { type: "lead_discovered" },
      { type: "agent_replied" },
      { type: "customer_replied" },
    ]);
    expect(idx).toBe(3);
  });

  it("handoff_recovered 映射到最后阶段(索引 5)", () => {
    expect(currentStageIndex([{ type: "handoff_recovered" }])).toBe(5);
  });

  it("未知事件类型回退到 discovered(索引 0)", () => {
    expect(currentStageIndex([{ type: "something_else" }])).toBe(0);
  });
});
