# LeadFlow Memory

面向房产销售（及其他社媒获客场景）的**可验证长期记忆系统**。它把两个 Agent 串起来，并由三层存储支撑：

- **发现 Agent（Lead Discovery）**：在小红书搜索/评论里找到有购买意向的用户，提取画像、生成线索。
- **转化 Agent（Lead Conversion）**：自动给线索发开场白、轮询客户回复、结合长期记忆多轮跟进，直到达成目标或被拒。

### 三层存储分工

| 层 | 技术 | 存什么 |
|---|---|---|
| **业务状态 / 对话原文** | PostgreSQL（Prisma） | 线索、画像、会话逐句记录、时间线、状态机 |
| **长期语义记忆** | MemWal | 客户已确认的事实（按语义召回，跨会话画像） |
| **决策存证** | Walrus | 每步决策的不可篡改快照（审计/追责） |

> 关键区分：**对话连贯**靠 Postgres 的对话历史（喂给 LLM）；**长期画像**靠 MemWal 召回。两者分工，互不替代。

---

## 目录结构

```
LeadFlow-Memory/
├── apps/
│   ├── api/            # 后端 API（Hono）+ 定时调度 + 自动跟进循环
│   └── web/            # 前端看板（React + Vite）
├── packages/
│   ├── agents/         # 发现 / 转化 工作流（含提示词、outcome 判定）
│   ├── connectors/     # 小红书连接器：xhs-discovery（采集）/ xhs-chat（私信，进程内 Midscene 驱动 ADB）
│   ├── llm/            # LLM provider（OpenAI 兼容）
│   ├── memwal/         # MemWal 语义记忆客户端
│   ├── walrus/         # Walrus 存证客户端
│   ├── playbook/       # 行业剧本加载（YAML）
│   ├── core/ db/       # 共享类型与数据库
├── playbooks/          # 转化剧本（如 real-estate-chongqing.yml）
├── prisma/             # 数据库 schema 与迁移
└── docs/               # 架构 / 特性 / 提案文档
```

---

## 技术栈

