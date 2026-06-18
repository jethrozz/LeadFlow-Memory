# LeadFlow xhs-chat MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the existing `mcp-xhs-chat` capability so LeadFlow can sync Xiaohongshu conversations and send private messages through a real chat channel.

**Architecture:** `packages/connectors` owns platform connector interfaces and an XHS chat client. The first implementation provides a deterministic fake client (test-only) plus a real MCP stdio client built on `@modelcontextprotocol/sdk` that keeps a **single long-lived connection** to `mcp-xhs-chat` and calls `xhs_connect_device`, `xhs_disconnect_device`, `xhs_get_conversation`, and `xhs_send_private_message` via JSON-RPC. A per-call spawned process is NOT acceptable: mcp-xhs-chat speaks the MCP protocol over stdio (initialize handshake required), and device connection state lives inside the server process, so it must survive across tool calls. API routes use the connector through dependency injection, keeping manual fallback available.

**Tech Stack:** TypeScript, Zod, Vitest, Hono, Node child process boundary for MCP command invocation.

---

## Prerequisites

This plan assumes Plans 1-3 are complete.

Existing external MCP project:

```text
/Users/jethrozz/Documents/UGit/lead-hunter-client/xhs-lead-converter/mcp-xhs-chat
```

Expected tool names from the existing project:

```text
xhs_connect_device
xhs_disconnect_device
xhs_get_conversation
xhs_send_private_message
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
packages/connectors/package.json
packages/connectors/tsconfig.json
packages/connectors/src/index.ts
packages/connectors/src/xhs-chat/types.ts
packages/connectors/src/xhs-chat/fake-client.ts
packages/connectors/src/xhs-chat/mcp-client.ts
packages/connectors/src/xhs-chat/env.ts
packages/connectors/src/xhs-chat/xhs-chat.test.ts
```

Modify:

```text
apps/api/package.json
apps/api/src/app.ts
apps/api/src/routes/conversations.ts
apps/api/src/routes/devices.ts
apps/api/src/app.test.ts
```

Reference:

```text
docs/features/conversion-agent-zh.md
docs/architecture/api-design-zh.md
docs/superpowers/specs/2026-06-11-leadflow-memory-design.md
```

---

### Task 1: Create Connector Package and XHS Chat Types

**Files:**

- Create: `packages/connectors/package.json`
- Create: `packages/connectors/tsconfig.json`
- Create: `packages/connectors/src/xhs-chat/types.ts`
- Create: `packages/connectors/src/index.ts`
- Create: `packages/connectors/src/xhs-chat/xhs-chat.test.ts`

- [ ] **Step 1: Create package manifest**

Create `packages/connectors/package.json`:

```json
{
  "name": "@leadflow/connectors",
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
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Create `packages/connectors/tsconfig.json`:

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

- [ ] **Step 2: Write failing connector tests**

Create `packages/connectors/src/xhs-chat/xhs-chat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FakeXhsChatClient } from "../index.js";

describe("XHS chat connector", () => {
  it("syncs conversation messages for a lead identity", async () => {
    const client = new FakeXhsChatClient();
    const messages = await client.getConversation({
      deviceId: "device-1",
      xhsUserId: "xhs_001",
      xhsUsername: "重庆买房小陈",
      sinceTime: "2026-06-11T10:00:00.000Z",
    });

    expect(messages[0]?.content).toContain("渝北");
  });

  it("sends private messages", async () => {
    const client = new FakeXhsChatClient();
    const result = await client.sendPrivateMessage({
      deviceId: "device-1",
      xhsUserId: "xhs_001",
      xhsUsername: "重庆买房小陈",
      message: "我整理几套渝北三房给你，可以加微信吗？",
    });

    expect(result.status).toBe("sent");
  });
});
```

Run:

```bash
pnpm --filter @leadflow/connectors test
```

Expected: FAIL because `../index.js` is missing.

- [ ] **Step 3: Add XHS chat types**

Create `packages/connectors/src/xhs-chat/types.ts`:

```ts
export type XhsConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  sentAt: string;
};

export type XhsLeadIdentity = {
  deviceId: string;
  xhsUserId?: string;
  xhsUsername?: string;
};

