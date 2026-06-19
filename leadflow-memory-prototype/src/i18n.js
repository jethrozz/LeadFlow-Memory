import { createContext, createElement, useCallback, useContext, useMemo, useState } from "react";

// UI chrome 文案字典。演示数据（线索、时间线等）保持中文，不在此翻译。
export const translations = {
  zh: {
    eyebrowDemo: "Walrus 赛道 Demo",
    leadsTitle: "房产线索",
    leadsCount: "3 条活跃",
    leadFilterAria: "线索状态筛选",
    filter_new: "新线索",
    filter_following: "跟进中",
    filter_replied: "已回复",
    filter_handoff: "接力中",
    dataLayer: "数据层状态",
    memwalRead: "MemWal 记忆读取",
    running: "运行中",
    walrusArtifacts: "Walrus Artifacts",
    verifiedCount: "5 个已验证",
    topEyebrow: "从线索发现到客户转化的可携带长期记忆",
    workbenchTitle: "房产销售 Agent 工作台",
    verifiedLayer: "可信数据层已验证",
    replayHandoff: "回放接力恢复",
    currentLead: "当前线索",
    intent: "意向",
    budget: "预算",
    area: "区域",
    stage: "阶段",
    sourceSignal: "来源信号",
    latestReply: "最近客户回复",
    memoryTimeline: "记忆时间线",
    timelineSubtitle: "从线索发现到接力恢复",
    proofChain: "Walrus 证明链完整",
    currentEvent: "当前事件",
    bestFollowup: "下一步最佳跟进",
    recovered: "已恢复",
    usedMemory: "本次使用的记忆",
    chip_budgetCap: "预算上限",
    chip_school: "学区优先",
    chip_metro: "近地铁",
    chip_threeRoom: "三房",
    inspectorAria: "Inspector 标签",
    tab_memory: "MemWal 记忆",
    tab_artifacts: "Walrus Artifacts",
    tab_trace: "Agent Trace",
    mem_budget: "预算",
    mem_area: "区域",
    mem_priority: "优先级",
    mem_concern: "顾虑",
    mem_strategy: "下一步策略",
  },
  en: {
    eyebrowDemo: "Walrus Track Demo",
    leadsTitle: "Property Leads",
    leadsCount: "3 active",
    leadFilterAria: "Lead status filter",
    filter_new: "New",
    filter_following: "Following up",
    filter_replied: "Replied",
    filter_handoff: "Handoff",
    dataLayer: "Data Layer Status",
    memwalRead: "MemWal recall",
    running: "Running",
    walrusArtifacts: "Walrus Artifacts",
    verifiedCount: "5 verified",
    topEyebrow: "Portable long-term memory from lead discovery to conversion",
    workbenchTitle: "Real Estate Sales Agent Workbench",
    verifiedLayer: "Trusted data layer verified",
    replayHandoff: "Replay handoff recovery",
    currentLead: "Current Lead",
    intent: "Intent",
    budget: "Budget",
    area: "Area",
    stage: "Stage",
    sourceSignal: "Source Signal",
    latestReply: "Latest Customer Reply",
    memoryTimeline: "Memory Timeline",
    timelineSubtitle: "From discovery to handoff recovery",
    proofChain: "Walrus proof chain intact",
    currentEvent: "Current Event",
    bestFollowup: "Next Best Follow-up",
    recovered: "Recovered",
    usedMemory: "Memory used this turn",
    chip_budgetCap: "Budget cap",
    chip_school: "School district",
    chip_metro: "Near metro",
    chip_threeRoom: "3-bedroom",
    inspectorAria: "Inspector tabs",
    tab_memory: "MemWal Memory",
    tab_artifacts: "Walrus Artifacts",
    tab_trace: "Agent Trace",
    mem_budget: "Budget",
    mem_area: "Area",
    mem_priority: "Priority",
    mem_concern: "Concerns",
    mem_strategy: "Next strategy",
  },
};

const STORAGE_KEY = "leadflow-lang";

function readInitialLang() {
  if (typeof window === "undefined") return "zh";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "en" || stored === "zh" ? stored : "zh";
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang);

  const setLang = useCallback((next) => {
    setLangState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next;
    }
  }, []);

  const value = useMemo(() => {
    const dict = translations[lang] ?? translations.zh;
    return {
      lang,
      setLang,
      t: (key) => dict[key] ?? key,
    };
  }, [lang, setLang]);

  return createElement(LanguageContext.Provider, { value }, children);
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useI18n must be used within a LanguageProvider");
  }
  return ctx;
}