- **Monorepo**：pnpm workspace
- **后端**：TypeScript (ESM) + Hono + Prisma + PostgreSQL
- **前端**：React + Vite
- **LLM**：OpenAI 兼容协议（默认智谱/小米等，可换）
- **设备自动化**：[Midscene](https://midscenejs.com) `@midscene/android` + ADB（真机操作小红书 App）
- **测试**：vitest

---

## 快速开始

### 1. 前置条件

- Node.js ≥ 20、pnpm
- 一个 PostgreSQL（本地或 Supabase 等云托管）
- 真机联调需要：Android 手机 + ADB + 已登录小红书 App + 一个支持视觉的多模态模型 key（如阿里云百炼 `qwen3-vl-plus`）

### 2. 安装

```bash
pnpm install
```

### 3. 配置环境变量

在仓库根目录建 `.env`（已在 `.gitignore`）。最小可跑（fake 模式，不连真实服务）：

```bash
# fake 模式：不连真实 LLM/记忆/设备，用内存桩，便于本地跑通逻辑
LLM_PROVIDER=fake
MEMWAL_MODE=fake
WALRUS_MODE=fake
XHS_CHAT_MODE=fake
```

真实模式见下方 [环境变量](#环境变量) 完整清单。

### 4. 初始化数据库

```bash
npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
```

### 5. 启动

```bash
# 后端 API（默认 http://127.0.0.1:3001）
pnpm --filter @leadflow/api dev      # watch 模式（改文件自动重启，调试自动循环时慎用，见下方注意）
# 或单实例（推荐做真机/循环调试时用，可控、不自动重启）：
node_modules/.bin/tsx --env-file=.env apps/api/src/index.ts

# 前端看板
pnpm --filter @leadflow/web dev
```

> ⚠️ **真机调试时不要用 watch（`pnpm dev`）模式**：改文件会自动重启，自动跟进循环会跟着重启并重新操作手机，容易出现重复发送、难以排查。改用上面的单实例命令。

---

## 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | PostgreSQL 连接串（pooler / 直连） |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 对话/抽取用 LLM（OpenAI 兼容）。`LLM_PROVIDER=fake` 用桩 |
| `MEMWAL_BASE_URL` / `MEMWAL_SERVER_URL` / `MEMWAL_DELEGATE_KEY` / `MEMWAL_ACCOUNT_ID` | MemWal 语义记忆。`MEMWAL_MODE=fake` 用桩 |
| `WALRUS_PUBLISHER_URL` / `WALRUS_AGGREGATOR_URL` | Walrus 存证（测试网公共端点）。`WALRUS_MODE=fake` 用桩 |
| `XHS_DISCOVERY_MCP_URL` | 小红书采集 MCP 地址（xiaohongshu-mcp，默认 `http://localhost:18060/mcp`） |
| `XHS_DISCOVERY_DELAY_MS` | 采集相邻工具调用间隔（防风控） |
| **xhs-chat（私信）** | |
| `XHS_CHAT_MODE` | `fake`=桩；`mcp`=外部子进程（legacy）；留空=**进程内 Midscene（默认）** |
| `MIDSCENE_MODEL_NAME` | 视觉模型，如 `qwen3-vl-plus` |
| `MIDSCENE_MODEL_FAMILY` | 模型家族，如 `qwen3-vl`（阿里云）、`glm-v`（智谱） |
| `MIDSCENE_MODEL_BASE_URL` / `MIDSCENE_MODEL_API_KEY` | 视觉模型端点与 key（如阿里云百炼 `https://dashscope.aliyuncs.com/compatible-mode/v1`） |
| **自动跟进循环** | |
| `AUTO_FOLLOWUP_ENABLED` | `true` 才启动定时跟进循环 |
| `AUTO_FOLLOWUP_INTERVAL_MS` | tick 间隔（也是单条线索的轮询节奏），默认 60000 |
| `AUTO_FOLLOWUP_DEVICE_ID` | 默认发送设备的 ADB serial（如 `b759b4fa`），留空则取首个 connected 设备 |
| `AUTO_FOLLOWUP_BATCH_SIZE` / `_DAILY_CAP` / `_MAX_TOUCHES` / `_SEND_MIN_MS` / `_SEND_MAX_MS` | 护栏：每轮处理上限 / 每日发送上限 / 单线索发送上限 / 发送节流 |
| `CONVERSION_PLAYBOOK_ID` | campaign 未指定剧本时的兜底剧本（默认 `real-estate-chongqing`） |

> 视觉模型**必须支持图片输入（VL）**，纯文本模型（如 `qwen-plus`）无法做屏幕定位。

---

## 核心流程

### A. 发现线索（Discovery）

```bash
# 触发某 campaign 的采集（需要 xiaohongshu-mcp 已运行且登录）
curl -X POST http://127.0.0.1:3001/api/workflows/discovery/run \
  -H "content-type: application/json" \
  -d '{"campaignId":"<id>","seedKeywords":["渝北 三房"]}'
```

发现的线索自动入列自动跟进（`autoFollowupEnabled=true`）。

### B. 自动转化跟进（Conversion，定时任务）

设 `AUTO_FOLLOWUP_ENABLED=true` 启动 API 后，定时循环会自动：

```
发现/入列线索(discovered)
  → 定时 tick 捞到 → 生成开场白(用画像) → 真机发送 → 状态转 contacting
  → 每隔 interval 轮询客户是否回复
  → 有回复：读会话 + 召回长期记忆 + 最近对话历史 → 生成回复 → 判 outcome
       continue→继续 / goal_reached→converted / rejected→lost / 超 maxTouches→paused
```

**手动把指定线索丢进流水线**（交给定时循环接管，不在请求内执行）：

```bash
curl -X POST http://127.0.0.1:3001/api/leads/<leadId>/start-followup
```

**造一条测试线索**（含小红书号、画像、写入 MemWal/Walrus）：

```bash
curl -X POST http://127.0.0.1:3001/api/leads/mock \
  -H "content-type: application/json" \
  -d '{"displayName":"昵称","redId":"小红书号","summary":"渝北三房预算130万",
       "sourceText":"求推荐渝北三房，预算130万以内","fields":{"budget":"130万以内","district":"渝北"}}'
```

---

## 主要 API

| 方法 / 路径 | 作用 |
|---|---|
| `POST /api/leads/mock` | 造测试线索（写 lead/profile/记忆/存证/身份） |
| `POST /api/leads/:leadId/start-followup` | 把线索入列自动跟进（秒回，交给定时循环） |
| `GET  /api/leads/:leadId` | 线索详情 |
| `GET  /api/leads/:leadId/conversation` | 拉取逐句对话记录 |
| `POST /api/leads/:leadId/conversation/customer-reply` | 人工录入一条客户回复（调试用） |
| `POST /api/workflows/discovery/run` | 触发采集 |
| `POST /api/workflows/conversion/run` | 手动跑一次转化（需 customerMessage） |
| `GET  /api/dashboard/leads` | 看板线索列表 |
| `GET  /api/devices/...` | 设备 / 登录状态 |

---

## 剧本（Playbook）

转化 Agent 的**系统提示词来自剧本**（`playbooks/*.yml`），而非内置默认词。剧本定义角色、语气、目标、对话规则、禁止事项、画像字段、本地知识。campaign 未指定时回退到 `CONVERSION_PLAYBOOK_ID`（默认 `real-estate-chongqing`）。

跨剧本通用的基线约束（短回复、被拒退让、记忆只写已确认事实）在代码中始终叠加。

---

## 测试

```bash
pnpm -r test          # 全部包单测
pnpm typecheck        # 全部类型检查
pnpm --filter @leadflow/api test   # 单个包
```

`XHS_CHAT_MODE=fake` 等桩模式下可在无真机/无外部服务时跑通主流程。

---

## 已知限制 / 说明

- **设备自动化靠视觉模型**，存在不确定性；发送流程已加入「输入校验 + 发送后校验输入框清空 + 重试只重点发送不重打字」防重复，会话同步按**内容去重**避免把自己发的消息当成客户回复。
- **暂无真实房源/楼盘库**：客户问具体小区名时 Agent 只能自然兜底（"整理资料发您"），接入知识库后可报具体楼盘。
- **单进程 MVP**：自动跟进循环未做多 worker 加锁；每日计数为进程内内存（重启清零）。
- 真机私信依赖设备已登录小红书；登录失效时发送会失败。
```
