import { describe, expect, it } from "vitest";
import { TIMELINE_STAGES, leadStageIndex } from "./timeline-stage";

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

  it("无线索返回 -1（未开始）", () => {
    expect(leadStageIndex(null)).toBe(-1);
  });

  it("已进库且已评分的 discovered 线索：发现+评分已过，当前到首次跟进(索引 2)", () => {
    // 用户诉求：只要进了线索库且有意向等级，发现线索/意向评分必然已完成。
    expect(leadStageIndex({ status: "discovered", intentLevel: "A" })).toBe(2);
  });

  it("已回复线索映射到 replied 阶段(索引 3)", () => {
    expect(leadStageIndex({ status: "replied", intentLevel: "A" })).toBe(3);
  });

  it("发生过接力恢复 → 停在最后阶段(索引 5)", () => {
    expect(
      leadStageIndex({ status: "contacting", intentLevel: "A" }, [{ type: "handoff_recovered" }]),
    ).toBe(5);
  });

  it("未知 status 回退到首次跟进(索引 2)", () => {
    expect(leadStageIndex({ status: "unknown_status", intentLevel: "A" })).toBe(2);
  });
});
