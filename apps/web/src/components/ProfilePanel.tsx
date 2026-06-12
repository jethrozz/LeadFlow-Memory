import type { DashboardLeadDetail } from "../types";

export function ProfilePanel({ detail }: { detail: DashboardLeadDetail | null }) {
  return (
    <>
      <h2>客户长期记忆</h2>
      <p>{detail?.profile.summary ?? "选择一个线索查看长期记忆。"}</p>
      {detail ? Object.entries(detail.profile.fields).map(([key, field]) => (
        <div className="field-row" key={key}>
          <span>{field.label}</span>
          <strong>{field.value}</strong>
        </div>
      )) : null}
    </>
  );
}
