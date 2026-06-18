# LeadFlow Memory 设计规格

## 1. 概述

LeadFlow Memory 是一个面向高决策成本销售场景的可验证长期记忆 Agent 工作流。参赛 MVP 以重庆房产销售为 Demo 场景，使用小红书作为第一社交平台连接器。

项目的核心目标不是做一个普通 CRM，也不是单纯的小红书爬虫，而是展示：

```text
长期运行的销售 Agent 如何发现社交线索、记住客户、持续跟进、在中断后恢复，并用 Walrus artifacts 证明每一步发生了什么。
```

## 2. 产品定位

### 一句话

LeadFlow Memory 让房产销售 Agent 从线索发现到多轮转化的全过程拥有可携带、可恢复、可验证的长期客户记忆。

### 英文 Pitch

> LeadFlow Memory gives real estate sales agents portable, verifiable long-term memory from lead discovery to multi-touch conversion, powered by Walrus and MemWal.

### 目标用户

```text
业务用户：
高客单价销售团队、房产顾问、获客团队、私域运营人员。

开发者 / 评委：
关注长期 Agent memory、multi-agent coordination、artifact-driven workflow、debuggability 的 agent builder。
```

## 3. 问题定义

高客单价销售不是一次聊天，而是持续数天到数周的多轮工作流。当前 Agent 系统常见问题：

```text
发现 Agent 和转化 Agent 割裂
数据库有字段，但不是 Agent 可自然 recall 的长期记忆
Worker 重启、模型切换或任务转交后容易丢上下文
很难解释 Agent 为什么判断某个客户高意向
很难证明 Agent 每一步读取了哪些历史信息和产生了哪些结果
```

LeadFlow Memory 解决的问题是：

> 如何让不同 Agent 在从线索发现到客户转化的全过程中，共享同一份可验证、可恢复、可持续更新的客户记忆？

## 4. MVP 范围

### 必须实现

MVP 需要形成一个真实闭环：

```text
1. 创建重庆房产 Discovery Campaign。
2. 从小红书关键词、博主内容、评论区或手动导入内容中发现线索。
3. Discovery Agent 提取购房意图并打分。
4. 将初始客户记忆写入 MemWal。
5. 将来源快照和发现报告存入 Walrus，并拿到真实 blob ID。
6. Conversion Agent 读取 Playbook 和 MemWal 记忆。
7. Conversion Agent 通过 mcp-xhs-chat 获取聊天记录并生成跟进话术。
8. 系统支持通过 mcp-xhs-chat 发送私信，或人工确认后发送。
9. 客户回复后，系统解析画像字段，更新 MemWal，并保存 Walrus trace。
10. 手动触发 Handoff Recovery，Worker-2 从 MemWal + Walrus 恢复上下文。
11. Dashboard 展示 lead timeline、MemWal memory、Walrus artifacts、Agent trace 和 handoff proof。
```

### 暂缓

```text
完整 CRM 系统
多平台 connector
大规模自动翻页采集
多账号采集和复杂风控
真实楼盘推荐库
复杂报价系统
政策实时查询
权限/团队管理
Playbook 可视化编辑器
复杂统计报表
自动 Worker 心跳和故障转移
```

## 5. 技术选型

```text
语言：TypeScript
包管理：pnpm workspace
前端：React + Vite + TypeScript
API 层：Hono
Agent 框架：Mastra
数据库：PostgreSQL + Prisma
Schema 校验：Zod
模型层：可配置 LLM Provider
默认模型：DeepSeek
候选模型：MiMo
长期记忆：MemWal
Artifact 存储：Walrus
小红书私聊：复用现有 mcp-xhs-chat
隐私层：Seal，后续接入
```

## 6. Monorepo 结构

