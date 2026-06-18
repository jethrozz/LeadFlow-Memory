# 数据模型 / 状态模型设计

## 文档目标

本文定义 LeadFlow Memory 的核心业务对象、状态流转和对象关系。

这一层不是最终数据库表结构，也不是最终代码类命名，而是产品功能与技术实现之间的领域模型。

后续 Prisma schema、API 设计、Mastra workflow 和 Dashboard 数据结构都应以本文为基础。

## 设计原则

### 1. 数据库是业务状态和索引层

数据库不承担长期 Agent 记忆，也不承担 artifact 原文存储。

```text
数据库：业务状态、索引、列表、调度、Dashboard 查询
MemWal：客户长期语义记忆
Walrus：来源证据、对话记录、决策 trace、记忆 diff、报告
```

### 2. LeadProfile 必须行业无关

LeadProfile 是通用客户画像容器，不是房产专用画像。

行业字段由 Conversion Playbook 的 `profile_fields` 定义。

例如：

```text
房产：预算、区域、户型、新房/二手、清水/精装
汽车：预算、品牌、车型、能源类型、试驾时间
装修：面积、风格、预算、开工时间、装修类型
```

### 3. TimelineEvent 串联用户可见故事

Dashboard 不直接拼接所有底层记录，而是通过 TimelineEvent 展示完整工作流：

```text
发现线索
写入记忆
生成话术
客户回复
记忆更新
接力恢复
```

## 核心对象总览

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

## Campaign

Campaign 表示一次线索发现任务。

例如：

```text
重庆房产买房客户发现任务
```

### 职责

Campaign 保存：

```text
行业
城市
目标客户
关键词
目标博主
采集范围
最大帖子数
最大评论数
使用的 Playbook
```

### 状态

```text
draft
active
running
paused
completed
failed
```

### 状态含义

```text
draft：还没开始
active：已配置，可运行
running：正在采集或分析
paused：暂停
completed：本轮完成
failed：本轮失败
```

## SocialSource

SocialSource 表示被发现的原始社交内容。

它可能来自：

```text
帖子
评论
博主主页
手动导入文本
```

### 职责

SocialSource 用于：

```text
保留原始来源索引
关联 Walrus source_snapshot
记录为什么它被判断为相关或不相关
作为 Lead 的来源证据
```

### 状态

```text
captured
relevant
irrelevant
analyzed
lead_created
ignored
failed
```

### 来源类型

```text
post
comment
creator_profile
manual_import
```

## Lead

Lead 表示真正进入销售流程的潜在客户线索。

### 职责

Lead 保存：

```text
来源平台
来源类型
当前销售状态
意向等级
所属 Campaign
所属 Playbook
关联 memorySpaceId
关键 artifact refs
```

### 状态

```text
discovered
qualified
assigned
contacting
replied
nurturing
asking_contact
contact_obtained
viewing_scheduled
converted
paused
lost
```

### 状态含义

```text
discovered：刚从社交内容中发现
qualified：已确认是有效潜在客户
assigned：已分配给 Agent/Worker
contacting：正在首次或持续跟进
replied：客户已回复
nurturing：客户有兴趣但还没强意向，需要持续培育
asking_contact：当前适合推进手机号/微信
contact_obtained：已获取联系方式
viewing_scheduled：已预约看房
converted：达到 MVP 定义的转化成功
paused：暂缓跟进
lost：明确无效或拒绝
```

### MVP 中的 converted 定义

MVP 里的 `converted` 不表示客户最终买房成交。

它表示：

```text
已获取联系方式
或
已预约看房
```

## LeadProfile

LeadProfile 表示当前已知客户画像。

它是通用客户画像容器，由 Playbook 决定行业字段。

### 类型定义

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

### common 字段

`common` 保存跨行业通用画像：

```text
客户需求
客户顾虑
决策时间线
决策人
联系方式
```

### fields 字段

`fields` 保存行业特有画像。

