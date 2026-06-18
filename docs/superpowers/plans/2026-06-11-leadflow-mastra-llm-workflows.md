# LeadFlow Mastra + LLM Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the agent workflow layer for discovery, conversion, and handoff recovery with configurable LLM providers and adapter calls to MemWal and Walrus.

**Architecture:** `packages/llm` provides a provider-agnostic chat interface with DeepSeek/MiMo-compatible HTTP providers and a fake provider for tests. `packages/agents` owns pure workflow functions that can later be wrapped by Mastra runtime primitives. API workflow routes call the workflow service and return deterministic workflow results with memory and artifact references.

**Tech Stack:** TypeScript, Zod, Vitest, Hono, Mastra-compatible workflow boundaries, configurable OpenAI-compatible HTTP chat protocol for DeepSeek/MiMo-style providers.

---

## Prerequisites

This plan assumes Plan 1 and Plan 2 are complete:

```text
packages/core
packages/playbook
packages/memwal
packages/walrus
apps/api
```

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
packages/llm/package.json
packages/llm/tsconfig.json
packages/llm/src/index.ts
packages/llm/src/types.ts
packages/llm/src/fake-provider.ts
packages/llm/src/openai-compatible-provider.ts
packages/llm/src/env.ts
packages/llm/src/provider.test.ts

packages/agents/package.json
packages/agents/tsconfig.json
packages/agents/src/index.ts
packages/agents/src/types.ts
packages/agents/src/prompts.ts
packages/agents/src/discovery-workflow.ts
packages/agents/src/conversion-workflow.ts
packages/agents/src/handoff-workflow.ts
packages/agents/src/workflow-service.ts
packages/agents/src/workflow-service.test.ts
```

Modify:

```text
apps/api/package.json
apps/api/src/app.ts
apps/api/src/routes/workflows.ts
apps/api/src/app.test.ts
```

Reference:

```text
docs/features/social-lead-discovery-zh.md
docs/features/conversion-agent-zh.md
docs/features/handoff-recovery-zh.md
docs/features/conversion-playbook-zh.md
```

---

### Task 1: Create LLM Provider Package

**Files:**

- Create: `packages/llm/package.json`
- Create: `packages/llm/tsconfig.json`
- Create: `packages/llm/src/types.ts`
- Create: `packages/llm/src/index.ts`
- Create: `packages/llm/src/provider.test.ts`

- [ ] **Step 1: Create package files**

Create `packages/llm/package.json`:

```json
{
  "name": "@leadflow/llm",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Create `packages/llm/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Write failing provider tests**

Create `packages/llm/src/provider.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLlmProviderFromEnv, FakeLlmProvider } from "./index.js";

describe("LLM provider", () => {
  it("returns deterministic fake JSON", async () => {
    const provider = new FakeLlmProvider({
      content: JSON.stringify({ intentLevel: "A", summary: "客户关注渝北三房" }),
    });

    const result = await provider.chatJson({
      system: "Return JSON.",
      messages: [{ role: "user", content: "客户说预算 130 万以内" }],
    });

    expect(result.intentLevel).toBe("A");
  });

  it("creates fake provider from env", () => {
    const provider = createLlmProviderFromEnv({ LLM_PROVIDER: "fake" });
    expect(provider).toBeInstanceOf(FakeLlmProvider);
  });
});
```

Run:

```bash
pnpm --filter @leadflow/llm test
```

Expected: FAIL because `./index.js` does not exist.

- [ ] **Step 3: Add provider types**

Create `packages/llm/src/types.ts`:

```ts
export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatJsonInput = {
  system: string;
  messages: LlmMessage[];
  temperature?: number;
};

export type LlmProvider = {
  chatJson(input: ChatJsonInput): Promise<Record<string, unknown>>;
};
```

Create `packages/llm/src/index.ts`:

```ts
export * from "./types.js";
```

Run:

```bash
pnpm --filter @leadflow/llm test
```

Expected: FAIL because provider implementations are missing.

---

### Task 2: Implement Fake and HTTP LLM Providers

**Files:**

- Create: `packages/llm/src/fake-provider.ts`
- Create: `packages/llm/src/openai-compatible-provider.ts`
- Create: `packages/llm/src/env.ts`
- Modify: `packages/llm/src/index.ts`

- [ ] **Step 1: Implement fake provider**

Create `packages/llm/src/fake-provider.ts`:

```ts
import type { ChatJsonInput, LlmProvider } from "./types.js";

