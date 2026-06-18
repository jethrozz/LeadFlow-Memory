# LeadFlow Memory 技术选型文档

## 目标

LeadFlow Memory 将使用 TypeScript 重新开发，构建一个真实接入 Walrus / MemWal 的可验证长期记忆销售 Agent 工作流。

本项目不以 mock 为核心演示方式，而是尽量走真实链路：

- 真实 Agent workflow
- 真实 LLM 调用
- 真实 MemWal 记忆写入与读取
- 真实 Walrus artifact 上传与 blob ID 展示
- 真实 Dashboard 数据聚合

房产销售是参赛 Demo 场景，但技术架构应支持未来扩展到汽车、装修、教育、保险、B2B 销售等高决策成本销售场景。

## 总体技术栈

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
隐私层：Seal，后续接入
```

## Monorepo 结构

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
│   └── db/                  # Prisma client + repositories
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

## 前端选型

### 技术

```text
React
Vite
TypeScript
CSS Modules 或普通 CSS，MVP 阶段保持轻量
```

### 职责

前端 Dashboard 负责展示：

- 房产线索列表
- 客户画像
- 记忆时间线
- MemWal memory
- Walrus artifacts
- Agent trace
- Worker handoff recovery 状态

### 当前原型

当前已有原型位于：

```text
leadflow-memory-prototype/
```

后续正式开发时，可以将该原型迁移到：

```text
apps/web/
```

## API 层选型

### 技术

```text
Hono
TypeScript
Zod
Prisma
```

### 职责

`apps/api` 是产品 API 层，负责连接前端、数据库、Agent workflow、MemWal 和 Walrus。

```text
Frontend Dashboard
  -> apps/api
      -> PostgreSQL
      -> Mastra workflows
      -> MemWal adapter
      -> Walrus adapter
```

### API 分类

```text
Lead API
- 创建线索
- 获取线索列表
- 获取线索详情

Workflow API
- 启动线索发现 workflow
- 启动转化跟进 workflow
- 触发 handoff recovery workflow

Memory API
- 获取某个 lead 的 MemWal memory
- 触发 memory recall

Artifact API
- 获取 Walrus artifact 列表
- 获取 blob ID、Sui object ID、artifact 类型和状态