export type XhsGetConversationInput = XhsLeadIdentity & {
  sinceTime?: string;
};

export type XhsSendPrivateMessageInput = XhsLeadIdentity & {
  message: string;
};

export type XhsSendPrivateMessageResult = {
  status: "sent";
  remoteMessageId?: string;
  sentAt: string;
};

export type XhsDeviceInput = {
  deviceId: string;
  adbAddress?: string;
};

export type XhsDeviceResult = {
  deviceId: string;
  status: "connected" | "disconnected";
  adbAddress?: string;
  updatedAt: string;
};

export type XhsChatClient = {
  connectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult>;
  disconnectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult>;
  getConversation(input: XhsGetConversationInput): Promise<XhsConversationMessage[]>;
  sendPrivateMessage(input: XhsSendPrivateMessageInput): Promise<XhsSendPrivateMessageResult>;
};
```

Create `packages/connectors/src/index.ts`:

```ts
export * from "./xhs-chat/types.js";
```

Run:

```bash
pnpm --filter @leadflow/connectors test
```

Expected: FAIL because `FakeXhsChatClient` is not exported.

---

### Task 2: Implement Fake XHS Chat Client

**Files:**

- Create: `packages/connectors/src/xhs-chat/fake-client.ts`
- Modify: `packages/connectors/src/index.ts`

- [ ] **Step 1: Implement fake client**

Create `packages/connectors/src/xhs-chat/fake-client.ts`:

```ts
import type {
  XhsChatClient,
  XhsConversationMessage,
  XhsDeviceInput,
  XhsDeviceResult,
  XhsGetConversationInput,
  XhsSendPrivateMessageInput,
  XhsSendPrivateMessageResult,
} from "./types.js";

export class FakeXhsChatClient implements XhsChatClient {
  private readonly outbound: XhsConversationMessage[] = [];

  async connectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    return {
      deviceId: input.deviceId,
      adbAddress: input.adbAddress,
      status: "connected",
      updatedAt: new Date().toISOString(),
    };
  }

  async disconnectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    return {
      deviceId: input.deviceId,
      adbAddress: input.adbAddress,
      status: "disconnected",
      updatedAt: new Date().toISOString(),
    };
  }

  async getConversation(_input: XhsGetConversationInput): Promise<XhsConversationMessage[]> {
    return [
      {
        id: "xhs_msg_001",
        direction: "inbound",
        content: "想看看渝北 130 万以内的三房，新房有没有补贴？",
        sentAt: "2026-06-11T10:00:00.000Z",
      },
      ...this.outbound,
    ];
  }

  async sendPrivateMessage(input: XhsSendPrivateMessageInput): Promise<XhsSendPrivateMessageResult> {
    const message: XhsConversationMessage = {
      id: `xhs_msg_out_${this.outbound.length + 1}`,
      direction: "outbound",
      content: input.message,
      sentAt: new Date().toISOString(),
    };
    this.outbound.push(message);
    return {
      status: "sent",
      remoteMessageId: message.id,
      sentAt: message.sentAt,
    };
  }
}
```

- [ ] **Step 2: Export fake client**

Modify `packages/connectors/src/index.ts`:

```ts
export * from "./xhs-chat/fake-client.js";
export * from "./xhs-chat/types.js";
```

- [ ] **Step 3: Verify connector fake client**

Run:

```bash
pnpm --filter @leadflow/connectors test
pnpm --filter @leadflow/connectors typecheck
```

Expected: both commands pass.

- [ ] **Step 4: Commit connector package**

Run:

```bash
git add packages/connectors
git commit -m "feat: add xhs chat connector contract"
```

Expected: commit succeeds.

---

### Task 3: Add MCP Stdio Client Boundary

**Files:**

- Create: `packages/connectors/src/xhs-chat/mcp-client.ts`
- Create: `packages/connectors/src/xhs-chat/env.ts`
- Modify: `packages/connectors/src/index.ts`
- Modify: `packages/connectors/src/xhs-chat/xhs-chat.test.ts`

- [ ] **Step 1: Add environment factory test**

Append to `packages/connectors/src/xhs-chat/xhs-chat.test.ts`:

```ts
import { createXhsChatClientFromEnv } from "../index.js";

