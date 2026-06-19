export type TimelineStage = { key: string; label: string };

// 固定的 6 段展示模型（label 仅作回退；UI 用 i18n 的 stage_* 文案）。
export const TIMELINE_STAGES: TimelineStage[] = [
  { key: "discovered", label: "发现线索" },
  { key: "scored", label: "意向评分" },
  { key: "contacted", label: "首次跟进" },
  { key: "replied", label: "客户回复" },
  { key: "updated", label: "记忆更新" },
  { key: "handoff", label: "接力恢复" },
];

// 线索状态 → 当前活跃阶段索引（该阶段及之前算"已完成/进行中"）。
// 设计前提：只要线索进了库且有意向等级，"发现线索"和"意向评分"必然已过。
const STATUS_TO_STAGE: Record<string, number> = {
  discovered: 2, // 已发现+已评分，下一步首次跟进
  qualified: 2,
  assigned: 2,
  contacting: 2, // 首次跟进进行中
  asking_contact: 2,
  replied: 3, // 客户已回复
  contact_obtained: 3,
  nurturing: 4, // 培育/记忆更新
  viewing_scheduled: 4,
  converted: 4,
  paused: 2,
  lost: 2,
};

// 根据线索真实状态（status + intentLevel）+ 时间线推断当前进度阶段。
// - 发生过接力恢复 → 停在最后阶段(5)。
// - 否则按 status 映射，并对"已进库且已评分"的线索保证至少到首次跟进(2)。
// - 无线索 → -1（未开始）。
export function leadStageIndex(
  lead: { status: string; intentLevel?: string | null } | null | undefined,
  timeline: Array<{ type: string }> = [],
): number {
  if (!lead) return -1;
  if (timeline.some((e) => e.type === "handoff_recovered")) return 5;
  const base = STATUS_TO_STAGE[lead.status] ?? 2;
  const floor = lead.intentLevel ? 2 : 1; // 已评分→发现+评分已完成；未评分→至少已发现
  return Math.max(base, floor);
}
