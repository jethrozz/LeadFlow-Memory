# 设计：转化 Agent 自动领取跟进循环

- 日期：2026-06-15
- 状态：待实现
- 范围：单进程自动跟进循环（MVP）

## 背景

当前转化 agent 只有手动入口（`POST /api/workflows/conversion/run` 生成话术、`POST /api/leads/:leadId/conversation/send` 发送）。发现流程已自动化（scheduler 按 campaign 排期跑采集），但转化全靠人工触发，且客户回复不会自动驱动下一轮。

本设计补一套**单进程自动跟进循环**：线索被发现后自动开场、固定间隔轮询客户回复、有回复就结合长期记忆继续对话，直到客户明确拒绝或达成 playbook 定义的目标。

## 需求（已确认）

| 维度 | 决定 |
|---|---|
| 自主程度 | 全自动：生成 **+ 自动发送**（经 mcp-xhs-chat / adb） |
| 触发 | 主动（timer）+ 客户回复驱动，两者都要 |
| Worker 模型 | 单进程自动循环（MVP），不做真加锁；为将来多 worker 留口子 |
| 节奏 | 发现即发开场 → 固定间隔轮询是否有新回复 → 有回复就结合回复+记忆继续对话 → 直到明确拒绝/达成目标 |
| 目标定义 | 由 playbook 配置成功条件，LLM 每轮判定 continue/goal_reached/rejected |
| 护栏 | 发送节流 + 每日上限 + maxTouches 兜底 |

## 架构总览

方案 C：**Lead 状态机 + 调度字段**，由进程内调度循环驱动。

```
发现流程（已有） ──置 autoFollowupEnabled=true, nextActionAt=now──► Lead(discovered)
                                                                       │
followup-loop tick（新增，每 INTERVAL_MS） 查 nextActionAt<=now 且 status∈活跃集
                                                                       ▼
                                                                 processLead
```

三层存储在循环中的分工：

| 层 | 在循环里管什么 | 失败影响 |
|---|---|---|
| Postgres 状态机 | 流程到哪步、下次何时动 | 致命（循环逻辑本身） |
| LLM | 生成话术 + 判定 outcome | 致命 |
| xhsChat / adb | 真正把消息发出去 | 致命（发不出，但失败可重试，不丢状态） |
| MemWal | 客户画像/对话记忆（召回驱动生成质量） | 降级：recall 容错返回 `[]`，仍能发但无记忆 |
| Walrus | 每步决策的不可篡改证据（审计/追责） | 不影响：`safeWalrusStore` 已容错 |

## 数据模型

Lead 表新增 3 个字段（迁移）：

- `autoFollowupEnabled Boolean @default(false)` —— 是否进入自动跟进流水线。默认 false，发现流程置 true；已有/测试线索不被自动骚扰。
- `nextActionAt DateTime?` —— 循环下次处理这条的时间。`null` = 无待办（终态或未启用）。
- `followupTouchCount Int @default(0)` —— 已发送次数，供 maxTouches 护栏与可视化。

复用现有 `LeadStatus` 枚举。MVP 使用的状态：
- 活跃集：`discovered`（待首触）、`contacting`（已发、轮询回复中）
- 终态：`converted`（达标）、`lost`（被拒）、`paused`（maxTouches 兜底或人工暂停）

## 状态机

```
discovered ──首触发送──► contacting
   ▲(发现流程置 enabled+nextActionAt=now)        │
                                    每隔 interval 轮询会话
                                                 ▼
                                       有新回复？
                                  ┌───否──► contacting，nextActionAt = now + interval（继续等）
                                  └─是─► recall+生成+发送 → LLM 判 outcome
                                          ├ continue     → contacting， nextActionAt = now + interval
                                          ├ goal_reached → converted，  nextActionAt = null
                                          └ rejected     → lost，       nextActionAt = null
  任意发送后 touchCount >= maxTouches 且未 goal/reject → paused，nextActionAt = null
```

纯函数（可单测，IO 留在外层）：

```
decideNextAction(status, hasNewInbound, outcome, touchCount, maxTouches)
  → { nextStatus, nextActionAt | null, shouldSend }
```

## 组件

### followup-loop.ts（新增）

进程内循环，`index.ts` 启动（与发现 scheduler 并列），受 `AUTO_FOLLOWUP_ENABLED` 控制。

**tick（每 `AUTO_FOLLOWUP_INTERVAL_MS`）：**
1. 未启用 / 当日已达发送上限 → 跳过。
2. `running` 标志防重入（上一轮未完则跳过本轮）。
3. 查询：`autoFollowupEnabled=true AND nextActionAt<=now AND status∈{discovered,contacting} ORDER BY nextActionAt LIMIT AUTO_FOLLOWUP_BATCH_SIZE`。
4. 逐条 `processLead`，每条 try/catch。

