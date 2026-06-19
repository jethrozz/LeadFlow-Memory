import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import {
  fetchDashboardLeadDetail,
  fetchDashboardLeads,
  sendFollowup,
  simulateCrash,
  startFollowup,
} from "./api";
import type { DashboardLeadDetail, DashboardLeadItem } from "./types";
import { DeviceScreen } from "./DeviceScreen";
import { CRASHED_DEMO_WORKER_ID, findCrashRecovery } from "./crash-recovery";
import { useI18n, type TFunc } from "./i18n";
import "./styles.css";

// 把带前缀的枚举值翻译成本地化标签；字典里没有就回退到原始值（如未知 status）。
function label(t: TFunc, prefix: string, value: string): string {
  const key = `${prefix}_${value}`;
  const r = t(key);
  return r === key ? value : r;
}

function formatTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 把长 workerId 收成可读短名：worker_192.168.0.100_56443_7668 → Worker-7668。 */
function shortWorker(id: string | null | undefined, t: TFunc): string {
  if (!id) return t("crashStandbyWorker");
  if (id === CRASHED_DEMO_WORKER_ID) return t("crashCrashedWorker");
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
  const { t, lang, setLang } = useI18n();
  const [leads, setLeads] = useState<DashboardLeadItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DashboardLeadDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("followup");
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [crashState, setCrashState] = useState<CrashState | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const detailBodyRef = useRef<HTMLDivElement | null>(null);
  const crashRunIdRef = useRef(0);

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
      setIsDetailLoading(false);
      return;
    }
    let active = true;
    setIsDetailLoading(true);
    fetchDashboardLeadDetail(selectedLeadId)
      .then((data) => {
        if (!active) return;
        setDetail(data);
        setActiveEventId(data.timeline.at(-1)?.id ?? null);
        setIsDetailLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setIsDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedLeadId]);

  useEffect(() => {
    const panel = detailPanelRef.current;
    const body = detailBodyRef.current;
    if (!panel || !body || isDetailLoading || !detail || detail.lead.id !== selectedLeadId) return;

    const items = body.querySelectorAll(".detail-anim-item");
    gsap.killTweensOf(panel);
    gsap.killTweensOf(items);

    const timeline = gsap.timeline({
      defaults: { duration: 0.44, ease: "power2.out", overwrite: "auto" },
    });

    timeline
      .fromTo(panel, { y: 10 }, { y: 0, clearProps: "transform" })
      .fromTo(
        items,
        { y: 18, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          stagger: 0.06,
          clearProps: "transform,opacity,visibility",
        },
        "<0.08",
      );

    return () => {
      timeline.kill();
    };
  }, [detail, isDetailLoading, selectedLeadId]);

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
    if (!selectedLeadId || !currentDetail) return;
    const leadId = selectedLeadId;
    const runId = crashRunIdRef.current + 1;
    crashRunIdRef.current = runId;
    const prevWorker = currentDetail.lead.workerId ?? "worker";
    const crashStartedAtMs = Date.now();
    // 基线：崩溃前最近一次接力恢复的时间戳，之后出现的才算"本次"接力。
    const baselineTs = currentDetail.timeline
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
    if (crashRunIdRef.current !== runId) return;
    setCrashState((s) => (s ? { ...s, stage: "waiting" } : s));

    // 轮询等待真实接力(下一 tick 才发生，最多等 ~70s)。
    const deadline = Date.now() + 70_000;
    let found: { newWorker: string; summary: string } | null = null;
    while (Date.now() < deadline) {
      await sleep(2500);
      if (crashRunIdRef.current !== runId) return;
      let d: DashboardLeadDetail;
      try {
        d = await fetchDashboardLeadDetail(leadId);
      } catch {
        continue;
      }
      setDetail(d);
      const recovery = findCrashRecovery(
        d,
        baselineTs,
        crashStartedAtMs,
        t("crashRecoveredFallback"),
      );
      if (recovery) {
        found = recovery;
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
    if (found) {
      await sleep(2400);
      if (crashRunIdRef.current !== runId) return;
      setCrashState((s) => (s?.stage === "recovered" ? null : s));
    }
  }

  const activeLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const isFreshDetail = detail?.lead.id === selectedLeadId;
  const currentDetail = isFreshDetail ? detail : null;
  const detailReady = Boolean(currentDetail && !isDetailLoading);
  const timelineEvents = currentDetail?.timeline ?? [];
  const activeEvent =
    timelineEvents.find((event) => event.id === activeEventId) ?? timelineEvents.at(-1) ?? null;

  const lastInbound = useMemo(
    () => currentDetail?.conversation.messages.filter((m) => m.direction === "inbound").at(-1) ?? null,
    [currentDetail],
  );
  const lastReply = currentDetail?.conversation.messages.at(-1) ?? null;

  const profileFields = currentDetail ? Object.values(currentDetail.profile.fields) : [];
  const budgetField = currentDetail?.profile.fields.budget;
  const districtField = currentDetail?.profile.fields.district;
  const usedMemoryChips = currentDetail
    ? [...(budgetField ? [t("budgetCapChip")] : []), ...currentDetail.profile.needs]
    : [];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">AL</div>
          <div>
            <p className="eyebrow">{t("brandEyebrow")}</p>
            <h1>{t("brandTitle")}</h1>
          </div>
        </div>

        <section className="lead-section">
          <div className="section-heading">
            <span>{t("leadsTitle")}</span>
            <strong>{leads.length} {t("activeSuffix")}</strong>
          </div>
          <div className="lead-tabs" aria-label={t("leadFilterAria")}>
            {["filterNew", "filterFollowing", "filterReplied", "filterHandoff"].map((key) => (
              <span className="filter-pill" key={key}>
                {t(key)}
              </span>
            ))}
          </div>

          {isLoading ? (
            <p className="lead-meta">{t("loadingLeads")}</p>
          ) : leads.length === 0 ? (
            <div className="seed-empty">
              <p>{t("emptyLeads")}</p>
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
                      {lead.isDemoSeed ? <span className="demo-tag">{t("demoTag")}</span> : null}
                    </strong>
                    <span className="score">{lead.intentLevel}</span>
                  </span>
                  {lead.district ? <span className="lead-meta">{lead.district}</span> : null}
                  {lead.needs && lead.needs.length > 0 ? (
                    <span className="lead-need">{lead.needs.slice(0, 2).join(" · ")}</span>
                  ) : null}
                  <span className="lead-state">{label(t, "status", lead.status)}</span>
                  <span className={`badge status-${lead.status}`}>{lead.status}</span>
                  {lead.workerId
                    ? <span className="badge worker">{lead.workerId}</span>
                    : <span className="badge none">{t("unassigned")}</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="data-layer">
          <p className="section-kicker">{t("dataLayer")}</p>
          <div className="layer-row">
            <span>{t("memwalRead")}</span>
            <strong>{t("running")}</strong>
          </div>
          <div className="layer-row">
            <span>{t("walrusArtifacts")}</span>
            <strong>{currentDetail ? `${currentDetail.artifacts.length} ${t("verifiedSuffix")}` : "—"}</strong>
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t("topEyebrow")}</p>
            <h2>{t("workbenchTitle")}</h2>
          </div>
          <div className="status-cluster">
            <button
              className="lang-toggle"
              type="button"
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              aria-label="切换语言 / Switch language"
            >
              {lang === "zh" ? "EN" : "中文"}
            </button>
            <span className="verified-dot">{t("verifiedLayer")}</span>
          </div>
        </header>

        {/* ① 会话状态条 */}
        <div className="session-bar">
          {activeLead ? (
            <>
              <span className="session-dot" /> {t("sessionFollowing")}{" "}
              <strong>{activeLead.displayName}</strong> ·{" "}
              {t("sessionIntent", { intent: activeLead.intentLevel })} ·{" "}
              {t("sessionTouches", { touch: currentDetail?.lead.followupTouchCount ?? 0 })}
            </>
          ) : (
            <span className="session-muted">{t("noLeadSelected")}</span>
          )}
        </div>

        {/* ② 画像 + 跟进控制台(含 Inspector Tab) */}
        <div className="mid-row">
          <section
            className="lead-profile panel"
            ref={detailPanelRef}
            aria-busy={selectedLeadId ? !detailReady : undefined}
          >
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t("currentLead")}</p>
                <h3>{activeLead?.displayName ?? t("noLeadSelected")}</h3>
              </div>
              {activeLead ? (
                <span className="intent-badge">{t("intent")} {activeLead.intentLevel}</span>
              ) : null}
            </div>

            <div className="lead-profile-body" ref={detailBodyRef}>
              {detailReady && currentDetail ? (
                <>
                  <div className="requirement-grid detail-anim-item">
                    <div>
                      <span>{t("budget")}</span>
                      <strong>{budgetField?.value ?? t("tbd")}</strong>
                    </div>
                    <div>
                      <span>{t("area")}</span>
                      <strong>{districtField?.value ?? t("tbd")}</strong>
                    </div>
                    <div>
                      <span>{t("stage")}</span>
                      <strong>{label(t, "status", activeLead?.status ?? "")}</strong>
                    </div>
                  </div>

                  {currentDetail.profile.needs.length > 0 ? (
                    <div className="chips detail-anim-item">
                      {currentDetail.profile.needs.map((need) => (
                        <span key={need}>{need}</span>
                      ))}
                    </div>
                  ) : null}

                  {currentDetail.profile.sourceNote ? (
                    <div className="source-note detail-anim-item">
                      <p className="section-kicker">{t("sourceSignal")}</p>
                      <p>{currentDetail.profile.sourceNote}</p>
                    </div>
                  ) : null}

                  <div className="customer-reply detail-anim-item">
                    <p className="section-kicker">{t("latestReply")}</p>
                    <blockquote className={lastReply?.direction === "outbound" ? "outbound" : ""}>
                      {lastInbound?.content ?? t("noReply")}
                    </blockquote>
                  </div>
                </>
              ) : selectedLeadId ? (
                <div className="lead-detail-skeleton" aria-hidden="true">
                  <div className="lead-skeleton-grid detail-anim-item">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="lead-skeleton-chips detail-anim-item">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="lead-skeleton-block detail-anim-item" />
                  <div className="lead-skeleton-block lead-skeleton-block-tall detail-anim-item" />
                </div>
              ) : (
                <p className="lead-meta">{t("selectLeadHint")}</p>
              )}
            </div>
          </section>

          <section className="console panel">
            <div className="tab-row" role="tablist" aria-label={t("consoleAria")}>
              {(
                [
                  ["followup", t("tabFollowup")],
                  ["artifacts", t("tabArtifacts")],
                  ["memory", t("tabMemory")],
                  ["trace", t("tabTrace")],
                ] as Array<[Tab, string]>
              ).map(([key, text]) => (
                <button
                  className={activeTab === key ? "tab active" : "tab"}
                  key={key}
                  onClick={() => setActiveTab(key)}
                  type="button"
                >
                  {text}
                </button>
              ))}
            </div>

            {activeTab === "followup" ? (
              <div className="followup-body">
                <div className="message-preview">
                  <p>{currentDetail?.nextFollowup?.message ?? t("waitingFollowup")}</p>
                </div>
                {usedMemoryChips.length > 0 ? (
                  <div className="used-memory">
                    <p className="section-kicker">{t("usedMemory")}</p>
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
                    {t("btnStart")}
                  </button>
                  <button type="button"
                    disabled={!selectedLeadId || busy || currentDetail?.lead.status !== "contacting"}
                    onClick={handleSimulateCrash}>
                    {t("btnCrash")}
                  </button>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("sendPlaceholder")} />
                  <button type="button" disabled={!selectedLeadId || busy || !draft}
                    onClick={() => withBusy(async () => { await sendFollowup(selectedLeadId!, draft); setDraft(""); })}>
                    {t("btnSend")}
                  </button>
                </div>
              </div>
            ) : null}

            {activeTab === "memory" ? (
              <div className="memory-grid">
                {(currentDetail?.memories ?? []).map((memory) => (
                  <div className="memory-row" key={memory.id}>
                    <span>{label(t, "kind", memory.kind)}</span>
                    <strong>{memory.summary}</strong>
                  </div>
                ))}
                {currentDetail && currentDetail.memories.length === 0
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
                {(currentDetail?.artifacts ?? []).map((artifact) => (
                  <div className="artifact-row" key={artifact.id}>
                    <div>
                      <strong>{label(t, "artifact", artifact.artifactType)}</strong>
                      <span>{artifact.summary ?? artifact.artifactType}</span>
                    </div>
                    <code>{artifact.blobId}</code>
                    <span className="verified-label">{t("verified")}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {activeTab === "trace" ? (
              <div className="trace-list">
                {(currentDetail?.timeline ?? []).map((event) => (
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

        {/* ③ 底部横向时间线：真实事件流 + 横向滚动窗口（每个事件一个节点）。 */}
        <section className="timeline-strip panel">
          <p className="section-kicker">{t("timelineTitle")}</p>
          {timelineEvents.length > 0 ? (
            <div className="htl-scroll">
              <div className="htl-track">
                {timelineEvents.map((event, i) => {
                  const isLast = i === timelineEvents.length - 1;
                  const cls = [
                    "hstep",
                    "done",
                    isLast ? "cur" : "",
                    event.id === activeEventId ? "active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      className={cls}
                      key={event.id}
                      type="button"
                      onClick={() => setActiveEventId(event.id)}
                    >
                      <span className="hnode" />
                      <span className="hlabel">{label(t, "event", event.type)}</span>
                      <span className="htime">{formatTime(event.createdAt)}</span>
                      {isLast ? <span className="hcur">{t("inProgress")}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="lead-meta">{t("timelineEmpty")}</p>
          )}
          {activeEvent ? (
            <div className="strip-detail">
              <span>{label(t, "event", activeEvent.type)}: {activeEvent.summary}</span>
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
              aria-label={t("crashClose")}
              onClick={() => {
                crashRunIdRef.current += 1;
                setCrashState(null);
                setBusy(false);
              }}
            >
              ×
            </button>

            <p className="crash-title">
              {crashState.stage === "crashing" && t("crashTitleCrashing")}
              {crashState.stage === "waiting" && t("crashTitleWaiting")}
              {crashState.stage === "recovered" && t("crashTitleRecovered")}
              {crashState.stage === "timeout" && t("crashTitleTimeout")}
            </p>

            <div className="crash-agents">
              <div
                className={`crash-agent old ${
                  crashState.stage === "crashing" ? "boom" : "dead"
                }`}
              >
                <div className="crash-avatar">🤖</div>
                <span className="crash-agent-name">{shortWorker(crashState.prevWorker, t)}</span>
                <span className="crash-agent-tag">{t("crashOldWorker")}</span>
              </div>

              <div className={`crash-beam stage-${crashState.stage}`}>
                <span className="crash-packet">{t("crashMemoryPacket")}</span>
              </div>

              <div
                className={`crash-agent new ${
                  crashState.stage === "recovered" ? "alive" : ""
                }`}
              >
                <div className="crash-avatar">🤖</div>
                <span className="crash-agent-name">
                  {crashState.newWorker ? shortWorker(crashState.newWorker, t) : t("crashStandbyWorker")}
                </span>
                <span className="crash-agent-tag">{t("crashNewWorker")}</span>
              </div>
            </div>

            <div className="crash-detail">
              {crashState.stage === "crashing" && <p>{t("crashDetailCrashing")}</p>}
              {crashState.stage === "waiting" && <p>{t("crashDetailWaiting")}</p>}
              {crashState.stage === "recovered" && (
                <>
                  <p className="crash-summary-label">{t("crashRecoveredLabel")}</p>
                  <blockquote className="crash-summary">{crashState.summary}</blockquote>
                </>
              )}
              {crashState.stage === "timeout" && <p>{t("crashDetailTimeout")}</p>}
            </div>

            {(crashState.stage === "recovered" || crashState.stage === "timeout") && (
              <button className="crash-done" type="button" onClick={() => setCrashState(null)}>
                {t("crashDone")}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
