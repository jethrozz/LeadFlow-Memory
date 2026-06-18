import { useState } from "react";

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
            <p className="eyebrow">Walrus 赛道 Demo</p>
            <h1>LeadFlow Memory</h1>
          </div>
        </div>

        <section className="lead-section">
          <div className="section-heading">
            <span>房产线索</span>
            <strong>3 条活跃</strong>
          </div>
          <div className="lead-tabs" aria-label="线索状态筛选">
            {["新线索", "跟进中", "已回复", "接力中"].map((item) => (
              <button
                className={item === "接力中" ? "filter-pill active" : "filter-pill"}
                key={item}
                type="button"
              >
                {item}
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
          <p className="section-kicker">数据层状态</p>
          <div className="layer-row">
            <span>MemWal 记忆读取</span>
            <strong>运行中</strong>
          </div>
          <div className="layer-row">
            <span>Walrus Artifacts</span>
            <strong>5 个已验证</strong>
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
            <button className="primary-action" type="button" onClick={() => setActiveEventKey("handoff")}>
              回放接力恢复
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="lead-profile panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">当前线索</p>
                <h3>{activeLead.name}</h3>
              </div>
              <span className="intent-badge">意向 {activeLead.score}</span>
            </div>

            <div className="requirement-grid">
              <div>
                <span>预算</span>
                <strong>{activeLead.budget}</strong>
              </div>
              <div>
                <span>区域</span>
                <strong>{activeLead.location}</strong>
              </div>
              <div>
                <span>阶段</span>
                <strong>{activeLead.stage}</strong>
              </div>
            </div>

            <div className="chips">
              {activeLead.needs.map((need) => (
                <span key={need}>{need}</span>
              ))}
            </div>

            <div className="source-note">
              <p className="section-kicker">来源信号</p>
              <p>{activeLead.sourceNote}</p>
            </div>

            <div className="customer-reply">
              <p className="section-kicker">最近客户回复</p>
              <blockquote>{activeLead.lastReply}</blockquote>
            </div>
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
                <p className="section-kicker">当前事件</p>
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
                <p className="eyebrow">下一步最佳跟进</p>
                <h3>{activeLead.worker}</h3>
              </div>
              <span className="handoff-badge">已恢复</span>
            </div>
            <div className="message-preview">
              <p>
                我按你刚补充的 130 万以内、近学校和地铁的条件重新筛了一版。
                这几套会更兼顾孩子上学和通勤，我可以先发你 3 个小区对比。
              </p>
            </div>
            <div className="used-memory">
              <p className="section-kicker">本次使用的记忆</p>
              <div className="chips compact">
                <span>预算上限</span>
                <span>学区优先</span>
                <span>近地铁</span>
                <span>三房</span>
              </div>
            </div>
          </section>

          <section className="inspector panel">
            <div className="tab-row" role="tablist" aria-label="Inspector 标签">
              {[
                ["memory", "MemWal 记忆"],
                ["artifacts", "Walrus Artifacts"],
                ["trace", "Agent Trace"],
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
                  ["预算", "130 万以内"],
                  ["区域", "高新区"],
                  ["优先级", "学区 + 地铁"],
                  ["顾虑", "通勤和价格压力"],
                  ["下一步策略", "优先推荐总价可控的学区友好小区"],
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
