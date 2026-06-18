# LeadFlow End-to-End Demo Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repeatable competition demo flow that seeds a real-estate lead, runs discovery, conversion, XHS chat sync/send, handoff recovery, and verifies Dashboard-visible MemWal/Walrus evidence.

**Architecture:** Demo orchestration lives in `scripts` and calls the public Hono API instead of importing private package internals. This proves the same product surface used by the Dashboard can drive the whole workflow. The script supports fake local mode for rehearsals and real adapter mode through environment variables.

**Tech Stack:** TypeScript, tsx, Hono API, pnpm scripts, Vitest smoke tests, API-driven orchestration.

---

## Prerequisites

This plan assumes Plans 1-5 are complete.

Run before starting:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands pass.

## File Structure

Create:

```text
scripts/demo-api-client.ts
scripts/seed-real-estate-demo.ts
scripts/run-demo-flow.ts
scripts/verify-demo-flow.ts
scripts/demo-flow.test.ts
.env.example
docs/demo/leadflow-demo-script-zh.md
docs/demo/judge-walkthrough-zh.md
```

Modify:

```text
package.json
apps/api/src/routes/dashboard.ts
apps/api/src/fixtures/demo-data.ts
```

Reference:

```text
docs/superpowers/specs/2026-06-11-leadflow-memory-design.md
docs/features/dashboard-memory-inspector-zh.md
docs/features/handoff-recovery-zh.md
```

---

### Task 1: Add Demo Scripts and Environment Commands

**Files:**

- Create: `.env.example`
- Modify: `package.json`
- Create: `scripts/demo-flow.test.ts`

- [ ] **Step 1: Add demo scripts to root package**

Modify root `package.json` scripts:

```json
{
  "scripts": {
    "demo:seed": "tsx scripts/seed-real-estate-demo.ts",
    "demo:run": "tsx scripts/run-demo-flow.ts",
    "demo:verify": "tsx scripts/verify-demo-flow.ts",
    "demo:test": "vitest run scripts/demo-flow.test.ts"
  }
}
```

- [ ] **Step 2: Add environment example**

Create `.env.example`:

```bash
API_BASE_URL=http://127.0.0.1:3001

# ===== 真实链路配置（默认，比赛/演示使用）=====
# 任一项缺失时 API 启动直接报错，不会静默回退到 fake。

LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=
LLM_MODEL=deepseek-v4-pro

MEMWAL_BASE_URL=
MEMWAL_DELEGATE_KEY=

WALRUS_PUBLISHER_URL=
WALRUS_AGGREGATOR_URL=

XHS_CHAT_COMMAND=node dist/index.js
XHS_CHAT_CWD=/Users/jethrozz/Documents/UGit/lead-hunter-client/xhs-lead-converter/mcp-xhs-chat

# ===== 排练模式（仅本地走查流程用，禁止用于正式演示）=====
# 需要时显式取消注释，覆盖上面的真实配置：
# LLM_PROVIDER=fake
# MEMWAL_MODE=fake
# WALRUS_MODE=fake
# XHS_CHAT_MODE=fake
```

- [ ] **Step 3: Write failing demo smoke test**

Create `scripts/demo-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getApiBaseUrl } from "./demo-api-client";

describe("demo flow helpers", () => {
  it("reads API base URL from env with local default", () => {
    expect(getApiBaseUrl({})).toBe("http://127.0.0.1:3001");
    expect(getApiBaseUrl({ API_BASE_URL: "http://localhost:9999" })).toBe("http://localhost:9999");
  });
});
```

Run:

```bash
pnpm demo:test
```

Expected: FAIL because `scripts/demo-api-client.ts` does not exist.

---

### Task 2: Create API Client for Demo Scripts

**Files:**

- Create: `scripts/demo-api-client.ts`
- Modify: `scripts/demo-flow.test.ts`

- [ ] **Step 1: Implement API client helpers**

Create `scripts/demo-api-client.ts`:

```ts
export type DemoEnv = {
  API_BASE_URL?: string;
};

export function getApiBaseUrl(env: DemoEnv = process.env): string {
  return env.API_BASE_URL ?? "http://127.0.0.1:3001";
}

export async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  env: DemoEnv = process.env,
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl(env)}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${path} failed with ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

export function postJson<T>(path: string, body: unknown, env: DemoEnv = process.env): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    env,
  );
}
```

- [ ] **Step 2: Extend client tests**

Append to `scripts/demo-flow.test.ts`:

```ts
import { postJson } from "./demo-api-client";

it("exports postJson helper", () => {
  expect(typeof postJson).toBe("function");
});
```

- [ ] **Step 3: Verify helper tests**

Run:

```bash
pnpm demo:test
```

Expected: PASS.