Dashboard API
- 聚合 lead timeline、memory、artifacts、agent trace
```

### 推荐边界

Hono 负责产品 API，Mastra 负责 Agent 和 workflow runtime。

```text
apps/api = Hono API Server
packages/agents = Mastra Agents + Workflows
```

这样可以避免 API 层和 Agent 编排层耦合过重。

## Agent 框架选型

### 技术

```text
Mastra
```

### 使用 Mastra 的原因

Mastra 是 TypeScript-first 的 Agent 框架，支持：

- Agents
- Workflows
- Tools
- MCP
- Memory
- Observability
- Workflow state
- Suspend / resume
- Hono / Node 部署

这些能力和本项目高度匹配，尤其适合以下流程：

```text
发现线索
-> 提取画像
-> 写 MemWal
-> 存 Walrus artifact
-> 转化跟进
-> 更新记忆
-> Worker 接力恢复
```

### Mastra 的定位

Mastra 是 Agent runtime 和 workflow orchestrator。

项目核心叙事仍然是：

```text
长期客户记忆：MemWal
可验证 artifacts：Walrus
Agent 编排：Mastra
业务索引：PostgreSQL
```

不建议把 Mastra 自带 memory 作为核心长期记忆层，否则会削弱 Walrus/MemWal 的赛道表达。

### MCP 工具接入

Mastra workflow 可以通过 MCPClient 调用已有 MCP 服务。

第一阶段接入两个小红书 MCP 服务，分别覆盖触达和采集：

**1. mcp-xhs-chat（私聊触达，stdio + ADB 设备）**

```text
/Users/jethrozz/Documents/UGit/lead-hunter-client/xhs-lead-converter/mcp-xhs-chat
```

该服务提供：

```text
xhs_connect_device
xhs_disconnect_device
xhs_get_conversation
xhs_send_private_message
```

**2. xiaohongshu-mcp（内容采集，streamable HTTP + 浏览器登录态）**

```text
https://github.com/xpzouying/xiaohongshu-mcp
默认端点：http://localhost:18060/mcp
```

Discovery 使用的工具：

```text
check_login_status
search_feeds        关键词搜索帖子（支持排序/类型/时间/地点过滤）
get_feed_detail     帖子正文 + 互动数据 + 评论及子评论
user_profile        博主主页
```

注意：两个服务是独立进程、两套登录身份（浏览器 cookie 与手机设备），互不替代。采集只使用只读工具，不使用其发布/评论/点赞等写操作，控制账号风控面。

职责边界：

```text
Mastra Discovery Workflow：负责搜索策略、相关性过滤和意向识别
xiaohongshu-mcp：负责真实小红书帖子搜索和评论区读取
Mastra Conversion Workflow：负责决策和编排
mcp-xhs-chat：负责真实小红书聊天记录读取和私信发送
Hono API：负责触发、配置、状态记录和 Dashboard 聚合
```

## Agent / Workflow 设计

### Discovery Workflow

负责从小红书房产内容中发现线索，并生成初始客户记忆。

```text
searchXhsLead
-> extractRealEstateIntent
-> createLeadInDb
-> memwalRememberInitialProfile
-> walrusStoreSourceSnapshot
-> walrusStoreLeadScoreReport
```

### Conversion Workflow

负责从 MemWal 读取客户记忆，生成并执行跟进策略。

```text
loadLead
-> memwalRecallLeadContext
-> xhsGetConversation via mcp-xhs-chat
-> generateFollowUpMessage
-> xhsSendPrivateMessage via mcp-xhs-chat
-> walrusStoreConversationLog
-> memwalUpdateLeadMemory
-> walrusStoreAgentTrace
```

### Handoff Recovery Workflow

负责展示长期记忆的核心价值：Worker 失效后，新的 Worker 可以从 MemWal 恢复上下文。

```text
detectOrTriggerWorkerFailure
-> assignWorker2
-> memwalRecallLeadContext
-> walrusReadPreviousTrace
-> generateRecoveredFollowUp
-> walrusStoreHandoffProof
```

## 模型层选型

### 目标

底层大模型必须可配置，不能写死到单一厂商。

默认支持 DeepSeek，预留 MiMo。

### 推荐结构

```text
packages/llm/
├── LLMProvider interface
├── deepseek-provider.ts
├── mimo-provider.ts
├── openai-compatible-provider.ts
└── model-router.ts
```

### 配置示例

DeepSeek：

```env
LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=xxx
LLM_MODEL=deepseek-v4-pro
LLM_REASONING_MODEL=deepseek-v4-pro
LLM_FAST_MODEL=deepseek-v4-flash
```

MiMo：

```env
LLM_PROVIDER=mimo
LLM_BASE_URL=https://mimo.xxx/api
LLM_API_KEY=xxx
LLM_MODEL=mimo-v2-pro
LLM_REASONING_MODEL=mimo-v2-pro
LLM_FAST_MODEL=mimo-v2-flash
```

### 模型分工

```text
reasoning model
- 客户画像提取
- 意向评分
- Handoff recovery
- 复杂跟进策略生成

fast model
- 摘要
- 格式化
- 普通话术生成
- artifact 描述

embedding model
- 优先交给 MemWal relayer 处理
- 仅当 MemWal 需要外部 embedding 时再单独配置
```

### DeepSeek 说明

DeepSeek API 支持 OpenAI / Anthropic 兼容格式。项目不会绑定 OpenAI 服务，但可以使用 OpenAI-compatible 协议作为抽象接口。

## MemWal 选型

### 职责

MemWal 是项目的长期语义记忆层。

用于保存：

- 客户预算
- 区域偏好
- 户型需求
- 学区需求
- 通勤要求
- 顾虑和拒绝原因
- 历史对话摘要
- 下一步跟进策略

### 关键操作

```text
remember
- 写入客户初始记忆
- 写入客户回复后的新事实

recall
- 根据 leadId 和当前任务读取相关记忆

analyze
- 从原始文本中提取结构化事实

