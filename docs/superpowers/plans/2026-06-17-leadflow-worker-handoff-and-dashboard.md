# 多 Worker 故障接管 + 看板可观测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让转化跟进具备单设备故障接管能力——worker 崩溃/卡住后，另一实例认领其未完成线索并经 MemWal 恢复上下文继续；看板自动刷新并能直观看到接力。

**Architecture:** Lead 表加 `workerId`/`leaseExpiresAt`；followup-loop 每实例有唯一 workerId，每 tick 用 `claimDueLeads` 原子认领到期线索（只领无主/租约过期/本人）；认领到他人遗留的 contacting 线索时跑现有 handoff 工作流恢复上下文。看板轮询刷新 + 操作栏（加入跟进/模拟崩溃/手动发）+ 检查器 tabs。

**Tech Stack:** TypeScript (ESM)、Prisma + PostgreSQL、Hono、React + Vite、vitest。

---

## 设计参考

实现前阅读 spec：[docs/superpowers/specs/2026-06-17-leadflow-worker-handoff-and-dashboard-design.md](../specs/2026-06-17-leadflow-worker-handoff-and-dashboard-design.md)

## 文件结构

| 文件 | 职责 | 任务 |
|---|---|---|
| `prisma/schema.prisma` + migration | Lead 加 `workerId`/`leaseExpiresAt` | 1 |
| `apps/api/src/store.ts` | `StoredLead` 加字段；`ClaimedLead` 类型；接口加 `claimDueLeads`；`updateLeadFollowupState` patch 扩展；内存实现 | 1,2 |
| `apps/api/src/prisma-store.ts` | `leadFromPrisma` 加字段；`claimDueLeads` Prisma 实现；`updateLeadFollowupState` 扩展 | 1,2 |
| `apps/api/src/store.test.ts` | `claimDueLeads` 单测 | 2 |
| `apps/api/src/followup-loop.ts` | worker 身份；tick 用 `claimDueLeads`；processLead 接管判定 + 续租/释放 | 3,4 |
| `apps/api/src/followup-loop.test.ts` | 接管单测 | 4 |
| `apps/api/src/routes/leads.ts` | `POST /:leadId/simulate-crash` | 5 |
| `apps/api/src/routes/dashboard.ts` | 列表/详情暴露 `workerId`/`leaseExpiresAt` | 5 |
| `apps/api/src/app.test.ts` | simulate-crash 接口测试 | 5 |
| `apps/web/src/api.ts` | 加 `startFollowup`/`simulateCrash`；改 send 参数 | 6 |
| `apps/web/src/types.ts` | DashboardLead 加 workerId 等 | 6 |
| `apps/web/src/App.tsx` | 自动刷新轮询 + 操作栏 + worker 徽章 + 检查器 | 6 |

---

## Task 1: Lead 租约字段 + store 类型

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260617120000_add_lead_worker_lease/migration.sql`
- Modify: `apps/api/src/store.ts`
- Modify: `apps/api/src/prisma-store.ts`

- [ ] **Step 1: 改 schema**

在 `prisma/schema.prisma` 的 `model Lead` 里，`followupTouchCount` 之后加：

```prisma
  workerId            String?
  leaseExpiresAt      DateTime?
```

- [ ] **Step 2: 写 migration**

新建 `prisma/migrations/20260617120000_add_lead_worker_lease/migration.sql`：

```sql
ALTER TABLE "Lead" ADD COLUMN "workerId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
```

- [ ] **Step 3: 应用迁移 + 生成 client**

Run: `npx prisma migrate deploy --schema prisma/schema.prisma && npx prisma generate --schema prisma/schema.prisma`
Expected: `All migrations have been successfully applied.`

- [ ] **Step 4: 扩展 store.ts 类型**

在 `apps/api/src/store.ts`，`StoredLead` 末尾加两字段：

```ts
  autoFollowupEnabled?: boolean;
  nextActionAt?: Date | null;
  followupTouchCount?: number;
  workerId?: string | null;
  leaseExpiresAt?: Date | null;
};
```

在 `StoredLead` 类型之后加 `ClaimedLead`：

```ts
export type ClaimedLead = { lead: StoredLead; prevWorkerId: string | null };
```

`ApiStore` 接口在 `listActiveFollowupLeads` 之后加：

```ts
  claimDueLeads(
    workerId: string,
    now: Date,
    leaseMs: number,
    limit: number,
  ): Promise<ClaimedLead[]>;
