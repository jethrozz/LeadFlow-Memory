# LeadFlow Real Data Path Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static API fixtures with a shared store so that Dashboard、verify 脚本和 Demo 展示的 memory refs、artifact blob IDs、timeline 全部来自真实 workflow 运行产物，而不是预置数据。

**Why this plan exists:** Plan 1 用 `apps/api/src/fixtures/demo-data.ts` 提供确定性响应，便于前端先行开发。但 fixtures 一直保留到演示就是 mock：workflow 写入 MemWal/Walrus 的真实结果不会出现在 Dashboard 上，verify 脚本对着假数据"验证通过"。本计划切断这条假数据路径。

**Architecture:** `apps/api` 增加一个进程内共享存储（`src/store.ts`），workflow / conversation / campaign 路由把真实运行产物写进去，dashboard / lead / memory / artifact 路由从中读出。存储以 repository 风格的接口暴露，后续可以用 Prisma 实现替换而不改路由。`fixtures/demo-data.ts` 只允许被 Demo seed 端点引用，且 seed 出来的数据必须在 Dashboard 上明确标记为演示数据。

**Tech Stack:** TypeScript, Hono, Vitest, Node `crypto.randomUUID`.

**Prerequisites:** Plans 1-4 已执行（API 骨架、Walrus/MemWal adapters、workflow service、xhs-chat connector 均已存在，`createApp(services)` 需要显式注入服务）。

**Files overview:**

```text
apps/api/src/store.ts
apps/api/src/store.test.ts
apps/api/src/app.ts
apps/api/src/routes/workflows.ts
apps/api/src/routes/conversations.ts
apps/api/src/routes/campaigns.ts
apps/api/src/routes/leads.ts
apps/api/src/routes/memories.ts
apps/api/src/routes/artifacts.ts
apps/api/src/routes/dashboard.ts
apps/api/src/routes/demo.ts
apps/api/src/fixtures/demo-data.ts
apps/api/src/app.test.ts
```

Reference:

```text
docs/architecture/data-state-model-zh.md
docs/architecture/api-design-zh.md
docs/architecture/leadflow-memory-tech-stack-zh.md（"真实链路原则"一节）
```

---

### Task 1: Create Shared Store

**Files:**

- Create: `apps/api/src/store.ts`
- Create: `apps/api/src/store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `apps/api/src/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createStore } from "./store.js";

describe("api store", () => {
  it("persists a lead and reads it back", () => {
    const store = createStore();
    const lead = store.upsertLead({
      id: "lead_001",
      campaignId: "campaign_001",
      platform: "xhs",
      status: "discovered",
      memorySpaceId: "space_001",
      displayName: "重庆买房小陈",
    });

    expect(store.getLead("lead_001")).toEqual(lead);
    expect(store.listLeads()).toHaveLength(1);
  });

  it("appends memory refs, artifact refs, and timeline events per lead", () => {
    const store = createStore();
    store.upsertLead({
      id: "lead_001",
      campaignId: "campaign_001",
      platform: "xhs",
      status: "discovered",
      memorySpaceId: "space_001",
      displayName: "重庆买房小陈",
    });

    store.appendMemoryRef({
      leadId: "lead_001",
      memoryId: "mem_001",
      kind: "budget",
      summary: "客户预算 130 万以内",
      confidence: 0.9,
    });
    store.appendArtifactRef({
      leadId: "lead_001",
      artifactType: "lead_discovery_report",
      blobId: "0xabc",
    });
    store.appendTimelineEvent({
      leadId: "lead_001",
      type: "lead_discovered",
      summary: "从小红书评论发现线索",
      memoryRefs: ["mem_001"],
      artifactRefs: ["0xabc"],
    });

    expect(store.listMemoryRefs("lead_001")).toHaveLength(1);
    expect(store.listArtifactRefs("lead_001")).toHaveLength(1);
    expect(store.listTimelineEvents("lead_001")[0]?.type).toBe("lead_discovered");
  });

  it("appends conversation messages in order", () => {
    const store = createStore();
    store.appendConversationMessage("lead_001", {
      direction: "inbound",
      content: "想看看渝北 130 万以内的三房",
      sentAt: "2026-06-11T10:00:00.000Z",
    });
    store.appendConversationMessage("lead_001", {
      direction: "outbound",
      content: "我帮你筛几个渝北的小区",
      sentAt: "2026-06-11T10:05:00.000Z",
    });

    const messages = store.listConversationMessages("lead_001");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.direction).toBe("inbound");
  });
});
```

Run:

```bash
pnpm --filter @leadflow/api test
```

Expected: FAIL because `./store.js` does not exist.

- [ ] **Step 2: Implement store**

Create `apps/api/src/store.ts`。要求：

- 所有集合用 `Map`/数组保存在进程内；接口签名不暴露 Map，方便后续 Prisma 实现替换。
- 每条 append 记录自动补 `id`（`randomUUID`）和 `createdAt`。
- 实体字段名与 `docs/architecture/data-state-model-zh.md` 的领域模型一致（Lead、MemoryRef、ArtifactRef、TimelineEvent、Campaign、ConversationMessage、WorkflowRun）。

```ts
import { randomUUID } from "node:crypto";

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
};

