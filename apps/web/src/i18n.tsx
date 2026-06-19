import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// UI chrome 文案字典。线索/画像等演示数据保持原样，不在此翻译。
type Dict = Record<string, string>;

const zh: Dict = {
  // 品牌 / 侧栏
  brandTitle: "Auto Lead Flow",
  brandEyebrow: "Walrus 赛道 Demo",
  leadsTitle: "房产线索",
  activeSuffix: "条活跃",
  leadFilterAria: "线索状态筛选",
  filterNew: "新线索",
  filterFollowing: "跟进中",
  filterReplied: "已回复",
  filterHandoff: "接力中",
  loadingLeads: "加载线索中…",
  emptyLeads: "尚无线索数据。请通过 API 添加线索后刷新。",
  demoTag: "演示数据",
  unassigned: "无主",
  dataLayer: "数据层状态",
  memwalRead: "MemWal 记忆读取",
  running: "运行中",
  walrusArtifacts: "Walrus Artifacts",
  verifiedSuffix: "个已验证",
  // 顶栏
  topEyebrow: "从线索发现到客户转化的可携带长期记忆",
  workbenchTitle: "转化 Agent 工作台",
  verifiedLayer: "可信数据层已验证",
  // 会话条
  sessionFollowing: "正在跟进",
  sessionIntent: "{intent} 级",
  sessionTouches: "触达 {touch}",
  noLeadSelected: "未选择线索",
  // 画像
  currentLead: "当前线索",
  intent: "意向",
  budget: "预算",
  area: "区域",
  stage: "阶段",
  tbd: "待补充",
  sourceSignal: "来源信号",
  latestReply: "最近客户回复",
  noReply: "暂无客户回复。",
  selectLeadHint: "选择左侧线索查看长期记忆画像。",
  // 控制台
  tabFollowup: "跟进话术",
  tabArtifacts: "Walrus Artifacts",
  tabMemory: "MemWal 记忆",
  tabTrace: "Agent Trace",
  consoleAria: "跟进与证据",
  waitingFollowup: "等待 Agent 生成下一步跟进话术。",
  usedMemory: "本次使用的记忆",
  budgetCapChip: "预算上限",
  btnStart: "加入跟进",
  btnCrash: "模拟崩溃",
  btnSend: "手动发",
  sendPlaceholder: "手动发一句…",
  verified: "已验证",
  // 时间线
  timelineTitle: "记忆时间线 · 当前进度",
  inProgress: "进行中",
  stage_discovered: "发现线索",
  stage_scored: "意向评分",
  stage_contacted: "首次跟进",
  stage_replied: "客户回复",
  stage_updated: "记忆更新",
  stage_handoff: "接力恢复",
  // 线索状态
  status_discovered: "新线索",
  status_contacting: "跟进中",
  status_asking_contact: "索要联系方式",
  status_nurturing: "跟进中",
  status_replied: "已回复",
  status_converted: "已成交",
  status_paused: "已暂停",
  status_lost: "已流失",
  status_handoff: "接力中",
  // 事件
  event_lead_discovered: "发现线索",
  event_conversion_decision_made: "生成跟进",
  event_handoff_recovered: "接力恢复",
  event_customer_replied: "客户回复",
  event_agent_replied: "发送跟进",
  // 记忆 kind
  kind_budget: "预算",
  kind_strategy: "策略",
  kind_source_evidence: "来源证据",
  kind_customer_reply: "客户回复",
  // artifact 类型
  artifact_source_snapshot: "来源快照",
  artifact_lead_discovery_report: "线索发现报告",
  artifact_conversion_decision: "转化决策",
  artifact_memory_diff: "记忆差异",
  artifact_handoff_proof: "接力证明",
  // 崩溃接力浮层
  crashClose: "关闭",
  crashTitleCrashing: "💥 Worker 崩溃",
  crashTitleWaiting: "🛟 接力恢复进行中…",
  crashTitleRecovered: "✅ 接力成功，已恢复上下文",
  crashTitleTimeout: "⏳ 接管处理中",
  crashOldWorker: "原 Worker",
  crashNewWorker: "接力 Worker",
  crashStandbyWorker: "待命 Worker",
  crashCrashedWorker: "已崩溃 Worker",
  crashMemoryPacket: "🧠 记忆",
  crashDetailCrashing: "原 Worker 异常退出，租约失效，跟进中断…",
  crashDetailWaiting: "另一个 Worker 正在认领该线索，并从 MemWal 召回客户长期记忆以恢复上下文…",
  crashRecoveredLabel: "从 MemWal 长期记忆恢复：",
  crashDetailTimeout: "接管仍在进行，稍后可在「记忆时间线」查看 接力恢复 事件与恢复摘要。",
  crashDone: "完成",
  // 设备实况
  deviceTitle: "设备实况",
  deviceConnecting: "连接中…",
  deviceNoDevice: "设备未连接",
  deviceStalled: "画面已暂停",
  deviceWaitSession: "等待 Agent 启动会话",
  deviceWaitFrame: "等待首帧…",
};

