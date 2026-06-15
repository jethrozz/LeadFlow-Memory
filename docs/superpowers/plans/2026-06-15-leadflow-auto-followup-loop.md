# 转化 Agent 自动领取跟进循环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给转化 agent 加一套单进程自动跟进循环——线索被发现后自动开场、固定间隔轮询客户回复、结合长期记忆多轮对话，直到客户明确拒绝或达成 playbook 目标。

**Architecture:** Lead 状态机（`status` + `nextActionAt`）由进程内调度循环驱动；纯函数 `decideNextAction` 决定状态转移，IO（recall/生成/发送/同步）在 `processLead` 中。复用现有转化工作流（加 outcome 判定与 opening 模式）与 xhsChat 连接器（发送/同步逻辑抽成 service）。

**Tech Stack:** TypeScript (ESM)、Hono、Prisma + PostgreSQL、vitest、pnpm workspace。`@leadflow/agents`（工作流）、`@leadflow/playbook`、`apps/api`（store + 循环 + 路由）。

---

## 设计参考

实现前阅读 spec：[docs/superpowers/specs/2026-06-15-leadflow-auto-followup-loop-design.md](../specs/2026-06-15-leadflow-auto-followup-loop-design.md)

## 文件结构

| 文件 | 职责 | 任务 |
|---|---|---|
| `packages/agents/src/prompts.ts` | `buildConversionPrompt` 支持 reply/opening 模式 + outcome 指令 | 1 |
| `packages/agents/src/types.ts` | `ConversionInput.customerMessage` 可选；`ConversionResult.outcome` | 1 |
| `packages/agents/src/conversion-workflow.ts` | opening 模式、outcome 解析、recall 容错 | 1 |
| `packages/agents/src/conversion-workflow.test.ts` | 转化工作流单测（新建） | 1 |
| `prisma/schema.prisma` + migration | Lead 加 `autoFollowupEnabled`/`nextActionAt`/`followupTouchCount` | 2 |
| `apps/api/src/store.ts` | `StoredLead` 新字段；接口加 `listActiveFollowupLeads`/`updateLeadFollowupState`/`getDefaultDevice`；内存实现 | 2 |
| `apps/api/src/prisma-store.ts` | 上述三方法的 Prisma 实现 + upsertLead 持久化新字段 | 2 |
| `apps/api/src/store.test.ts` | 内存 store 新方法测试 | 2 |
| `apps/api/src/followup-decision.ts` | 纯函数 `decideNextAction`（新建） | 3 |
| `apps/api/src/followup-decision.test.ts` | 纯函数穷举测试（新建） | 3 |
| `apps/api/src/conversation-service.ts` | `sendFollowup`/`syncConversation`（去重）（新建） | 4 |
| `apps/api/src/routes/conversations.ts` | 路由改用 service | 4 |
| `apps/api/src/conversation-service.test.ts` | service 测试（新建） | 4 |
| `apps/api/src/playbook-loader.ts` | `loadPlaybookForCampaign` 抽取共享（新建） | 5 |
| `apps/api/src/followup-loop.ts` | tick + processLead + 护栏（新建） | 5 |
| `apps/api/src/followup-loop.test.ts` | 循环 processLead 测试（新建） | 5 |
| `apps/api/src/scheduler.ts` | 改用共享 playbook-loader；发现入列设字段 | 5,6 |
| `apps/api/src/routes/workflows.ts` | 发现入列设字段 | 6 |
| `apps/api/src/index.ts` | 启动 followup-loop | 5 |
| `.env.example` | 新增 `AUTO_FOLLOWUP_*` 变量 | 5 |

---

## Task 1: 转化工作流加 outcome 判定 + opening 模式

**Files:**
- Modify: `packages/agents/src/types.ts`
- Modify: `packages/agents/src/prompts.ts`
- Modify: `packages/agents/src/conversion-workflow.ts`
- Test: `packages/agents/src/conversion-workflow.test.ts`（新建）

- [ ] **Step 1: 改类型 —— customerMessage 可选 + outcome**

修改 `packages/agents/src/types.ts`：把 `ConversionInput.customerMessage` 改为可选，新增 `ConversionOutcome`，给 `ConversionResult` 加 `outcome`。

```ts
export type ConversionOutcome = "continue" | "goal_reached" | "rejected";

export type ConversionInput = {
  leadId: string;
  memorySpaceId: string;
  customerMessage?: string; // 缺省 = 首触 opening 模式
  playbook?: ConversionPlaybook;
};

export type ConversionResult = {
  message: string;
  memoryRef: string;
  artifact: StoredWalrusArtifact;
  extractedFields: Record<string, unknown>;
  outcome: ConversionOutcome;
};
```

- [ ] **Step 2: 写失败测试**

新建 `packages/agents/src/conversion-workflow.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { FakeLlmProvider } from "@leadflow/llm";
import { FakeMemWalClient } from "@leadflow/memwal";
import { FakeWalrusArtifactClient } from "@leadflow/walrus";
import { runConversionWorkflow } from "./conversion-workflow.js";
import type { WorkflowServices } from "./types.js";

function services(content: string): WorkflowServices {
  return {
    llm: new FakeLlmProvider({ content }),
    memwal: new FakeMemWalClient(),
    walrus: new FakeWalrusArtifactClient(),
  };
}

describe("conversion workflow", () => {
  it("回复轮解析 outcome=goal_reached", async () => {
    const result = await runConversionWorkflow(
      services(JSON.stringify({ message: "好的，加您微信", memory: "已要到微信", outcome: "goal_reached" })),
      { leadId: "l1", memorySpaceId: "space_l1", customerMessage: "我微信是 abc" },
    );
    expect(result.outcome).toBe("goal_reached");
    expect(result.message).toBe("好的，加您微信");
  });

  it("outcome 缺失/非法时默认 continue", async () => {
    const result = await runConversionWorkflow(
      services(JSON.stringify({ message: "了解一下您的预算？" })),
      { leadId: "l1", memorySpaceId: "space_l1", customerMessage: "你好" },
    );
    expect(result.outcome).toBe("continue");
  });

  it("opening 模式（无 customerMessage）强制 continue 且能生成开场", async () => {
    const result = await runConversionWorkflow(
      services(JSON.stringify({ message: "您好，看到您在找渝北三房", memory: "首次触达", outcome: "rejected" })),
      { leadId: "l1", memorySpaceId: "space_l1" },
    );
    expect(result.message).toBe("您好，看到您在找渝北三房");
    expect(result.outcome).toBe("continue"); // opening 不采纳 LLM 的 outcome
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm --filter @leadflow/agents exec vitest run src/conversion-workflow.test.ts`
Expected: FAIL（`result.outcome` 为 undefined / opening 行为未实现）

