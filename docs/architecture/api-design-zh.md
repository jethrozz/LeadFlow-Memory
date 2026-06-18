# API 设计文档

## 文档目标

本文定义 LeadFlow Memory 的 Hono API 边界。

API 层负责连接：

```text
Dashboard
数据库
Mastra workflows
MemWal adapter
Walrus adapter
mcp-xhs-chat
```

API 层不直接承担 Agent 决策，也不直接保存长期语义记忆或 artifact 原文。

## API 层职责

```text
给 Dashboard 提供聚合数据
触发 Mastra workflows
管理 Campaign / Lead / Conversation 状态
调用或封装 mcp-xhs-chat 会话能力
读取 MemWal memory refs 和 recall 结果
读取 Walrus artifact refs 和 artifact 内容
```

## API 分组

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

## Campaign API

管理线索发现任务。

```text
GET    /api/campaigns
POST   /api/campaigns
GET    /api/campaigns/:campaignId
PATCH  /api/campaigns/:campaignId
POST   /api/campaigns/:campaignId/run
POST   /api/campaigns/:campaignId/pause
```

用途：

```text
创建房产线索发现任务
配置关键词/博主/平台
启动 Discovery Workflow
暂停 Campaign
```

## Lead API

管理线索。

```text
GET    /api/leads
GET    /api/leads/:leadId
PATCH  /api/leads/:leadId
POST   /api/leads/:leadId/assign
POST   /api/leads/:leadId/pause
POST   /api/leads/:leadId/lost
```

查询参数：

```text
status
intentLevel
campaignId
platform
q
```

用途：

```text
展示 Lead 列表
查看 Lead 详情
更新 Lead 状态
分配 Worker
暂停或标记流失
```

## Conversation API

Conversation API 负责读取和写入对话线程。

第一版应优先复用现有 `mcp-xhs-chat`，同时保留人工兜底。

### 读取本地保存的对话

```text
GET /api/leads/:leadId/conversation
```

返回数据库中已同步的 conversation messages。

### 同步小红书聊天记录

```text
POST /api/leads/:leadId/conversation/sync
```

作用：

```text
调用 mcp-xhs-chat 的 xhs_get_conversation
保存或更新 Conversation
触发客户回复解析
生成 conversation_log artifact
```

请求：

```json
{
  "sinceTime": "2026-06-11T10:00:00Z"
}
```

系统根据 lead 关联的 SocialIdentity 和 DeviceConfig 组装 MCP 参数：

```ts
xhs_get_conversation({
  device_id,
  xhs_user_id,
  xhs_username,
  since_time
});
```

### 发送私信

```text
POST /api/leads/:leadId/conversation/send
```

作用：

```text
使用已生成或人工确认的话术
调用 mcp-xhs-chat 的 xhs_send_private_message
保存发送记录
存 Walrus conversation_log / conversion_decision
```

请求：

```json
{
  "message": "我按你刚补充的 130 万以内、渝北三房重新筛了一版...",
  "mode": "send_now"
}
```

MCP 调用：

```ts
xhs_send_private_message({
  device_id,
  xhs_user_id,
  xhs_username,
  message
});
```

### 人工录入客户回复

```text
POST /api/leads/:leadId/conversation/customer-reply
```

作用：

```text
作为真实 MCP 不可用时的兜底
允许 Demo 或运营人员手动录入客户回复
触发 Conversion 分析和 memory update
```

## Device API

Device API 管理小红书设备连接。

底层复用 `mcp-xhs-chat`：

```text
xhs_connect_device
xhs_disconnect_device
```

### 连接设备

```text
POST /api/devices/xhs/connect
```

请求：

```json
{
  "deviceId": "device-1",
  "adbAddress": "emulator-5554"
}
```

MCP 调用：

```ts
xhs_connect_device({
  device_id: "device-1",
  adb_address: "emulator-5554"
});
```

### 断开设备

```text
POST /api/devices/xhs/disconnect
```

请求：

```json
{
  "deviceId": "device-1"
}
```

MCP 调用：

```ts
xhs_disconnect_device({
  device_id: "device-1"
});
```

### 查询设备

```text
GET /api/devices/xhs
```

返回当前系统配置或记录的设备状态。

## Workflow API

触发 Agent 工作流。

```text
POST /api/workflows/discovery/run
POST /api/workflows/conversion/run
POST /api/workflows/handoff/run
GET  /api/workflows/:workflowRunId
```

### Discovery Run

```json
{
  "campaignId": "campaign_001"
}
```

### Conversion Run

```json
{
  "leadId": "lead_001",
  "mode": "generate_next_message"
}
```

可选模式：

```text
generate_next_message
sync_and_generate
send_generated_message
```

其中：

```text
sync_and_generate:
先通过 mcp-xhs-chat 同步聊天记录，再生成下一轮话术。

send_generated_message:
发送已生成并确认的话术。
```