字段 key 来自 Playbook 的 `profile_fields`。

### 房产示例

```json
{
  "industry": "real_estate",
  "playbookId": "real-estate-chongqing",
  "summary": "客户预算约 130 万，关注渝北三房，可能关心学区和地铁。",
  "intentLevel": "A",
  "profileCompleteness": 0.65,
  "missingRequiredFields": ["property_market", "property_condition", "viewing_time"],
  "common": {
    "needs": ["三房", "近地铁", "学区"],
    "concerns": ["预算压力", "通勤"],
    "timeline": "孩子明年上小学",
    "contactInfo": {}
  },
  "fields": {
    "budget": {
      "value": "130万以内",
      "confidence": 0.92,
      "sourceMemoryRef": "mem_001",
      "sourceArtifactRef": "artifact_001",
      "updatedAt": "2026-06-11T10:00:00Z"
    },
    "district": {
      "value": "渝北",
      "confidence": 0.86,
      "updatedAt": "2026-06-11T10:00:00Z"
    },
    "layout": {
      "value": "三房",
      "confidence": 0.9,
      "updatedAt": "2026-06-11T10:00:00Z"
    }
  }
}
```

### 汽车示例

```json
{
  "industry": "auto",
  "playbookId": "auto-chongqing",
  "summary": "客户预算 20-25 万，关注新能源 SUV，计划周末试驾。",
  "intentLevel": "A",
  "common": {
    "needs": ["新能源", "SUV", "家用通勤"],
    "concerns": ["续航", "价格"],
    "timeline": "周末试驾"
  },
  "fields": {
    "budget": { "value": "20-25万", "confidence": 0.9, "updatedAt": "..." },
    "vehicle_type": { "value": "SUV", "confidence": 0.88, "updatedAt": "..." },
    "energy_type": { "value": "新能源", "confidence": 0.95, "updatedAt": "..." }
  }
}
```

## Conversation

Conversation 表示和客户的对话线程。

### 状态

```text
not_started
opened
waiting_reply
customer_replied
agent_replied
contact_shared
viewing_discussed
closed
```

### 和 Lead.status 的区别

```text
Lead.status 表示销售进展
Conversation.status 表示对话线程进展
```

例如：

```text
Lead.status = nurturing
Conversation.status = waiting_reply
```

表示客户有兴趣，但当前正在等待客户回复。

## SocialIdentity

SocialIdentity 表示客户在某个社交平台上的身份。

它用于把 Lead 与具体平台账号关联起来，方便 Conversion Agent 调用平台连接器或 MCP 工具。

### 字段

```text
leadId
platform
externalUserId
username
profileUrl
raw
createdAt
updatedAt
```

### 小红书示例

```json
{
  "leadId": "lead_001",
  "platform": "xhs",
  "externalUserId": "xhs_user_123",
  "username": "重庆买房小白",
  "profileUrl": "https://www.xiaohongshu.com/user/profile/...",
  "raw": {}
}
```

Conversion Agent 调用 `mcp-xhs-chat` 时，需要从 SocialIdentity 读取：

```text
xhs_user_id
xhs_username
```

## DeviceConfig

DeviceConfig 表示可用于平台自动化的设备配置。

第一阶段主要用于小红书私聊 MCP。

### 字段

```text
id
platform
deviceId
adbAddress
status
lastConnectedAt
metadata
createdAt
updatedAt
```

### 状态

```text
connected
disconnected
unavailable
```

### 小红书示例

```json
{
  "platform": "xhs",
  "deviceId": "device-1",
  "adbAddress": "emulator-5554",
  "status": "connected"
}
```

Conversion Agent 调用 `mcp-xhs-chat` 时，需要从 DeviceConfig 读取：

```text
device_id
adb_address
```

## WorkflowRun

WorkflowRun 表示一次 Agent workflow 执行。

### 类型

```text
discovery
conversion
handoff_recovery
memory_update
artifact_store
```

