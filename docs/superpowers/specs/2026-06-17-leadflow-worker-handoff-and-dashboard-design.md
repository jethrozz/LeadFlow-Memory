# 设计：多 Worker 故障接管（接力恢复）+ 看板可观测改造

- 日期：2026-06-17
- 状态：待实现
- 范围：单设备故障接管（lease/认领 + handoff 恢复）+ 看板自动刷新/按钮生效/检查器

## 背景

设计初衷里有"接力恢复（为什么不是普通 CRM）"：Worker-1 异常后 Worker-2 通过 MemWal 恢复客户上下文继续跟进，展示跨 session/agent/worker 的长期记忆能力。

现状：handoff 工作流（`runHandoffRecoveryWorkflow`：召回记忆→生成恢复摘要→存 `handoff_proof`）、手动接口 `POST /api/workflows/handoff/run`、以及 demo 假数据都存在，但**运行时没有 worker 概念**——自动跟进循环是单进程，没有故障检测，也没有自动接管。所以"接力"在跑起来的系统里看不见。

本设计把它做成真实能力（**单设备故障接管/容错**），并改造看板让它"可观测"。

## 需求（已确认）

| 维度 | 决定 |
|---|---|
| Worker 模型 | 故障接管/容错（单设备）：同一时刻一个 worker 在跑；它崩了/卡住租约过期后，另一实例认领其未完成线索继续 |
| 接管触发 | 租约超时自动接管 + 看板「模拟崩溃」按钮（不用真杀进程即可演示） |
| 看板 | 自动刷新 + 现有按钮真生效 + 线索/会话/记忆检查器；接力通过时间线 `handoff_recovered` + 检查器体现，不做专门 worker 大面板 |
| 看板操作栏 | 加入跟进、模拟崩溃、手动发；去掉造测试线索、同步、Seed |
| 自动刷新方式 | 轮询（每 ~4s），非 SSE/WebSocket |
| 租约机制 | 线索级租约 + 原子认领（方案 1），复用现有循环与 handoff 工作流 |

## 架构总览

```
followup-loop 实例(workerId=worker_<host>_<pid>_<rand>)
  每 tick: claimDueLeads(我, now, leaseMs, batch)  ── 原子认领到期线索 ──►
     processLead:
        若认领到的线索 prevWorkerId≠我且非空且 status=contacting → 接管
            → runHandoffRecoveryWorkflow(召回记忆→恢复摘要→存证)
            → 写 handoff_triggered / handoff_recovered 时间线
        然后照常跟进(开场 / 查回复→回应)，成功后续租；终态释放
```

## 数据模型

Lead 表新增 2 字段（迁移）：

- `workerId String?` —— 当前持有该线索的 worker；`null`=无主。
- `leaseExpiresAt DateTime?` —— 租约到期时间；`< now` 视为可被他人认领。

复用现有 `status` / `nextActionAt` / `followupTouchCount` / `autoFollowupEnabled`。

新增 env：
- `AUTO_FOLLOWUP_LEASE_MS`：租约时长，默认 90000（90s，需 > 单条真机处理耗时 ~60-90s，避免处理中被抢）。

## Worker 身份

- followup-loop 每个进程实例启动时生成唯一 `workerId`，格式 `worker_<hostname>_<pid>_<rand4>`，打到启动日志。
- 不建 Worker 表；worker 存活由其持有线索的租约是否过期间接体现（YAGNI）。

## 认领/租约（store）

新增方法（替代循环里对 `listActiveFollowupLeads` 的使用；后者可保留给只读场景）：

```
claimDueLeads(workerId: string, now: Date, leaseMs: number, limit: number)
  → Promise<{ lead: StoredLead; prevWorkerId: string | null }[]>
```

原子认领（Prisma：`updateMany` 抢占 + 回查，或单条 raw `UPDATE ... RETURNING`）：

```sql
UPDATE "Lead"
SET "workerId" = :me, "leaseExpiresAt" = :now + :leaseMs
WHERE "autoFollowupEnabled" = true
  AND "nextActionAt" <= :now
  AND "status" IN ('discovered','contacting')
  AND ("workerId" IS NULL OR "leaseExpiresAt" < :now OR "workerId" = :me)
-- 取到期最早的若干条；并发安全靠条件 UPDATE 的行锁
```

要点：
- 返回每条的 `prevWorkerId`（认领前的持有者），供接管判定。需在更新前读取或用 RETURNING 拿旧值（Prisma 无原生 RETURNING 旧值，实现上：先按条件 `findMany` 候选 + 逐条带 `where` 乐观 `updateMany` 抢占，抢到的（count=1）才纳入，记录其旧 workerId）。
- 只认领"无主 / 租约过期 / 本人" → 不抢别的活着 worker 正在处理的线索。
- 处理一条**成功后续租**（`leaseExpiresAt = now + leaseMs`）。
- 线索进终态（converted/lost/paused）时释放：`workerId=null, leaseExpiresAt=null`（在 `updateLeadFollowupState` 终态分支处理，或循环里显式释放）。