const en: Dict = {
  brandTitle: "Auto Lead Flow",
  brandEyebrow: "Walrus Track Demo",
  leadsTitle: "Property Leads",
  activeSuffix: "active",
  leadFilterAria: "Lead status filter",
  filterNew: "New",
  filterFollowing: "Following up",
  filterReplied: "Replied",
  filterHandoff: "Handoff",
  loadingLeads: "Loading leads…",
  emptyLeads: "No leads yet. Add one via the API and refresh.",
  demoTag: "Demo",
  unassigned: "Unassigned",
  dataLayer: "Data Layer Status",
  memwalRead: "MemWal recall",
  running: "Running",
  walrusArtifacts: "Walrus Artifacts",
  verifiedSuffix: "verified",
  topEyebrow: "Portable long-term memory from lead discovery to conversion",
  workbenchTitle: "Conversion Agent Workbench",
  verifiedLayer: "Trusted data layer verified",
  sessionFollowing: "Following up",
  sessionIntent: "Intent {intent}",
  sessionTouches: "{touch} touches",
  noLeadSelected: "No lead selected",
  currentLead: "Current Lead",
  intent: "Intent",
  budget: "Budget",
  area: "Area",
  stage: "Stage",
  tbd: "TBD",
  sourceSignal: "Source Signal",
  latestReply: "Latest Customer Reply",
  noReply: "No customer reply yet.",
  selectLeadHint: "Select a lead on the left to view its long-term memory profile.",
  tabFollowup: "Follow-up Script",
  tabArtifacts: "Walrus Artifacts",
  tabMemory: "MemWal Memory",
  tabTrace: "Agent Trace",
  consoleAria: "Follow-up and evidence",
  waitingFollowup: "Waiting for the agent to generate the next follow-up script.",
  usedMemory: "Memory used this turn",
  budgetCapChip: "Budget cap",
  btnStart: "Start follow-up",
  btnCrash: "Simulate crash",
  btnSend: "Send",
  sendPlaceholder: "Send a message…",
  verified: "Verified",
  timelineTitle: "Memory Timeline · Current Progress",
  inProgress: "In progress",
  stage_discovered: "Discovered",
  stage_scored: "Scored",
  stage_contacted: "First contact",
  stage_replied: "Customer reply",
  stage_updated: "Memory update",
  stage_handoff: "Handoff recovery",
  status_discovered: "New",
  status_contacting: "Contacting",
  status_asking_contact: "Asking contact",
  status_nurturing: "Nurturing",
  status_replied: "Replied",
  status_converted: "Converted",
  status_paused: "Paused",
  status_lost: "Lost",
  status_handoff: "Handoff",
  event_lead_discovered: "Lead discovered",
  event_conversion_decision_made: "Follow-up generated",
  event_handoff_recovered: "Handoff recovered",
  event_customer_replied: "Customer replied",
  event_agent_replied: "Follow-up sent",
  kind_budget: "Budget",
  kind_strategy: "Strategy",
  kind_source_evidence: "Source evidence",
  kind_customer_reply: "Customer reply",
  artifact_source_snapshot: "Source snapshot",
  artifact_lead_discovery_report: "Lead discovery report",
  artifact_conversion_decision: "Conversion decision",
  artifact_memory_diff: "Memory diff",
  artifact_handoff_proof: "Handoff proof",
  crashClose: "Close",
  crashTitleCrashing: "💥 Worker crashed",
  crashTitleWaiting: "🛟 Handoff recovery in progress…",
  crashTitleRecovered: "✅ Handoff succeeded, context recovered",
  crashTitleTimeout: "⏳ Takeover in progress",
  crashOldWorker: "Previous worker",
  crashNewWorker: "Relay worker",
  crashStandbyWorker: "Standby worker",
  crashCrashedWorker: "Crashed worker",
  crashMemoryPacket: "🧠 Memory",
  crashDetailCrashing: "Previous worker exited unexpectedly, lease expired, follow-up interrupted…",
  crashDetailWaiting:
    "Another worker is claiming the lead and recalling the customer's long-term memory from MemWal to restore context…",
  crashRecoveredLabel: "Recovered from MemWal long-term memory:",
  crashDetailTimeout:
    "Takeover still in progress; check the handoff recovery event and summary in the Memory Timeline shortly.",
  crashDone: "Done",
  deviceTitle: "Device Live",
  deviceConnecting: "Connecting…",
  deviceNoDevice: "No device connected",
  deviceStalled: "Feed paused",
  deviceWaitSession: "Waiting for the agent to start a session",
  deviceWaitFrame: "Waiting for first frame…",
};

const translations: Record<Lang, Dict> = { zh, en };

export type Lang = "zh" | "en";
export type TFunc = (key: string, vars?: Record<string, string | number>) => string;
export type I18nValue = { lang: Lang; setLang: (next: Lang) => void; t: TFunc };

const STORAGE_KEY = "leadflow-lang";

function readInitialLang(): Lang {
  if (typeof window === "undefined") return "zh";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "en" || stored === "zh" ? stored : "zh";
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

function makeT(lang: Lang): TFunc {
  const dict = translations[lang] ?? zh;
  return (key, vars) => interpolate(dict[key] ?? key, vars);
}

const LanguageContext = createContext<I18nValue | null>(null);

// 无 Provider 时的默认值（中文），让 <App /> 可独立渲染（如单测）而不抛错。
const fallbackValue: I18nValue = { lang: "zh", setLang: () => {}, t: makeT("zh") };

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next;
    }
  }, []);

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t: makeT(lang) }), [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(LanguageContext) ?? fallbackValue;
}
