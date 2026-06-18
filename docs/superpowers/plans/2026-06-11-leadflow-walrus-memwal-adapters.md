# LeadFlow Walrus + MemWal Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real adapter packages for Walrus artifact storage and MemWal long-term memory so LeadFlow can persist verifiable sales workflow evidence and recall lead memory.

**Architecture:** The API and agents must depend on small interfaces, not SDK-specific code. `packages/walrus` owns artifact serialization, upload, retrieval metadata, and local test fakes. `packages/memwal` owns memory write, recall, and lead-scoped memory summaries. Both adapters expose deterministic fake clients for tests and environment-driven real clients for runtime.

**Tech Stack:** TypeScript, Zod, Vitest, Node fetch, Walrus HTTP/CLI-compatible adapter, MemWal HTTP-compatible adapter.

---

## Prerequisites

This plan assumes Plan 1 has been implemented and the following packages exist:

```text
packages/core
packages/db
apps/api
prisma/schema.prisma
```

Run before starting:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all existing tests, typecheck, and build pass.

## File Structure

Create:

```text
packages/walrus/package.json
packages/walrus/tsconfig.json
packages/walrus/src/index.ts
packages/walrus/src/types.ts
packages/walrus/src/artifact.ts
packages/walrus/src/client.ts
packages/walrus/src/fake-client.ts
packages/walrus/src/env.ts
packages/walrus/src/artifact.test.ts

packages/memwal/package.json
packages/memwal/tsconfig.json
packages/memwal/src/index.ts
packages/memwal/src/types.ts
packages/memwal/src/client.ts
packages/memwal/src/fake-client.ts
packages/memwal/src/env.ts
packages/memwal/src/memory.test.ts
```

Modify:

```text
apps/api/package.json
apps/api/src/app.ts
apps/api/src/routes/artifacts.ts
apps/api/src/routes/memories.ts
apps/api/src/fixtures/demo-data.ts
apps/api/src/app.test.ts
package.json
```

Reference:

```text
docs/superpowers/specs/2026-06-11-leadflow-memory-design.md
docs/architecture/data-state-model-zh.md
docs/architecture/api-design-zh.md
```

---

### Task 1: Create Walrus Package Contract

**Files:**

- Create: `packages/walrus/package.json`
- Create: `packages/walrus/tsconfig.json`
- Create: `packages/walrus/src/types.ts`
- Create: `packages/walrus/src/index.ts`
- Create: `packages/walrus/src/artifact.test.ts`

- [ ] **Step 1: Create package manifest**

Create `packages/walrus/package.json`:

```json
{
  "name": "@leadflow/walrus",
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

Create `packages/walrus/tsconfig.json`:

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

- [ ] **Step 2: Write failing artifact tests**

Create `packages/walrus/src/artifact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createArtifactPayload, FakeWalrusArtifactClient } from "./index.js";