export class FakeLlmProvider implements LlmProvider {
  constructor(private readonly options: { content?: string } = {}) {}

  async chatJson(_input: ChatJsonInput): Promise<Record<string, unknown>> {
    return JSON.parse(this.options.content ?? "{}") as Record<string, unknown>;
  }
}
```

- [ ] **Step 2: Implement HTTP provider**

Create `packages/llm/src/openai-compatible-provider.ts`:

```ts
import type { ChatJsonInput, LlmProvider } from "./types.js";

export type OpenAiCompatibleProviderOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private readonly options: OpenAiCompatibleProviderOptions) {}

  async chatJson(input: ChatJsonInput): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: input.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: input.system }, ...input.messages],
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM response did not include message content");
    }
    return JSON.parse(content) as Record<string, unknown>;
  }
}
```

- [ ] **Step 3: Implement environment factory**

Create `packages/llm/src/env.ts`:

```ts
import { FakeLlmProvider } from "./fake-provider.js";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";
import type { LlmProvider } from "./types.js";

export type LlmEnv = {
  LLM_PROVIDER?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
};

export function createLlmProviderFromEnv(env: LlmEnv = process.env): LlmProvider {
  if (env.LLM_PROVIDER === "fake") {
    return new FakeLlmProvider({
      content: JSON.stringify({
        intentLevel: "A",
        summary: "Fake provider response for local tests.",
      }),
    });
  }

  if (!env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) {
    throw new Error("Set LLM_PROVIDER=fake or provide LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL");
  }

  return new OpenAiCompatibleProvider({
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
  });
}
```

- [ ] **Step 4: Export providers**

Modify `packages/llm/src/index.ts`:

```ts
export * from "./env.js";
export * from "./fake-provider.js";
export * from "./openai-compatible-provider.js";
export * from "./types.js";
```

- [ ] **Step 5: Verify LLM package**

Run:

```bash
pnpm --filter @leadflow/llm test
pnpm --filter @leadflow/llm typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit LLM provider package**

Run:

```bash
git add packages/llm
git commit -m "feat: add configurable llm provider"
```

Expected: commit succeeds.

---

### Task 3: Create Agent Workflow Package

**Files:**

- Create: `packages/agents/package.json`
- Create: `packages/agents/tsconfig.json`
- Create: `packages/agents/src/types.ts`
- Create: `packages/agents/src/prompts.ts`
- Create: `packages/agents/src/index.ts`
- Create: `packages/agents/src/workflow-service.test.ts`

- [ ] **Step 1: Create package manifest**

Create `packages/agents/package.json`:

```json
{
  "name": "@leadflow/agents",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@leadflow/core": "workspace:*",
    "@leadflow/llm": "workspace:*",
    "@leadflow/memwal": "workspace:*",
    "@leadflow/playbook": "workspace:*",
    "@leadflow/walrus": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Create `packages/agents/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Add workflow service tests**