export type StoredMemoryRef = {
  id: string;
  leadId: string;
  memoryId: string;
  kind: string;
  summary: string;
  confidence?: number;
  sourceArtifactBlobId?: string;
  createdAt: string;
};

export type StoredArtifactRef = {
  id: string;
  leadId: string;
  artifactType: string;
  blobId: string;
  suiObjectId?: string;
  summary?: string;
  createdAt: string;
};

export type StoredTimelineEvent = {
  id: string;
  leadId: string;
  type: string;
  summary: string;
  agentName?: string;
  workerId?: string;
  memoryRefs: string[];
  artifactRefs: string[];
  createdAt: string;
};

export type StoredConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  sentAt: string;
};

export type ApiStore = ReturnType<typeof createStore>;

export function createStore() {
  const campaigns = new Map<string, Record<string, unknown>>();
  const leads = new Map<string, StoredLead>();
  const memoryRefs = new Map<string, StoredMemoryRef[]>();
  const artifactRefs = new Map<string, StoredArtifactRef[]>();
  const timelineEvents = new Map<string, StoredTimelineEvent[]>();
  const conversations = new Map<string, StoredConversationMessage[]>();

  const push = <T>(map: Map<string, T[]>, key: string, item: T): T => {
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
    return item;
  };

  return {
    campaigns,

    upsertLead(lead: StoredLead): StoredLead {
      const next = { ...lead, updatedAt: new Date().toISOString() };
      leads.set(lead.id, next);
      return next;
    },
    getLead: (leadId: string) => leads.get(leadId),
    listLeads: () => [...leads.values()],

    appendMemoryRef(input: Omit<StoredMemoryRef, "id" | "createdAt">): StoredMemoryRef {
      return push(memoryRefs, input.leadId, {
        ...input,
        id: `memref_${randomUUID()}`,
        createdAt: new Date().toISOString(),
      });
    },
    listMemoryRefs: (leadId: string) => memoryRefs.get(leadId) ?? [],

    appendArtifactRef(input: Omit<StoredArtifactRef, "id" | "createdAt">): StoredArtifactRef {
      return push(artifactRefs, input.leadId, {
        ...input,
        id: `artref_${randomUUID()}`,
        createdAt: new Date().toISOString(),
      });
    },
    listArtifactRefs: (leadId: string) => artifactRefs.get(leadId) ?? [],

    appendTimelineEvent(input: Omit<StoredTimelineEvent, "id" | "createdAt">): StoredTimelineEvent {
      return push(timelineEvents, input.leadId, {
        ...input,
        id: `evt_${randomUUID()}`,
        createdAt: new Date().toISOString(),
      });
    },
    listTimelineEvents: (leadId: string) => timelineEvents.get(leadId) ?? [],

    appendConversationMessage(
      leadId: string,
      input: Omit<StoredConversationMessage, "id">,
    ): StoredConversationMessage {
      return push(conversations, leadId, { ...input, id: `msg_${randomUUID()}` });
    },
    listConversationMessages: (leadId: string) => conversations.get(leadId) ?? [],
  };
}
```

- [ ] **Step 3: Verify store tests**

Run:

```bash
pnpm --filter @leadflow/api test
```

Expected: PASS.

- [ ] **Step 4: Commit store**

```bash
git add apps/api/src/store.ts apps/api/src/store.test.ts
git commit -m "feat: 添加 API 进程内共享存储"
```

---

### Task 2: Inject Store into App Services

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`

- [ ] **Step 1: Extend ApiServices with store**

Modify `apps/api/src/app.ts`:

```ts
import { createStore, type ApiStore } from "./store.js";

export type ApiServices = {
  llm: LlmProvider;
  memwal: MemWalClient;
  walrus: WalrusArtifactClient;
  xhsChat: XhsChatClient;
  workflows: ReturnType<typeof createWorkflowService>;
  store: ApiStore;
};
```

`createFakeServices()` 与 `createServicesFromEnv()` 都加上 `store: createStore()`。store 是业务状态层，fake/real 模式共用同一实现。

