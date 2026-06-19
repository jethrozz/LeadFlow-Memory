export type TimelineStage = { key: string; label: string };

// 固定的 6 段展示模型（与设计文档一致）。
export const TIMELINE_STAGES: TimelineStage[] = [
  { key: "discovered", label: "发现线索" },
  { key: "scored", label: "意向评分" },
  { key: "contacted", label: "首次跟进" },
  { key: "replied", label: "客户回复" },
  { key: "updated", label: "记忆更新" },
  { key: "handoff", label: "接力恢复" },
];

// 事件 type → 阶段索引。未列出的 type 回退到 0(发现线索)。
const TYPE_TO_STAGE: Record<string, number> = {
  lead_discovered: 0,
  conversion_decision_made: 2,
  agent_replied: 2,
  customer_replied: 3,
  memory_diff: 4,
  handoff_recovered: 5,
};

// 取时间线中"最靠后阶段"的事件作为当前进度；空数组返回 -1。
export function currentStageIndex(timeline: Array<{ type: string }>): number {
  if (timeline.length === 0) return -1;
  let maxIdx = 0;
  for (const ev of timeline) {
    const idx = TYPE_TO_STAGE[ev.type] ?? 0;
    if (idx > maxIdx) maxIdx = idx;
  }
  return maxIdx;
}