- [ ] **Step 4: 改 prompts.ts 支持模式**

修改 `packages/agents/src/prompts.ts` 的 `buildConversionPrompt`：

```ts
export function buildConversionPrompt(
  playbook?: ConversionPlaybook,
  mode: "reply" | "opening" = "reply",
): string {
  const role = playbook?.agent?.role ?? "销售顾问";
  const tone = playbook?.agent?.tone ?? "专业、亲切";
  const objective = playbook?.agent?.objective ?? "了解客户需求，建立信任关系";

  const rules = playbook?.conversation_rules?.length
    ? playbook.conversation_rules.map((r) => `- ${r}`).join("\n")
    : "- 提问不超过 3 个，避免让客户感到被审问\n- 以一个明确的下一步行动结束";

  const forbidden = playbook?.forbidden_claims?.length
    ? `\n禁止事项：\n${playbook.forbidden_claims.map((r) => `- ${r}`).join("\n")}`
    : "";

  if (mode === "opening") {
    return [
      `你是${role}。语气${tone}。目标：${objective}`,
      "",
      "规则：",
      rules,
      forbidden,
      "",
      "这是首次主动触达客户，请基于已知客户画像写一句自然的开场白，不要假设客户说过的话。",
      "返回 JSON：{ message, memory, extractedFields }",
      "message 为开场白，memory 为写入长期记忆的事实，extractedFields 为画像字段。",
    ].join("\n");
  }

  const goals = playbook?.success_criteria?.length
    ? playbook.success_criteria.map((g) => `- ${g}`).join("\n")
    : "- 拿到客户的微信或电话联系方式\n- 或客户明确同意线下/视频看房";

  return [
    `你是${role}。语气${tone}。目标：${objective}`,
    "",
    "规则：",
    rules,
    forbidden,
    "",
    "本次对话的成功目标（满足任一即算达成）：",
    goals,
    "",
    "请判断当前对话状态并返回 JSON：{ message, memory, extractedFields, outcome }",
    'outcome 取值："goal_reached"（客户已满足上述目标）、"rejected"（客户明确拒绝/不感兴趣）、"continue"（仍在沟通中）。',
    "message 为回复话术，memory 为写入长期记忆的事实，extractedFields 为本次抽取的画像字段。",
  ].join("\n");
}
```

- [ ] **Step 5: 改 conversion-workflow.ts**

修改 `packages/agents/src/conversion-workflow.ts`：

```ts
import { createArtifactPayload } from "@leadflow/walrus";
import { buildConversionPrompt } from "./prompts.js";
import { safeWalrusStore } from "./walrus-utils.js";
import type {
  ConversionInput,
  ConversionOutcome,
  ConversionResult,
  WorkflowServices,
} from "./types.js";

const OPENING_RECALL_QUERY = "客户购房需求 预算 区域 户型 顾虑";

function parseOutcome(value: unknown): ConversionOutcome {
  if (value === "goal_reached" || value === "rejected") return value;
  return "continue"; // 缺失/非法一律保守继续
}

export async function runConversionWorkflow(
  services: WorkflowServices,
  input: ConversionInput,
): Promise<ConversionResult> {
  const isOpening = !input.customerMessage;
  const recallQuery = input.customerMessage ?? OPENING_RECALL_QUERY;

  let recalled: Awaited<ReturnType<typeof services.memwal.recall>> = [];
  try {
    recalled = await services.memwal.recall({
      leadId: input.leadId,
      memorySpaceId: input.memorySpaceId,
      query: recallQuery,
      limit: 5,
    });
  } catch (err) {
    console.warn(
      "[conversion] recall failed, continuing without memory:",
      err instanceof Error ? err.message : err,
    );
  }

  const systemPrompt = buildConversionPrompt(input.playbook, isOpening ? "opening" : "reply");

  const result = await services.llm.chatJson({
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          customerMessage: input.customerMessage ?? "(首次主动触达，请生成开场白)",
          recalledMemory: recalled.map((memory) => memory.content),
        }),
      },
    ],
  });

  const artifact = await safeWalrusStore(
    services.walrus,
    createArtifactPayload({
      leadId: input.leadId,
      type: "conversion_decision",
      data: { customerMessage: input.customerMessage ?? null, recalled, result },
    }),
  );

  const memory = await services.memwal.writeMemory({
    leadId: input.leadId,
    memorySpaceId: input.memorySpaceId,
    content: String(result.memory ?? result.message ?? input.customerMessage ?? ""),
    metadata: { source: "conversion", confidence: 0.88, artifactRefs: [artifact.blobId] },
  });

  return {
    message: String(result.message ?? ""),
    memoryRef: memory.id,
    artifact,
    extractedFields: (result.extractedFields ?? {}) as Record<string, unknown>,
    outcome: isOpening ? "continue" : parseOutcome(result.outcome),
  };
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --filter @leadflow/agents exec vitest run src/conversion-workflow.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 7: 跑全包测试 + typecheck**

Run: `pnpm --filter @leadflow/agents test && pnpm --filter @leadflow/agents typecheck`
Expected: 全部 PASS（注意 `runConversion` 调用方不受影响：customerMessage 变可选向后兼容）

- [ ] **Step 8: Commit**

```bash
git add packages/agents/src/types.ts packages/agents/src/prompts.ts packages/agents/src/conversion-workflow.ts packages/agents/src/conversion-workflow.test.ts
git commit -m "feat: 转化工作流加 outcome 判定与 opening 模式

- ConversionResult 新增 outcome（continue/goal_reached/rejected），缺失默认 continue
- customerMessage 可选；缺省走 opening 开场白模式，强制 continue
- buildConversionPrompt 按 reply/opening 模式拼接，目标取 playbook.success_criteria
- recall 包容错，失败降级为无记忆继续

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Lead 调度字段 + store 读写

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260615120000_add_lead_followup_fields/migration.sql`
- Modify: `apps/api/src/store.ts`
- Modify: `apps/api/src/prisma-store.ts`
- Test: `apps/api/src/store.test.ts`

- [ ] **Step 1: 改 Prisma schema**

在 `prisma/schema.prisma` 的 `model Lead` 里，`isDemoSeed` 之后加三个字段：

```prisma
  isDemoSeed     Boolean         @default(false)
  autoFollowupEnabled Boolean    @default(false)
  nextActionAt   DateTime?
  followupTouchCount  Int        @default(0)