Create `packages/agents/src/workflow-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FakeLlmProvider } from "@leadflow/llm";
import { FakeMemWalClient } from "@leadflow/memwal";
import { FakeWalrusArtifactClient } from "@leadflow/walrus";
import { createWorkflowService } from "./workflow-service.js";

describe("LeadFlow workflow service", () => {
  it("runs discovery and writes initial memory plus source artifact", async () => {
    const service = createWorkflowService({
      llm: new FakeLlmProvider({
        content: JSON.stringify({
          intentLevel: "A",
          summary: "客户评论表达购房意向，关注渝北三房。",
          memory: "客户关注渝北三房，总价约 130 万。",
        }),
      }),
      memwal: new FakeMemWalClient(),
      walrus: new FakeWalrusArtifactClient(),
    });

    const result = await service.runDiscovery({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      sourceText: "想看看渝北 130 万以内的三房",
    });

    expect(result.intentLevel).toBe("A");
    expect(result.memoryRef).toMatch(/^mem_/);
    expect(result.artifact.blobId).toMatch(/^fake_blob_/);
  });

  it("runs conversion and produces a follow-up message", async () => {
    const service = createWorkflowService({
      llm: new FakeLlmProvider({
        content: JSON.stringify({
          message: "我按你说的预算和区域整理几套渝北三房，可以加微信发你吗？",
          memory: "下一步策略：索要微信发送房源对比。",
          extractedFields: { budget: "130万以内", district: "渝北", layout: "三房" },
        }),
      }),
      memwal: new FakeMemWalClient(),
      walrus: new FakeWalrusArtifactClient(),
    });

    await service.runDiscovery({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      sourceText: "想看看渝北 130 万以内的三房",
    });

    const result = await service.runConversion({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      customerMessage: "可以，先看看有没有新房补贴",
    });

    expect(result.message).toContain("加微信");
    expect(result.memoryRef).toMatch(/^mem_/);
  });

  it("runs handoff recovery with recalled memory and proof artifact", async () => {
    const memwal = new FakeMemWalClient();
    await memwal.writeMemory({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      content: "客户预算 130 万以内，关注渝北三房。",
      metadata: { source: "conversion", confidence: 0.9, artifactRefs: [] },
    });

    const service = createWorkflowService({
      llm: new FakeLlmProvider({
        content: JSON.stringify({
          recoverySummary: "Worker-2 已恢复客户预算、区域和下一步沟通策略。",
        }),
      }),
      memwal,
      walrus: new FakeWalrusArtifactClient(),
    });

    const result = await service.runHandoffRecovery({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      fromWorkerId: "worker-1",
      toWorkerId: "worker-2",
    });

    expect(result.recoverySummary).toContain("Worker-2");
    expect(result.artifact.blobId).toMatch(/^fake_blob_/);
  });
});
```

Run:

```bash
pnpm --filter @leadflow/agents test
```

Expected: FAIL because workflow service does not exist.

- [ ] **Step 3: Add agent types**

Create `packages/agents/src/types.ts`:

```ts
import type { StoredWalrusArtifact } from "@leadflow/walrus";

export type WorkflowServices = {
  llm: import("@leadflow/llm").LlmProvider;
  memwal: import("@leadflow/memwal").MemWalClient;
  walrus: import("@leadflow/walrus").WalrusArtifactClient;
};

export type DiscoveryInput = {
  leadId: string;
  memorySpaceId: string;
  sourceText: string;
};

export type DiscoveryResult = {
  intentLevel: string;
  summary: string;
  memoryRef: string;
  artifact: StoredWalrusArtifact;
};

export type ConversionInput = {
  leadId: string;
  memorySpaceId: string;
  customerMessage: string;
};

export type ConversionResult = {
  message: string;
  memoryRef: string;
  artifact: StoredWalrusArtifact;
  extractedFields: Record<string, unknown>;
};

export type HandoffRecoveryInput = {
  leadId: string;
  memorySpaceId: string;
  fromWorkerId: string;
  toWorkerId: string;
};

export type HandoffRecoveryResult = {
  recoverySummary: string;
  artifact: StoredWalrusArtifact;
};
```

- [ ] **Step 4: Add prompts**

Create `packages/agents/src/prompts.ts`:

```ts
export const discoverySystemPrompt = [
  "You are LeadFlow Discovery Agent.",
  "Analyze social content and return JSON with intentLevel, summary, and memory.",
  "Use intentLevel S/A/B/C/Ignore.",
].join("\n");

export const conversionSystemPrompt = [
  "You are LeadFlow Conversion Agent for high-consideration sales.",
  "Return JSON with message, memory, and extractedFields.",
  "The message must be helpful, non-pushy, and ask at most one clear next step.",
].join("\n");

export const handoffSystemPrompt = [
  "You are LeadFlow Handoff Recovery Agent.",
  "Return JSON with recoverySummary based only on recalled memory.",
  "Mention what context was recovered and what the next worker should do.",
].join("\n");
```

Create `packages/agents/src/index.ts`:

```ts
export * from "./types.js";
export * from "./prompts.js";
```

Run:

```bash
pnpm --filter @leadflow/agents test
```

