import { useEffect, useState } from "react";
import { fetchDashboardLeadDetail, fetchDashboardLeads } from "./api";
import type { DashboardLeadDetail, DashboardLeadItem } from "./types";
import "./styles.css";

export function App() {
  const [leads, setLeads] = useState<DashboardLeadItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DashboardLeadDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchDashboardLeads().then((items) => {
      if (!active) return;
      setLeads(items);
      setSelectedLeadId(items[0]?.id ?? null);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedLeadId) return;
    let active = true;
    fetchDashboardLeadDetail(selectedLeadId).then((data) => {
      if (active) setDetail(data);
    });
    return () => {
      active = false;
    };
  }, [selectedLeadId]);

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Walrus Track Demo</p>
        <h1>LeadFlow Memory</h1>
        <p>可验证长期记忆销售 Agent 工作台</p>
      </header>
      <section className="dashboard-grid">
        <aside className="panel">
          <h2>线索列表</h2>
          {isLoading ? <p>加载线索中...</p> : null}
          {leads.map((lead) => (
            <button className="lead-card" key={lead.id} onClick={() => setSelectedLeadId(lead.id)}>
              <strong>{lead.displayName}</strong>
              <span>{lead.intentLevel} · {lead.status}</span>
              <small>{lead.summary}</small>
            </button>
          ))}
        </aside>
        <section className="panel">
          <h2>客户长期记忆</h2>
          <p>{detail?.profile.summary ?? "选择一个线索查看长期记忆。"}</p>
          {detail ? Object.entries(detail.profile.fields).map(([key, field]) => (
            <div className="field-row" key={key}>
              <span>{field.label}</span>
              <strong>{field.value}</strong>
            </div>
          )) : null}
        </section>
        <aside className="panel">
          <h2>Inspector</h2>
          <p>{detail?.nextFollowup ?? "等待 Agent 生成下一步。"}</p>
        </aside>
      </section>
    </main>
  );
}