```

- [ ] **Step 2: 写 migration SQL**

新建 `prisma/migrations/20260615120000_add_lead_followup_fields/migration.sql`：

```sql
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "autoFollowupEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "nextActionAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "followupTouchCount" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 3: 应用迁移 + 重新生成 client**

Run: `npx prisma migrate deploy --schema prisma/schema.prisma && npx prisma generate --schema prisma/schema.prisma`
Expected: `All migrations have been successfully applied.`

- [ ] **Step 4: 写失败测试**

在 `apps/api/src/store.test.ts` 末尾（`describe` 内）加用例。先确认文件顶部已 `import { createMemoryStore } from "./store.js"`（已有则复用）：

```ts
  it("listActiveFollowupLeads 只返回到期且活跃的线索", async () => {
    const store = createMemoryStore();
    await store.upsertCampaign({ id: "c1" });
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);
    await store.upsertLead({ id: "a", campaignId: "c1", platform: "xhs", status: "discovered", memorySpaceId: "s_a", displayName: "A", autoFollowupEnabled: true, nextActionAt: past });
    await store.upsertLead({ id: "b", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s_b", displayName: "B", autoFollowupEnabled: true, nextActionAt: future });
    await store.upsertLead({ id: "c", campaignId: "c1", platform: "xhs", status: "discovered", memorySpaceId: "s_c", displayName: "C", autoFollowupEnabled: false, nextActionAt: past });
    await store.upsertLead({ id: "d", campaignId: "c1", platform: "xhs", status: "converted", memorySpaceId: "s_d", displayName: "D", autoFollowupEnabled: true, nextActionAt: past });

    const due = await store.listActiveFollowupLeads(new Date(), 10);
    expect(due.map((l) => l.id)).toEqual(["a"]); // b 未到期、c 未启用、d 非活跃状态
  });

  it("updateLeadFollowupState 更新状态/计数/下次时间", async () => {
    const store = createMemoryStore();
    await store.upsertCampaign({ id: "c1" });
    await store.upsertLead({ id: "a", campaignId: "c1", platform: "xhs", status: "discovered", memorySpaceId: "s_a", displayName: "A" });
    await store.updateLeadFollowupState("a", { status: "contacting", followupTouchCount: 1, nextActionAt: null });
    const lead = await store.getLead("a");
    expect(lead?.status).toBe("contacting");
    expect(lead?.followupTouchCount).toBe(1);
    expect(lead?.nextActionAt).toBeNull();
  });
```

- [ ] **Step 5: 运行测试确认失败**

Run: `pnpm --filter @leadflow/api exec vitest run src/store.test.ts`
Expected: FAIL（方法不存在 / 字段未持久化）

- [ ] **Step 6: 改 store.ts —— 类型、接口、内存实现**

在 `apps/api/src/store.ts`：

1）扩展 `StoredLead`（新增可选字段）：

```ts
export type StoredLead = {
  id: string;
  campaignId: string;
  platform: string;
  status: string;
  memorySpaceId: string;
  displayName: string;
  intentLevel?: string;
  summary?: string;
  updatedAt?: string;
  isDemoSeed?: boolean;
  autoFollowupEnabled?: boolean;
  nextActionAt?: Date | null;
  followupTouchCount?: number;
};
```

2）`StoredDevice` 类型与接口方法（放在 `ApiStore` interface 内，靠近 leads 区）：

```ts
export type StoredDevice = {
  deviceId: string;
  adbAddress: string;
  status: string;
};
```

interface 内新增：

```ts
  listActiveFollowupLeads(now: Date, limit: number): Promise<StoredLead[]>;
  updateLeadFollowupState(
    leadId: string,
    patch: { status?: string; nextActionAt?: Date | null; followupTouchCount?: number; autoFollowupEnabled?: boolean },
  ): Promise<void>;
  getDefaultDevice(): Promise<StoredDevice | undefined>;
```

3）内存实现：`upsertLead` 保留新字段（更新 `next` 构造）：

```ts
    upsertLead: async (lead) => {
      const existing = leads.get(lead.id);
      const next: StoredLead = {
        ...existing,
        ...lead,
        autoFollowupEnabled: lead.autoFollowupEnabled ?? existing?.autoFollowupEnabled ?? false,
        nextActionAt: lead.nextActionAt ?? existing?.nextActionAt ?? null,
        followupTouchCount: lead.followupTouchCount ?? existing?.followupTouchCount ?? 0,
        updatedAt: new Date().toISOString(),
      };
      leads.set(lead.id, next);
      return next;
    },
```

新增三个方法（放在 leads 区）：

```ts
    listActiveFollowupLeads: async (now, limit) =>
      [...leads.values()]
        .filter(
          (l) =>
            l.autoFollowupEnabled === true &&
            l.nextActionAt != null &&
            l.nextActionAt <= now &&
            (l.status === "discovered" || l.status === "contacting"),
        )
        .sort((a, b) => (a.nextActionAt!.getTime() - b.nextActionAt!.getTime()))
        .slice(0, limit),
    updateLeadFollowupState: async (leadId, patch) => {
      const lead = leads.get(leadId);
      if (!lead) return;
      if (patch.status !== undefined) lead.status = patch.status;
      if (patch.nextActionAt !== undefined) lead.nextActionAt = patch.nextActionAt;
      if (patch.followupTouchCount !== undefined) lead.followupTouchCount = patch.followupTouchCount;
      if (patch.autoFollowupEnabled !== undefined) lead.autoFollowupEnabled = patch.autoFollowupEnabled;
      lead.updatedAt = new Date().toISOString();
    },
    getDefaultDevice: async () => undefined, // 内存模式无设备表
```

- [ ] **Step 7: 运行内存测试确认通过**

Run: `pnpm --filter @leadflow/api exec vitest run src/store.test.ts`
Expected: PASS

- [ ] **Step 8: 改 prisma-store.ts**

在 `apps/api/src/prisma-store.ts`：

1）`upsertLead` 的 create/update 增加新字段；create：