describe("Walrus artifacts", () => {
  it("creates deterministic JSON artifact payloads", () => {
    const payload = createArtifactPayload({
      leadId: "lead_001",
      type: "conversation_log",
      data: { messages: [{ role: "customer", text: "预算 130 万以内" }] },
    });

    expect(payload.fileName).toBe("lead_001-conversation_log.json");
    expect(payload.contentType).toBe("application/json");
    expect(payload.body).toContain("\"leadId\":\"lead_001\"");
  });

  it("stores and reads an artifact through the fake client", async () => {
    const client = new FakeWalrusArtifactClient();
    const payload = createArtifactPayload({
      leadId: "lead_001",
      type: "handoff_proof",
      data: { recoveredBy: "worker-2" },
    });

    const stored = await client.store(payload);
    const loaded = await client.read(stored.blobId);

    expect(stored.blobId).toMatch(/^fake_blob_/);
    expect(loaded.body).toBe(payload.body);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm --filter @leadflow/walrus test
```

Expected: FAIL because `./index.js` is missing.

- [ ] **Step 4: Add Walrus types**

Create `packages/walrus/src/types.ts`:

```ts
export type WalrusArtifactType =
  | "source_snapshot"
  | "lead_discovery_report"
  | "conversation_log"
  | "conversion_decision"
  | "memory_diff"
  | "followup_report"
  | "handoff_proof";

export type WalrusArtifactPayload = {
  leadId: string;
  type: WalrusArtifactType;
  fileName: string;
  contentType: "application/json";
  body: string;
};

export type StoredWalrusArtifact = {
  id: string;
  leadId: string;
  type: WalrusArtifactType;
  blobId: string;
  suiObjectId?: string;
  fileName: string;
  contentType: "application/json";
  sizeBytes: number;
  storedAt: string;
};

export type WalrusArtifactClient = {
  store(payload: WalrusArtifactPayload): Promise<StoredWalrusArtifact>;
  read(blobId: string): Promise<WalrusArtifactPayload>;
};
```

- [ ] **Step 5: Export empty implementation to confirm next failure**

Create `packages/walrus/src/index.ts`:

```ts
export * from "./types.js";
```

Run:

```bash
pnpm --filter @leadflow/walrus test
```

Expected: FAIL because `createArtifactPayload` and `FakeWalrusArtifactClient` are not exported.

---

### Task 2: Implement Walrus Artifact Serialization and Fake Client

**Files:**

- Create: `packages/walrus/src/artifact.ts`
- Create: `packages/walrus/src/fake-client.ts`
- Modify: `packages/walrus/src/index.ts`

- [ ] **Step 1: Implement artifact serialization**

Create `packages/walrus/src/artifact.ts`:

```ts
import type { WalrusArtifactPayload, WalrusArtifactType } from "./types.js";

export function createArtifactPayload(input: {
  leadId: string;
  type: WalrusArtifactType;
  data: unknown;
}): WalrusArtifactPayload {
  return {
    leadId: input.leadId,
    type: input.type,
    fileName: `${input.leadId}-${input.type}.json`,
    contentType: "application/json",
    body: JSON.stringify({
      leadId: input.leadId,
      type: input.type,
      data: input.data,
      createdAt: new Date().toISOString(),
    }),
  };
}
```

- [ ] **Step 2: Implement fake client**

Create `packages/walrus/src/fake-client.ts`:

```ts
import type {
  StoredWalrusArtifact,
  WalrusArtifactClient,
  WalrusArtifactPayload,
} from "./types.js";

export class FakeWalrusArtifactClient implements WalrusArtifactClient {
  private readonly payloads = new Map<string, WalrusArtifactPayload>();
  private sequence = 0;

  async store(payload: WalrusArtifactPayload): Promise<StoredWalrusArtifact> {
    this.sequence += 1;
    const blobId = `fake_blob_${this.sequence.toString().padStart(4, "0")}`;
    this.payloads.set(blobId, payload);

    return {
      id: `artifact_${this.sequence.toString().padStart(4, "0")}`,
      leadId: payload.leadId,
      type: payload.type,
      blobId,
      fileName: payload.fileName,
      contentType: payload.contentType,
      sizeBytes: Buffer.byteLength(payload.body),
      storedAt: new Date().toISOString(),
    };
  }

  async read(blobId: string): Promise<WalrusArtifactPayload> {
    const payload = this.payloads.get(blobId);
    if (!payload) {
      throw new Error(`Walrus artifact not found: ${blobId}`);
    }
    return payload;
  }
}
```

- [ ] **Step 3: Export implementation**

Modify `packages/walrus/src/index.ts`:

```ts
export * from "./artifact.js";
export * from "./fake-client.js";
export * from "./types.js";
```

- [ ] **Step 4: Verify Walrus tests**

Run:

```bash
pnpm --filter @leadflow/walrus test
```

Expected: PASS.

- [ ] **Step 5: Commit Walrus fake adapter**

Run:

```bash
git add packages/walrus
git commit -m "feat: add walrus artifact adapter contract"
```

Expected: commit succeeds.

---

### Task 3: Add Environment-Driven Walrus HTTP Client

**Files:**

- Create: `packages/walrus/src/env.ts`
- Create: `packages/walrus/src/client.ts`
- Modify: `packages/walrus/src/index.ts`
- Modify: `packages/walrus/src/artifact.test.ts`

- [ ] **Step 1: Add config tests**

Append to `packages/walrus/src/artifact.test.ts`:

```ts
import { createWalrusClientFromEnv } from "./env.js";

describe("Walrus client configuration", () => {
  it("uses fake client when WALRUS_MODE=fake", () => {
    const client = createWalrusClientFromEnv({ WALRUS_MODE: "fake" });
    expect(client).toBeInstanceOf(FakeWalrusArtifactClient);
  });
});
```

Run:

```bash
pnpm --filter @leadflow/walrus test
```

Expected: FAIL because `./env.js` does not exist.

- [ ] **Step 2: Implement HTTP client**

Create `packages/walrus/src/client.ts`:

```ts
import type {
  StoredWalrusArtifact,
  WalrusArtifactClient,
  WalrusArtifactPayload,
} from "./types.js";

type WalrusHttpClientOptions = {
  publisherUrl: string;
  aggregatorUrl: string;
};

export class WalrusHttpArtifactClient implements WalrusArtifactClient {
  constructor(private readonly options: WalrusHttpClientOptions) {}

  async store(payload: WalrusArtifactPayload): Promise<StoredWalrusArtifact> {
    const response = await fetch(`${this.options.publisherUrl}/v1/blobs`, {
      method: "PUT",
      headers: { "content-type": payload.contentType },
      body: payload.body,
    });

    if (!response.ok) {
      throw new Error(`Walrus upload failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      newlyCreated?: { blobObject?: { blobId?: string; id?: string } };
      alreadyCertified?: { blobId?: string; event?: { blobId?: string } };
    };

    const blobId =
      json.newlyCreated?.blobObject?.blobId ??
      json.alreadyCertified?.blobId ??
      json.alreadyCertified?.event?.blobId;

    if (!blobId) {
      throw new Error("Walrus upload response did not include blobId");
    }

    return {
      id: `artifact_${blobId}`,
      leadId: payload.leadId,
      type: payload.type,
      blobId,
      suiObjectId: json.newlyCreated?.blobObject?.id,
      fileName: payload.fileName,
      contentType: payload.contentType,
      sizeBytes: Buffer.byteLength(payload.body),
      storedAt: new Date().toISOString(),
    };
  }

  async read(blobId: string): Promise<WalrusArtifactPayload> {
    const response = await fetch(`${this.options.aggregatorUrl}/v1/blobs/${blobId}`);
    if (!response.ok) {
      throw new Error(`Walrus read failed with status ${response.status}`);
    }
    const body = await response.text();
    const parsed = JSON.parse(body) as { leadId: string; type: WalrusArtifactPayload["type"] };

    return {
      leadId: parsed.leadId,
      type: parsed.type,
      fileName: `${parsed.leadId}-${parsed.type}.json`,
      contentType: "application/json",
      body,
    };
  }
}
```

- [ ] **Step 3: Implement environment factory**

Create `packages/walrus/src/env.ts`:

```ts
import { WalrusHttpArtifactClient } from "./client.js";
import { FakeWalrusArtifactClient } from "./fake-client.js";
import type { WalrusArtifactClient } from "./types.js";

export type WalrusEnv = {
  WALRUS_MODE?: string;
  WALRUS_PUBLISHER_URL?: string;
  WALRUS_AGGREGATOR_URL?: string;
};

export function createWalrusClientFromEnv(env: WalrusEnv = process.env): WalrusArtifactClient {
  if (env.WALRUS_MODE === "fake") {
    return new FakeWalrusArtifactClient();
  }

  if (!env.WALRUS_PUBLISHER_URL || !env.WALRUS_AGGREGATOR_URL) {
    throw new Error("Set WALRUS_MODE=fake or provide WALRUS_PUBLISHER_URL and WALRUS_AGGREGATOR_URL");
  }

  return new WalrusHttpArtifactClient({
    publisherUrl: env.WALRUS_PUBLISHER_URL,
    aggregatorUrl: env.WALRUS_AGGREGATOR_URL,
  });
}
```

- [ ] **Step 4: Export client factory**

Modify `packages/walrus/src/index.ts`:

```ts
export * from "./artifact.js";
export * from "./client.js";
export * from "./env.js";
export * from "./fake-client.js";
export * from "./types.js";
```

- [ ] **Step 5: Verify Walrus package**

Run:

```bash
pnpm --filter @leadflow/walrus test
pnpm --filter @leadflow/walrus typecheck
```

Expected: both commands pass.

---

### Task 4: Create MemWal Package Contract

**Files:**

- Create: `packages/memwal/package.json`
- Create: `packages/memwal/tsconfig.json`
- Create: `packages/memwal/src/types.ts`
- Create: `packages/memwal/src/index.ts`
- Create: `packages/memwal/src/memory.test.ts`

- [ ] **Step 1: Create package manifest**

Create `packages/memwal/package.json`:

```json
{
  "name": "@leadflow/memwal",
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

Create `packages/memwal/tsconfig.json`:

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

- [ ] **Step 2: Write failing memory tests**

Create `packages/memwal/src/memory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FakeMemWalClient } from "./index.js";

describe("MemWal memory client", () => {
  it("writes and recalls lead-scoped memory", async () => {
    const client = new FakeMemWalClient();

    const written = await client.writeMemory({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      content: "客户预算 130 万以内，关注渝北三房。",
      metadata: {
        source: "conversion",
        confidence: 0.92,
        artifactRefs: ["artifact_001"],
      },
    });

    const recalled = await client.recall({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      query: "客户预算",
      limit: 5,
    });

    expect(written.id).toMatch(/^mem_/);
    expect(recalled[0]?.content).toContain("130 万");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm --filter @leadflow/memwal test
```

Expected: FAIL because `./index.js` is missing.

- [ ] **Step 4: Add MemWal types**

Create `packages/memwal/src/types.ts`:

```ts
export type MemorySource = "discovery" | "conversion" | "handoff" | "manual";

export type WriteMemoryInput = {
  leadId: string;
  memorySpaceId: string;
  content: string;
  metadata: {
    source: MemorySource;
    confidence: number;
    artifactRefs: string[];
  };
};

export type LeadMemory = {
  id: string;
  leadId: string;
  memorySpaceId: string;
  content: string;
  metadata: WriteMemoryInput["metadata"];
  createdAt: string;
};

export type RecallMemoryInput = {
  leadId: string;
  memorySpaceId: string;
  query: string;
  limit: number;
};

export type MemWalClient = {
  writeMemory(input: WriteMemoryInput): Promise<LeadMemory>;
  recall(input: RecallMemoryInput): Promise<LeadMemory[]>;
};
```

- [ ] **Step 5: Export types and verify next failure**

Create `packages/memwal/src/index.ts`:

```ts
export * from "./types.js";
```

Run:

```bash
pnpm --filter @leadflow/memwal test
```

Expected: FAIL because `FakeMemWalClient` is not exported.

---

### Task 5: Implement MemWal Fake and HTTP Clients

**Files:**

- Create: `packages/memwal/src/fake-client.ts`
- Create: `packages/memwal/src/client.ts`
- Create: `packages/memwal/src/env.ts`
- Modify: `packages/memwal/src/index.ts`
- Modify: `packages/memwal/src/memory.test.ts`

- [ ] **Step 1: Implement fake client**

Create `packages/memwal/src/fake-client.ts`:

```ts
import type {
  LeadMemory,
  MemWalClient,
  RecallMemoryInput,
  WriteMemoryInput,
} from "./types.js";

export class FakeMemWalClient implements MemWalClient {
  private readonly memories: LeadMemory[] = [];
  private sequence = 0;

  async writeMemory(input: WriteMemoryInput): Promise<LeadMemory> {
    this.sequence += 1;
    const memory: LeadMemory = {
      id: `mem_${this.sequence.toString().padStart(4, "0")}`,
      leadId: input.leadId,
      memorySpaceId: input.memorySpaceId,
      content: input.content,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };
    this.memories.push(memory);
    return memory;
  }

  async recall(input: RecallMemoryInput): Promise<LeadMemory[]> {
    const queryTokens = input.query.split(/\s+/).filter(Boolean);
    return this.memories
      .filter((memory) => memory.leadId === input.leadId)
      .filter((memory) => memory.memorySpaceId === input.memorySpaceId)
      .filter((memory) => queryTokens.length === 0 || queryTokens.some((token) => memory.content.includes(token)))
      .slice(0, input.limit);
  }
}
```

- [ ] **Step 2: Implement HTTP client**

Create `packages/memwal/src/client.ts`:

```ts
import type {
  LeadMemory,
  MemWalClient,
  RecallMemoryInput,
  WriteMemoryInput,
} from "./types.js";

type MemWalHttpClientOptions = {
  baseUrl: string;
  delegateKey: string;
};

export class MemWalHttpClient implements MemWalClient {
  constructor(private readonly options: MemWalHttpClientOptions) {}

  async writeMemory(input: WriteMemoryInput): Promise<LeadMemory> {
    const response = await fetch(`${this.options.baseUrl}/memories`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.delegateKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`MemWal write failed with status ${response.status}`);
    }

    return (await response.json()) as LeadMemory;
  }

  async recall(input: RecallMemoryInput): Promise<LeadMemory[]> {
    const response = await fetch(`${this.options.baseUrl}/memories/recall`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.delegateKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`MemWal recall failed with status ${response.status}`);
    }

    return (await response.json()) as LeadMemory[];
  }
}
```

- [ ] **Step 3: Implement environment factory**

Create `packages/memwal/src/env.ts`:

```ts
import { MemWalHttpClient } from "./client.js";
import { FakeMemWalClient } from "./fake-client.js";
import type { MemWalClient } from "./types.js";

export type MemWalEnv = {
  MEMWAL_MODE?: string;
  MEMWAL_BASE_URL?: string;
  MEMWAL_DELEGATE_KEY?: string;
};

export function createMemWalClientFromEnv(env: MemWalEnv = process.env): MemWalClient {
  if (env.MEMWAL_MODE === "fake") {
    return new FakeMemWalClient();
  }

  if (!env.MEMWAL_BASE_URL || !env.MEMWAL_DELEGATE_KEY) {
    throw new Error("Set MEMWAL_MODE=fake or provide MEMWAL_BASE_URL and MEMWAL_DELEGATE_KEY");
  }

  return new MemWalHttpClient({
    baseUrl: env.MEMWAL_BASE_URL,
    delegateKey: env.MEMWAL_DELEGATE_KEY,
  });
}
```

- [ ] **Step 4: Export clients**

Modify `packages/memwal/src/index.ts`:

```ts
export * from "./client.js";
export * from "./env.js";
export * from "./fake-client.js";
export * from "./types.js";
```

- [ ] **Step 5: Add environment test**

Append to `packages/memwal/src/memory.test.ts`:

```ts
import { createMemWalClientFromEnv } from "./env.js";

describe("MemWal client configuration", () => {
  it("uses fake client when MEMWAL_MODE=fake", () => {
    const client = createMemWalClientFromEnv({ MEMWAL_MODE: "fake" });
    expect(client).toBeInstanceOf(FakeMemWalClient);
  });
});
```

- [ ] **Step 6: Verify MemWal package**

Run:

```bash
pnpm --filter @leadflow/memwal test
pnpm --filter @leadflow/memwal typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Commit MemWal adapter**

Run:

```bash
git add packages/memwal
git commit -m "feat: add memwal memory adapter contract"
```

Expected: commit succeeds.

---

### Task 6: Wire Memory and Artifact Adapters into API

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/artifacts.ts`
- Modify: `apps/api/src/routes/memories.ts`
- Modify: `apps/api/src/app.test.ts`

- [ ] **Step 1: Add API package dependencies**

Modify `apps/api/package.json` dependencies:

```json
{
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "@leadflow/core": "workspace:*",
    "@leadflow/memwal": "workspace:*",
    "@leadflow/playbook": "workspace:*",
    "@leadflow/walrus": "workspace:*",
    "hono": "^4.6.10",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Add integration tests**

Append to `apps/api/src/app.test.ts`:

```ts
it("stores a Walrus artifact through the API", async () => {
  const response = await app.request("/api/artifacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leadId: "lead_001",
      type: "handoff_proof",
      data: { recoveredBy: "worker-2" },
    }),
  });

  expect(response.status).toBe(201);
  const json = await response.json();
  expect(json.blobId).toMatch(/^fake_blob_/);
});

it("writes and recalls MemWal memory through the API", async () => {
  const writeResponse = await app.request("/api/memories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      content: "客户关注渝北三房，总价 130 万以内。",
      metadata: {
        source: "conversion",
        confidence: 0.9,
        artifactRefs: [],
      },
    }),
  });

  expect(writeResponse.status).toBe(201);

  const recallResponse = await app.request("/api/memories/recall", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      query: "渝北",
      limit: 3,
    }),
  });

  expect(recallResponse.status).toBe(200);
  const json = await recallResponse.json();
  expect(json.memories[0].content).toContain("渝北");
});
```

Run:

```bash
pnpm --filter @leadflow/api test
```

Expected: FAIL because POST memory/artifact routes are missing.

- [ ] **Step 3: Add dependency injection to app**

Modify `apps/api/src/app.ts`:

```ts
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
import { artifactsRoute } from "./routes/artifacts.js";
import { campaignsRoute } from "./routes/campaigns.js";
import { conversationsRoute } from "./routes/conversations.js";
import { dashboardRoute } from "./routes/dashboard.js";
import { devicesRoute } from "./routes/devices.js";
import { leadsRoute } from "./routes/leads.js";
import { memoriesRoute } from "./routes/memories.js";
import { workflowsRoute } from "./routes/workflows.js";

export type ApiServices = {
  memwal: MemWalClient;
  walrus: WalrusArtifactClient;
};

// 测试专用：只允许在 vitest 中使用，生产入口不得调用。
export function createFakeServices(): ApiServices {
  return {
    memwal: new FakeMemWalClient(),
    walrus: new FakeWalrusArtifactClient(),
  };
}

// 生产/演示入口：根据环境变量接线真实客户端。
// 配置缺失时环境工厂会直接抛错，不允许静默回退到 fake。
export function createServicesFromEnv(env: NodeJS.ProcessEnv = process.env): ApiServices {
  return {
    memwal: createMemWalClientFromEnv(env),
    walrus: createWalrusClientFromEnv(env),
  };
}

export function createApp(services: ApiServices) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/api/artifacts", artifactsRoute(services));
  app.route("/api/campaigns", campaignsRoute);
  app.route("/api/leads", leadsRoute);
  app.route("/api/leads", conversationsRoute);
  app.route("/api/dashboard", dashboardRoute);
  app.route("/api/devices", devicesRoute);
  app.route("/api/memories", memoriesRoute(services));
  app.route("/api/workflows", workflowsRoute);

  return app;
}
```

`createApp` 不再提供 fake 默认值，也不再导出模块级 `app` 单例：服务必须显式注入，避免生产入口在无配置时静默运行在 mock 模式。

Modify `apps/api/src/index.ts` so the server entry wires real clients from env:

```ts
import { serve } from "@hono/node-server";
import { createApp, createServicesFromEnv } from "./app.js";

const port = Number(process.env.PORT ?? 3001);

serve({
  fetch: createApp(createServicesFromEnv()).fetch,
  port,
});

console.log(`LeadFlow API listening on http://127.0.0.1:${port}`);
```

Update `apps/api/src/app.test.ts` to build the app with fake services instead of importing a shared `app` instance:

```ts
import { createApp, createFakeServices } from "./app.js";

const app = createApp(createFakeServices());
```

- [ ] **Step 4: Add artifact route**

Modify `apps/api/src/routes/artifacts.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { createArtifactPayload } from "@leadflow/walrus";
import type { ApiServices } from "../app.js";

const StoreArtifactBodySchema = z.object({
  leadId: z.string(),
  type: z.enum([
    "source_snapshot",
    "lead_discovery_report",
    "conversation_log",
    "conversion_decision",
    "memory_diff",
    "followup_report",
    "handoff_proof",
  ]),
  data: z.unknown(),
});

export function artifactsRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/", async (c) => {
    const body = StoreArtifactBodySchema.parse(await c.req.json());
    const payload = createArtifactPayload(body);
    const stored = await services.walrus.store(payload);
    return c.json(stored, 201);
  });

  route.get("/:blobId", async (c) => {
    const payload = await services.walrus.read(c.req.param("blobId"));
    return c.json(payload);
  });

  return route;
}
```

- [ ] **Step 5: Add memory route**

Modify `apps/api/src/routes/memories.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { ApiServices } from "../app.js";

const WriteMemoryBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  content: z.string().min(1),
  metadata: z.object({
    source: z.enum(["discovery", "conversion", "handoff", "manual"]),
    confidence: z.number().min(0).max(1),
    artifactRefs: z.array(z.string()),
  }),
});

const RecallMemoryBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  query: z.string(),
  limit: z.number().int().positive().max(20),
});

export function memoriesRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/", async (c) => {
    const body = WriteMemoryBodySchema.parse(await c.req.json());
    const memory = await services.memwal.writeMemory(body);
    return c.json(memory, 201);
  });

  route.post("/recall", async (c) => {
    const body = RecallMemoryBodySchema.parse(await c.req.json());
    const memories = await services.memwal.recall(body);
    return c.json({ memories });
  });

  return route;
}
```

- [ ] **Step 6: Verify API adapter integration**

Run:

```bash
pnpm --filter @leadflow/api test
pnpm --filter @leadflow/api typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Commit API wiring**