**processLead(lead)：**
1. 解析身份/设备：`redId = getSocialIdentity(leadId).redId`；`deviceId = AUTO_FOLLOWUP_DEVICE_ID || 首个 connected 设备`。缺 redId 或无设备 → 记日志 + nextActionAt 退避 → 跳过。
2. 分支：
   - `discovered`（首触）：生成开场白（opening 模式：无 customerMessage，recall 查询用线索 summary/画像，不判 outcome）→ `send`（节流）→ 落 outbound 会话 + timeline(`agent_replied`) → `status=contacting, nextActionAt=now+interval, touchCount++`。**自动发送不写 nextFollowup**（那是人工审批队列用的）。
   - `contacting`（查回复）：`syncConversation`（自 lastMessageAt 之后）→
     - 无新回复 → `nextActionAt=now+interval`。
     - 有新回复 → `runConversion`（recall + 生成 + 判 outcome）→ `send`（节流）→ 落库 → 按 `decideNextAction` 应用 outcome。
3. 发送顺序保证幂等：`生成 → send → 成功后才推进状态/计数/落 outbound`；send 失败 → 不推进、设退避重试，不会半发/重复发。

### 复用与改进

把现有路由里的发送/同步逻辑抽成 service 函数，循环与路由共用，避免重复实现 adb 发送与会话同步：
- `sendFollowup(services, { leadId, deviceId, xhsUserId, message })` ← 抽自 `/conversation/send`
- `syncConversation(services, { leadId, deviceId, xhsUserId, sinceTime })` ← 抽自 `/conversation/sync`

### 转化工作流改动

- `ConversionPlaybook` 新增 `goal.description`（成功条件）。
- `buildConversionPrompt(playbook)` 拼入目标与 outcome 判定指令，要求返回 `{ message, memory, extractedFields, outcome }`。
- `ConversionResult` 新增 `outcome: "continue" | "goal_reached" | "rejected"`；解析缺失/非法时默认 `"continue"`（保守，绝不误判停止）。
- **opening 模式**：`runConversion` 支持 `customerMessage` 缺省的首触场景——此时用线索 summary/画像作为 recall 查询，prompt 切换为"生成开场白"，不判 outcome。回复轮才有 customerMessage 并判 outcome。
- 首触（discovered）不判 outcome；仅回复轮判定。
- `recall` 包一层容错：失败返回 `[]`。

> 备注：自动循环发送的消息记录在 conversation（outbound）+ timeline，不写 `nextFollowup`；`nextFollowup`（`requiresHumanApproval`）仅服务手动审批流程。

### store 改动

- 复用 `getSocialIdentity(leadId)`（已有）。
- 新增取默认设备的访问器（`getDefaultDevice()` 或 `listDevices()`，devices 路由已有数据）。
- 查询活跃线索的方法（按 nextActionAt/status 过滤）。

## 配置（env，带默认）

| 配置 | 默认 | 作用 |
|---|---|---|
| `AUTO_FOLLOWUP_ENABLED` | `false` | 总开关 |
| `AUTO_FOLLOWUP_INTERVAL_MS` | `60000` | tick 间隔 |
| `AUTO_FOLLOWUP_BATCH_SIZE` | `10` | 每 tick 处理上限 |
| `AUTO_FOLLOWUP_SEND_MIN_MS` / `_MAX_MS` | `3000` / `8000` | 每次发送后随机延迟（节流） |
| `AUTO_FOLLOWUP_DAILY_CAP` | `50` | 当日发送总上限 |
| `AUTO_FOLLOWUP_MAX_TOUCHES` | `8` | 单线索累计发送上限，超过转 paused |
| `AUTO_FOLLOWUP_DEVICE_ID` | （空） | 指定发送设备；空则取首个已连接设备 |

每日上限 MVP 用进程内计数器 `{date, count}`，日期变更归零；全局计数（单设备够用），将来多设备再升级为每设备。

## 错误处理

- 每条线索 try/catch：失败 → 日志 + nextActionAt 退避，继续下一条。
- send 失败：不推进状态/计数，退避重试；只在发送成功后落 outbound + 推进，保证不重复发。
- recall 失败：降级返回 `[]`。
- Walrus 失败：`safeWalrusStore` 已容错。
- LLM 失败：落到每条 catch，退避重试。
- 达每日上限：本 tick 起跳过发送，留 nextActionAt 次日重试。
- tick 级 try/catch + `running` 防重入。

## 测试策略

1. 纯函数 `decideNextAction` 穷举转移：discovered→contacting；contacting+无回复→contacting；contacting+回复+continue/goal/rejected→contacting/converted/lost；touchCount≥max→paused。
2. `processLead`（fake 服务）：首触发开场并转 contacting；检测回复后回应并按 outcome 流转；send 失败状态不变且可重试；缺 redId 跳过退避。
3. 护栏：达每日上限不发；maxTouches 转 paused。
4. outcome 解析：缺失/非法 → 默认 continue。
5. 测试脚手架：`FakeXhsChatClient.getConversation` 可注入一条客户回复，用于回复轮测试。

## 不在本期范围（YAGNI）

- 多 worker 领取/加锁/宕机交接（保留字段口子，逻辑后置）。
- 无回复时的主动 nudge 补发（节奏定为"轮询回复"而非"定时补发"）。
- 每设备独立每日上限（先全局）。
- 分级人工审批（本期全自动发送）。