### 状态

```text
queued
running
succeeded
failed
cancelled
retrying
```

### 职责

WorkflowRun 用于：

```text
记录 Agent 执行过程
支持失败重试
支持 Dashboard trace
关联 Walrus artifacts
关联 TimelineEvent
```

## MemoryRef

MemoryRef 是数据库里对 MemWal memory 的引用。

它不保存完整长期记忆，只保存索引和摘要。

### 字段

```text
leadId
memorySpaceId
memoryId / ref
kind
summary
confidence
sourceArtifactId
createdAt
```

### 职责

MemoryRef 用于：

```text
Dashboard 快速展示
Agent 知道该去哪 recall
将 memory 和 Walrus artifact 建立证据关联
```

## ArtifactRef

ArtifactRef 是数据库里对 Walrus artifact 的引用。

它不保存 artifact 原文。

### 字段

```text
leadId
workflowRunId
artifactType
blobId
suiObjectId
summary
createdAt
verifiedStatus
```

### Artifact 类型

```text
source_snapshot
lead_discovery_report
conversation_log
conversion_decision
memory_diff
followup_report
handoff_proof
```

## TimelineEvent

TimelineEvent 是 Dashboard 时间线事件。

它把业务状态、MemWal memory refs、Walrus artifacts 和 Agent trace 串成用户可理解的故事。

### 类型

```text
campaign_started
source_captured
lead_discovered
lead_scored
memory_written
lead_assigned
conversation_started
customer_replied
conversion_decision_made
memory_updated
contact_requested
contact_obtained
viewing_scheduled
handoff_triggered
handoff_recovered
lead_paused
lead_lost
```

### 关联信息

```text
leadId
workflowRunId
memoryRefs
artifactRefs
agentName
workerId
summary
createdAt
```

## 典型状态流转

### Discovery 流程

```text
Campaign.running
-> SocialSource.captured
-> SocialSource.relevant
-> Lead.discovered
-> Lead.qualified
-> MemoryRef created
-> ArtifactRef created
-> TimelineEvent.lead_discovered
```

### Conversion 流程

```text
Lead.qualified
-> Lead.assigned
-> Conversation.opened
-> Lead.contacting
-> Customer replied
-> Conversation.customer_replied
-> Lead.replied
-> Memory updated
-> Lead.nurturing / Lead.asking_contact
```

### 获取联系方式

```text
Lead.asking_contact
-> Customer shares phone/wechat
-> Conversation.contact_shared
-> Lead.contact_obtained
-> Lead.converted
```

### 预约看房

```text
Lead.replied
-> Agent proposes viewing
-> Customer confirms time
-> Conversation.viewing_discussed
-> Lead.viewing_scheduled
-> Lead.converted
```

### Handoff

```text
Lead.contacting / nurturing / asking_contact
-> TimelineEvent.handoff_triggered
-> WorkflowRun.handoff_recovery.running
-> MemWal recalled
-> Walrus artifacts loaded
-> handoff_proof stored
-> Lead.assigned to Worker-2
-> TimelineEvent.handoff_recovered
```

## MVP 最小状态集

第一版不需要实现全部状态。

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

## MVP 实现建议

第一版不要一开始做复杂任务队列和完全自动状态机。

优先做到：

```text
状态可记录
状态可展示
关键状态可人工触发
Agent 输出建议状态
API 根据结果更新状态
```

也就是说：

```text
第一版允许半自动
但数据结构要允许未来自动化
```

## 最终定义

英文：

> The data model keeps operational state and references in the database, long-term semantic memory in MemWal, verifiable artifacts in Walrus, and TimelineEvent as the bridge that turns them into an inspectable product story.

中文：

> 数据库保存业务状态和引用，MemWal 保存 Agent 长期语义记忆，Walrus 保存可验证 artifacts，TimelineEvent 把三者串成 Dashboard 能看的故事。