所有需要读写状态的路由改为工厂式注入：`campaignsRoute(services)`、`leadsRoute(services)`、`dashboardRoute(services)` 等，与 Plan 2 的 `artifactsRoute(services)` 风格一致。

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @leadflow/api typecheck
```

Expected: PASS（路由签名调整后编译通过）。

---

### Task 3: Persist Workflow Outputs

**Files:**

- Modify: `apps/api/src/routes/workflows.ts`
- Modify: `apps/api/src/app.test.ts`

- [ ] **Step 1: Write failing test**

Append to `apps/api/src/app.test.ts`:

```ts
it("dashboard reflects workflow outputs instead of fixtures", async () => {
  await app.request("/api/workflows/discovery/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leadId: "lead_e2e",
      memorySpaceId: "space_e2e",
      sourceText: "想看看渝北 130 万以内的三房",
    }),
  });

  const response = await app.request("/api/dashboard/leads/lead_e2e");
  expect(response.status).toBe(200);
  const detail = await response.json();
  expect(detail.memories.length).toBeGreaterThan(0);
  expect(detail.artifacts.length).toBeGreaterThan(0);
  expect(detail.timeline.some((e: { type: string }) => e.type === "lead_discovered")).toBe(true);
});
```

Run:

```bash
pnpm --filter @leadflow/api test
```

Expected: FAIL（dashboard 返回 fixtures，不包含 lead_e2e）。

- [ ] **Step 2: Persist in workflow routes**

Modify `apps/api/src/routes/workflows.ts`，每个 run 端点在 workflow service 返回后写入 store：

```ts
route.post("/discovery/run", async (c) => {
  const body = DiscoveryBodySchema.parse(await c.req.json());
  const result = await services.workflows.runDiscovery(body);

  services.store.upsertLead({
    id: body.leadId,
    campaignId: body.campaignId ?? "manual",
    platform: "xhs",
    status: "discovered",
    memorySpaceId: body.memorySpaceId,
    displayName: body.displayName ?? body.leadId,
    summary: result.summary,
    intentLevel: result.intentLevel,
  });
  const memoryRef = services.store.appendMemoryRef({
    leadId: body.leadId,
    memoryId: result.memoryRef ?? "",
    kind: "source_evidence",
    summary: result.memory ?? result.summary ?? "",
    sourceArtifactBlobId: result.artifact?.blobId,
  });
  const artifactRef = services.store.appendArtifactRef({
    leadId: body.leadId,
    artifactType: result.artifact?.type ?? "lead_discovery_report",
    blobId: result.artifact?.blobId ?? "",
  });
  services.store.appendTimelineEvent({
    leadId: body.leadId,
    type: "lead_discovered",
    summary: result.summary ?? "Discovery workflow completed",
    agentName: "discovery",
    memoryRefs: [memoryRef.id],
    artifactRefs: [artifactRef.blobId],
  });

  return c.json(result);
});
```

conversion / handoff 端点同理：

- conversion 写 `memory_updated` + `conversion_decision_made` 事件，更新 lead 状态为 `replied` 或 `nurturing`；
- handoff 写 `handoff_triggered` + `handoff_recovered` 事件，记录 `fromWorkerId` / `toWorkerId`，artifact 类型为 `handoff_proof`。

字段名以 workflow service 实际返回类型为准；若 `DiscoveryResult` 缺少这里需要的字段（如 `intentLevel`、`summary`），先扩展 `packages/agents` 的结果类型，而不是在路由里造假值。

- [ ] **Step 3: Verify**

```bash
pnpm --filter @leadflow/api test
```

Expected: Task 3 Step 1 的测试仍 FAIL（dashboard 还没接 store），但 workflow 路由测试 PASS。属于预期中间态，继续 Task 4。

---

### Task 4: Persist Conversation Messages

**Files:**

- Modify: `apps/api/src/routes/conversations.ts`

- [ ] **Step 1: Wire conversation routes to store**

- `GET /:leadId/conversation` 返回 `services.store.listConversationMessages(leadId)`，删除空数组 stub。
- `POST /:leadId/conversation/sync`：`xhsChat.getConversation` 返回的消息逐条 `appendConversationMessage`（按 `id` 去重，避免重复 sync 产生重复消息），并写 `customer_replied` timeline 事件（仅当出现新的 inbound 消息时）。
- `POST /:leadId/conversation/send`：发送成功后 append outbound 消息，写 `conversation_started` 或 `agent_replied` 事件。
- `POST /:leadId/conversation/customer-reply`：人工兜底录入同样 append inbound 消息并写 `customer_replied` 事件——它和真实 sync 走同一条存储路径，Dashboard 不区分来源做特殊渲染，但事件 summary 标注"人工录入"。

- [ ] **Step 2: Verify**

```bash
pnpm --filter @leadflow/api test
```

Expected: conversation 相关测试 PASS。

---

### Task 5: Dashboard Reads Store, Fixtures Become Demo-Seed-Only

**Files:**

- Modify: `apps/api/src/routes/dashboard.ts`
- Modify: `apps/api/src/routes/leads.ts`
- Modify: `apps/api/src/routes/memories.ts`
- Modify: `apps/api/src/routes/artifacts.ts`
- Create: `apps/api/src/routes/demo.ts`
- Modify: `apps/api/src/fixtures/demo-data.ts`

- [ ] **Step 1: Rewrite dashboard aggregation from store**

`GET /api/dashboard/leads` 与 `GET /api/dashboard/leads/:leadId` 全部从 store 聚合：

```ts
route.get("/leads/:leadId", (c) => {
  const leadId = c.req.param("leadId");
  const lead = services.store.getLead(leadId);
  if (!lead) {
    return c.json({ error: "lead not found" }, 404);
  }
  return c.json({
    lead,
    conversation: { messages: services.store.listConversationMessages(leadId) },
    timeline: services.store.listTimelineEvents(leadId),
    memories: services.store.listMemoryRefs(leadId),
    artifacts: services.store.listArtifactRefs(leadId),
  });
});
```

`leads.ts` / `memories.ts`（GET 列表部分）/ `artifacts.ts`（GET 列表部分）同样改为读 store。`memories/recall` 和 `artifacts/:id`（读 blob 内容）继续直连 MemWal / Walrus adapter，不变。

- [ ] **Step 2: Move fixtures behind demo seed endpoint**

Create `apps/api/src/routes/demo.ts`:

```ts
import { Hono } from "hono";
import type { ApiServices } from "../app.js";
import { demoLeadChen } from "../fixtures/demo-data.js";