Expected: FAIL because `workflow-service.js` is missing.

---

### Task 4: Implement Discovery, Conversion, and Handoff Workflows

**Files:**

- Create: `packages/agents/src/discovery-workflow.ts`
- Create: `packages/agents/src/conversion-workflow.ts`
- Create: `packages/agents/src/handoff-workflow.ts`
- Create: `packages/agents/src/workflow-service.ts`
- Modify: `packages/agents/src/index.ts`

- [ ] **Step 1: Implement discovery workflow**

Create `packages/agents/src/discovery-workflow.ts`:

```ts
import { createArtifactPayload } from "@leadflow/walrus";
import { discoverySystemPrompt } from "./prompts.js";
import type { DiscoveryInput, DiscoveryResult, WorkflowServices } from "./types.js";

export async function runDiscoveryWorkflow(
  services: WorkflowServices,
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  const analysis = await services.llm.chatJson({
    system: discoverySystemPrompt,
    messages: [{ role: "user", content: input.sourceText }],
  });

  const memoryText = String(analysis.memory ?? analysis.summary ?? input.sourceText);
  const artifact = await services.walrus.store(
    createArtifactPayload({
      leadId: input.leadId,
      type: "lead_discovery_report",
      data: { sourceText: input.sourceText, analysis },
    }),
  );

  const memory = await services.memwal.writeMemory({
    leadId: input.leadId,
    memorySpaceId: input.memorySpaceId,
    content: memoryText,
    metadata: {
      source: "discovery",
      confidence: 0.85,
      artifactRefs: [artifact.blobId],
    },
  });

  return {
    intentLevel: String(analysis.intentLevel ?? "B"),
    summary: String(analysis.summary ?? memoryText),
    memoryRef: memory.id,
    artifact,
  };
}
```

- [ ] **Step 2: Implement conversion workflow**

Create `packages/agents/src/conversion-workflow.ts`:

```ts
import { createArtifactPayload } from "@leadflow/walrus";
import { conversionSystemPrompt } from "./prompts.js";
import type { ConversionInput, ConversionResult, WorkflowServices } from "./types.js";

export async function runConversionWorkflow(
  services: WorkflowServices,
  input: ConversionInput,
): Promise<ConversionResult> {
  const recalled = await services.memwal.recall({
    leadId: input.leadId,
    memorySpaceId: input.memorySpaceId,
    query: input.customerMessage,
    limit: 5,
  });

  const result = await services.llm.chatJson({
    system: conversionSystemPrompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          customerMessage: input.customerMessage,
          recalledMemory: recalled.map((memory) => memory.content),
        }),
      },
    ],
  });

  const artifact = await services.walrus.store(
    createArtifactPayload({
      leadId: input.leadId,
      type: "conversion_decision",
      data: { customerMessage: input.customerMessage, recalled, result },
    }),
  );

  const memory = await services.memwal.writeMemory({
    leadId: input.leadId,
    memorySpaceId: input.memorySpaceId,
    content: String(result.memory ?? result.message ?? input.customerMessage),
    metadata: {
      source: "conversion",
      confidence: 0.88,
      artifactRefs: [artifact.blobId],
    },
  });

  return {
    message: String(result.message ?? ""),
    memoryRef: memory.id,
    artifact,
    extractedFields: (result.extractedFields ?? {}) as Record<string, unknown>,
  };
}
```

- [ ] **Step 3: Implement handoff workflow**

Create `packages/agents/src/handoff-workflow.ts`:

```ts
import { createArtifactPayload } from "@leadflow/walrus";
import { handoffSystemPrompt } from "./prompts.js";
import type { HandoffRecoveryInput, HandoffRecoveryResult, WorkflowServices } from "./types.js";

export async function runHandoffRecoveryWorkflow(
  services: WorkflowServices,
  input: HandoffRecoveryInput,
): Promise<HandoffRecoveryResult> {
  const recalled = await services.memwal.recall({
    leadId: input.leadId,
    memorySpaceId: input.memorySpaceId,
    query: "客户画像 下一步策略 联系方式 看房",
    limit: 10,
  });

  const result = await services.llm.chatJson({
    system: handoffSystemPrompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          fromWorkerId: input.fromWorkerId,
          toWorkerId: input.toWorkerId,
          recalledMemory: recalled.map((memory) => memory.content),
        }),
      },
    ],
  });

  const artifact = await services.walrus.store(
    createArtifactPayload({
      leadId: input.leadId,
      type: "handoff_proof",
      data: { input, recalled, result },
    }),
  );

  return {
    recoverySummary: String(result.recoverySummary ?? ""),
    artifact,
  };
}
```