### Handoff Run

```json
{
  "leadId": "lead_001",
  "reason": "demo_trigger"
}
```

## Memory API

读取 MemWal 记忆引用和 recall 结果。

```text
GET  /api/leads/:leadId/memories
POST /api/leads/:leadId/memories/recall
```

### GET memories

读取数据库中的 `MemoryRef`。

### POST recall

真正调用 MemWal。

请求：

```json
{
  "query": "客户当前预算、区域、户型和下一步策略是什么？",
  "limit": 8
}
```

返回：

```json
{
  "leadId": "lead_001",
  "memories": [
    {
      "kind": "budget",
      "summary": "客户预算 130 万以内",
      "confidence": 0.92,
      "sourceArtifactBlobId": "0x..."
    }
  ]
}
```

## Artifact API

读取 Walrus artifacts 引用和详情。

```text
GET  /api/leads/:leadId/artifacts
GET  /api/artifacts/:artifactId
POST /api/artifacts/:artifactId/verify
```

说明：

```text
GET /api/leads/:leadId/artifacts
返回 DB 中的 ArtifactRef。

GET /api/artifacts/:artifactId
根据 ArtifactRef 调用 Walrus 读取 blob 内容。

POST /api/artifacts/:artifactId/verify
验证 artifact 是否仍可读取和匹配。
```

## Dashboard API

Dashboard API 给前端一次性聚合页面数据，避免前端拼接大量底层接口。

### Lead 列表

```text
GET /api/dashboard/leads
```

返回适合左侧 Lead 列表的数据。

### Lead 详情

```text
GET /api/dashboard/leads/:leadId
```

返回：

```json
{
  "lead": {},
  "profile": {},
  "conversation": {},
  "timeline": [],
  "memories": [],
  "artifacts": [],
  "nextFollowUp": {},
  "playbook": {},
  "activeWorkflowRun": {}
}
```

## Demo API

为了比赛 Demo，可以保留演示端点。

```text
POST /api/demo/seed-real-estate
POST /api/demo/run-discovery
POST /api/demo/run-conversion
POST /api/demo/simulate-reply
POST /api/demo/simulate-handoff
```

Demo API 不是正式产品 API，但可以保证现场演示稳定。

## mcp-xhs-chat 接入

现有 MCP 项目路径：

```text
/Users/jethrozz/Documents/UGit/lead-hunter-client/xhs-lead-converter/mcp-xhs-chat
```

启动方式：

```text
node dist/index.js
```

提供工具：

```text
xhs_connect_device
xhs_disconnect_device
xhs_get_conversation
xhs_send_private_message
```

### 设计原则

```text
Mastra Conversion Workflow 负责决策
mcp-xhs-chat 负责真实小红书会话读写
Hono API 负责配置、触发、聚合和状态记录
```

### 推荐调用链

```text
Dashboard 点击“同步对话”
-> Hono API
-> Mastra Conversion Workflow 或 MCP adapter
-> mcp-xhs-chat.xhs_get_conversation
-> 保存 Conversation
-> 更新 Dashboard
```

```text
Dashboard 点击“发送跟进”
-> Hono API
-> Conversion Agent 生成或读取已确认话术
-> mcp-xhs-chat.xhs_send_private_message
-> 保存发送记录
-> 存 Walrus artifacts
-> 更新 TimelineEvent
```

## MVP 最小 API 集

第一版建议实现：

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

如果做 Demo API，再加：

```text
POST /api/demo/seed-real-estate
POST /api/demo/simulate-reply
POST /api/demo/simulate-handoff
```

## 设计原则

### 前端优先使用 Dashboard API

```text
Dashboard 页面 -> /api/dashboard/leads/:leadId
```

前端不应该自己拼接大量底层接口。

### Workflow API 负责触发，不负责展示

```text
POST /api/workflows/conversion/run
```

返回 `workflowRunId` 和结果摘要。

详细展示仍然通过 Dashboard API 获取。

### Memory / Artifact API 是检查工具

它们更像 inspector：

```text
查看 MemWal recall
查看 Walrus artifact
验证 blob
```

### Conversation API 应支持真实通道和兜底通道

```text
真实通道：mcp-xhs-chat
兜底通道：手动录入客户回复 / 人工确认发送
```

## 最终定义

英文：

> The Hono API layer connects the Dashboard, Mastra workflows, database, MemWal, Walrus, and mcp-xhs-chat. Dashboard APIs aggregate state for display, Workflow APIs trigger agent execution, and Conversation APIs bridge the real Xiaohongshu chat channel.

中文：

> Hono API 层负责串联 Dashboard、Mastra workflows、数据库、MemWal、Walrus 和 mcp-xhs-chat。Dashboard API 负责聚合展示，Workflow API 负责触发执行，Conversation API 负责连接真实小红书会话通道。