describe("XHS chat client configuration", () => {
  it("uses fake client when XHS_CHAT_MODE=fake", () => {
    const client = createXhsChatClientFromEnv({ XHS_CHAT_MODE: "fake" });
    expect(client).toBeInstanceOf(FakeXhsChatClient);
  });
});
```

Run:

```bash
pnpm --filter @leadflow/connectors test
```

Expected: FAIL because `createXhsChatClientFromEnv` does not exist.

- [ ] **Step 2: Implement MCP stdio client**

Create `packages/connectors/src/xhs-chat/mcp-client.ts`.

实现要求：

- 使用 `@modelcontextprotocol/sdk` 的 `Client` + `StdioClientTransport`，走标准 MCP initialize 握手和 JSON-RPC 调用，而不是把工具名当命令行参数。
- 维持**单一长连接**（懒加载、复用），保证 `xhs_connect_device` 建立的设备状态在后续 `xhs_get_conversation` / `xhs_send_private_message` 调用中仍然有效。
- 工具结果从 MCP `content` 的 text 块中解析 JSON。

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  XhsChatClient,
  XhsConversationMessage,
  XhsDeviceInput,
  XhsDeviceResult,
  XhsGetConversationInput,
  XhsSendPrivateMessageInput,
  XhsSendPrivateMessageResult,
} from "./types.js";

type XhsMcpStdioClientOptions = {
  command: string;
  args: string[];
  cwd: string;
};

export class XhsMcpStdioClient implements XhsChatClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly options: XhsMcpStdioClientOptions) {}

  // 设备连接状态保存在 mcp-xhs-chat 进程内，必须跨调用复用同一连接。
  private getClient(): Promise<Client> {
    if (this.client) {
      return Promise.resolve(this.client);
    }
    if (!this.connecting) {
      this.connecting = (async () => {
        const transport = new StdioClientTransport({
          command: this.options.command,
          args: this.options.args,
          cwd: this.options.cwd,
        });
        const client = new Client({ name: "leadflow-api", version: "0.1.0" });
        await client.connect(transport);
        this.client = client;
        return client;
      })().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  async connectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    return this.callTool<XhsDeviceResult>("xhs_connect_device", {
      device_id: input.deviceId,
      adb_address: input.adbAddress,
    });
  }

  async disconnectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    return this.callTool<XhsDeviceResult>("xhs_disconnect_device", {
      device_id: input.deviceId,
    });
  }

  async getConversation(input: XhsGetConversationInput): Promise<XhsConversationMessage[]> {
    return this.callTool<XhsConversationMessage[]>("xhs_get_conversation", {
      device_id: input.deviceId,
      xhs_user_id: input.xhsUserId,
      xhs_username: input.xhsUsername,
      since_time: input.sinceTime,
    });
  }

  async sendPrivateMessage(input: XhsSendPrivateMessageInput): Promise<XhsSendPrivateMessageResult> {
    return this.callTool<XhsSendPrivateMessageResult>("xhs_send_private_message", {
      device_id: input.deviceId,
      xhs_user_id: input.xhsUserId,
      xhs_username: input.xhsUsername,
      message: input.message,
    });
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  private async callTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const client = await this.getClient();
    const result = await client.callTool({ name: tool, arguments: args });
    if (result.isError) {
      throw new Error(`mcp-xhs-chat ${tool} failed: ${JSON.stringify(result.content)}`);
    }
    const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
      (block) => block.type === "text" && typeof block.text === "string",
    );
    if (!textBlock?.text) {
      throw new Error(`mcp-xhs-chat ${tool} returned no text content`);
    }
    return JSON.parse(textBlock.text) as T;
  }
}
```

注意：在执行本任务前，先用 MCP inspector 或一次手工调用核对 mcp-xhs-chat 各工具返回的 text JSON 字段名（如 `messages`、`message_sent`），如与 `XhsConversationMessage` 等类型不一致，在 `callTool` 之后做一层字段映射，禁止直接改业务类型去迁就平台返回。

- [ ] **Step 3: Implement environment factory**

Create `packages/connectors/src/xhs-chat/env.ts`:

```ts
import { FakeXhsChatClient } from "./fake-client.js";
import { XhsMcpStdioClient } from "./mcp-client.js";
import type { XhsChatClient } from "./types.js";

export type XhsChatEnv = {
  XHS_CHAT_MODE?: string;
  XHS_CHAT_COMMAND?: string;
  XHS_CHAT_CWD?: string;
};

export function createXhsChatClientFromEnv(env: XhsChatEnv = process.env): XhsChatClient {
  if (env.XHS_CHAT_MODE === "fake") {
    return new FakeXhsChatClient();
  }

  if (!env.XHS_CHAT_COMMAND || !env.XHS_CHAT_CWD) {
    throw new Error("Set XHS_CHAT_MODE=fake or provide XHS_CHAT_COMMAND and XHS_CHAT_CWD");
  }

  // XHS_CHAT_COMMAND 形如 "node dist/index.js"，拆为 command + args 交给 stdio transport。
  const [command, ...args] = env.XHS_CHAT_COMMAND.split(/\s+/);

  return new XhsMcpStdioClient({
    command,
    args,
    cwd: env.XHS_CHAT_CWD,
  });
}
```

- [ ] **Step 4: Export MCP client and env factory**

Modify `packages/connectors/src/index.ts`:

```ts
export * from "./xhs-chat/env.js";
export * from "./xhs-chat/fake-client.js";
export * from "./xhs-chat/mcp-client.js";
export * from "./xhs-chat/types.js";
```

- [ ] **Step 5: Verify connector package**

Run:

```bash
pnpm --filter @leadflow/connectors test
pnpm --filter @leadflow/connectors typecheck
```

Expected: both commands pass.

---