- [ ] **Step 4: Implement workflow service facade**

Create `packages/agents/src/workflow-service.ts`:

```ts
import { runConversionWorkflow } from "./conversion-workflow.js";
import { runDiscoveryWorkflow } from "./discovery-workflow.js";
import { runHandoffRecoveryWorkflow } from "./handoff-workflow.js";
import type { WorkflowServices } from "./types.js";

export function createWorkflowService(services: WorkflowServices) {
  return {
    runDiscovery: (input: Parameters<typeof runDiscoveryWorkflow>[1]) =>
      runDiscoveryWorkflow(services, input),
    runConversion: (input: Parameters<typeof runConversionWorkflow>[1]) =>
      runConversionWorkflow(services, input),
    runHandoffRecovery: (input: Parameters<typeof runHandoffRecoveryWorkflow>[1]) =>
      runHandoffRecoveryWorkflow(services, input),
  };
}
```

- [ ] **Step 5: Export workflows**

Modify `packages/agents/src/index.ts`:

```ts
export * from "./conversion-workflow.js";
export * from "./discovery-workflow.js";
export * from "./handoff-workflow.js";
export * from "./prompts.js";
export * from "./types.js";
export * from "./workflow-service.js";
```

- [ ] **Step 6: Verify agents package**

Run:

```bash
pnpm --filter @leadflow/agents test
pnpm --filter @leadflow/agents typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Commit workflow package**

Run:

```bash
git add packages/agents packages/llm
git commit -m "feat: add leadflow workflow service"
```

Expected: commit succeeds.

---

### Task 5: Wire Workflows into API Routes

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/workflows.ts`
- Modify: `apps/api/src/app.test.ts`

- [ ] **Step 1: Add API dependencies**

Modify `apps/api/package.json` dependencies:

```json
{
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "@leadflow/agents": "workspace:*",
    "@leadflow/core": "workspace:*",
    "@leadflow/llm": "workspace:*",
    "@leadflow/memwal": "workspace:*",
    "@leadflow/playbook": "workspace:*",
    "@leadflow/walrus": "workspace:*",
    "hono": "^4.6.10",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Add workflow API tests**

Append to `apps/api/src/app.test.ts`:

```ts
it("runs discovery workflow through the API", async () => {
  const response = await app.request("/api/workflows/discovery/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      sourceText: "想看看渝北 130 万以内的三房",
    }),
  });

  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.artifact.blobId).toBeTruthy();
});
```

Run:

```bash
pnpm --filter @leadflow/api test
```

Expected: FAIL because workflow route does not call the workflow service.

- [ ] **Step 3: Extend API services**

Modify `apps/api/src/app.ts` so `ApiServices` includes `llm` and `workflows`, and extend **both** service factories from Plan 2. The fake factory stays test-only; the env factory is what `apps/api/src/index.ts` runs at startup:

```ts
import { createWorkflowService } from "@leadflow/agents";
import { createLlmProviderFromEnv, FakeLlmProvider, type LlmProvider } from "@leadflow/llm";
import { Hono } from "hono";
import {
  createMemWalClientFromEnv,
  FakeMemWalClient,
  type MemWalClient,
} from "@leadflow/memwal";
import {
  createWalrusClientFromEnv,
  FakeWalrusArtifactClient,
  type WalrusArtifactClient,
} from "@leadflow/walrus";

export type ApiServices = {
  llm: LlmProvider;
  memwal: MemWalClient;
  walrus: WalrusArtifactClient;
  workflows: ReturnType<typeof createWorkflowService>;
};

