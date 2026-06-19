import { useEffect, useMemo, useState } from "react";
import {
  fetchDashboardLeadDetail,
  fetchDashboardLeads,
  sendFollowup,
  simulateCrash,
  startFollowup,
} from "./api";
import type { DashboardLeadDetail, DashboardLeadItem } from "./types";
import { DeviceScreen } from "./DeviceScreen";
import { TIMELINE_STAGES, currentStageIndex } from "./timeline-stage";
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 把长 workerId 收成可读短名：worker_192.168.0.100_56443_7668 → Worker-7668。 */
function shortWorker(id?: string | null): string {
  if (!id) return "待命 Worker";
  if (id === "worker_crashed_demo") return "已崩溃 Worker";
  const seg = id.split("_").pop();
  return `Worker-${seg ?? id}`;
}

type Tab = "followup" | "artifacts" | "memory" | "trace";

type CrashStage = "crashing" | "waiting" | "recovered" | "timeout";
type CrashState = {
  stage: CrashStage;
  prevWorker: string;
  newWorker?: string;
  summary?: string;
};

export function App() {
  const [leads, setLeads] = useState<DashboardLeadItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DashboardLeadDetail | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("followup");
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [crashState, setCrashState] = useState<CrashState | null>(null);

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

  useEffect(() => {
    const timer = setInterval(() => {
      if (busy) return;
      fetchDashboardLeads().then(setLeads).catch(() => {});
      if (selectedLeadId) {
        fetchDashboardLeadDetail(selectedLeadId).then(setDetail).catch(() => {});
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [busy, selectedLeadId]);

  async function withBusy(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      const items = await fetchDashboardLeads();
      setLeads(items);
      if (selectedLeadId) setDetail(await fetchDashboardLeadDetail(selectedLeadId));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }


  // 模拟崩溃 + 接力动画：点击后播放三幕动画，并真实轮询后端时间线，
  // 等到新的 handoff_recovered 事件后揭晓恢复摘要(动画不是假的，结尾是真实接力结果)。
  async function handleSimulateCrash() {
    if (!selectedLeadId || !detail) return;
    const leadId = selectedLeadId;
    const prevWorker = detail.lead.workerId ?? "worker";
    // 基线：崩溃前最近一次接力恢复的时间戳，之后出现的才算"本次"接力。
    const baselineTs = detail.timeline
      .filter((e) => e.type === "handoff_recovered")
      .reduce((max, e) => Math.max(max, new Date(e.createdAt).getTime()), 0);

    setBusy(true);
    setCrashState({ stage: "crashing", prevWorker });
    try {
      await simulateCrash(leadId);
    } catch (e) {
      setCrashState(null);
      setBusy(false);
      alert(e instanceof Error ? e.message : String(e));
      return;
    }

    await sleep(1800); // 崩溃动画
    setCrashState((s) => (s ? { ...s, stage: "waiting" } : s));

    // 轮询等待真实接力(下一 tick 才发生，最多等 ~70s)。
    const deadline = Date.now() + 70_000;
    let found: { newWorker: string; summary: string } | null = null;
    while (Date.now() < deadline) {
      await sleep(2500);
      let d: DashboardLeadDetail;
      try {
        d = await fetchDashboardLeadDetail(leadId);
      } catch {
        continue;
      }
      setDetail(d);
      const rec = d.timeline
        .filter((e) => e.type === "handoff_recovered" && new Date(e.createdAt).getTime() > baselineTs)
        .at(-1);
      if (rec) {
        found = { newWorker: rec.workerId ?? d.lead.workerId ?? "", summary: rec.summary };
        break;
      }
    }

    setCrashState((s) =>
      s
        ? found
          ? { ...s, stage: "recovered", newWorker: found.newWorker, summary: found.summary }
          : { ...s, stage: "timeout" }
        : s,
    );
    fetchDashboardLeads().then(setLeads).catch(() => {});
    setBusy(false);
  }

  const activeLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const stageIndex = currentStageIndex(detail?.timeline ?? []);
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
              <p>尚无线索数据。请通过 API 添加线索后刷新。</p>
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
                  <span className={`badge status-${lead.status}`}>{lead.status}</span>
                  {lead.workerId
                    ? <span className="badge worker">{lead.workerId}</span>
                    : <span className="badge none">无主</span>}
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

        {/* ① 会话状态条 */}
        <div className="session-bar">
          {activeLead ? (
            <>
              <span className="session-dot" /> 正在跟进{" "}
              <strong>{activeLead.displayName}</strong> · {activeLead.intentLevel} 级 · 触达{" "}
              {detail?.lead.followupTouchCount ?? 0}
            </>
          ) : (
            <span className="session-muted">未选择线索</span>
          )}
        </div>

        {/* ② 画像 + 跟进控制台(含 Inspector Tab) */}
        <div className="mid-row">
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

          <section className="console panel">
            <div className="tab-row" role="tablist" aria-label="跟进与证据">
              {(
                [
                  ["followup", "跟进话术"],
                  ["artifacts", "Walrus Artifacts"],
                  ["memory", "MemWal 记忆"],
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

            {activeTab === "followup" ? (
              <div className="followup-body">
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
                  <button type="button" disabled={!selectedLeadId || busy}
                    onClick={() => withBusy(() => startFollowup(selectedLeadId!))}>
                    加入跟进
                  </button>
                  <button type="button"
                    disabled={!selectedLeadId || busy || detail?.lead.status !== "contacting"}
                    onClick={handleSimulateCrash}>
                    模拟崩溃
                  </button>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="手动发一句…" />
                  <button type="button" disabled={!selectedLeadId || busy || !draft}
                    onClick={() => withBusy(async () => { await sendFollowup(selectedLeadId!, draft); setDraft(""); })}>
                    手动发
                  </button>
                </div>
              </div>
            ) : null}

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

        {/* ③ 底部横向时间线进度带 */}
        <section className="timeline-strip panel">
          <p className="section-kicker">记忆时间线 · 当前进度</p>
          <div className="hsteps">
            {TIMELINE_STAGES.map((stage, i) => {
              const cls =
                i < stageIndex ? "hstep done" : i === stageIndex ? "hstep cur" : "hstep";
              return (
                <div className={cls} key={stage.key}>
                  <span className="hnode" />
                  <span className="hlabel">{stage.label}</span>
                  {i === stageIndex ? <span className="hcur">进行中</span> : null}
                </div>
              );
            })}
          </div>
          {activeEvent ? (
            <div className="strip-detail">
              <span>{EVENT_LABELS[activeEvent.type] ?? activeEvent.type}：{activeEvent.summary}</span>
              <code>{activeEvent.artifactRefs[0] ?? "—"}</code>
            </div>
          ) : null}
        </section>
      </section>

      <aside className="device-rail">
        <DeviceScreen />
      </aside>

      {crashState ? (
        <div className="crash-overlay" role="dialog" aria-modal="true">
          <div className={`crash-stage stage-${crashState.stage}`}>
            <button
              className="crash-close"
              type="button"
              aria-label="关闭"
              onClick={() => setCrashState(null)}
            >
              ×
            </button>

            <p className="crash-title">
              {crashState.stage === "crashing" && "💥 Worker 崩溃"}
              {crashState.stage === "waiting" && "🛟 接力恢复进行中…"}
              {crashState.stage === "recovered" && "✅ 接力成功，已恢复上下文"}
              {crashState.stage === "timeout" && "⏳ 接管处理中"}
            </p>

            <div className="crash-agents">
              <div
                className={`crash-agent old ${
                  crashState.stage === "crashing" ? "boom" : "dead"
                }`}
              >
                <div className="crash-avatar">🤖</div>
                <span className="crash-agent-name">{shortWorker(crashState.prevWorker)}</span>
                <span className="crash-agent-tag">原 Worker</span>
              </div>

              <div className={`crash-beam stage-${crashState.stage}`}>
                <span className="crash-packet">🧠 记忆</span>
              </div>

              <div
                className={`crash-agent new ${
                  crashState.stage === "recovered" ? "alive" : ""
                }`}
              >
                <div className="crash-avatar">🤖</div>
                <span className="crash-agent-name">
                  {crashState.newWorker ? shortWorker(crashState.newWorker) : "待命 Worker"}
                </span>
                <span className="crash-agent-tag">接力 Worker</span>
              </div>
            </div>

            <div className="crash-detail">
              {crashState.stage === "crashing" && (
                <p>原 Worker 异常退出，租约失效，跟进中断…</p>
              )}
              {crashState.stage === "waiting" && (
                <p>另一个 Worker 正在认领该线索，并从 MemWal 召回客户长期记忆以恢复上下文…</p>
              )}
              {crashState.stage === "recovered" && (
                <>
                  <p className="crash-summary-label">从 MemWal 长期记忆恢复：</p>
                  <blockquote className="crash-summary">{crashState.summary}</blockquote>
                </>
              )}
              {crashState.stage === "timeout" && (
                <p>接管仍在进行，稍后可在「记忆时间线」查看 接力恢复 事件与恢复摘要。</p>
              )}
            </div>

            {(crashState.stage === "recovered" || crashState.stage === "timeout") && (
              <button className="crash-done" type="button" onClick={() => setCrashState(null)}>
                完成
              </button>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