- [ ] **Step 4: Commit demo helper**

Run:

```bash
git add package.json .env.example scripts/demo-api-client.ts scripts/demo-flow.test.ts
git commit -m "feat: add demo api client helpers"
```

Expected: commit succeeds.

---

### Task 3: Add Seed Script for Real Estate Demo

**Files:**

- Create: `scripts/seed-real-estate-demo.ts`
- Modify: `apps/api/src/fixtures/demo-data.ts`
- Modify: `apps/api/src/routes/dashboard.ts`

- [ ] **Step 1: Implement seed script**

Create `scripts/seed-real-estate-demo.ts`:

```ts
import { postJson } from "./demo-api-client";

async function main() {
  const campaign = await postJson<{ id: string }>("/api/campaigns", {
    name: "重庆改善型购房线索",
    industry: "real_estate",
    city: "重庆",
    targetCustomer: "准备购买重庆新房或二手房的高意向客户",
    seedKeywords: ["重庆买房", "渝北三房", "重庆新房补贴"],
    targetCreators: [{ platform: "xhs", name: "重庆房产博主" }],
    sourceModes: ["search_posts", "comments"],
    maxPostsPerRun: 20,
    maxCommentsPerPost: 50,
    playbookId: "real-estate-chongqing",
  });

  console.log(JSON.stringify({ seeded: true, campaignId: campaign.id }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Ensure campaign POST route returns id**

If `apps/api/src/routes/campaigns.ts` only returns fixtures, modify `POST /` handler to persist the campaign into the shared store (see Plan 7) and return the stored record:

```ts
import { randomUUID } from "node:crypto";