```text
leadflow-memory/
├── apps/
│   ├── web/                 # React + Vite Dashboard
│   └── api/                 # Hono API Server
│
├── packages/
│   ├── core/                # 领域模型、Zod schema、共享类型
│   ├── agents/              # Mastra agents + workflows
│   ├── llm/                 # 可配置模型 provider
│   ├── memwal/              # MemWal adapter
│   ├── walrus/              # Walrus artifact adapter
│   ├── connectors/          # SocialConnector 和 XHS connector
│   └── db/                  # Prisma client + repositories
│
├── playbooks/
│   └── real-estate-chongqing.yml
│
├── prisma/
│   └── schema.prisma
│
├── scripts/
│   ├── seed-real-estate-demo.ts
│   └── run-demo-flow.ts
│
└── docs/
```

## 7. 架构分层

### Dashboard

负责展示：

```text
Lead 列表
客户画像
记忆时间线
MemWal memory
Walrus artifacts
Agent trace
Handoff Recovery 状态
Playbook 摘要
```

前端优先调用 Dashboard 聚合 API，而不是自己拼接多个底层接口。

### Hono API

API 层负责：

```text
管理 Campaign / Lead / Conversation 状态
触发 Mastra workflows
聚合 Dashboard 数据
调用 MemWal / Walrus adapters
封装 mcp-xhs-chat 会话能力
```

### Mastra Workflows

Mastra 是 Agent runtime 和 workflow orchestrator。它负责编排：

```text
Discovery Workflow
Conversion Workflow
Handoff Recovery Workflow
```

Mastra 自带 memory 不作为核心长期记忆层，避免削弱 Walrus/MemWal 赛道表达。

### MemWal

MemWal 是长期语义记忆层，保存 Agent 可 recall 的客户事实：

```text
预算
区域
需求
顾虑
时间线
联系方式状态
下一步策略
接力恢复记录
```

### Walrus

Walrus 是可验证 artifact 层，保存：

```text
source_snapshot.json
lead_discovery_report.json
conversation_log.json
conversion_decision.json
memory_diff.json
followup_report.json
handoff_proof.json
```

### PostgreSQL

数据库是业务状态和索引层，不保存长期语义记忆原文，也不保存完整 artifact 原文。

保存：

```text
Lead 状态
Campaign 配置
Conversation 索引
WorkflowRun 状态
MemoryRef
ArtifactRef
TimelineEvent
SocialIdentity
DeviceConfig
```

## 8. 核心模块

### 8.1 Social Lead Discovery

Discovery 是社交平台线索发现层。

第一阶段支持小红书：

```text
关键词搜索帖子
指定博主内容扫描
评论区意向识别
手动导入真实内容
```

Workflow：

```text
loadCampaign
-> generateSearchKeywords
-> searchPlatformPosts
-> filterRelevantPosts
-> collectComments
-> identifyLeadCandidates
-> extractRealEstateIntent
-> scoreLead
-> storeSourceArtifactsToWalrus
-> createLeadRecord
-> createOrResolveMemWalMemorySpace
-> writeInitialMemoriesToMemWal
-> generateOpeningStrategy
-> storeDiscoveryReportToWalrus
-> emitTimelineEvent("lead_discovered")
```

### 8.2 Conversion Playbook

Playbook 是 Conversion Agent 的可配置大脑。

第一版使用 YAML：

```text
playbooks/real-estate-chongqing.yml
```

配置内容：

```text
Agent 角色
主目标：获取微信、手机号、预约看房
过程目标：补全预算、区域、户型、新房/二手、清水/精装、补贴兴趣、看房时间
画像字段 profile_fields
对话规则 conversation_rules
禁止事项 forbidden_claims
本地行业知识 local_knowledge
成功标准 success_criteria
```

### 8.3 Conversion Agent

Conversion Agent 负责多轮销售跟进。

目标：

```text
读取 lead 和 Playbook
从 MemWal recall 客户长期记忆
通过 mcp-xhs-chat 获取聊天记录
判断客户阶段和缺失画像字段
生成下一轮跟进话术
通过 mcp-xhs-chat 发送，或等待人工确认发送
解析客户回复
更新客户画像和 MemWal 记忆
生成 Walrus trace artifacts
更新 Dashboard 时间线
```

核心输出：

