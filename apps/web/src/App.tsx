import { useEffect, useMemo, useState } from "react";
import {
  fetchDashboardLeadDetail,
  fetchDashboardLeads,
  runHandoff,
  seedDemo,
  sendFollowup,
  syncConversation,
} from "./api";
import type { DashboardLeadDetail, DashboardLeadItem } from "./types";
import "./styles.css";

const STATUS_LABELS: Record<string, string> = {
  discovered: "新线索",
  asking_contact: "索要联系方式",
  nurturing: "跟进中",
  replied: "已回复",
  handoff: "接力中",
};

const EVENT_LABELS: Record<string, string> = {
  lead_discovered: "发现线索",
  conversion_decision_made: "生成跟进",
  handoff_recovered: "接力恢复",
  customer_replied: "客户回复",
  agent_replied: "发送跟进",
};

const ARTIFACT_LABELS: Record<string, string> = {
  source_snapshot: "来源快照",
  lead_discovery_report: "线索发现报告",
  conversion_decision: "转化决策",
  memory_diff: "记忆差异",
  handoff_proof: "接力证明",
};

const KIND_LABELS: Record<string, string> = {
  budget: "预算",
  strategy: "策略",
  source_evidence: "来源证据",
  customer_reply: "客户回复",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function formatTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

type Tab = "memory" | "artifacts" | "trace";

export function App() {
  const [leads, setLeads] = useState<DashboardLeadItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DashboardLeadDetail | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("artifacts");
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  const loadLeads = async (preferLeadId?: string) => {
    const items = await fetchDashboardLeads();
    setLeads(items);
    setSelectedLeadId((current) => preferLeadId ?? current ?? items[0]?.id ?? null);
    setIsLoading(false);
  };

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
    if (!selectedLeadId) {
      setDetail(null);
      return;
    }
    let active = true;
    fetchDashboardLeadDetail(selectedLeadId).then((data) => {
      if (!active) return;
      setDetail(data);
      setActiveEventId(data.timeline.at(-1)?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, [selectedLeadId]);

  const refreshSelectedLead = async () => {
    if (!selectedLeadId) return;
    setDetail(await fetchDashboardLeadDetail(selectedLeadId));
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const { leadId } = await seedDemo();
      await loadLeads(leadId);
      setSelectedLeadId(leadId);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSync = async () => {
    if (!selectedLeadId) return;
    await syncConversation(selectedLeadId);
    await refreshSelectedLead();
  };

  const handleSend = async () => {
    if (!selectedLeadId || !detail?.nextFollowup) return;
    await sendFollowup(selectedLeadId, detail.nextFollowup.message);
    await refreshSelectedLead();
  };

  const handleHandoff = async () => {
    if (!selectedLeadId) return;
    await runHandoff(selectedLeadId);
    await refreshSelectedLead();
  };

  const activeLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const activeEvent =
    detail?.timeline.find((event) => event.id === activeEventId) ?? detail?.timeline[0] ?? null;

  const lastInbound = useMemo(
    () => detail?.conversation.messages.filter((m) => m.direction === "inbound").at(-1) ?? null,
    [detail],
  );
  const lastReply = detail?.conversation.messages.at(-1) ?? null;

  const profileFields = detail ? Object.values(detail.profile.fields) : [];
  const budgetField = detail?.profile.fields.budget;
  const districtField = detail?.profile.fields.district;
  const usedMemoryChips = detail
    ? [...(budgetField ? ["预算上限"] : []), ...detail.profile.needs]
    : [];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">LF</div>
          <div>
            <p className="eyebrow">Walrus 赛道 Demo</p>
            <h1>LeadFlow Memory</h1>
          </div>
        </div>

        <section className="lead-section">
          <div className="section-heading">
            <span>房产线索</span>
            <strong>{leads.length} 条活跃</strong>
          </div>
          <div className="lead-tabs" aria-label="线索状态筛选">
            {["新线索", "跟进中", "已回复", "接力中"].map((item) => (
              <span className="filter-pill" key={item}>
                {item}
              </span>
            ))}
          </div>

          {isLoading ? (
            <p className="lead-meta">加载线索中…</p>
          ) : leads.length === 0 ? (
            <div className="seed-empty">
              <p>尚无线索数据。载入演示数据集即可查看完整画像。</p>
              <button type="button" onClick={handleSeed} disabled={isSeeding}>
                {isSeeding ? "载入中…" : "载入演示数据"}
              </button>
            </div>
          ) : (
            <div className="lead-list">
              {leads.map((lead) => (
                <button
                  className={lead.id === selectedLeadId ? "lead-row active" : "lead-row"}
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  type="button"
                >
                  <span className="lead-row-top">
                    <strong>
                      {lead.displayName}
                      {lead.isDemoSeed ? <span className="demo-tag">演示数据</span> : null}
                    </strong>
                    <span className="score">{lead.intentLevel}</span>
                  </span>
                  {lead.district ? <span className="lead-meta">{lead.district}</span> : null}
                  {lead.needs && lead.needs.length > 0 ? (
                    <span className="lead-need">{lead.needs.slice(0, 2).join(" · ")}</span>
                  ) : null}
                  <span className="lead-state">{statusLabel(lead.status)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="data-layer">
          <p className="section-kicker">数据层状态</p>
          <div className="layer-row">
            <span>MemWal 记忆读取</span>
            <strong>运行中</strong>
          </div>
          <div className="layer-row">
            <span>Walrus Artifacts</span>
            <strong>{detail ? `${detail.artifacts.length} 个已验证` : "—"}</strong>
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">从线索发现到客户转化的可携带长期记忆</p>
            <h2>房产销售 Agent 工作台</h2>
          </div>
          <div className="status-cluster">
            <span className="verified-dot">可信数据层已验证</span>
          </div>
        </header>

        <div className="content-grid">
          <section className="lead-profile panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">当前线索</p>
                <h3>{activeLead?.displayName ?? "未选择线索"}</h3>
              </div>
              {activeLead ? <span className="intent-badge">意向 {activeLead.intentLevel}</span> : null}
            </div>

            {detail ? (
              <>
                <div className="requirement-grid">
                  <div>
                    <span>预算</span>
                    <strong>{budgetField?.value ?? "待补充"}</strong>
                  </div>
                  <div>
                    <span>区域</span>
                    <strong>{districtField?.value ?? "待补充"}</strong>
                  </div>
                  <div>
                    <span>阶段</span>
                    <strong>{statusLabel(activeLead?.status ?? "")}</strong>
                  </div>
                </div>

                {detail.profile.needs.length > 0 ? (
                  <div className="chips">
                    {detail.profile.needs.map((need) => (
                      <span key={need}>{need}</span>
                    ))}
                  </div>
                ) : null}

                {detail.profile.sourceNote ? (
                  <div className="source-note">
                    <p className="section-kicker">来源信号</p>
                    <p>{detail.profile.sourceNote}</p>
                  </div>
                ) : null}

                <div className="customer-reply">
                  <p className="section-kicker">最近客户回复</p>
                  <blockquote className={lastReply?.direction === "outbound" ? "outbound" : ""}>
                    {lastInbound?.content ?? "暂无客户回复。"}
                  </blockquote>
                </div>
              </>
            ) : (
              <p className="lead-meta">选择左侧线索查看长期记忆画像。</p>
            )}
          </section>

          <section className="timeline-panel panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">记忆时间线</p>
                <h3>从线索发现到接力恢复</h3>
              </div>
              <span className="small-proof">Walrus 证明链完整</span>
            </div>

            <div className="timeline">
              {(detail?.timeline ?? []).map((event) => (
                <button
                  className={event.id === activeEvent?.id ? "timeline-event active" : "timeline-event"}
                  key={event.id}
                  onClick={() => setActiveEventId(event.id)}
                  type="button"
                >
                  <span className="event-node" />
                  <span className="event-time">{formatTime(event.createdAt)}</span>
                  <strong>{EVENT_LABELS[event.type] ?? event.type}</strong>
                  <span>{event.agentName ?? "Agent"}</span>
                </button>
              ))}
            </div>

            {activeEvent ? (
              <div className="event-detail">
                <div>
                  <p className="section-kicker">当前事件</p>
                  <h4>{EVENT_LABELS[activeEvent.type] ?? activeEvent.type}</h4>
                  <p>{activeEvent.summary}</p>
                </div>
                <div className="event-proof">
                  <span>{activeEvent.type}</span>
                  <strong>{activeEvent.artifactRefs[0] ?? "—"}</strong>
                </div>
              </div>
            ) : null}
          </section>

          <section className="follow-up panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">下一步最佳跟进</p>
                <h3>{detail?.nextFollowup?.worker ?? "转化 Agent"}</h3>
              </div>
              <span className="handoff-badge">{detail?.nextFollowup ? "已恢复" : "待生成"}</span>
            </div>
            <div className="message-preview">
              <p>{detail?.nextFollowup?.message ?? "等待 Agent 生成下一步跟进话术。"}</p>
            </div>
            {usedMemoryChips.length > 0 ? (
              <div className="used-memory">
                <p className="section-kicker">本次使用的记忆</p>
                <div className="chips compact">
                  {usedMemoryChips.map((chip) => (
                    <span key={chip}>{chip}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="follow-up-actions">
              <button type="button" onClick={handleSync} disabled={!selectedLeadId}>
                同步小红书聊天
              </button>
              <button
                className="primary"
                type="button"
                onClick={handleSend}
                disabled={!detail?.nextFollowup}
              >
                发送跟进私信
              </button>
              <button type="button" onClick={handleHandoff} disabled={!selectedLeadId}>
                触发接力恢复
              </button>
            </div>
          </section>

          <section className="inspector panel">
            <div className="tab-row" role="tablist" aria-label="Inspector 标签">
              {(
                [
                  ["memory", "MemWal 记忆"],
                  ["artifacts", "Walrus Artifacts"],
                  ["trace", "Agent Trace"],
                ] as Array<[Tab, string]>
              ).map(([key, label]) => (
                <button
                  className={activeTab === key ? "tab active" : "tab"}
                  key={key}
                  onClick={() => setActiveTab(key)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "memory" ? (
              <div className="memory-grid">
                {(detail?.memories ?? []).map((memory) => (
                  <div className="memory-row" key={memory.id}>
                    <span>{KIND_LABELS[memory.kind] ?? memory.kind}</span>
                    <strong>{memory.summary}</strong>
                  </div>
                ))}
                {detail && detail.memories.length === 0
                  ? profileFields.map((field) => (
                      <div className="memory-row" key={field.label}>
                        <span>{field.label}</span>
                        <strong>{field.value}</strong>
                      </div>
                    ))
                  : null}
              </div>
            ) : null}

            {activeTab === "artifacts" ? (
              <div className="artifact-list">
                {(detail?.artifacts ?? []).map((artifact) => (
                  <div className="artifact-row" key={artifact.id}>
                    <div>
                      <strong>{ARTIFACT_LABELS[artifact.artifactType] ?? artifact.artifactType}</strong>
                      <span>{artifact.summary ?? artifact.artifactType}</span>
                    </div>
                    <code>{artifact.blobId}</code>
                    <span className="verified-label">已验证</span>
                  </div>
                ))}
              </div>
            ) : null}

            {activeTab === "trace" ? (
              <div className="trace-list">
                {(detail?.timeline ?? []).map((event) => (
                  <div className="trace-row" key={event.id}>
                    <code>{event.agentName ?? event.type}</code>
                    <span>{event.summary}</span>
                    <strong>{formatTime(event.createdAt)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
