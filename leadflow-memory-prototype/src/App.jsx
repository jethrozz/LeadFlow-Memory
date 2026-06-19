import { useState } from "react";
import { useI18n } from "./i18n.js";

// 线索状态筛选项：用稳定 key 驱动选中态，文案随语言切换。
const leadFilters = [
  { key: "filter_new", active: false },
  { key: "filter_following", active: false },
  { key: "filter_replied", active: false },
  { key: "filter_handoff", active: true },
];

const leads = [
  {
    id: "lead-chen",
    name: "陈薇",
    source: "小红书评论",
    status: "接力中",
    score: "A",
    stage: "已恢复接力",
    budget: "<= 130 万",
    location: "高新区",
    needs: ["三房", "近地铁", "学区优先"],
    lastReply: "预算最好 130 万以内，孩子明年上小学。",
    sourceNote: "想在高新区附近买个三房，预算别太高，最好通勤方便。",
    strategy: "优先推荐 130 万以内、兼顾学校和地铁的小区。",
    worker: "转化 Worker-2",
  },
  {
    id: "lead-lin",
    name: "林雨",
    source: "搜索结果",
    status: "已回复",
    score: "B+",
    stage: "记忆已更新",
    budget: "160-180 万",
    location: "金融城",
    needs: ["两房", "低楼层", "拎包入住"],
    lastReply: "我更在意月供压力，不只是总价。",
    sourceNote: "在小红书询问金融城附近精装现房。",
    strategy: "先给出月供测算，再推荐可直接入住的房源。",
    worker: "转化 Worker-1",
  },
  {
    id: "lead-zhao",
    name: "赵明",
    source: "发现 Agent",
    status: "新线索",
    score: "A-",
    stage: "已评分",
    budget: "约 200 万",
    location: "天府新区",
    needs: ["四房", "车位", "公园景观"],
    lastReply: "尚未私聊。发现 Agent 已从评论中提取购房意图。",
    sourceNote: "家庭改善型置换，希望小区环境和配套更好。",
    strategy: "从改善型居住价值和小区配套切入。",
    worker: "发现 Agent",
  },
];

const timeline = [
  {
    key: "discovered",
    label: "发现线索",
    agent: "发现 Agent",
    time: "09:12",
    summary: "在小红书房产讨论中发现明确购房意图。",
    memory: "初始意图：高新区附近三房，关注通勤。",
    artifact: "source-snapshot.wal",
    blob: "0x8f1...a92c",
  },
  {
    key: "scored",
    label: "意向评分",
    agent: "评分 Agent",
    time: "09:14",
    summary: "根据明确区域、户型和价格敏感度，判定为 A 级意向。",
    memory: "高意向原因：客户明确表达区域、户型和预算顾虑。",
    artifact: "lead-score-report.json",
    blob: "0x3a4...f17b",
  },
  {
    key: "contacted",
    label: "首次跟进",
    agent: "转化 Worker-1",
    time: "10:03",
    summary: "以通勤方便的三房房源作为首次开场。",
    memory: "使用记忆：区域、户型、通勤顾虑。",
    artifact: "conversation-log-01.json",
    blob: "0xb72...c0d5",
  },
  {
    key: "replied",
    label: "客户回复",
    agent: "mcp-xhs-chat",
    time: "10:21",
    summary: "客户收窄预算，并新增学区优先级。",
    memory: "新增事实：预算不超过 130 万，孩子明年上小学。",
    artifact: "customer-reply.txt",
    blob: "0x19d...880e",
  },
  {
    key: "updated",
    label: "记忆更新",
    agent: "MemWal Writer",
    time: "10:22",
    summary: "客户长期记忆已写入新的预算上限和学区需求。",
    memory: "更新策略：学区 + 地铁 + 130 万以内。",
    artifact: "memory-diff.json",
    blob: "0x6bc...42aa",
  },
  {
    key: "handoff",
    label: "接力恢复",
    agent: "转化 Worker-2",
    time: "10:27",
    summary: "Worker-1 异常后，Worker-2 通过 MemWal 恢复上下文继续跟进。",
    memory: "恢复事实：预算、学区、地铁、通勤、三房。",
    artifact: "handoff-proof.json",
    blob: "0xe25...9f03",
  },
];