```

把 `updateLeadFollowupState` 的 patch 类型扩展为：

```ts
  updateLeadFollowupState(
    leadId: string,
    patch: {
      status?: string;
      nextActionAt?: Date | null;
      followupTouchCount?: number;
      autoFollowupEnabled?: boolean;
      workerId?: string | null;
      leaseExpiresAt?: Date | null;
    },
  ): Promise<void>;
```

- [ ] **Step 5: 内存 store——upsertLead 保留新字段 + updateLeadFollowupState 处理新字段**

在 `createMemoryStore` 的 `upsertLead`，`next` 构造里补：

```ts
        followupTouchCount: lead.followupTouchCount ?? existing?.followupTouchCount ?? 0,
        workerId: lead.workerId !== undefined ? lead.workerId : (existing?.workerId ?? null),
        leaseExpiresAt:
          lead.leaseExpiresAt !== undefined ? lead.leaseExpiresAt : (existing?.leaseExpiresAt ?? null),
        updatedAt: new Date().toISOString(),
```

在内存 `updateLeadFollowupState` 里补两行：

```ts
      if (patch.workerId !== undefined) lead.workerId = patch.workerId;
      if (patch.leaseExpiresAt !== undefined) lead.leaseExpiresAt = patch.leaseExpiresAt;
      lead.updatedAt = new Date().toISOString();
```

- [ ] **Step 6: prisma-store——leadFromPrisma + upsertLead + updateLeadFollowupState 加字段**

`leadFromPrisma` 返回值末尾加：

```ts
    followupTouchCount: (row.followupTouchCount as number) ?? 0,
    workerId: (row.workerId as string | null) ?? null,
    leaseExpiresAt: (row.leaseExpiresAt as Date | null) ?? null,
  };
```

`upsertLead` 的 create 块加 `workerId: lead.workerId ?? null, leaseExpiresAt: lead.leaseExpiresAt ?? null,`；update 块加条件展开：

```ts
          ...(lead.workerId !== undefined ? { workerId: lead.workerId } : {}),
          ...(lead.leaseExpiresAt !== undefined ? { leaseExpiresAt: lead.leaseExpiresAt } : {}),
```

`updateLeadFollowupState` 的 data 加条件展开：

```ts
          ...(patch.workerId !== undefined ? { workerId: patch.workerId } : {}),
          ...(patch.leaseExpiresAt !== undefined ? { leaseExpiresAt: patch.leaseExpiresAt } : {}),
```

- [ ] **Step 7: typecheck**

Run: `pnpm --filter @leadflow/api typecheck`
Expected: 无错误（`claimDueLeads` 未实现会报接口未实现——Task 2 补；本步先确认类型字段无误，可暂时在两个 store 里加 `claimDueLeads: async () => []` 占位让 typecheck 过）

加占位：内存 store 和 prisma store 各加
```ts
    claimDueLeads: async () => [],