Run:

```bash
git add apps/api packages/walrus packages/memwal
git commit -m "feat: wire memory and artifact adapters into api"
```

Expected: commit succeeds.

---

### Task 7: Verify Adapter Plan

**Files:**

- Modify: none

- [ ] **Step 1: Run package tests**

Run:

```bash
pnpm --filter @leadflow/walrus test
pnpm --filter @leadflow/memwal test
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

Expected: all workspace tests, typecheck, and build pass.

- [ ] **Step 3: Commit final verification if needed**

Run:

```bash
git status --short
```

Expected: no uncommitted changes. If generated files remain, add the exact changed files and commit with:

```bash
git commit -m "chore: finalize walrus memwal adapters"
```

Expected: commit succeeds or no commit is needed.

---

## Self-Review

Spec coverage:

- Walrus artifact upload/read path: Tasks 1-3 and Task 6.
- MemWal write/recall path: Tasks 4-6.
- API access to memory and artifacts: Task 6.
- Fake clients for deterministic local development: Tasks 2 and 5.

Deferred to later plans:

- Mastra workflow calls to these adapters.
- Real UI display of adapter responses.
- End-to-end demo seed and orchestration.
- Seal privacy layer.

Placeholder scan:

- This plan contains no unresolved implementation placeholders.

Type consistency:

- Artifact type names match the master spec.
- Memory metadata sources match discovery, conversion, handoff, and manual flows.
- API service injection keeps runtime clients swappable.