```ts
type ConversionDecision = {
  stage:
    | "opening"
    | "qualifying"
    | "nurturing"
    | "asking_contact"
    | "scheduling_viewing"
    | "converted"
    | "paused"
    | "lost";
  missingProfileFields: string[];
  nextBestAction: string;
  message: string;
  rationale: string;
  memoryUpdates: LeadMemoryFact[];
  goalProgress: {
    achievedGoals: string[];
    pendingGoals: string[];
  };
};
```

### 8.4 mcp-xhs-chat 接入

复用现有项目：

```text
/Users/jethrozz/Documents/UGit/lead-hunter-client/xhs-lead-converter/mcp-xhs-chat
```

工具：

```text
xhs_connect_device
xhs_disconnect_device
xhs_get_conversation
xhs_send_private_message
```

职责边界：

```text
Mastra Conversion Workflow：负责决策和编排
mcp-xhs-chat：负责真实小红书聊天记录读取和私信发送
Hono API：负责触发、配置、状态记录和 Dashboard 聚合
```

### 8.5 Handoff Recovery

Handoff Recovery 展示长期记忆的核心价值：新 Worker 在中断后恢复上下文并继续自然跟进。

Workflow：

```text
detectHandoffNeed
-> lockLeadForRecovery
-> loadLeadStateFromDb
-> recallMemWalMemory
-> loadWalrusArtifacts
-> summarizePreviousContext
-> loadConversionPlaybook
-> generateRecoveryPlan
-> assignNewWorker
-> storeHandoffProofToWalrus
-> writeRecoveryMemoryToMemWal
-> emitTimelineEvent("handoff_recovered")
```

MVP 只要求手动触发，不要求真实 Worker 心跳检测。

### 8.6 Dashboard / Memory Inspector

Dashboard 是业务工作台和比赛展示台。

主页面布局：

```text
左侧：Lead 列表
中间：Lead Profile + Memory Timeline
右侧：Next Follow-up + Inspector
```

Inspector tabs：

```text
MemWal Memory
Walrus Artifacts
Agent Trace
Playbook
```

高光事件：

```text
Handoff Recovered
```

## 9. 数据模型

核心对象：

```text
Campaign
SocialSource
Lead
LeadProfile
Conversation
WorkflowRun
MemoryRef
ArtifactRef
TimelineEvent
SocialIdentity
DeviceConfig
```

### LeadProfile

LeadProfile 必须是行业无关的通用客户画像容器。行业字段由 Playbook 的 `profile_fields` 决定。

```ts
type LeadProfile = {
  leadId: string;
  industry: string;
  playbookId: string;
  summary: string;
  intentLevel: "S" | "A" | "B" | "C" | "Ignore";
  profileCompleteness: number;
  missingRequiredFields: string[];
  common: {
    needs: string[];
    concerns: string[];
    timeline?: string;
    decisionMakers?: string[];
    contactInfo?: {
      phone?: string;
      wechat?: string;
    };
  };
  fields: Record<string, ProfileFieldValue>;
};

type ProfileFieldValue = {
  value: unknown;
  confidence: number;
  sourceMemoryRef?: string;
  sourceArtifactRef?: string;
  updatedAt: string;
};
```

## 10. 状态模型

### Campaign.status

```text
draft
running
completed
failed
paused
```

### Lead.status

```text
discovered
qualified
contacting
replied
asking_contact
contact_obtained
viewing_scheduled
converted
paused
lost
```

MVP 中 `converted` 表示：

```text
已获取联系方式
或
已预约看房
```

### Conversation.status

```text
not_started
waiting_reply
customer_replied
agent_replied
closed
```

### WorkflowRun.status

```text
queued
running
succeeded
failed
```

## 11. API 设计

API 分组：

```text
Campaign API
Lead API
Conversation API
Workflow API
Memory API
Artifact API
Dashboard API
Device API
Demo API
```

MVP 关键接口：