const artifacts = [
  { name: "来源快照", type: "小红书证据", blob: "0x8f1...a92c", status: "已验证" },
  { name: "线索评分报告", type: "JSON 报告", blob: "0x3a4...f17b", status: "已验证" },
  { name: "对话记录", type: "聊天 Artifact", blob: "0xb72...c0d5", status: "已验证" },
  { name: "记忆差异", type: "MemWal 更新", blob: "0x6bc...42aa", status: "已验证" },
  { name: "接力证明", type: "恢复 Trace", blob: "0xe25...9f03", status: "已验证" },
];

const traceRows = [
  ["memwal.recall", "读取 5 条客户长期记忆", "42ms"],
  ["mcp-db-reader", "加载线索状态和 Worker 分配", "31ms"],
  ["walrus.getArtifact", "读取接力证明和历史 trace", "88ms"],
  ["agent.reason", "选择学区 + 地铁跟进角度", "1.2s"],
  ["mcp-xhs-chat", "生成下一轮私聊消息", "64ms"],
];

function App() {
  const { t, lang, setLang } = useI18n();
  const [activeLeadId, setActiveLeadId] = useState(leads[0].id);
  const [activeEventKey, setActiveEventKey] = useState("handoff");
  const [activeTab, setActiveTab] = useState("artifacts");

  const activeLead = leads.find((lead) => lead.id === activeLeadId) ?? leads[0];
  const activeEvent = timeline.find((event) => event.key === activeEventKey) ?? timeline[0];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">LF</div>
          <div>
            <p className="eyebrow">{t("eyebrowDemo")}</p>
            <h1>LeadFlow Memory</h1>
          </div>
        </div>

        <section className="lead-section">
          <div className="section-heading">
            <span>{t("leadsTitle")}</span>
            <strong>{t("leadsCount")}</strong>
          </div>
          <div className="lead-tabs" aria-label={t("leadFilterAria")}>
            {leadFilters.map((item) => (
              <button
                className={item.active ? "filter-pill active" : "filter-pill"}
                key={item.key}
                type="button"
              >
                {t(item.key)}
              </button>
            ))}
          </div>
          <div className="lead-list">
            {leads.map((lead) => (
              <button
                className={lead.id === activeLeadId ? "lead-row active" : "lead-row"}
                key={lead.id}
                onClick={() => setActiveLeadId(lead.id)}
                type="button"
              >
                <span className="lead-row-top">
                  <strong>{lead.name}</strong>
                  <span className={`score score-${lead.score.replace("+", "plus").replace("-", "minus")}`}>
                    {lead.score}
                  </span>
                </span>
                <span className="lead-meta">{lead.location}</span>
                <span className="lead-need">{lead.needs.slice(0, 2).join(" · ")}</span>
                <span className="lead-state">{lead.status}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="data-layer">
          <p className="section-kicker">{t("dataLayer")}</p>
          <div className="layer-row">
            <span>{t("memwalRead")}</span>
            <strong>{t("running")}</strong>
          </div>
          <div className="layer-row">
            <span>{t("walrusArtifacts")}</span>
            <strong>{t("verifiedCount")}</strong>
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
            >
              {lang === "zh" ? "EN" : "中文"}
            </button>
            <span className="verified-dot">{t("verifiedLayer")}</span>
            <button className="primary-action" type="button" onClick={() => setActiveEventKey("handoff")}>
              {t("replayHandoff")}
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="lead-profile panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t("currentLead")}</p>
                <h3>{activeLead.name}</h3>
              </div>
              <span className="intent-badge">{t("intent")} {activeLead.score}</span>
            </div>

            <div className="requirement-grid">
              <div>
                <span>{t("budget")}</span>
                <strong>{activeLead.budget}</strong>
              </div>
              <div>
                <span>{t("area")}</span>
                <strong>{activeLead.location}</strong>
              </div>
              <div>
                <span>{t("stage")}</span>
                <strong>{activeLead.stage}</strong>
              </div>
            </div>

            <div className="chips">
              {activeLead.needs.map((need) => (
                <span key={need}>{need}</span>
              ))}
            </div>

            <div className="source-note">
              <p className="section-kicker">{t("sourceSignal")}</p>
              <p>{activeLead.sourceNote}</p>
            </div>

            <div className="customer-reply">
              <p className="section-kicker">{t("latestReply")}</p>
              <blockquote>{activeLead.lastReply}</blockquote>
            </div>
          </section>

          <section className="timeline-panel panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t("memoryTimeline")}</p>
                <h3>{t("timelineSubtitle")}</h3>
              </div>
              <span className="small-proof">{t("proofChain")}</span>
            </div>

            <div className="timeline">
              {timeline.map((event) => (
                <button
                  className={event.key === activeEventKey ? "timeline-event active" : "timeline-event"}
                  key={event.key}
                  onClick={() => setActiveEventKey(event.key)}
                  type="button"
                >
                  <span className="event-node" />
                  <span className="event-time">{event.time}</span>
                  <strong>{event.label}</strong>
                  <span>{event.agent}</span>
                </button>
              ))}
            </div>

            <div className="event-detail">
              <div>
                <p className="section-kicker">{t("currentEvent")}</p>
                <h4>{activeEvent.label}</h4>
                <p>{activeEvent.summary}</p>
              </div>
              <div className="event-proof">
                <span>{activeEvent.artifact}</span>
                <strong>{activeEvent.blob}</strong>
              </div>
            </div>
          </section>

          <section className="follow-up panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t("bestFollowup")}</p>
                <h3>{activeLead.worker}</h3>
              </div>
              <span className="handoff-badge">{t("recovered")}</span>
            </div>
            <div className="message-preview">
              <p>
                我按你刚补充的 130 万以内、近学校和地铁的条件重新筛了一版。
                这几套会更兼顾孩子上学和通勤，我可以先发你 3 个小区对比。
              </p>
            </div>
            <div className="used-memory">
              <p className="section-kicker">{t("usedMemory")}</p>
              <div className="chips compact">
                <span>{t("chip_budgetCap")}</span>
                <span>{t("chip_school")}</span>
                <span>{t("chip_metro")}</span>
                <span>{t("chip_threeRoom")}</span>
              </div>
            </div>
          </section>

          <section className="inspector panel">
            <div className="tab-row" role="tablist" aria-label={t("inspectorAria")}>
              {[
                ["memory", t("tab_memory")],
                ["artifacts", t("tab_artifacts")],
                ["trace", t("tab_trace")],
              ].map(([key, label]) => (
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

            {activeTab === "memory" && (
              <div className="memory-grid">
                {[
                  [t("mem_budget"), "130 万以内"],
                  [t("mem_area"), "高新区"],
                  [t("mem_priority"), "学区 + 地铁"],
                  [t("mem_concern"), "通勤和价格压力"],
                  [t("mem_strategy"), "优先推荐总价可控的学区友好小区"],
                ].map(([label, value]) => (
                  <div className="memory-row" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "artifacts" && (
              <div className="artifact-list">
                {artifacts.map((artifact) => (
                  <div className="artifact-row" key={artifact.blob}>
                    <div>
                      <strong>{artifact.name}</strong>
                      <span>{artifact.type}</span>
                    </div>
                    <code>{artifact.blob}</code>
                    <span className="verified-label">{artifact.status}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "trace" && (
              <div className="trace-list">
                {traceRows.map(([tool, detail, duration]) => (
                  <div className="trace-row" key={tool}>
                    <code>{tool}</code>
                    <span>{detail}</span>
                    <strong>{duration}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

export { App };