## 接管时的 handoff 恢复（followup-loop）

`processLead` 接收 `prevWorkerId`，开头加接管判定：

- 若 `prevWorkerId` 非空且 ≠ 当前 workerId 且 `lead.status === 'contacting'` → 判定为接管：
  1. `runHandoffRecoveryWorkflow({ leadId, memorySpaceId, fromWorkerId: prevWorkerId, toWorkerId: 我 })`：召回 MemWal → LLM 生成恢复摘要 → 存 `handoff_proof`（已容错）。
  2. 写时间线：`handoff_triggered`（agentName/workerId 体现 prev→我）、`handoff_recovered`（summary=恢复摘要，artifactRefs=[handoff_proof blobId]）。
  3. 继续本轮正常跟进。
- `discovered` 被接管：直接当首触，不跑恢复（没有"进行中上下文"可恢复）。
- handoff 恢复失败（MemWal 429 等）：按现有容错降级，不阻断跟进。

## 接口

新增：
```
POST /api/leads/:leadId/simulate-crash
```
- 校验 lead 存在且 `status === 'contacting'`（否则 400，附原因）。
- 置 `workerId = 'worker_crashed_demo'`，`leaseExpiresAt = now - 1s`。
- 返回最新线索状态。
- 效果：正在跑的真 worker 下一 tick 认领到它（租约过期）→ prevWorkerId='worker_crashed_demo'≠我 → 触发 handoff 恢复。

现有接口回显（按钮"真生效"）：
- `start-followup`、`simulate-crash` 等返回最新线索状态，前端调用后立即刷新。
- `GET /api/dashboard/leads/:id` 确认返回 profile / timeline / artifacts / memories / conversation / nextFollowup / status，并补 `workerId` / `leaseExpiresAt`；缺块补齐（检查器用）。
- `GET /api/dashboard/leads` 每项带 `status` / `workerId` / `updatedAt`。

手动发沿用现有 `POST /api/leads/:leadId/conversation/send`。

## 看板（前端，apps/web）

布局：左线索列表 + 右详情。

- **自动刷新**：每 ~4s 轮询列表 + 当前详情；写操作进行中暂停轮询；右上角 live 指示。
- **线索列表**：每条显示昵称、状态徽章（discovered/contacting/converted/lost/paused 不同色）、意向级别、归属 worker 徽章（无主/worker-x）。
- **详情头**：状态、当前 worker + 租约状态、touchCount、下次动作时间。
- **检查器 Tabs**：时间线（`handoff_recovered` 高亮 + 恢复摘要 + 可点 Walrus 存证）/ 对话（气泡流）/ 记忆（MemWal 召回与写入）/ 存证（Walrus blob 可点）/ 画像。
- **操作栏**：加入跟进（start-followup）、模拟崩溃（simulate-crash，仅 contacting 可点）、手动发（send，带输入框）。每个按钮带 loading + 结果提示 + 触发刷新。
- **接力可见**：模拟崩溃后几秒内，列表该线索 worker 徽章变化、时间线冒出 `handoff_recovered` + 摘要。

## 错误处理

- 认领原子性：条件 UPDATE 行锁保证不双发；抢占失败（count=0）跳过该条。
- 处理中崩溃：租约不再续 → 到期后他人接管。
- handoff/MemWal/Walrus 失败：沿用既有容错（不阻断发送）。
- simulate-crash 非 contacting：400。
- 前端轮询失败：静默重试，不打断当前操作。

## 测试策略

1. `claimDueLeads`：无主/过期/本人可领；别人活租约不可领；并发只一个抢到。
2. `processLead` 接管：prevWorkerId≠我且 contacting → 跑 handoff + 写 `handoff_recovered`；discovered 接管不跑恢复；handoff 失败降级不阻断。
3. 终态释放 workerId/leaseExpiresAt。
4. `simulate-crash`：置过期+假 workerId；非 contacting 返回 400。
5. 前端：自动刷新轮询、按钮触发对应 API、检查器各 tab 渲染。
6. 真机冒烟（人工）：起循环 → contacting 线索 → 模拟崩溃 → 时间线几秒内出 `handoff_recovered` + 摘要 + 存证。

## 不在本期范围（YAGNI）

- 多设备横向扩展（多 worker 并行各绑一台设备）。
- 独立 Worker 注册表 + 心跳 + 回收器（用线索级租约替代）。
- 专门的 worker 监控大面板（用线索 worker 徽章 + 时间线体现）。
- SSE/WebSocket 实时推送（用轮询）。
- 看板造测试线索/同步/Seed 按钮（移除）。