```

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma "prisma/migrations/20260617120000_add_lead_worker_lease" apps/api/src/store.ts apps/api/src/prisma-store.ts
git commit -m "feat: Lead 增加 workerId/leaseExpiresAt 租约字段 + store 类型

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: claimDueLeads 原子认领

**Files:**
- Modify: `apps/api/src/store.ts`
- Modify: `apps/api/src/prisma-store.ts`
- Test: `apps/api/src/store.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/api/src/store.test.ts` 的 `describe("api store", ...)` 内加：

```ts
  it("claimDueLeads 只认领无主/过期/本人，且记录 prevWorkerId", async () => {
    const store = createMemoryStore();
    await store.upsertCampaign({ id: "c1" });
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);
    // a: 无主到期 → 可领
    await store.upsertLead({ id: "a", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "A", autoFollowupEnabled: true, nextActionAt: past });
    // b: 别人持有且租约未过期 → 不可领
    await store.upsertLead({ id: "b", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "B", autoFollowupEnabled: true, nextActionAt: past, workerId: "other", leaseExpiresAt: future });
    // c: 别人持有但租约过期 → 可领，prevWorkerId=other
    await store.upsertLead({ id: "c", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "C", autoFollowupEnabled: true, nextActionAt: past, workerId: "other", leaseExpiresAt: past });

    const now = new Date();
    const claimed = await store.claimDueLeads("me", now, 90_000, 10);
    const ids = claimed.map((x) => x.lead.id).sort();
    expect(ids).toEqual(["a", "c"]);
    const cClaim = claimed.find((x) => x.lead.id === "c");
    expect(cClaim?.prevWorkerId).toBe("other");
    expect(cClaim?.lead.workerId).toBe("me");
    // 认领后 b 不受影响
    expect((await store.getLead("b"))?.workerId).toBe("other");
    // 再认领一次：已被 me 持有且租约未过期 → 仍可领(本人)，但 b 仍不可领
    const again = await store.claimDueLeads("me", new Date(), 90_000, 10);
    expect(again.map((x) => x.lead.id).sort()).toEqual(["a", "c"]);
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @leadflow/api exec vitest run src/store.test.ts`
Expected: FAIL（claimDueLeads 占位返回 []）

- [ ] **Step 3: 内存实现 claimDueLeads**

把内存 store 的占位 `claimDueLeads: async () => [],` 换成：

```ts
    claimDueLeads: async (workerId, now, leaseMs, limit) => {
      const eligible = [...leads.values()]
        .filter(
          (l) =>
            l.autoFollowupEnabled === true &&
            l.nextActionAt != null &&
            l.nextActionAt <= now &&
            (l.status === "discovered" || l.status === "contacting") &&
            (l.workerId == null ||
              (l.leaseExpiresAt != null && l.leaseExpiresAt < now) ||
              l.workerId === workerId),
        )
        .sort((a, b) => a.nextActionAt!.getTime() - b.nextActionAt!.getTime())
        .slice(0, limit);
      const claimed: ClaimedLead[] = [];
      for (const l of eligible) {
        const prevWorkerId = l.workerId ?? null;
        l.workerId = workerId;
        l.leaseExpiresAt = new Date(now.getTime() + leaseMs);
        l.updatedAt = new Date().toISOString();
        claimed.push({ lead: { ...l }, prevWorkerId });
      }
      return claimed;
    },
```

确保 `store.ts` 顶部已 import 不需要（`ClaimedLead` 同文件定义）。

- [ ] **Step 4: 运行内存测试确认通过**

Run: `pnpm --filter @leadflow/api exec vitest run src/store.test.ts`
Expected: PASS

- [ ] **Step 5: Prisma 实现 claimDueLeads**

把 prisma-store 的占位换成（候选查 + 逐行乐观抢占，保证并发安全）：

```ts
    async claimDueLeads(workerId, now, leaseMs, limit) {
      const candidates = await prisma.lead.findMany({
        where: {
          autoFollowupEnabled: true,
          nextActionAt: { lte: now },
          status: { in: ["discovered", "contacting"] as never },
          OR: [{ workerId: null }, { leaseExpiresAt: { lt: now } }, { workerId }],
        },
        orderBy: { nextActionAt: "asc" },
        take: limit,
      });
      const leaseUntil = new Date(now.getTime() + leaseMs);
      const claimed: ClaimedLead[] = [];
      for (const c of candidates) {
        const prevWorkerId = ((c as Record<string, unknown>).workerId as string | null) ?? null;
        // 乐观抢占：仅当仍处于可领状态才更新，防并发双领
        const res = await prisma.lead.updateMany({
          where: {
            id: c.id,
            OR: [{ workerId: null }, { leaseExpiresAt: { lt: now } }, { workerId }],
          },
          data: { workerId, leaseExpiresAt: leaseUntil },
        });
        if (res.count === 1) {
          const row = await prisma.lead.findUnique({ where: { id: c.id } });
          claimed.push({ lead: leadFromPrisma(row as Record<string, unknown>), prevWorkerId });
        }
      }
      return claimed;
    },
```

在 prisma-store 顶部 import 加 `ClaimedLead`：

```ts
import type {
  ApiStore,
  ClaimedLead,
  StoredArtifactRef,
  ...
} from "./store.js";
```

- [ ] **Step 6: typecheck**

Run: `pnpm --filter @leadflow/api typecheck`
Expected: 无错误

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/store.ts apps/api/src/prisma-store.ts apps/api/src/store.test.ts
git commit -m "feat: claimDueLeads 原子认领(无主/过期/本人)+ prevWorkerId

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Worker 身份 + 循环改用认领

**Files:**
- Modify: `apps/api/src/followup-loop.ts`
- Modify: `.env.example`

- [ ] **Step 1: FollowupConfig 加 workerId + leaseMs；readFollowupConfig 生成**

在 `apps/api/src/followup-loop.ts`，`FollowupConfig` 改为：

```ts
export type FollowupConfig = {
  intervalMs: number;
  maxTouches: number;
  deviceId?: string;
  workerId: string;
  leaseMs: number;
};
```

文件顶部 import 加：

```ts
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
```

加一个 worker id 生成器（模块级，进程内唯一）：

```ts
const WORKER_ID = `worker_${hostname()}_${process.pid}_${randomBytes(2).toString("hex")}`;
```

`readFollowupConfig` 改为带 workerId/leaseMs：

```ts
export function readFollowupConfig(): FollowupConfig {
  return {
    intervalMs: num(process.env.AUTO_FOLLOWUP_INTERVAL_MS, 60_000),
    maxTouches: num(process.env.AUTO_FOLLOWUP_MAX_TOUCHES, 8),
    deviceId: process.env.AUTO_FOLLOWUP_DEVICE_ID || undefined,
    workerId: WORKER_ID,
    leaseMs: num(process.env.AUTO_FOLLOWUP_LEASE_MS, 90_000),
  };
}
```

`readConfig`（循环用）里 `cfg: readFollowupConfig()` 不变（已含新字段）。

- [ ] **Step 2: tick 改用 claimDueLeads**

把 `startFollowupLoop` 里 tick 的查询与处理改成：

```ts
      const now = new Date();
      const claimed = await services.store.claimDueLeads(cfg.workerId, now, cfg.leaseMs, batchSize);
      for (const { lead, prevWorkerId } of claimed) {
        if (dailyCount() >= dailyCap) break;
        try {
          const r = await processLead(services, lead, cfg, now, prevWorkerId);
          if (r.sent) {
            bumpDaily();
            await sleep(sendMinMs + Math.random() * (sendMaxMs - sendMinMs));
          }
        } catch (err) {
          console.error(
            `[followup] lead ${lead.id} 处理失败:`,
            err instanceof Error ? err.message : err,
          );
          await services.store
            .updateLeadFollowupState(lead.id, {
              nextActionAt: new Date(now.getTime() + cfg.intervalMs),
            })
            .catch(() => {});
        }
      }
```

启动日志带 workerId：

```ts
  console.log(`[followup] 自动跟进循环启动 worker=${cfg.workerId}，每 ${tickMs}ms 一轮`);
```

- [ ] **Step 3: processLead 续租/释放（先不加接管，接管放 Task 4）**

`processLead` 签名加 `prevWorkerId`（本任务暂不使用，Task 4 用）：

```ts
export async function processLead(
  services: ApiServices,
  lead: StoredLead,
  cfg: FollowupConfig,
  now: Date,
  prevWorkerId: string | null = null,
): Promise<ProcessResult> {
```

在文件内加一个计算租约补丁的小工具（放 processLead 上方）：

```ts
// 非终态(还要继续)：续租并保持归属；终态：释放归属与租约。
function leasePatch(cfg: FollowupConfig, now: Date, nextActionAt: Date | null) {
  return nextActionAt == null
    ? { workerId: null, leaseExpiresAt: null }
    : { workerId: cfg.workerId, leaseExpiresAt: new Date(now.getTime() + cfg.leaseMs) };
}
```

把 processLead 里**三处** `updateLeadFollowupState` 调用都并入租约补丁：

首触分支：
```ts
    await services.store.updateLeadFollowupState(lead.id, {
      status: decision.nextStatus,
      nextActionAt: decision.nextActionAt,
      followupTouchCount: (lead.followupTouchCount ?? 0) + 1,
      ...leasePatch(cfg, now, decision.nextActionAt),
    });
```

无新回复分支：
```ts
    await services.store.updateLeadFollowupState(lead.id, {
      nextActionAt: decision.nextActionAt,
      ...leasePatch(cfg, now, decision.nextActionAt),
    });
```

有回复分支末尾：
```ts
  await services.store.updateLeadFollowupState(lead.id, {
    status: decision.nextStatus,
    nextActionAt: decision.nextActionAt,
    followupTouchCount: (lead.followupTouchCount ?? 0) + (sent ? 1 : 0),
    ...leasePatch(cfg, now, decision.nextActionAt),
  });
```

`backoff()` 也续租（缺设备/redId 时退避但保持归属）：
```ts
  const backoff = () =>
    services.store.updateLeadFollowupState(lead.id, {
      nextActionAt: new Date(now.getTime() + cfg.intervalMs),
      ...leasePatch(cfg, now, new Date(now.getTime() + cfg.intervalMs)),
    });
```

- [ ] **Step 4: .env.example 加租约配置**

在 `.env.example` 的 AUTO_FOLLOWUP 区追加：

```
# 线索租约时长(ms)，需 > 单条处理耗时，崩溃后超过此时长被他人接管
# AUTO_FOLLOWUP_LEASE_MS=90000
```

- [ ] **Step 5: typecheck + 现有 followup-loop 测试**

Run: `pnpm --filter @leadflow/api typecheck && pnpm --filter @leadflow/api exec vitest run src/followup-loop.test.ts`
Expected: typecheck 通过；现有 3 个用例需把 `CFG` 补上 `workerId`/`leaseMs` 才过——在 `followup-loop.test.ts` 顶部把 `const CFG = { intervalMs: 60_000, maxTouches: 8, deviceId: "d1" };` 改为：

```ts
const CFG = { intervalMs: 60_000, maxTouches: 8, deviceId: "d1", workerId: "test-worker", leaseMs: 90_000 };
```

再次 Run 上面命令，Expected: PASS

- [ ] **Step 5b: 修 debug-conversion-e2e.ts 的 cfg（FollowupConfig 新增必填字段）**

`apps/api/src/debug-conversion-e2e.ts` 里调用 `processLead` 传的是字面量 cfg，缺 `workerId`/`leaseMs` 会 typecheck 失败。把那处改为复用 `readFollowupConfig()`：

```ts
import { processLead, readFollowupConfig } from "./followup-loop.js";
// ...
  const result = await processLead(
    services,
    lead,
    { ...readFollowupConfig(), deviceId: DEVICE },
    new Date(),
  );
```

Run: `pnpm --filter @leadflow/api typecheck`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/followup-loop.ts apps/api/src/followup-loop.test.ts apps/api/src/debug-conversion-e2e.ts .env.example
git commit -m "feat: followup-loop 引入 worker 身份与租约认领、续租/释放

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 接管时触发 handoff 恢复

**Files:**
- Modify: `apps/api/src/followup-loop.ts`
- Test: `apps/api/src/followup-loop.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/api/src/followup-loop.test.ts` 末尾（describe 内）加：

```ts
  it("接管他人遗留的 contacting 线索 → 跑 handoff 恢复并写 handoff_recovered", async () => {
    const services = createFakeServices();
    await seedLead(services, "lh", "contacting");
    let handoffCalled = false;
    services.workflows = {
      ...services.workflows,
      runHandoffRecovery: async () => {
        handoffCalled = true;
        return { recoverySummary: "已恢复客户画像与下一步", artifact: { blobId: "0xproof" } as never };
      },
    } as never;
    // 无新回复，避免触发回复轮（聚焦验证接管）
    services.xhsChat = {
      ...services.xhsChat,
      getConversation: async () => ({ messages: [] }),
    } as never;

    const lead = (await services.store.getLead("lh"))!;
    await processLead(services, lead, CFG, new Date(), "worker-OLD");

    expect(handoffCalled).toBe(true);
    const events = await services.store.listTimelineEvents("lh");
    expect(events.some((e) => e.type === "handoff_recovered")).toBe(true);
  });

  it("discovered 被接管不跑 handoff（无上下文可恢复）", async () => {
    const services = createFakeServices();
    await seedLead(services, "ld", "discovered");
    let handoffCalled = false;
    services.workflows = {
      ...services.workflows,
      runHandoffRecovery: async () => {
        handoffCalled = true;
        return { recoverySummary: "x", artifact: { blobId: "y" } as never };
      },
      runConversion: async () => ({ message: "您好", memoryRef: "", artifact: {} as never, extractedFields: {}, outcome: "continue" as const }),
    } as never;
    services.xhsChat = {
      ...services.xhsChat,
      sendPrivateMessage: async () => ({ status: "sent", sentAt: new Date().toISOString() }),
    } as never;

    const lead = (await services.store.getLead("ld"))!;
    await processLead(services, lead, CFG, new Date(), "worker-OLD");
    expect(handoffCalled).toBe(false);
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @leadflow/api exec vitest run src/followup-loop.test.ts`
Expected: FAIL（未实现接管，handoff_recovered 不出现）

- [ ] **Step 3: 在 processLead 加接管判定**

在 `processLead` 解析完 identity/device、拿到 `playbook` 之后、进入"首触/查回复"分支**之前**，加：

```ts
  // 接管判定：认领到的线索原属于别的 worker(且非空)、且是进行中的对话 → 跑 handoff 恢复。
  if (prevWorkerId && prevWorkerId !== cfg.workerId && lead.status === "contacting") {
    console.log(`[followup] lead ${lead.id} 接管自 ${prevWorkerId}，跑 handoff 恢复`);
    try {
      const recovery = await services.workflows.runHandoffRecovery({
        leadId: lead.id,
        memorySpaceId: lead.memorySpaceId,
        fromWorkerId: prevWorkerId,
        toWorkerId: cfg.workerId,
      });
      await services.store.appendTimelineEvent({
        leadId: lead.id,
        type: "handoff_triggered",
        summary: `worker ${prevWorkerId} → ${cfg.workerId}`,
        agentName: "handoff",
        workerId: cfg.workerId,
        memoryRefs: [],
        artifactRefs: [],
      });
      await services.store.appendTimelineEvent({
        leadId: lead.id,
        type: "handoff_recovered",
        summary: recovery.recoverySummary || "已恢复上下文",
        agentName: "handoff",
        workerId: cfg.workerId,
        memoryRefs: [],
        artifactRefs: recovery.artifact?.blobId ? [recovery.artifact.blobId] : [],
      });
    } catch (err) {
      console.warn(
        `[followup] lead ${lead.id} handoff 恢复失败，继续跟进:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
```

> 注：`appendTimelineEvent` 的入参已支持 `workerId`（见 `StoredTimelineEvent`）。`type` 为字符串，`handoff_triggered`/`handoff_recovered` 均合法。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @leadflow/api exec vitest run src/followup-loop.test.ts`
Expected: PASS（含新增 2 用例）

- [ ] **Step 5: 全 api 测试 + typecheck**

Run: `pnpm --filter @leadflow/api test && pnpm --filter @leadflow/api typecheck`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/followup-loop.ts apps/api/src/followup-loop.test.ts
git commit -m "feat: 接管他人遗留 contacting 线索时跑 handoff 恢复并记时间线

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: simulate-crash 接口 + 看板数据暴露 workerId

**Files:**
- Modify: `apps/api/src/routes/leads.ts`
- Modify: `apps/api/src/routes/dashboard.ts`
- Test: `apps/api/src/app.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/api/src/app.test.ts` 的 `describe("api app", ...)` 内加：

```ts
  it("simulate-crash 把 contacting 线索租约置过期+假 worker", async () => {
    const services = createFakeServices();
    const a = createApp(services);
    await services.store.upsertCampaign({ id: "c1" });
    await services.store.upsertLead({ id: "lx", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "X", workerId: "worker-real", leaseExpiresAt: new Date(Date.now() + 60_000) });

    const res = await a.request("/api/leads/lx/simulate-crash", { method: "POST" });
    expect(res.status).toBe(200);
    const lead = await services.store.getLead("lx");
    expect(lead?.workerId).toBe("worker_crashed_demo");
    expect(lead?.leaseExpiresAt!.getTime()).toBeLessThan(Date.now());
  });

  it("simulate-crash 对非 contacting 线索返回 400", async () => {
    const services = createFakeServices();
    const a = createApp(services);
    await services.store.upsertCampaign({ id: "c1" });
    await services.store.upsertLead({ id: "ld", campaignId: "c1", platform: "xhs", status: "discovered", memorySpaceId: "s", displayName: "D" });
    const res = await a.request("/api/leads/ld/simulate-crash", { method: "POST" });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @leadflow/api exec vitest run src/app.test.ts`
Expected: FAIL（404，路由不存在）

- [ ] **Step 3: 加 simulate-crash 路由**

在 `apps/api/src/routes/leads.ts` 的 `route.post("/:leadId/start-followup", ...)` 之后加：

```ts
  // 模拟 worker 崩溃：把线索租约置过期 + 假 workerId，让真 worker 下一 tick 认领并触发 handoff。
  route.post("/:leadId/simulate-crash", async (c) => {
    const leadId = c.req.param("leadId");
    const lead = await services.store.getLead(leadId);
    if (!lead) {
      return c.json({ error: { code: "LEAD_NOT_FOUND" } }, 404);
    }
    if (lead.status !== "contacting") {
      return c.json(
        { error: { code: "NOT_CONTACTING", message: "仅 contacting(进行中对话) 的线索可模拟接管" } },
        400,
      );
    }
    await services.store.updateLeadFollowupState(leadId, {
      workerId: "worker_crashed_demo",
      leaseExpiresAt: new Date(Date.now() - 1000),
    });
    const after = await services.store.getLead(leadId);
    return c.json({ leadId, simulated: true, status: after?.status, workerId: after?.workerId });
  });
```

- [ ] **Step 4: dashboard 暴露 workerId/leaseExpiresAt**

在 `apps/api/src/routes/dashboard.ts` 的 `toLeadListItem` 返回对象里加：

```ts
    status: lead.status,
    workerId: lead.workerId ?? null,
    leaseExpiresAt: lead.leaseExpiresAt ? lead.leaseExpiresAt.toISOString() : null,
    followupTouchCount: lead.followupTouchCount ?? 0,
```

（`toLeadListItem` 列表项与详情头都用它，一处改两处生效。）

- [ ] **Step 5: 运行确认通过 + 全测**

Run: `pnpm --filter @leadflow/api test && pnpm --filter @leadflow/api typecheck`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/leads.ts apps/api/src/routes/dashboard.ts apps/api/src/app.test.ts
git commit -m "feat: simulate-crash 接口 + 看板暴露 workerId/租约

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 看板——自动刷新 + 操作栏 + worker 徽章 + 检查器

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: types.ts 加字段**

在 `apps/web/src/types.ts` 的 `DashboardLeadItem` 加：

```ts
  workerId?: string | null;
  leaseExpiresAt?: string | null;
  followupTouchCount?: number;
```

- [ ] **Step 2: api.ts——加 startFollowup/simulateCrash，移除 syncConversation，send 改通用参数**

在 `apps/web/src/api.ts` 删除 `syncConversation`、`seedDemo`（按 spec 移除同步/Seed/造测试线索）。把 `sendFollowup` 的设备/用户写死参数保留（手动发仍走 device-1 占位，真实场景由后端 env 决定设备）。新增：

```ts
export async function startFollowup(leadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/start-followup`, { method: "POST" });
  if (!response.ok) throw new Error(`start-followup failed: ${response.status}`);
  return response.json();
}

export async function simulateCrash(leadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/simulate-crash`, { method: "POST" });
  if (!response.ok) throw new Error(`simulate-crash failed: ${response.status}`);
  return response.json();
}
```

`runHandoff` 可保留（不再放按钮，但不删以免连带改动）。

- [ ] **Step 3: App.tsx——自动刷新轮询**

在 `apps/web/src/App.tsx` 的列表加载 effect 后，加一个轮询 effect（每 4s 刷新列表 + 当前详情，写操作中暂停）。在组件内已有 `selectedLeadId`、`setItems`、`setDetail` 的前提下加：

```tsx
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (busy) return;
      fetchDashboardLeads().then(setItems).catch(() => {});
      if (selectedLeadId) {
        fetchDashboardLeadDetail(selectedLeadId).then(setDetail).catch(() => {});
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [busy, selectedLeadId]);
```

> 若现有 state 命名不同（如 `leads`/`setLeads`），按现有命名对齐。`busy` 在按钮处理中置 true、完成后置 false。

- [ ] **Step 4: App.tsx——操作栏三按钮（加入跟进/模拟崩溃/手动发）**

把原操作栏（Sync/Send/Handoff/Seed）替换为：

```tsx
  async function withBusy(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      const items = await fetchDashboardLeads();
      setItems(items);
      if (selectedLeadId) setDetail(await fetchDashboardLeadDetail(selectedLeadId));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
```

操作栏 JSX：

```tsx
            <div className="actions">
              <button type="button" disabled={!selectedLeadId || busy}
                onClick={() => withBusy(() => startFollowup(selectedLeadId!))}>
                加入跟进
              </button>
              <button type="button"
                disabled={!selectedLeadId || busy || detail?.lead.status !== "contacting"}
                onClick={() => withBusy(() => simulateCrash(selectedLeadId!))}>
                模拟崩溃
              </button>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="手动发一句…" />
              <button type="button" disabled={!selectedLeadId || busy || !draft}
                onClick={() => withBusy(async () => { await sendFollowup(selectedLeadId!, draft); setDraft(""); })}>
                手动发
              </button>
            </div>
```

加 state：`const [draft, setDraft] = useState("");`（import 自现有 `useState`）。

- [ ] **Step 5: App.tsx——列表项加状态 + worker 徽章**

在列表渲染每个 lead 的按钮里，名称下加徽章行：

```tsx
                  <span className={`badge status-${lead.status}`}>{lead.status}</span>
                  {lead.workerId
                    ? <span className="badge worker">{lead.workerId}</span>
                    : <span className="badge none">无主</span>}
```

详情头加当前 worker/租约：在详情标题处加：

```tsx
              <div className="lead-sub">
                {detail.lead.workerId ? `worker ${detail.lead.workerId}` : "无主"} · 触达 {detail.lead.followupTouchCount ?? 0}
              </div>
```

> 样式：`apps/web/src/styles.css` 加 `.badge{font-size:11px;padding:1px 7px;border-radius:10px;margin-right:4px}` 及各状态色（status-contacting/converted/lost/paused/discovered）。具体配色可参考 spec 草图，自由发挥但需深色模式可读。

- [ ] **Step 6: App.tsx——时间线 handoff 高亮**

时间线渲染处，给 `handoff_recovered`/`handoff_triggered` 加高亮类：

```tsx
                <li className={event.type.startsWith("handoff") ? "evt handoff" : "evt"}>
                  <span className="evt-type">{event.type}</span>
                  <span className="evt-summary">{event.summary}</span>
                </li>
```

`.evt.handoff{border-left:2px solid var(--accent);background:rgba(127,119,221,.12);padding-left:8px}` 之类。

- [ ] **Step 7: 前端测试 + 构建**

更新/精简 `apps/web/src/App.test.tsx`：移除对已删按钮(Sync/Seed)的断言；加一条"渲染状态徽章"。最少改动让其通过。

Run: `pnpm --filter @leadflow/web test && pnpm --filter @leadflow/web build`
Expected: 全部 PASS / 构建成功

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/api.ts apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/styles.css
git commit -m "feat: 看板自动刷新 + 操作栏(加入跟进/模拟崩溃/手动发) + worker 徽章/接力高亮

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 验收（人工，真机/真实环境）

1. `.env`：`AUTO_FOLLOWUP_ENABLED=true`、`AUTO_FOLLOWUP_INTERVAL_MS=15000`、`AUTO_FOLLOWUP_LEASE_MS=90000`、`AUTO_FOLLOWUP_DEVICE_ID=<设备>`。
2. 单实例启动 API（非 watch）。mock 一条线索 → 看板「加入跟进」→ 等开场 → 转 contacting。
3. 你在手机回一句让对话推进；确认看板自动刷新、worker 徽章显示当前 worker。
4. 点「模拟崩溃」→ 几秒内：worker 徽章变 `worker_crashed_demo` 短暂 → 真 worker 下一 tick 认领 → 时间线冒出 `handoff_triggered` + `handoff_recovered` + 恢复摘要 + 可点 Walrus 存证 → 继续跟进。
5. 验证不双发、不抢设备（单实例下天然单 worker）。

> 真实多实例容错（杀进程让另一实例接管）可选验证：起第二个单实例（同库、同设备勿并发发送），杀第一个，等租约过期，看第二个认领续跟。