```ts
        create: {
          id: lead.id,
          campaignId: lead.campaignId,
          platform: lead.platform,
          status: lead.status as Prisma.LeadCreateInput["status"],
          memorySpaceId: lead.memorySpaceId ?? "",
          displayName: lead.displayName ?? "",
          isDemoSeed: lead.isDemoSeed ?? false,
          intentLevel: lead.intentLevel as never ?? undefined,
          sourceType: "",
          autoFollowupEnabled: lead.autoFollowupEnabled ?? false,
          nextActionAt: lead.nextActionAt ?? null,
          followupTouchCount: lead.followupTouchCount ?? 0,
        },
        update: {
          platform: lead.platform,
          status: lead.status as Prisma.LeadUpdateInput["status"],
          memorySpaceId: lead.memorySpaceId ?? "",
          displayName: lead.displayName ?? "",
          isDemoSeed: lead.isDemoSeed ?? false,
          intentLevel: lead.intentLevel as never ?? undefined,
          ...(lead.autoFollowupEnabled !== undefined ? { autoFollowupEnabled: lead.autoFollowupEnabled } : {}),
          ...(lead.nextActionAt !== undefined ? { nextActionAt: lead.nextActionAt } : {}),
          ...(lead.followupTouchCount !== undefined ? { followupTouchCount: lead.followupTouchCount } : {}),
        },
```

2）`leadFromPrisma` 返回新字段：

```ts
function leadFromPrisma(row: Record<string, unknown>): StoredLead {
  return {
    id: row.id as string,
    campaignId: row.campaignId as string,
    platform: row.platform as string,
    status: row.status as string,
    memorySpaceId: (row.memorySpaceId as string) ?? "",
    displayName: (row.displayName as string) ?? "",
    intentLevel: (row.intentLevel as string) ?? undefined,
    summary: undefined,
    updatedAt: row.updatedAt ? new Date(row.updatedAt as string | number | Date).toISOString() : undefined,
    isDemoSeed: (row.isDemoSeed as boolean) ?? false,
    autoFollowupEnabled: (row.autoFollowupEnabled as boolean) ?? false,
    nextActionAt: (row.nextActionAt as Date | null) ?? null,
    followupTouchCount: (row.followupTouchCount as number) ?? 0,
  };
}
```

3）新增三个方法（放在 leads 区之后，social identity 之前）：

```ts
    async listActiveFollowupLeads(now, limit) {
      const rows = await prisma.lead.findMany({
        where: {
          autoFollowupEnabled: true,
          nextActionAt: { lte: now },
          status: { in: ["discovered", "contacting"] as never },
        },
        orderBy: { nextActionAt: "asc" },
        take: limit,
      });
      return rows.map(leadFromPrisma);
    },

    async updateLeadFollowupState(leadId, patch) {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          ...(patch.status !== undefined ? { status: patch.status as never } : {}),
          ...(patch.nextActionAt !== undefined ? { nextActionAt: patch.nextActionAt } : {}),
          ...(patch.followupTouchCount !== undefined ? { followupTouchCount: patch.followupTouchCount } : {}),
          ...(patch.autoFollowupEnabled !== undefined ? { autoFollowupEnabled: patch.autoFollowupEnabled } : {}),
        },
      });
    },

    async getDefaultDevice() {
      const row = await prisma.deviceConfig.findFirst({
        where: { status: "connected" as never },
        orderBy: { lastConnectedAt: "desc" },
      });
      if (!row) return undefined;
      return { deviceId: row.deviceId, adbAddress: row.adbAddress, status: row.status };
    },
```

- [ ] **Step 9: typecheck**

Run: `pnpm --filter @leadflow/api typecheck`
Expected: 无错误

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260615120000_add_lead_followup_fields apps/api/src/store.ts apps/api/src/prisma-store.ts apps/api/src/store.test.ts
git commit -m "feat: Lead 增加自动跟进调度字段 + store 读写

- Lead 加 autoFollowupEnabled/nextActionAt/followupTouchCount（含迁移）
- store 新增 listActiveFollowupLeads/updateLeadFollowupState/getDefaultDevice
- 内存与 Prisma 双实现 + 单测

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: decideNextAction 纯函数

**Files:**
- Create: `apps/api/src/followup-decision.ts`
- Test: `apps/api/src/followup-decision.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `apps/api/src/followup-decision.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { decideNextAction } from "./followup-decision.js";

const base = { touchCount: 0, maxTouches: 8, intervalMs: 60_000, now: new Date("2026-06-15T00:00:00Z") };