### Task 4: Wire XHS Chat into API Conversation and Device Routes

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/conversations.ts`
- Modify: `apps/api/src/routes/devices.ts`
- Modify: `apps/api/src/app.test.ts`

- [ ] **Step 1: Add API dependency**

Modify `apps/api/package.json` dependencies:

```json
{
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "@leadflow/agents": "workspace:*",
    "@leadflow/connectors": "workspace:*",
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

- [ ] **Step 2: Add API tests**

Append to `apps/api/src/app.test.ts`:

```ts
it("syncs XHS conversation through connector", async () => {
  const response = await app.request("/api/leads/lead_001/conversation/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId: "device-1",
      xhsUserId: "xhs_001",
      xhsUsername: "重庆买房小陈",
    }),
  });

  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.messages[0].content).toContain("渝北");
});

it("sends XHS private message through connector", async () => {
  const response = await app.request("/api/leads/lead_001/conversation/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId: "device-1",
      xhsUserId: "xhs_001",
      xhsUsername: "重庆买房小陈",
      message: "我整理几套渝北三房给你，可以加微信吗？",
    }),
  });

  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.status).toBe("sent");
});
```

Run:

```bash
pnpm --filter @leadflow/api test
```

Expected: FAIL because routes do not use `xhsChat`.

- [ ] **Step 3: Extend API services**

Modify `apps/api/src/app.ts` to include the connector:

```ts
import {
  createXhsChatClientFromEnv,
  FakeXhsChatClient,
  type XhsChatClient,
} from "@leadflow/connectors";

export type ApiServices = {
  llm: LlmProvider;
  memwal: MemWalClient;
  walrus: WalrusArtifactClient;
  xhsChat: XhsChatClient;
  workflows: ReturnType<typeof createWorkflowService>;
};
```

In `createFakeServices()`（测试专用）, instantiate:

```ts
const xhsChat = new FakeXhsChatClient();
```

In `createServicesFromEnv()`（生产/演示入口）, instantiate:

```ts
const xhsChat = createXhsChatClientFromEnv(env);
```

Return `xhsChat` in both services objects and continue passing `services` to `conversationsRoute(services)` and `devicesRoute(services)`. 这样 `apps/api/src/index.ts` 启动时，小红书通道走真实 mcp-xhs-chat，除非环境里**显式**设置 `XHS_CHAT_MODE=fake`。

- [ ] **Step 4: Implement conversation routes**

Modify `apps/api/src/routes/conversations.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { ApiServices } from "../app.js";

const XhsIdentityBodySchema = z.object({
  deviceId: z.string(),
  xhsUserId: z.string().optional(),
  xhsUsername: z.string().optional(),
  sinceTime: z.string().optional(),
});

const SendBodySchema = XhsIdentityBodySchema.extend({
  message: z.string().min(1),
});

export function conversationsRoute(services: ApiServices) {
  const route = new Hono();

  route.get("/:leadId/conversation", (c) =>
    c.json({
      leadId: c.req.param("leadId"),
      messages: [],
    }),
  );

  route.post("/:leadId/conversation/sync", async (c) => {
    const body = XhsIdentityBodySchema.parse(await c.req.json());
    const messages = await services.xhsChat.getConversation(body);
    return c.json({
      leadId: c.req.param("leadId"),
      messages,
    });
  });

  route.post("/:leadId/conversation/send", async (c) => {
    const body = SendBodySchema.parse(await c.req.json());
    const result = await services.xhsChat.sendPrivateMessage(body);
    return c.json({
      leadId: c.req.param("leadId"),
      ...result,
    });
  });

  route.post("/:leadId/conversation/customer-reply", async (c) => {
    const body = z.object({ message: z.string().min(1) }).parse(await c.req.json());
    return c.json({
      leadId: c.req.param("leadId"),
      direction: "inbound",
      content: body.message,
      receivedAt: new Date().toISOString(),
    });
  });

  return route;
}
```

- [ ] **Step 5: Implement device routes**

Modify `apps/api/src/routes/devices.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { ApiServices } from "../app.js";

const DeviceBodySchema = z.object({
  deviceId: z.string(),
  adbAddress: z.string().optional(),
});

export function devicesRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/xhs/connect", async (c) => {
    const body = DeviceBodySchema.parse(await c.req.json());
    return c.json(await services.xhsChat.connectDevice(body));
  });

  route.post("/xhs/disconnect", async (c) => {
    const body = DeviceBodySchema.parse(await c.req.json());
    return c.json(await services.xhsChat.disconnectDevice(body));
  });

  route.get("/xhs", (c) =>
    c.json({
      devices: [{ deviceId: "device-1", status: "connected" }],
    }),
  );

  return route;
}
```

- [ ] **Step 6: Verify API integration**

Run:

```bash
pnpm --filter @leadflow/connectors test
pnpm --filter @leadflow/api test
pnpm --filter @leadflow/api typecheck
```

Expected: all commands pass.

- [ ] **Step 7: Commit XHS integration**

Run:

```bash
git add packages/connectors apps/api
git commit -m "feat: integrate xhs chat connector"
```

Expected: commit succeeds.

---

### Task 5: Verify xhs-chat Plan

**Files:**

- Modify: none

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all workspace checks pass.

- [ ] **Step 2: Document runtime environment**

Add these variables to deployment notes or `.env.example` if that file exists:

```bash
XHS_CHAT_MODE=fake
XHS_CHAT_COMMAND="pnpm mcp-call"
XHS_CHAT_CWD="/Users/jethrozz/Documents/UGit/lead-hunter-client/xhs-lead-converter/mcp-xhs-chat"
```

Expected: local tests continue to use `XHS_CHAT_MODE=fake`; real runtime can point to the external MCP project.

- [ ] **Step 3: Commit env documentation if changed**

Run:

```bash
git status --short
```

Expected: no uncommitted changes. If `.env.example` or docs changed, commit with:

```bash
git add .env.example docs
git commit -m "docs: document xhs chat runtime config"
```

Expected: commit succeeds or no commit is needed.

---

## Self-Review

Spec coverage:

- Reuses existing `mcp-xhs-chat` path and tool names: Task 3.
- Syncs XHS chat records: Task 4.
- Sends XHS private messages: Task 4.
- Keeps manual customer reply fallback: Task 4.
- Device connect/disconnect API: Task 4.

Deferred to later plans:

- Dashboard UI controls for sync/send.
- Demo script orchestration.
- Production-grade MCP session management and retries.

Placeholder scan:

- This plan contains no unresolved implementation placeholders.

Type consistency:

- API request fields use `deviceId`, `xhsUserId`, `xhsUsername`, and `sinceTime`.
- Process client maps those fields to existing MCP parameter names.
