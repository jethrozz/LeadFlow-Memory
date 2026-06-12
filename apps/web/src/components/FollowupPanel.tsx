import type { DashboardLeadDetail } from "../types";

export function FollowupPanel(props: {
  detail: DashboardLeadDetail | null;
  onSync: () => void;
  onSend: () => void;
  onHandoff: () => void;
}) {
  return (
    <section className="followup-card">
      <h2>Next Follow-up</h2>
      <p>{props.detail?.nextFollowup ?? "等待 Agent 生成下一步。"}</p>
      <div className="action-row">
        <button onClick={props.onSync}>同步小红书聊天</button>
        <button onClick={props.onSend}>发送跟进私信</button>
        <button onClick={props.onHandoff}>触发接力恢复</button>
      </div>
    </section>
  );
}