describe("decideNextAction", () => {
  it("discovered → contacting 且发送", () => {
    const d = decideNextAction({ ...base, status: "discovered", hasNewInbound: false, outcome: null });
    expect(d).toEqual({ nextStatus: "contacting", nextActionAt: new Date("2026-06-15T00:01:00Z"), shouldSend: true });
  });

  it("contacting 无回复 → 继续轮询不发", () => {
    const d = decideNextAction({ ...base, status: "contacting", hasNewInbound: false, outcome: null });
    expect(d).toEqual({ nextStatus: "contacting", nextActionAt: new Date("2026-06-15T00:01:00Z"), shouldSend: false });
  });

  it("contacting + 回复 + continue → 继续并发送", () => {
    const d = decideNextAction({ ...base, status: "contacting", hasNewInbound: true, outcome: "continue" });
    expect(d).toEqual({ nextStatus: "contacting", nextActionAt: new Date("2026-06-15T00:01:00Z"), shouldSend: true });
  });

  it("contacting + 回复 + goal_reached → converted 终态并发送收尾", () => {
    const d = decideNextAction({ ...base, status: "contacting", hasNewInbound: true, outcome: "goal_reached" });
    expect(d).toEqual({ nextStatus: "converted", nextActionAt: null, shouldSend: true });
  });

  it("contacting + 回复 + rejected → lost 终态且不发送", () => {
    const d = decideNextAction({ ...base, status: "contacting", hasNewInbound: true, outcome: "rejected" });
    expect(d).toEqual({ nextStatus: "lost", nextActionAt: null, shouldSend: false });
  });

  it("continue 但发完达到 maxTouches → paused", () => {
    const d = decideNextAction({ ...base, status: "contacting", hasNewInbound: true, outcome: "continue", touchCount: 7, maxTouches: 8 });
    expect(d).toEqual({ nextStatus: "paused", nextActionAt: null, shouldSend: true });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @leadflow/api exec vitest run src/followup-decision.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 decideNextAction**

新建 `apps/api/src/followup-decision.ts`：

```ts
import type { ConversionOutcome } from "@leadflow/agents";

export type FollowupDecision = {
  nextStatus: string;
  nextActionAt: Date | null;
  shouldSend: boolean;
};

/**
 * 纯函数：根据当前状态、是否有新回复、LLM 判定的 outcome，决定下一步。
 * IO（生成/发送/落库）由调用方负责。
 */
export function decideNextAction(params: {
  status: string;
  hasNewInbound: boolean;
  outcome: ConversionOutcome | null;
  touchCount: number;
  maxTouches: number;
  intervalMs: number;
  now: Date;
}): FollowupDecision {
  const { status, hasNewInbound, outcome, touchCount, maxTouches, intervalMs, now } = params;
  const next = new Date(now.getTime() + intervalMs);

  if (status === "discovered") {
    return { nextStatus: "contacting", nextActionAt: next, shouldSend: true };
  }

  if (status === "contacting") {
    if (!hasNewInbound) {
      return { nextStatus: "contacting", nextActionAt: next, shouldSend: false };
    }
    if (outcome === "goal_reached") {
      return { nextStatus: "converted", nextActionAt: null, shouldSend: true };
    }
    if (outcome === "rejected") {
      return { nextStatus: "lost", nextActionAt: null, shouldSend: false };
    }
    // continue：发回复继续轮询；若这次发送后达到上限则转 paused 交人工
    if (touchCount + 1 >= maxTouches) {
      return { nextStatus: "paused", nextActionAt: null, shouldSend: true };
    }
    return { nextStatus: "contacting", nextActionAt: next, shouldSend: true };
  }

  return { nextStatus: status, nextActionAt: null, shouldSend: false };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @leadflow/api exec vitest run src/followup-decision.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/followup-decision.ts apps/api/src/followup-decision.test.ts
git commit -m "feat: 自动跟进状态转移纯函数 decideNextAction

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 会话 service —— sendFollowup + syncConversation（去重）

**Files:**
- Create: `apps/api/src/conversation-service.ts`
- Modify: `apps/api/src/routes/conversations.ts`
- Test: `apps/api/src/conversation-service.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `apps/api/src/conversation-service.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { createFakeServices } from "./app.js";
import { sendFollowup, syncConversation } from "./conversation-service.js";

describe("conversation-service", () => {
  it("sendFollowup 发送并记录 outbound + timeline", async () => {
    const services = createFakeServices();
    await services.store.upsertCampaign({ id: "c1" });
    await services.store.upsertLead({ id: "l1", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "X" });

    const res = await sendFollowup(services, { leadId: "l1", deviceId: "d1", xhsUserId: "red1", message: "你好" });
    expect(res.status).toBe("sent");

    const msgs = await services.store.listConversationMessages("l1");
    expect(msgs.some((m) => m.direction === "outbound" && m.content === "你好")).toBe(true);
  });

  it("syncConversation 去重，重复同步不重复入库，返回新 inbound 数", async () => {
    const services = createFakeServices();
    await services.store.upsertCampaign({ id: "c1" });
    await services.store.upsertLead({ id: "l1", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "X" });

    const first = await syncConversation(services, { leadId: "l1", deviceId: "d1", xhsUserId: "red1" });
    expect(first.newInboundCount).toBeGreaterThan(0);

    const second = await syncConversation(services, { leadId: "l1", deviceId: "d1", xhsUserId: "red1" });
    expect(second.newInboundCount).toBe(0); // FakeXhsChatClient 返回同一条，去重后无新增

    const msgs = await services.store.listConversationMessages("l1");
    const inbound = msgs.filter((m) => m.direction === "inbound");
    expect(inbound.length).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @leadflow/api exec vitest run src/conversation-service.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 conversation-service.ts**

新建 `apps/api/src/conversation-service.ts`：

```ts
import type { ApiServices } from "./app.js";

type Identity = { leadId: string; deviceId: string; xhsUserId?: string; xhsUsername?: string };

/** 发送跟进消息：经 xhsChat 发出 + 记录 outbound 会话 + timeline。 */
export async function sendFollowup(
  services: ApiServices,
  input: Identity & { message: string },
): Promise<{ status: string; remoteMessageId?: string; sentAt: string }> {
  const result = await services.xhsChat.sendPrivateMessage({
    deviceId: input.deviceId,
    xhsUserId: input.xhsUserId,
    xhsUsername: input.xhsUsername,
    message: input.message,
  });
  await services.store.appendConversationMessage(input.leadId, {
    direction: "outbound",
    content: input.message,
    sentAt: result.sentAt,
  });
  await services.store.appendTimelineEvent({
    leadId: input.leadId,
    type: "agent_replied",
    summary: `Agent 发送跟进消息：${input.message.slice(0, 50)}`,
    agentName: "conversion",
    memoryRefs: [],
    artifactRefs: [],
  });
  return result;
}

/**
 * 拉取小红书会话并去重入库，返回新 inbound 数与最后一条 inbound 内容。
 * 去重键：direction + sentAt + content（ConversationMessage 未存远端 id）。
 */
export async function syncConversation(
  services: ApiServices,
  input: Identity & { sinceTime?: string },
): Promise<{ newInboundCount: number; lastInboundContent?: string }> {
  const existing = await services.store.listConversationMessages(input.leadId);
  const seen = new Set(existing.map((m) => `${m.direction}|${m.sentAt}|${m.content}`));
  const sinceTime =
    input.sinceTime ?? (existing.length ? existing[existing.length - 1].sentAt : undefined);

  const fetched = await services.xhsChat.getConversation({
    deviceId: input.deviceId,
    xhsUserId: input.xhsUserId,
    xhsUsername: input.xhsUsername,
    sinceTime,
  });

  let newInboundCount = 0;
  let lastInboundContent: string | undefined;
  for (const msg of fetched) {
    const key = `${msg.direction}|${msg.sentAt}|${msg.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await services.store.appendConversationMessage(input.leadId, {
      direction: msg.direction,
      content: msg.content,
      sentAt: msg.sentAt,
    });
    if (msg.direction === "inbound") {
      newInboundCount++;
      lastInboundContent = msg.content;
    }
  }
  return { newInboundCount, lastInboundContent };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @leadflow/api exec vitest run src/conversation-service.test.ts`
Expected: PASS

- [ ] **Step 5: 路由改用 service**

修改 `apps/api/src/routes/conversations.ts`，把 `/send` 和 `/sync` 改成调用 service（去除重复实现）。`/send` handler：

```ts
  route.post("/:leadId/conversation/send", async (c) => {
    const leadId = c.req.param("leadId");
    const body = SendBodySchema.parse(await c.req.json());
    const { sendFollowup } = await import("../conversation-service.js");
    const result = await sendFollowup(services, {
      leadId,
      deviceId: body.deviceId,
      xhsUserId: body.xhsUserId,
      xhsUsername: body.xhsUsername,
      message: body.message,
    });
    return c.json({ leadId, ...result });
  });
```

`/sync` handler：

```ts
  route.post("/:leadId/conversation/sync", async (c) => {
    const leadId = c.req.param("leadId");
    const body = XhsIdentityBodySchema.parse(await c.req.json());
    const { syncConversation } = await import("../conversation-service.js");
    const { newInboundCount } = await syncConversation(services, {
      leadId,
      deviceId: body.deviceId,
      xhsUserId: body.xhsUserId,
      xhsUsername: body.xhsUsername,
      sinceTime: body.sinceTime,
    });
    if (newInboundCount > 0) {
      await services.store.appendTimelineEvent({
        leadId,
        type: "customer_replied",
        summary: "客户通过小红书回复了消息",
        agentName: "xhs_sync",
        memoryRefs: [],
        artifactRefs: [],
      });
    }
    const updatedMessages = await services.store.listConversationMessages(leadId);
    return c.json({ leadId, messages: updatedMessages });
  });
```

- [ ] **Step 6: 跑 api 全测 + typecheck**

Run: `pnpm --filter @leadflow/api test && pnpm --filter @leadflow/api typecheck`
Expected: 全部 PASS（含原有 app.test.ts）

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/conversation-service.ts apps/api/src/conversation-service.test.ts apps/api/src/routes/conversations.ts
git commit -m "refactor: 抽出 sendFollowup/syncConversation service（含去重）

会话同步去重避免重复入库，发送/同步逻辑供路由与自动循环共用。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 自动跟进循环 followup-loop

**Files:**
- Create: `apps/api/src/playbook-loader.ts`
- Modify: `apps/api/src/scheduler.ts`（改用共享 loader）
- Create: `apps/api/src/followup-loop.ts`
- Test: `apps/api/src/followup-loop.test.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: 抽出 playbook-loader**

新建 `apps/api/src/playbook-loader.ts`（把 `scheduler.ts` 里的 `loadPlaybookForCampaign` 搬过来）：

```ts
import { resolve } from "node:path";
import type { ConversionPlaybook } from "@leadflow/playbook";

const PLAYBOOKS_DIR = resolve(import.meta.dirname, "../../../playbooks");

export async function loadPlaybookForCampaign(
  campaign: Record<string, unknown>,
): Promise<ConversionPlaybook | undefined> {
  const playbookId = campaign.playbookId as string | undefined;
  if (!playbookId) return undefined;
  try {
    const { loadPlaybookFromFile } = await import("@leadflow/playbook");
    return await loadPlaybookFromFile(resolve(PLAYBOOKS_DIR, `${playbookId}.yml`));
  } catch {
    console.warn(`[playbook] '${playbookId}' not found, using default prompt`);
    return undefined;
  }
}
```

然后修改 `apps/api/src/scheduler.ts`：删除其中本地的 `loadPlaybookForCampaign` 定义和 `PLAYBOOKS_DIR`，改为 `import { loadPlaybookForCampaign } from "./playbook-loader.js";`。

- [ ] **Step 2: typecheck 确认抽取无回归**

Run: `pnpm --filter @leadflow/api typecheck`
Expected: 无错误

- [ ] **Step 3: 写失败测试**

新建 `apps/api/src/followup-loop.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { createFakeServices, type ApiServices } from "./app.js";
import { processLead } from "./followup-loop.js";
import type { XhsConversationMessage } from "@leadflow/connectors";

const CFG = { intervalMs: 60_000, maxTouches: 8, deviceId: "d1" };

async function seedLead(services: ApiServices, id: string, status: string) {
  await services.store.upsertCampaign({ id: "c1" });
  await services.store.upsertLead({ id, campaignId: "c1", platform: "xhs", status, memorySpaceId: `s_${id}`, displayName: "X", autoFollowupEnabled: true, nextActionAt: new Date() });
  await services.store.upsertSocialIdentity({ leadId: id, platform: "xhs", externalUserId: "u1", redId: "red1", username: "X" });
}

describe("processLead", () => {
  it("首触：discovered → 发开场 → contacting", async () => {
    const services = createFakeServices();
    await seedLead(services, "l1", "discovered");
    const r = await processLead(services, (await services.store.getLead("l1"))!, CFG, new Date());
    expect(r.sent).toBe(true);
    const lead = await services.store.getLead("l1");
    expect(lead?.status).toBe("contacting");
    expect(lead?.followupTouchCount).toBe(1);
    const msgs = await services.store.listConversationMessages("l1");
    expect(msgs.some((m) => m.direction === "outbound")).toBe(true);
  });

  it("缺 redId → 跳过并退避", async () => {
    const services = createFakeServices();
    await services.store.upsertCampaign({ id: "c1" });
    await services.store.upsertLead({ id: "l2", campaignId: "c1", platform: "xhs", status: "discovered", memorySpaceId: "s", displayName: "X", autoFollowupEnabled: true, nextActionAt: new Date() });
    // 未写 socialIdentity
    const r = await processLead(services, (await services.store.getLead("l2"))!, CFG, new Date());
    expect(r.sent).toBe(false);
    expect(r.skippedReason).toBe("no_identity");
    const lead = await services.store.getLead("l2");
    expect(lead?.status).toBe("discovered"); // 状态不变
    expect(lead?.nextActionAt).not.toBeNull(); // 退避了
  });

  it("回复轮：检测到新回复 + rejected → lost 不再发", async () => {
    const services = createFakeServices();
    await seedLead(services, "l3", "contacting");
    // LLM 判 rejected
    services.llm = { chatJson: async () => ({ message: "好的打扰了", memory: "客户拒绝", outcome: "rejected" }) } as never;
    // xhsChat 注入一条新 inbound
    const reply: XhsConversationMessage = { id: "m1", direction: "inbound", content: "不需要，谢谢", sentAt: new Date().toISOString() };
    services.xhsChat = {
      ...services.xhsChat,
      getConversation: async () => [reply],
      sendPrivateMessage: async () => ({ status: "sent", sentAt: new Date().toISOString() }),
    } as never;

    await processLead(services, (await services.store.getLead("l3"))!, CFG, new Date());
    const lead = await services.store.getLead("l3");
    expect(lead?.status).toBe("lost");
    expect(lead?.nextActionAt).toBeNull();
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm --filter @leadflow/api exec vitest run src/followup-loop.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 5: 实现 followup-loop.ts**

新建 `apps/api/src/followup-loop.ts`：

```ts
import type { ApiServices } from "./app.js";
import type { StoredLead } from "./store.js";
import { decideNextAction } from "./followup-decision.js";
import { loadPlaybookForCampaign } from "./playbook-loader.js";
import { sendFollowup, syncConversation } from "./conversation-service.js";

export type FollowupConfig = {
  intervalMs: number;
  maxTouches: number;
  deviceId?: string;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function readConfig(): {
  enabled: boolean;
  tickMs: number;
  batchSize: number;
  sendMinMs: number;
  sendMaxMs: number;
  dailyCap: number;
  cfg: FollowupConfig;
} {
  const num = (v: string | undefined, d: number) => (v ? Number(v) : d);
  return {
    enabled: process.env.AUTO_FOLLOWUP_ENABLED === "true",
    tickMs: num(process.env.AUTO_FOLLOWUP_INTERVAL_MS, 60_000),
    batchSize: num(process.env.AUTO_FOLLOWUP_BATCH_SIZE, 10),
    sendMinMs: num(process.env.AUTO_FOLLOWUP_SEND_MIN_MS, 3000),
    sendMaxMs: num(process.env.AUTO_FOLLOWUP_SEND_MAX_MS, 8000),
    dailyCap: num(process.env.AUTO_FOLLOWUP_DAILY_CAP, 50),
    cfg: {
      intervalMs: num(process.env.AUTO_FOLLOWUP_INTERVAL_MS, 60_000),
      maxTouches: num(process.env.AUTO_FOLLOWUP_MAX_TOUCHES, 8),
      deviceId: process.env.AUTO_FOLLOWUP_DEVICE_ID,
    },
  };
}

// 进程内每日发送计数（单进程 MVP）
const dailyCounter = { date: "", count: 0 };
function bumpDaily(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCounter.date !== today) {
    dailyCounter.date = today;
    dailyCounter.count = 0;
  }
  dailyCounter.count++;
  return dailyCounter.count;
}
function dailyCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCounter.date !== today) return 0;
  return dailyCounter.count;
}

export type ProcessResult = { sent: boolean; skippedReason?: string };

/** 处理单条线索的一次动作（首触或查回复）。返回是否发送、跳过原因。 */
export async function processLead(
  services: ApiServices,
  lead: StoredLead,
  cfg: FollowupConfig,
  now: Date,
): Promise<ProcessResult> {
  const backoff = () =>
    services.store.updateLeadFollowupState(lead.id, {
      nextActionAt: new Date(now.getTime() + cfg.intervalMs),
    });

  // 身份/设备解析
  const identity = await services.store.getSocialIdentity(lead.id);
  const xhsUserId = identity?.redId ?? undefined;
  if (!xhsUserId) {
    console.warn(`[followup] lead ${lead.id} 缺 redId，跳过`);
    await backoff();
    return { sent: false, skippedReason: "no_identity" };
  }
  const deviceId = cfg.deviceId ?? (await services.store.getDefaultDevice())?.deviceId;
  if (!deviceId) {
    console.warn(`[followup] 无可用设备，跳过 lead ${lead.id}`);
    await backoff();
    return { sent: false, skippedReason: "no_device" };
  }

  const playbook = await loadPlaybookForCampaign(
    (await services.store.getCampaign(lead.campaignId)) ?? {},
  );

  // 首触
  if (lead.status === "discovered") {
    const conv = await services.workflows.runConversion({
      leadId: lead.id,
      memorySpaceId: lead.memorySpaceId,
      playbook,
    });
    const decision = decideNextAction({
      status: "discovered",
      hasNewInbound: false,
      outcome: null,
      touchCount: lead.followupTouchCount ?? 0,
      maxTouches: cfg.maxTouches,
      intervalMs: cfg.intervalMs,
      now,
    });
    await sendFollowup(services, { leadId: lead.id, deviceId, xhsUserId, message: conv.message });
    await services.store.updateLeadFollowupState(lead.id, {
      status: decision.nextStatus,
      nextActionAt: decision.nextActionAt,
      followupTouchCount: (lead.followupTouchCount ?? 0) + 1,
    });
    return { sent: true };
  }

  // 查回复
  const { newInboundCount, lastInboundContent } = await syncConversation(services, {
    leadId: lead.id,
    deviceId,
    xhsUserId,
  });
  const hasNewInbound = newInboundCount > 0;

  if (!hasNewInbound) {
    const decision = decideNextAction({
      status: "contacting",
      hasNewInbound: false,
      outcome: null,
      touchCount: lead.followupTouchCount ?? 0,
      maxTouches: cfg.maxTouches,
      intervalMs: cfg.intervalMs,
      now,
    });
    await services.store.updateLeadFollowupState(lead.id, { nextActionAt: decision.nextActionAt });
    return { sent: false };
  }

  // 有回复：生成 + 判 outcome
  const conv = await services.workflows.runConversion({
    leadId: lead.id,
    memorySpaceId: lead.memorySpaceId,
    customerMessage: lastInboundContent,
    playbook,
  });
  const decision = decideNextAction({
    status: "contacting",
    hasNewInbound: true,
    outcome: conv.outcome,
    touchCount: lead.followupTouchCount ?? 0,
    maxTouches: cfg.maxTouches,
    intervalMs: cfg.intervalMs,
    now,
  });

  let sent = false;
  if (decision.shouldSend) {
    await sendFollowup(services, { leadId: lead.id, deviceId, xhsUserId, message: conv.message });
    sent = true;
  }
  await services.store.updateLeadFollowupState(lead.id, {
    status: decision.nextStatus,
    nextActionAt: decision.nextActionAt,
    followupTouchCount: (lead.followupTouchCount ?? 0) + (sent ? 1 : 0),
  });
  return { sent };
}

/** 进程内自动跟进循环。 */
export function startFollowupLoop(services: ApiServices): { stop: () => void } {
  const { enabled, tickMs, batchSize, sendMinMs, sendMaxMs, dailyCap, cfg } = readConfig();
  if (!enabled) {
    console.log("[followup] AUTO_FOLLOWUP_ENABLED 未开启，自动跟进循环不启动");
    return { stop: () => {} };
  }
  console.log(`[followup] 自动跟进循环启动，每 ${tickMs}ms 一轮`);

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (dailyCount() >= dailyCap) {
        console.warn(`[followup] 当日发送已达上限 ${dailyCap}，跳过本轮`);
        return;
      }
      const now = new Date();
      const leads = await services.store.listActiveFollowupLeads(now, batchSize);
      for (const lead of leads) {
        if (dailyCount() >= dailyCap) break;
        try {
          const r = await processLead(services, lead, cfg, now);
          if (r.sent) {
            bumpDaily();
            await sleep(sendMinMs + Math.random() * (sendMaxMs - sendMinMs)); // 节流
          }
        } catch (err) {
          console.error(`[followup] lead ${lead.id} 处理失败:`, err instanceof Error ? err.message : err);
          await services.store
            .updateLeadFollowupState(lead.id, { nextActionAt: new Date(now.getTime() + cfg.intervalMs) })
            .catch(() => {});
        }
      }
    } catch (err) {
      console.error("[followup] tick 失败:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };

  const interval = setInterval(tick, tickMs);
  return { stop: () => clearInterval(interval) };
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --filter @leadflow/api exec vitest run src/followup-loop.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 7: index.ts 启动循环**

修改 `apps/api/src/index.ts`，在启动发现 scheduler 之后加入：

```ts
  const { startFollowupLoop } = await import("./followup-loop.js");
  startFollowupLoop(services);
```

（放在 `createServicesFromEnv()` 得到 `services` 之后、与 scheduler 启动相邻处。）

- [ ] **Step 8: .env.example 增加配置**

在 `.env.example` 末尾追加：

```
# 自动跟进循环（默认关闭，全自动给真实客户发消息有风控风险）
AUTO_FOLLOWUP_ENABLED=false
# AUTO_FOLLOWUP_INTERVAL_MS=60000
# AUTO_FOLLOWUP_BATCH_SIZE=10
# AUTO_FOLLOWUP_SEND_MIN_MS=3000
# AUTO_FOLLOWUP_SEND_MAX_MS=8000
# AUTO_FOLLOWUP_DAILY_CAP=50
# AUTO_FOLLOWUP_MAX_TOUCHES=8
# 指定发送设备；留空则取首个 connected 的 DeviceConfig
# AUTO_FOLLOWUP_DEVICE_ID=
```

- [ ] **Step 9: api 全测 + typecheck**

Run: `pnpm --filter @leadflow/api test && pnpm --filter @leadflow/api typecheck`
Expected: 全部 PASS

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/playbook-loader.ts apps/api/src/scheduler.ts apps/api/src/followup-loop.ts apps/api/src/followup-loop.test.ts apps/api/src/index.ts .env.example
git commit -m "feat: 自动跟进循环 followup-loop（单进程 MVP）

- processLead：首触发开场 / 查回复→生成→按 outcome 流转
- tick：查到期活跃线索逐条处理，节流 + 每日上限 + 防重入
- 身份取 SocialIdentity.redId，设备取 env 或首个 connected
- 抽出共享 playbook-loader，index 按 AUTO_FOLLOWUP_ENABLED 启动

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 发现流程入列

**Files:**
- Modify: `apps/api/src/scheduler.ts`（发现写线索处）
- Modify: `apps/api/src/routes/workflows.ts`（发现写线索处）

- [ ] **Step 1: scheduler 发现入列**

修改 `apps/api/src/scheduler.ts` 里写发现线索的 `upsertLead`（约在 `for (const lead of result.leads)` 内），加入启用与首触时间：

```ts
      await services.store.upsertLead({
        id: lead.leadId,
        campaignId,
        platform: lead.platform,
        status: "discovered",
        memorySpaceId: lead.memorySpaceId,
        displayName: lead.displayName,
        summary: lead.summary,
        intentLevel: lead.intentLevel,
        autoFollowupEnabled: true,
        nextActionAt: new Date(),
      });
```

- [ ] **Step 2: workflows 路由发现入列**

修改 `apps/api/src/routes/workflows.ts` 里 campaign 发现写线索的 `upsertLead`（约在 `for (const lead of result.leads)` 内），同样加：

```ts
        await services.store.upsertLead({
          id: lead.leadId,
          campaignId: body.campaignId,
          platform: lead.platform,
          status: "discovered",
          memorySpaceId: lead.memorySpaceId,
          displayName: lead.displayName,
          summary: lead.summary,
          intentLevel: lead.intentLevel,
          autoFollowupEnabled: true,
          nextActionAt: new Date(),
        });
```

- [ ] **Step 3: typecheck + api 全测**

Run: `pnpm --filter @leadflow/api typecheck && pnpm --filter @leadflow/api test`
Expected: 全部 PASS

- [ ] **Step 4: 全量回归**

Run: `pnpm typecheck && pnpm -r test`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scheduler.ts apps/api/src/routes/workflows.ts
git commit -m "feat: 发现流程把新线索入列自动跟进（enabled + nextActionAt=now）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 验收（人工，需真实设备/环境）

实现完成后，端到端冒烟（参考本会话手动流程的脚本方式）：

1. 设 `.env`：`AUTO_FOLLOWUP_ENABLED=true`、`AUTO_FOLLOWUP_INTERVAL_MS=15000`、`AUTO_FOLLOWUP_DEVICE_ID=<设备>`（或留空走 DeviceConfig）。
2. `/mock` 造一条线索并手动置 `autoFollowupEnabled=true, nextActionAt=now`（或跑一次发现自动入列）。
3. 启动 API，观察日志：首触发送 → 状态转 contacting → 间隔轮询；用 `/conversation/customer-reply` 模拟客户回复，下一轮应自动生成并发送，outcome=goal/rejected 时转 converted/lost。
4. 验证护栏：把 `AUTO_FOLLOWUP_DAILY_CAP=1`，确认第二条不发；`AUTO_FOLLOWUP_MAX_TOUCHES=1`，确认 continue 一次后转 paused。

> 注意：真发送依赖 mcp-xhs-chat + adb + 登录态；先用 `XHS_CHAT_MODE=fake` 跑通逻辑，再切真实设备。
