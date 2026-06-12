import type {
  ArtifactRef,
  Conversation,
  DashboardLeadDetail,
  DashboardLeadListItem,
  Lead,
  LeadProfile,
  MemoryRef,
  PlaybookSummary,
  TimelineEvent,
  WorkflowRun,
} from "@leadflow/core";

const now = "2026-06-11T10:00:00.000Z";

export const leadChen: Lead = {
  id: "lead_chen",
  campaignId: "campaign_real_estate_cq",
  playbookId: "real-estate-chongqing",
  platform: "xhs",
  sourceType: "comment",
  status: "asking_contact",
  intentLevel: "A",
  sourceUrl: "https://www.xiaohongshu.com/explore/demo",
  sourceAuthor: "重庆买房小白",
  memorySpaceId: "memspace_lead_chen",
  createdAt: now,
  updatedAt: now,
};

export const profileChen: LeadProfile = {
  leadId: "lead_chen",
  industry: "real_estate",
  playbookId: "real-estate-chongqing",
  summary: "客户预算 130 万以内，关注渝北三房，孩子明年上小学。",
  intentLevel: "A",
  profileCompleteness: 0.7,
  missingRequiredFields: ["property_market", "property_condition", "viewing_time"],
  common: {
    needs: ["三房", "近学校", "近地铁"],
    concerns: ["预算压力", "通勤"],
    timeline: "孩子明年上小学",
    contactInfo: {},
  },
  fields: {
    budget: {
      value: "130万以内",
      confidence: 0.92,
      sourceMemoryRef: "mem_budget",
      sourceArtifactRef: "artifact_memory_diff",
      updatedAt: now,
    },
    district: {
      value: "渝北",
      confidence: 0.86,
      updatedAt: now,
    },
    layout: {
      value: "三房",
      confidence: 0.9,
      updatedAt: now,
    },
  },
};

export const conversationChen: Conversation = {
  id: "conversation_chen",
  leadId: "lead_chen",
  status: "customer_replied",
  platform: "xhs",
  externalThreadId: "xhs_user_chen",
  lastMessageAt: now,
  messages: [
    {
      id: "msg_001",
      conversationId: "conversation_chen",
      from: "customer",
      content: "预算最好 130 万以内，孩子明年上小学。",
      sentAt: now,
    },
  ],
};

export const memoriesChen: MemoryRef[] = [
  {
    id: "mem_budget",
    leadId: "lead_chen",
    memorySpaceId: "memspace_lead_chen",
    memoryId: "memwal_budget_001",
    kind: "budget",
    summary: "客户预算 130 万以内。",
    confidence: 0.92,
    sourceArtifactId: "artifact_memory_diff",
    createdAt: now,
  },
  {
    id: "mem_strategy",
    leadId: "lead_chen",
    memorySpaceId: "memspace_lead_chen",
    memoryId: "memwal_strategy_001",
    kind: "strategy",
    summary: "下一步适合索要微信，发送渝北三房对比。",
    confidence: 0.88,
    sourceArtifactId: "artifact_handoff",
    createdAt: now,
  },
];

export const artifactsChen: ArtifactRef[] = [
  {
    id: "artifact_source",
    leadId: "lead_chen",
    workflowRunId: "workflow_discovery_001",
    artifactType: "source_snapshot",
    blobId: "0x8f1a92c",
    summary: "小红书评论来源快照。",
    createdAt: now,
    verifiedStatus: "verified",
  },
  {
    id: "artifact_handoff",
    leadId: "lead_chen",
    workflowRunId: "workflow_handoff_001",
    artifactType: "handoff_proof",
    blobId: "0xe259f03",
    summary: "Worker-2 接力恢复证明。",
    createdAt: now,
    verifiedStatus: "verified",
  },
  {
    id: "artifact_memory_diff",
    leadId: "lead_chen",
    workflowRunId: "workflow_conversion_001",
    artifactType: "memory_diff",
    blobId: "0x6bc42aa",
    summary: "客户预算和学区需求记忆更新。",
    createdAt: now,
    verifiedStatus: "verified",
  },
];

export const timelineChen: TimelineEvent[] = [
  {
    id: "event_discovered",
    leadId: "lead_chen",
    workflowRunId: "workflow_discovery_001",
    type: "lead_discovered",
    summary: "从小红书评论发现购房线索。",
    memoryRefs: ["mem_budget"],
    artifactRefs: ["artifact_source"],
    agentName: "Discovery Agent",
    workerId: "worker-1",
    createdAt: now,
  },
  {
    id: "event_handoff",
    leadId: "lead_chen",
    workflowRunId: "workflow_handoff_001",
    type: "handoff_recovered",
    summary: "Worker-2 从 MemWal 恢复上下文。",
    memoryRefs: ["mem_budget", "mem_strategy"],
    artifactRefs: ["artifact_handoff"],
    agentName: "Conversion Agent",
    workerId: "worker-2",
    createdAt: now,
  },
];

export const playbookSummary: PlaybookSummary = {
  id: "real-estate-chongqing",
  name: "重庆房产销售 Playbook",
  industry: "real_estate",
  city: "重庆",
  primaryGoals: ["get_wechat", "get_phone", "schedule_viewing"],
  rules: ["不要一开始就索要联系方式", "每轮最多追问 1-2 个问题"],
};

export const activeWorkflowRun: WorkflowRun = {
  id: "workflow_conversion_001",
  type: "conversion",
  status: "succeeded",
  leadId: "lead_chen",
  startedAt: now,
  completedAt: now,
};

export const dashboardLeadItems: DashboardLeadListItem[] = [
  {
    id: "lead_chen",
    displayName: "陈薇",
    platform: "xhs",
    sourceType: "comment",
    status: "asking_contact",
    intentLevel: "A",
    summary: "预算 130 万以内，关注渝北三房。",
    updatedAt: now,
  },
];

export const dashboardLeadDetail: DashboardLeadDetail = {
  lead: leadChen,
  profile: profileChen,
  conversation: conversationChen,
  timeline: timelineChen,
  memories: memoriesChen,
  artifacts: artifactsChen,
  nextFollowUp: {
    nextBestAction: "ask_wechat",
    message: "我按你刚补充的 130 万以内、渝北三房重新筛了一版。小红书这边发户型和预算表不太方便，你留个微信，我把对比表发你。",
    rationale: "客户已表达强意向，且需要接收房源对比资料。",
    usedMemoryRefs: ["mem_budget", "mem_strategy"],
    requiresHumanApproval: true,
  },
  playbook: playbookSummary,
  activeWorkflowRun,
};