// 测试专用。canned LLM 内容只存在于 vitest，不进入任何运行模式。
export function createFakeServices(): ApiServices {
  const llm = new FakeLlmProvider({
    content: JSON.stringify({
      intentLevel: "A",
      summary: "客户关注渝北三房。",
      memory: "客户预算 130 万以内，关注渝北三房。",
      message: "我按预算和区域整理几套渝北三房，可以加微信发你吗？",
      extractedFields: { budget: "130万以内", district: "渝北", layout: "三房" },
      recoverySummary: "Worker-2 已恢复客户画像和下一步策略。",
    }),
  });
  const memwal = new FakeMemWalClient();
  const walrus = new FakeWalrusArtifactClient();
  return {
    llm,
    memwal,
    walrus,
    workflows: createWorkflowService({ llm, memwal, walrus }),
  };
}

// 生产/演示入口：LLM、MemWal、Walrus 全部由环境变量决定，配置缺失直接抛错。
export function createServicesFromEnv(env: NodeJS.ProcessEnv = process.env): ApiServices {
  const llm = createLlmProviderFromEnv(env);
  const memwal = createMemWalClientFromEnv(env);
  const walrus = createWalrusClientFromEnv(env);
  return {
    llm,
    memwal,
    walrus,
    workflows: createWorkflowService({ llm, memwal, walrus }),
  };
}
```

Keep the route registrations from Plan 2 and pass the same `services` object to `workflowsRoute(services)`. `apps/api/src/index.ts` from Plan 2 keeps calling `createApp(createServicesFromEnv())`，因此本任务完成后，启动真实 API 服务即要求配置真实 LLM（如 DeepSeek）。

- [ ] **Step 4: Implement workflow routes**

Modify `apps/api/src/routes/workflows.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { ApiServices } from "../app.js";

const DiscoveryBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  sourceText: z.string().min(1),
});

const ConversionBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  customerMessage: z.string().min(1),
});

const HandoffBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  fromWorkerId: z.string(),
  toWorkerId: z.string(),
});

export function workflowsRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/discovery/run", async (c) => {
    const body = DiscoveryBodySchema.parse(await c.req.json());
    return c.json(await services.workflows.runDiscovery(body));
  });

  route.post("/conversion/run", async (c) => {
    const body = ConversionBodySchema.parse(await c.req.json());
    return c.json(await services.workflows.runConversion(body));
  });

  route.post("/handoff/run", async (c) => {
    const body = HandoffBodySchema.parse(await c.req.json());
    return c.json(await services.workflows.runHandoffRecovery(body));
  });

  return route;
}
```

- [ ] **Step 5: Verify API workflows**

Run:

```bash
pnpm --filter @leadflow/api test
pnpm --filter @leadflow/api typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit API workflow wiring**

Run:

```bash
git add apps/api packages/agents packages/llm
git commit -m "feat: expose leadflow workflows through api"
```

Expected: commit succeeds.

---

### Task 6: Verify Workflow Plan

**Files:**

- Modify: none

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter @leadflow/llm test
pnpm --filter @leadflow/agents test
pnpm --filter @leadflow/api test
```

Expected: all tests pass.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all workspace checks pass.

- [ ] **Step 3: Commit final verification if needed**

Run:

```bash
git status --short
```

Expected: no uncommitted changes. If lockfile or package manifests changed, add the exact changed files and commit:

```bash
git commit -m "chore: finalize workflow integration"
```

Expected: commit succeeds or no commit is needed.

---

## Self-Review

Spec coverage:

- Configurable LLM provider with DeepSeek/MiMo-compatible protocol: Tasks 1-2.
- Discovery workflow writing memory and artifacts: Task 4.
- Conversion workflow recalling memory and producing follow-up: Task 4.
- Handoff recovery with proof artifact: Task 4.
- API workflow routes: Task 5.

Deferred to later plans:

- Live `mcp-xhs-chat` conversation sync/send.
- Dashboard real-data migration.
- Demo orchestration script.
- Native Mastra runtime wrappers if required by deployment.

Placeholder scan:

- This plan contains no unresolved implementation placeholders.

Type consistency:

- Workflow inputs use `leadId` and `memorySpaceId` consistently.
- Adapter types come from `@leadflow/memwal` and `@leadflow/walrus`.
- API service injection matches Plan 2.