// Demo API（见 docs/architecture/api-design-zh.md "Demo API"）。
// 仅用于演示前预热界面；seed 产生的数据带 isDemoSeed 标记。
export function demoRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/seed-real-estate", (c) => {
    const lead = services.store.upsertLead({ ...demoLeadChen, isDemoSeed: true } as never);
    return c.json({ seeded: true, leadId: lead.id });
  });

  return route;
}
```

然后执行关键一步：**删除所有业务路由对 fixtures 的 import**。完成后运行：

```bash
grep -rn "fixtures/demo-data" apps/api/src/routes
```

Expected: 只有 `routes/demo.ts` 一处引用。出现其他引用即为未完成。

- [ ] **Step 3: Update tests and verify**

更新 `app.test.ts` 中依赖 fixtures 响应的断言（改为先调 workflow / conversation 端点产生数据，再断言读取结果）。Task 3 Step 1 的测试此时应 PASS。

```bash
pnpm --filter @leadflow/api test
pnpm --filter @leadflow/api typecheck
```

Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src
git commit -m "feat: Dashboard 改读共享存储，fixtures 仅保留给 Demo seed"
```

---

### Task 6: Frontend Demo-Seed Labeling and Final Verification

**Files:**

- Modify: `apps/web`（仅当 Plan 5 已执行）

- [ ] **Step 1: Mark demo-seeded leads in UI**

若 lead 带 `isDemoSeed: true`，Lead 列表项显示"演示数据"角标，避免评委把 seed 数据误认为真实运行产物。

- [ ] **Step 2: Full-flow verification**

按 Plan 6 Task 7 Step 2b 的真实模式步骤运行 `demo:run` + `demo:verify`。额外检查：

- Dashboard 上看到的 blobId 与 `demo:run` 输出的 blobId 一致（同一来源，非两套数据）；
- 重启 API 进程后 store 清空属于已知限制（进程内存储），Demo 前按顺序执行 seed → run 即可；后续接 Prisma 时由 DB 实现替换 `createStore()`。

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat: 标记演示数据并完成真实链路验证"
```

---

## Out of Scope

- Prisma 持久化实现（store 接口已为其预留，单独成计划）；
- 客户新回复的 LLM 解析与画像增量更新（属 Conversion 深化）；
- Discovery 的小红书搜索/评论采集 connector（需单独的采集能力计划，当前真实路径为手动导入真实文本）。

## Success Criteria

- 业务路由零 fixtures 引用（`grep` 检查通过）；
- 真实模式下 `demo:verify` 通过且无 `fake_blob_`；
- Dashboard 展示的 memories / artifacts / timeline 全部可追溯到当次 workflow 运行。

Placeholder scan:

- This plan contains no unresolved implementation placeholders.