```text
GET  /api/dashboard/leads
GET  /api/dashboard/leads/:leadId

POST /api/campaigns
POST /api/campaigns/:campaignId/run

POST /api/workflows/conversion/run
POST /api/workflows/handoff/run

GET  /api/leads/:leadId/conversation
POST /api/leads/:leadId/conversation/sync
POST /api/leads/:leadId/conversation/send
POST /api/leads/:leadId/conversation/customer-reply

GET  /api/leads/:leadId/memories
GET  /api/leads/:leadId/artifacts

POST /api/devices/xhs/connect
POST /api/devices/xhs/disconnect
```

Conversation API 必须支持：

```text
真实通道：mcp-xhs-chat
兜底通道：手动录入客户回复 / 人工确认发送
```

## 12. Demo 流程

比赛演示应控制在 1-2 分钟内：

```text
1. 选中一个房产 lead。
2. 展示它来自小红书评论或帖子。
3. 展示 Discovery Agent 提取的初始记忆。
4. 展示 Walrus source snapshot / discovery report blob ID。
5. 展示 Conversion Agent 读取 MemWal 记忆后生成跟进话术。
6. 通过真实 mcp-xhs-chat 或人工兜底方式录入客户回复。
7. 展示 MemWal memory 更新和 Walrus memory_diff blob ID。
8. 点击“回放接力恢复”。
9. 展示 Worker-2 从 MemWal 恢复上下文，并读取 Walrus artifacts。
10. 展示 handoff_proof.json 的 Walrus blob ID 和下一条自然接力话术。
```

## 13. 错误处理与恢复

### mcp-xhs-chat 失败

可能错误：

```text
DEVICE_NOT_CONNECTED
USER_NOT_FOUND
BLOCKED
RATE_LIMITED
NETWORK_ERROR
SEND_FAILED
GET_FAILED
```

处理：

```text
记录 WorkflowRun.failed
记录 TimelineEvent
Dashboard 显示错误
允许人工兜底录入客户回复或人工确认发送
```

### Walrus 上传失败

处理：

```text
WorkflowRun 标记 failed 或 retrying
保留本地业务状态
不把 artifact 标记为 verified
Dashboard 显示 artifact missing / failed
```

### MemWal 写入或 recall 失败

处理：

```text
不生成“恢复成功”状态
Dashboard 显示 memory unavailable
允许重试 workflow
```

## 14. 隐私与合规

Walrus 上的数据默认公开，Blob ID 不是 secret。

MVP 要求：

```text
避免上传真实手机号、微信号、真实姓名、精确住址等敏感信息
真实对话和客户画像在上传 Walrus 前应脱敏
若需要保存敏感信息，应后续接入 Seal 或本地加密
```

Conversion Agent 必须遵守 Playbook 禁止事项：

```text
不承诺学区
不夸大升值空间
不虚假宣传补贴
不频繁骚扰客户
客户拒绝后停止强推联系方式
```

## 15. 验收标准

MVP 完成时应满足：

```text
可以创建重庆房产 Campaign。
可以通过小红书内容或手动导入发现 lead。
Discovery Workflow 能生成 lead、MemWal 初始记忆和 Walrus artifacts。
Dashboard 能展示 lead profile、timeline、memory refs、artifact blob IDs。
Conversion Workflow 能读取 Playbook 和 MemWal 记忆，生成下一轮话术。
系统能通过 mcp-xhs-chat 同步聊天记录和发送私信，或使用人工兜底通道。
客户回复后，系统能更新 LeadProfile 和 MemWal，并保存 Walrus trace。
Handoff Recovery 能手动触发，并生成 handoff_proof.json 到 Walrus。
Dashboard 能展示 Handoff Recovered 高光事件和恢复后的推荐话术。
关键失败场景能在 Dashboard 显示明确错误，而不是静默失败。
```

## 16. 参考文档

详细子规格见：

```text
docs/proposals/leadflow-memory-proposal-zh.md
docs/architecture/leadflow-memory-tech-stack-zh.md
docs/architecture/data-state-model-zh.md
docs/architecture/api-design-zh.md
docs/features/social-lead-discovery-zh.md
docs/features/conversion-playbook-zh.md
docs/features/conversion-agent-zh.md
docs/features/handoff-recovery-zh.md
docs/features/dashboard-memory-inspector-zh.md
```