ask
- 基于客户长期记忆回答 agent 的上下文问题
```

### 设计原则

MemWal 是长期记忆主存储，不是缓存。

数据库只保存 memory reference、lead 状态和索引信息。

## Walrus 选型

### 职责

Walrus 是项目的 artifact proof 层。

用于保存：

- 来源快照
- 线索提取报告
- 意向评分报告
- 私聊记录
- memory diff
- agent trace
- handoff proof
- 跟进总结

### Artifact 类型

```text
source_snapshot.json
lead_score_report.json
conversation_log.json
memory_diff.json
agent_trace.json
handoff_proof.json
followup_summary.json
```

### Adapter 接口

```ts
storeArtifact(input): Promise<{
  blobId: string;
  suiObjectId?: string;
  artifactType: string;
  size: number;
  createdAt: string;
}>;

readArtifact(blobId): Promise<unknown>;

verifyArtifact(blobId): Promise<{
  status: "verified" | "missing" | "expired";
}>;
```

### 接入方式

优先级：

1. Walrus TypeScript SDK
2. Walrus HTTP API
3. Walrus CLI，仅用于开发或脚本辅助

## 数据库选型

### 技术

```text
PostgreSQL
Prisma
```

### 数据库定位

数据库不承担长期语义记忆，也不承担 artifact 原文存储。

数据库保存：

- lead 基础信息
- workflow 状态
- worker 分配
- MemWal memory reference
- Walrus artifact reference
- Dashboard 查询索引

### 初步实体

```text
Lead
LeadProfile
WorkflowRun
TimelineEvent
ArtifactRef
MemoryRef
WorkerAssignment
AgentTraceRef
```

## 真实链路原则

本项目比赛版本尽量不使用 mock。

允许使用：

- 真实采集的小红书房产内容
- 真实 LLM 提取
- 真实 MemWal 写入与 recall
- 真实 Walrus artifact 上传
- 真实 blob ID 展示

仅在外部平台不稳定或合规风险较高时，才允许用受控输入替代真实平台调用。

例如：

- 可以人工导入真实小红书文本作为输入
- 不一定必须现场实时爬取
- 不建议为了“真实”而把比赛风险押在平台反爬或账号风控上

## 隐私与安全

Walrus 上的数据默认公开，Blob ID 不是 secret。

真实客户数据上传 Walrus 前必须考虑加密。

MVP 阶段建议：

- 使用脱敏或演示数据
- 不上传真实手机号、微信号、身份证、精确住址等敏感信息
- Artifact 中保留业务上下文，但避免个人隐私

后续版本：

- 接入 Seal
- 对 conversation log 和 customer profile 加密
- 使用 delegate access 控制 agent 权限

## 推荐 MVP 开发顺序

### Phase 1: 项目骨架

- pnpm workspace
- apps/web
- apps/api
- packages/core
- packages/db
- packages/agents
- packages/llm
- packages/memwal
- packages/walrus

### Phase 2: 数据库与 API

- Prisma schema
- Lead API
- Dashboard API
- ArtifactRef / MemoryRef / TimelineEvent 数据结构

### Phase 3: 模型层

- LLM provider interface
- DeepSeek provider
- MiMo provider placeholder
- JSON output / structured extraction

### Phase 4: Walrus Adapter

- storeArtifact
- readArtifact
- artifact ref 入库
- Dashboard 展示真实 blob ID

### Phase 5: MemWal Adapter

- remember
- recall
- analyze
- lead memory space
- Dashboard 展示真实 memory

### Phase 6: Mastra Workflows

- Discovery Workflow
- Conversion Workflow
- Handoff Recovery Workflow
- Agent trace 记录

### Phase 7: 前端接真实数据

- 将现有原型迁移到 apps/web
- 接 Dashboard API
- 实现真实 timeline、memory、artifacts、trace

### Phase 8: Demo 打磨

- 一键运行房产销售 Demo
- 一键触发 Worker handoff
- 展示真实 Walrus blob IDs
- 展示真实 MemWal recall 结果

## 最终技术表达

英文：

> Mastra is our TypeScript agent runtime. MemWal is our portable long-term memory layer. Walrus is our verifiable artifact layer. PostgreSQL stores only workflow indexes and dashboard references.

中文：

> Mastra 负责 Agent 编排，MemWal 负责长期客户记忆，Walrus 负责可验证 artifacts，PostgreSQL 只保存业务索引和 Dashboard 引用。