const campaign = {
  id: `campaign_${randomUUID()}`,
  status: "draft",
  ...body,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
store.campaigns.set(campaign.id, campaign);
return c.json(campaign, 201);
```

不允许返回写死的 campaign id：后续 GET 接口必须能按这个 id 读回同一条记录。

Run:

```bash
pnpm --filter @leadflow/api test
```

Expected: API tests pass.

- [ ] **Step 3: Commit seed script**

Run:

```bash
git add scripts/seed-real-estate-demo.ts apps/api/src/routes/campaigns.ts
git commit -m "feat: add real estate demo seed script"
```

Expected: commit succeeds.

---

### Task 4: Add End-to-End Demo Runner

**Files:**

- Create: `scripts/run-demo-flow.ts`

- [ ] **Step 1: Implement demo runner**

Create `scripts/run-demo-flow.ts`:

```ts
import { postJson, requestJson } from "./demo-api-client";

type WorkflowResult = {
  memoryRef?: string;
  artifact?: { blobId: string; type: string };
  message?: string;
  recoverySummary?: string;
};

async function main() {
  console.log("1. Running discovery workflow");
  const discovery = await postJson<WorkflowResult>("/api/workflows/discovery/run", {
    leadId: "lead_001",
    memorySpaceId: "space_001",
    sourceText: "小红书评论：想看看渝北 130 万以内的三房，新房有没有补贴？",
  });
  console.log(JSON.stringify(discovery, null, 2));

  console.log("2. Syncing XHS conversation");
  const conversation = await postJson<{
    messages: Array<{ direction: string; content: string }>;
  }>("/api/leads/lead_001/conversation/sync", {
    deviceId: "device-1",
    xhsUserId: "xhs_001",
    xhsUsername: "重庆买房小陈",
  });
  console.log(JSON.stringify(conversation, null, 2));

  // 客户回复必须来自真实同步结果，不允许在脚本里写死。
  // 真实演示前先在小红书侧让测试账号回复一条消息；
  // 排练模式下 FakeXhsChatClient 自带一条 inbound 消息。
  const latestInbound = conversation.messages
    .filter((message) => message.direction === "inbound")
    .at(-1);
  if (!latestInbound) {
    throw new Error(
      "No inbound customer message found after sync. Reply from the test XHS account first, then re-run.",
    );
  }

  console.log("3. Running conversion workflow");
  const conversion = await postJson<WorkflowResult>("/api/workflows/conversion/run", {
    leadId: "lead_001",
    memorySpaceId: "space_001",
    customerMessage: latestInbound.content,
  });
  console.log(JSON.stringify(conversion, null, 2));

  if (conversion.message) {
    console.log("4. Sending XHS follow-up");
    const sendResult = await postJson("/api/leads/lead_001/conversation/send", {
      deviceId: "device-1",
      xhsUserId: "xhs_001",
      xhsUsername: "重庆买房小陈",
      message: conversion.message,
    });
    console.log(JSON.stringify(sendResult, null, 2));
  }

  console.log("5. Running handoff recovery");
  const handoff = await postJson<WorkflowResult>("/api/workflows/handoff/run", {
    leadId: "lead_001",
    memorySpaceId: "space_001",
    fromWorkerId: "worker-1",
    toWorkerId: "worker-2",
  });
  console.log(JSON.stringify(handoff, null, 2));

  console.log("6. Loading dashboard detail");
  const dashboard = await requestJson("/api/dashboard/leads/lead_001");
  console.log(JSON.stringify(dashboard, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck scripts through root**

Run:

```bash
pnpm typecheck
```

Expected: all packages typecheck. If root typecheck does not include scripts, run:

```bash
pnpm exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 scripts/run-demo-flow.ts scripts/demo-api-client.ts
```

Expected: script typecheck passes.

- [ ] **Step 3: Commit runner**

Run:

```bash
git add scripts/run-demo-flow.ts
git commit -m "feat: add end-to-end demo runner"
```

Expected: commit succeeds.

---

### Task 5: Add Demo Verification Script

**Files:**

- Create: `scripts/verify-demo-flow.ts`

- [ ] **Step 1: Implement verification script**

Create `scripts/verify-demo-flow.ts`:

```ts
import { requestJson } from "./demo-api-client";

type DashboardDetail = {
  timeline: Array<{ type: string; artifactRefs: string[]; memoryRefs: string[] }>;
  memories: Array<{ id: string; content: string }>;
  artifacts: Array<{ id: string; blobId: string; type: string }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  // 默认按真实链路校验。只有显式设置 DEMO_ALLOW_FAKE=1（本地排练）才放过 fake 产物。
  const allowFake = process.env.DEMO_ALLOW_FAKE === "1";

  const detail = await requestJson<DashboardDetail>("/api/dashboard/leads/lead_001");

  assert(detail.memories.length > 0, "Expected at least one MemWal memory in dashboard detail");

  if (!allowFake) {
    assert(
      detail.artifacts.length > 0 &&
        detail.artifacts.every((artifact) => !artifact.blobId.startsWith("fake_blob_")),
      "Found fake_blob_ artifact ids: API is running with fake adapters. Set real env config (see .env.example) or DEMO_ALLOW_FAKE=1 for rehearsal.",
    );
  }
  assert(detail.artifacts.length > 0, "Expected at least one Walrus artifact in dashboard detail");
  assert(
    detail.artifacts.some((artifact) => artifact.blobId.length > 0),
    "Expected Walrus artifact blob IDs to be visible",
  );
  assert(
    detail.timeline.some((event) => event.type.includes("handoff") || event.type.includes("Handoff")),
    "Expected handoff event in timeline",
  );

  console.log(JSON.stringify({
    verified: true,
    memories: detail.memories.length,
    artifacts: detail.artifacts.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck verification script**

Run:

```bash
pnpm exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 scripts/verify-demo-flow.ts scripts/demo-api-client.ts
```

Expected: typecheck passes.

- [ ] **Step 3: Commit verifier**

Run:

```bash
git add scripts/verify-demo-flow.ts
git commit -m "feat: add demo verification script"
```

Expected: commit succeeds.

---

### Task 6: Add Judge Walkthrough Documentation

> **⚠️ 演示专用任务** — 此任务只创建演示文档，不涉及代码逻辑，在正式演示前准备即可。不影响代码验收。

**Files:**

- Create: `docs/demo/leadflow-demo-script-zh.md`
- Create: `docs/demo/judge-walkthrough-zh.md`

- [ ] **Step 1: Create demo operator script**

Create `docs/demo/leadflow-demo-script-zh.md`:

```markdown
# LeadFlow Memory Demo 操作脚本

## 启动

1. 启动 API：

```bash
pnpm dev:api
```

2. 启动 Dashboard：

```bash
pnpm dev:web
```

3. 执行 Demo Flow：

```bash
pnpm demo:run
pnpm demo:verify
```

## 演示顺序

1. 打开 Dashboard，展示 Lead 列表和重庆房产客户。
2. 展示线索来源：小红书评论表达渝北三房和预算需求。
3. 展示 Discovery Agent 写入 MemWal 初始记忆。
4. 展示 Walrus artifact blob ID。
5. 点击同步小红书聊天，展示真实聊天通道边界。
6. 运行 Conversion Agent，展示它读取长期记忆后生成跟进话术。
7. 点击发送跟进私信。
8. 触发 Handoff Recovery，展示 Worker-2 恢复上下文。
9. 在 Inspector 中展示 MemWal memory、Walrus artifacts、Agent trace 和 handoff proof。
```

- [ ] **Step 2: Create judge walkthrough**

Create `docs/demo/judge-walkthrough-zh.md`:

```markdown
# LeadFlow Memory 评委讲解稿

LeadFlow Memory 不是普通 CRM，而是一个可验证长期记忆销售 Agent 工作流。

Demo 展示的是重庆房产销售场景：

- Discovery Agent 从小红书内容发现高意向客户。
- 系统将客户预算、区域、户型等事实写入 MemWal。
- 来源快照、发现报告、转化决策和接力证明写入 Walrus。
- Conversion Agent 在后续对话中 recall 长期记忆，而不是只看当前消息。
- Worker 切换后，Handoff Recovery 从 MemWal 和 Walrus 恢复上下文。
- Dashboard 将 memory、artifact blob ID、timeline 和 trace 一起展示。

Walrus Track 对应点：

- Long-term memory：MemWal 保存客户长期画像。
- Persistent data and file access：Walrus 保存可验证 artifacts。
- Artifact-driven workflow：每次发现、转化、接力都有 JSON artifact。
- Cross-agent context sharing：Discovery、Conversion、Handoff 使用同一份 lead memory。
```

- [ ] **Step 3: Commit demo docs**

Run:

```bash
git add docs/demo
git commit -m "docs: add leadflow demo walkthrough"
```

Expected: commit succeeds.

---

### Task 7: Verify End-to-End Demo Plan

**Files:**

- Modify: none

- [ ] **Step 1: Run static checks**

Run:

```bash
pnpm demo:test
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands pass.

- [ ] **Step 2: Run local rehearsal with API server (fake mode, rehearsal only)**

> **⚠️ 演示排练步骤** — 仅用于演示前走查流程，不作为代码验收依据。需在 Plan 7 完成后执行。

排练模式只用于走查流程，不作为验收依据。

In terminal 1:

```bash
MEMWAL_MODE=fake WALRUS_MODE=fake XHS_CHAT_MODE=fake LLM_PROVIDER=fake pnpm dev:api
```

Expected: API server starts on the configured local port.

In terminal 2:

```bash
API_BASE_URL=http://127.0.0.1:3001 pnpm demo:run
API_BASE_URL=http://127.0.0.1:3001 DEMO_ALLOW_FAKE=1 pnpm demo:verify
```

Expected: demo runner prints discovery, sync, conversion, send, handoff, and dashboard JSON; verifier prints `"verified": true`.

- [ ] **Step 2b: Run real-mode verification (acceptance gate)**

> **⚠️ 演示验收步骤** — 依赖真实 DeepSeek/MemWal/Walrus/mcp-xhs-chat 配置，须在 Plan 7 完成且外部服务可用后执行。

这是本计划的验收步骤：全部真实适配器，不带任何 fake 环境变量。

In terminal 1（确保 `.env` 已按 `.env.example` 填好真实配置，DeepSeek key、MemWal、Walrus testnet publisher/aggregator、mcp-xhs-chat 已构建且设备可连接）:

```bash
pnpm dev:api
```

Expected: API server starts；若任何真实配置缺失，启动必须直接报错而不是回退 fake。

In terminal 2:

```bash
API_BASE_URL=http://127.0.0.1:3001 pnpm demo:run
API_BASE_URL=http://127.0.0.1:3001 pnpm demo:verify
```

Expected:
- runner 输出真实 LLM 生成的话术（每次运行内容不同）；
- verifier 通过且无 `fake_blob_` 前缀断言失败；
- 抽取任意一个 blobId，通过 `curl "$WALRUS_AGGREGATOR_URL/v1/blobs/<blobId>"` 能读回 artifact 内容。

- [ ] **Step 3: Run Dashboard rehearsal**

> **⚠️ 演示排练步骤** — 需在 Plan 7 完成后（Dashboard 改读真实 store）执行。

In terminal 3:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3001 pnpm dev:web
```

Open:

```text
http://127.0.0.1:5173
```

Expected: Dashboard shows lead list, profile, memory timeline, MemWal memory, Walrus blob IDs, and action buttons.

- [ ] **Step 4: Commit final demo integration if needed**

Run:

```bash
git status --short
```

Expected: no uncommitted changes. If rehearsal changed docs or config, commit exact files with:

```bash
git commit -m "chore: finalize demo flow"
```

Expected: commit succeeds or no commit is needed.

---

## Self-Review

Spec coverage:

- Full MVP flow from discovery to dashboard evidence: Tasks 3-7.
- API-driven workflow proof: Tasks 2, 4, and 5.
- Demo operator and judge documentation: Task 6.
- Fake and real adapter mode support via env: Task 1.

Deferred to future work:

- Production authentication.
- Multi-platform demo.
- Walrus Sites deployment automation.
- Advanced observability dashboards.

Placeholder scan:

- This plan contains no unresolved implementation placeholders.

Type consistency:

- Script paths call the public API routes already defined in prior plans.
- Demo lead uses `lead_001` and `space_001` consistently across workflows.
