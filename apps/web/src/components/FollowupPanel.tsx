import type { DashboardLeadDetail } from "../types";

export function FollowupPanel({ detail }: { detail: DashboardLeadDetail | null }) {
  return (
    <section className="followup-card">
      <h2>Next Follow-up</h2>
      <p>{detail?.nextFollowup ?? "等待 Agent 生成下一步。"}</p>
    </section>
  );
}
