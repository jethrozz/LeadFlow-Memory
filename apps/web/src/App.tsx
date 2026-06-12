import { useEffect, useState } from "react";
import { fetchDashboardLeadDetail, fetchDashboardLeads } from "./api";
import { FollowupPanel } from "./components/FollowupPanel";
import { Inspector } from "./components/Inspector";
import { LeadList } from "./components/LeadList";
import { ProfilePanel } from "./components/ProfilePanel";
import { Timeline } from "./components/Timeline";
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
          {isLoading ? <p>加载线索中...</p> : null}
          <LeadList leads={leads} selectedLeadId={selectedLeadId} onSelectLead={setSelectedLeadId} />
        </aside>
        <section className="panel main-panel">
          <ProfilePanel detail={detail} />
          <Timeline detail={detail} />
        </section>
        <aside className="panel">
          <FollowupPanel detail={detail} />
          <Inspector detail={detail} />
        </aside>
      </section>
    </main>
  );
}
