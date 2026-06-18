# LeadFlow XHS Discovery Connector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 基于开源 [xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) 实现 Discovery 模块的真实采集通道：关键词搜索帖子、读取帖子详情和评论区，把社交内容喂给 Discovery workflow，补齐 `docs/features/social-lead-discovery-zh.md` 中"小红书搜索帖子 / 评论区扫描"两个 MVP 必须项。

**Architecture:** `packages/connectors` 新增 `xhs-discovery` 子模块，实现功能文档定义的 `SocialConnector` 语义（searchPosts / getPost / getComments / getCreatorPosts）。真实实现通过 MCP SDK 的 **StreamableHTTPClientTransport** 连接 xiaohongshu-mcp（默认 `http://localhost:18060/mcp`，Go 独立服务，浏览器 cookie 登录态）。注意它与 Plan 4 的 mcp-xhs-chat（stdio + ADB 设备）是**两个独立 MCP 服务、两套登录身份**：xiaohongshu-mcp 负责内容采集，mcp-xhs-chat 负责私聊触达，互不替代。Discovery workflow 路由增加 campaign 驱动模式：搜索 → LLM 相关性过滤 → 评论意向识别 → 逐条走既有的单源 discovery 流程（提取意图、写 MemWal、存 Walrus、落 store）。

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`（StreamableHTTP client）, Zod, Vitest, Hono。外部依赖：xiaohongshu-mcp 服务（Go，用户侧启动并扫码登录）。

**Prerequisites:**

- Plans 1-4、7 已执行（connectors 包、`createServicesFromEnv`、共享 store 均已存在）。
- 本机已部署 xiaohongshu-mcp 并完成扫码登录（登录态持久化在其服务端）。

**Files overview:**

```text
packages/connectors/src/xhs-discovery/types.ts
packages/connectors/src/xhs-discovery/fake-client.ts
packages/connectors/src/xhs-discovery/mcp-client.ts
packages/connectors/src/xhs-discovery/env.ts
packages/connectors/src/xhs-discovery/xhs-discovery.test.ts
packages/connectors/src/index.ts
packages/agents/src/campaign-discovery-workflow.ts
apps/api/src/app.ts
apps/api/src/routes/workflows.ts
apps/api/src/routes/devices.ts
.env.example
```

Reference:

```text
docs/features/social-lead-discovery-zh.md（统一内容模型 SocialPost/SocialComment/LeadSource）
docs/architecture/leadflow-memory-tech-stack-zh.md（MCP 工具接入）
https://github.com/xpzouying/xiaohongshu-mcp
```

---

### Task 0: Verify xiaohongshu-mcp Tool Contracts

**Files:**

- Create: `docs/superpowers/specs/xiaohongshu-mcp-tool-contracts.md`

实现前先用 MCP inspector（或 curl streamable HTTP 端点）对照真实服务核对，并把结果记录成文档：

- [ ] **Step 1: List tools and record schemas**

启动 xiaohongshu-mcp 后执行 `tools/list`，记录以下工具的**确切入参字段名和返回 JSON 结构**：

```text
check_login_status
search_feeds        （关键词、排序、笔记类型、发布时间、地点等过滤参数）
get_feed_detail     （feed id / xsec_token 等定位参数；返回正文、作者、互动数据、评论及子评论）
user_profile        （能否取到博主笔记列表 → 决定 getCreatorPosts 是否可实现）
```

- [ ] **Step 2: Record operational facts**

记录：登录失效时各工具的报错形态；搜索单次返回条数上限；是否有分页参数。这些直接决定 connector 的错误处理和 `maxPostsPerRun` 截断逻辑。

- [ ] **Step 3: Commit contract notes**

```bash
git add docs/superpowers/specs/xiaohongshu-mcp-tool-contracts.md
git commit -m "docs: 记录 xiaohongshu-mcp 工具契约"
```

**门槛**：Task 1 之后所有代码中的字段映射必须引用本文档，禁止凭猜测写字段名。

---

### Task 1: Discovery Connector Types and Fake Client

**Files:**

- Create: `packages/connectors/src/xhs-discovery/types.ts`
- Create: `packages/connectors/src/xhs-discovery/fake-client.ts`
- Create: `packages/connectors/src/xhs-discovery/xhs-discovery.test.ts`
- Modify: `packages/connectors/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/connectors/src/xhs-discovery/xhs-discovery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FakeXhsDiscoveryClient } from "../index.js";

describe("XHS discovery connector", () => {
  it("searches posts by keyword", async () => {
    const client = new FakeXhsDiscoveryClient();
    const posts = await client.searchPosts({ keyword: "渝北三房", limit: 5 });
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]?.platform).toBe("xhs");
    expect(posts[0]?.content).toContain("渝北");
  });

  it("gets post detail with comments", async () => {
    const client = new FakeXhsDiscoveryClient();
    const detail = await client.getPostWithComments({ externalId: "fake_post_001" });
    expect(detail.post.externalId).toBe("fake_post_001");
    expect(detail.comments.some((c) => c.content.includes("130万"))).toBe(true);
  });

  it("reports login status", async () => {
    const client = new FakeXhsDiscoveryClient();
    const status = await client.checkLoginStatus();
    expect(status.loggedIn).toBe(true);
  });
});
```

Run: `pnpm --filter @leadflow/connectors test` — Expected: FAIL.

- [ ] **Step 2: Define types**

Create `packages/connectors/src/xhs-discovery/types.ts`，字段沿用功能文档的统一内容模型：

```ts
export type XhsDiscoveryPost = {
  platform: "xhs";
  externalId: string;
  url: string;
  authorName?: string;
  authorUrl?: string;
  title?: string;
  content: string;
  images?: string[];
  stats?: { likes?: number; comments?: number; shares?: number };
  publishedAt?: string;
  capturedAt: string;
  raw?: unknown;
};

export type XhsDiscoveryComment = {
  platform: "xhs";
  externalId: string;
  postExternalId: string;
  authorName?: string;
  authorUrl?: string;
  content: string;
  likeCount?: number;
  publishedAt?: string;
  capturedAt: string;
  raw?: unknown;
};

export type SearchPostsInput = {
  keyword: string;
  limit?: number;
  sort?: string;
  noteType?: string;
  publishWithin?: string;
};

export type GetPostWithCommentsInput = {
  externalId: string;
  url?: string;
  maxComments?: number;
};

export type XhsDiscoveryClient = {
  checkLoginStatus(): Promise<{ loggedIn: boolean; username?: string }>;
  searchPosts(input: SearchPostsInput): Promise<XhsDiscoveryPost[]>;
  // get_feed_detail 一次返回正文 + 评论，因此合并为一个方法，
  // 不强行拆成功能文档接口里的 getPost/getComments 两步。
  getPostWithComments(input: GetPostWithCommentsInput): Promise<{
    post: XhsDiscoveryPost;
    comments: XhsDiscoveryComment[];
  }>;
  // user_profile 若可取博主笔记列表则实现，否则抛 NotSupported（以 Task 0 核对结果为准）。
  getCreatorPosts?(input: { profileUrl: string; limit?: number }): Promise<XhsDiscoveryPost[]>;
};
```

- [ ] **Step 3: Implement fake client and export**

`FakeXhsDiscoveryClient` 返回 2-3 条确定性的重庆房产帖子和评论（内容沿用既有演示文案），仅供测试。`packages/connectors/src/index.ts` 增加 `export * from "./xhs-discovery/...";`。

Run: `pnpm --filter @leadflow/connectors test` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/connectors
git commit -m "feat: 添加小红书采集 connector 契约与测试桩"
```

---

### Task 2: MCP Streamable HTTP Client

**Files:**

- Create: `packages/connectors/src/xhs-discovery/mcp-client.ts`
- Create: `packages/connectors/src/xhs-discovery/env.ts`
- Modify: `packages/connectors/src/index.ts`

- [ ] **Step 1: Implement streamable HTTP client**

Create `packages/connectors/src/xhs-discovery/mcp-client.ts`。要求与 Plan 4 的 stdio 客户端同级：单一长连接、懒加载、text content JSON 解析、错误透传。传输层不同：

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  GetPostWithCommentsInput,
  SearchPostsInput,
  XhsDiscoveryClient,
  XhsDiscoveryComment,
  XhsDiscoveryPost,
} from "./types.js";

type XhsDiscoveryMcpClientOptions = {
  baseUrl: string; // 默认 http://localhost:18060/mcp
};

export class XhsDiscoveryMcpClient implements XhsDiscoveryClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly options: XhsDiscoveryMcpClientOptions) {}

  private getClient(): Promise<Client> {
    if (this.client) {
      return Promise.resolve(this.client);
    }
    if (!this.connecting) {
      this.connecting = (async () => {
        const transport = new StreamableHTTPClientTransport(new URL(this.options.baseUrl));
        const client = new Client({ name: "leadflow-discovery", version: "0.1.0" });
        await client.connect(transport);
        this.client = client;
        return client;
      })().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  async checkLoginStatus(): Promise<{ loggedIn: boolean; username?: string }> {
    const result = await this.callTool<Record<string, unknown>>("check_login_status", {});
    // 字段映射以 docs/superpowers/specs/xiaohongshu-mcp-tool-contracts.md 为准。
    return mapLoginStatus(result);
  }

  async searchPosts(input: SearchPostsInput): Promise<XhsDiscoveryPost[]> {
    const result = await this.callTool<unknown>("search_feeds", mapSearchArgs(input));
    const posts = mapFeedsToPosts(result);
    return input.limit ? posts.slice(0, input.limit) : posts;
  }

  async getPostWithComments(input: GetPostWithCommentsInput): Promise<{
    post: XhsDiscoveryPost;
    comments: XhsDiscoveryComment[];
  }> {
    const result = await this.callTool<unknown>("get_feed_detail", mapDetailArgs(input));
    return mapFeedDetail(result, input.maxComments);
  }

  private async callTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const client = await this.getClient();
    const result = await client.callTool({ name: tool, arguments: args });
    if (result.isError) {
      throw new Error(`xiaohongshu-mcp ${tool} failed: ${JSON.stringify(result.content)}`);
    }
    const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
      (block) => block.type === "text" && typeof block.text === "string",
    );
    if (!textBlock?.text) {
      throw new Error(`xiaohongshu-mcp ${tool} returned no text content`);
    }
    return JSON.parse(textBlock.text) as T;
  }
}
```

`mapSearchArgs` / `mapFeedsToPosts` / `mapFeedDetail` / `mapLoginStatus` 为纯函数（同文件或独立 `mappers.ts`），字段名严格按 Task 0 的契约文档填写，并为 mapper 写单测（输入用契约文档里记录的真实返回样例）。

登录失效处理：当工具返回登录失效错误时，抛出带 `XHS_DISCOVERY_LOGIN_REQUIRED` 标识的错误，API 层据此返回 409 并提示用户去 xiaohongshu-mcp 重新扫码，**不得回退到 fake 数据**。

- [ ] **Step 2: Implement env factory**

Create `packages/connectors/src/xhs-discovery/env.ts`:

```ts
import { FakeXhsDiscoveryClient } from "./fake-client.js";
import { XhsDiscoveryMcpClient } from "./mcp-client.js";
import type { XhsDiscoveryClient } from "./types.js";

export type XhsDiscoveryEnv = {
  XHS_DISCOVERY_MODE?: string;
  XHS_DISCOVERY_MCP_URL?: string;
};

export function createXhsDiscoveryClientFromEnv(
  env: XhsDiscoveryEnv = process.env,
): XhsDiscoveryClient {
  if (env.XHS_DISCOVERY_MODE === "fake") {
    return new FakeXhsDiscoveryClient();
  }
  if (!env.XHS_DISCOVERY_MCP_URL) {
    throw new Error(
      "Set XHS_DISCOVERY_MODE=fake or provide XHS_DISCOVERY_MCP_URL (e.g. http://localhost:18060/mcp)",
    );
  }
  return new XhsDiscoveryMcpClient({ baseUrl: env.XHS_DISCOVERY_MCP_URL });
}
```

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter @leadflow/connectors test
pnpm --filter @leadflow/connectors typecheck
git add packages/connectors
git commit -m "feat: 实现 xiaohongshu-mcp streamable HTTP 客户端"
```

---

### Task 3: Campaign-Driven Discovery Workflow

**Files:**

- Create: `packages/agents/src/campaign-discovery-workflow.ts`
- Modify: `packages/agents/src/types.ts`
- Modify: `packages/agents/src/index.ts`

- [ ] **Step 1: Write failing workflow test**

测试用 `FakeXhsDiscoveryClient` + `FakeLlmProvider`，断言：搜索 → 相关性过滤 → 评论意向识别 → 对每个候选 lead 调用既有 `runDiscoveryWorkflow`，并产出 `source_snapshot` / `comment_snapshot` artifact 与 keyword 策略记录。

- [ ] **Step 2: Implement workflow**

`runCampaignDiscoveryWorkflow(services, input)` 步骤对齐功能文档的 Mastra workflow 清单：

```text
1. loadCampaign（store）
2. generateSearchKeywords（LLM，seed keywords 扩展；结果存入 keyword_strategy artifact）
3. searchPosts（xhsDiscovery connector，按 maxPostsPerRun 截断）
4. filterRelevantPosts（LLM 逐帖判断 PostRelevance，不相关的记录原因后跳过）
5. getPostWithComments（相关帖子，按 maxCommentsPerPost 截断）
6. identifyLeadCandidates（LLM 识别 post_author_intent / comment_intent）
7. 对每个候选：复用单源 discovery（extract intent → score → MemWal → Walrus source/comment snapshot + discovery report → store lead/refs/timeline）
8. 返回 { campaignId, searched, relevant, leadsCreated, skipped, artifacts }
```

`WorkflowServices` 类型增加 `xhsDiscovery: XhsDiscoveryClient`。

限速与风控约束写进实现：每次工具调用之间加可配置延迟（`XHS_DISCOVERY_DELAY_MS`，默认 2000），单次 run 严格遵守 campaign 的 `maxPostsPerRun` / `maxCommentsPerPost`，不做自动翻页（功能文档 MVP 暂缓项）。

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter @leadflow/agents test
git add packages/agents
git commit -m "feat: 添加 campaign 驱动的发现工作流"
```

---

### Task 4: Wire into API

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/workflows.ts`
- Modify: `apps/api/src/routes/devices.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Extend services**

`ApiServices` 增加 `xhsDiscovery: XhsDiscoveryClient`：

- `createFakeServices()` → `new FakeXhsDiscoveryClient()`（仅测试）；
- `createServicesFromEnv()` → `createXhsDiscoveryClientFromEnv(env)`。

- [ ] **Step 2: Campaign discovery endpoint**

`POST /api/workflows/discovery/run` 支持两种请求体（Zod union）：

```text
{ campaignId }                       → runCampaignDiscoveryWorkflow（真实搜索采集）
{ leadId, memorySpaceId, sourceText } → 既有单源模式（手动导入真实文本，保留为兜底）
```

- [ ] **Step 3: Login status endpoint**

`GET /api/devices/xhs-web/login-status` → `services.xhsDiscovery.checkLoginStatus()`。Dashboard 演示前可据此确认采集通道在线。登录失效错误统一映射为 409 + 重新扫码提示。

- [ ] **Step 4: Update .env.example**

真实配置区追加：

```bash
XHS_DISCOVERY_MCP_URL=http://localhost:18060/mcp
XHS_DISCOVERY_DELAY_MS=2000
```

排练注释区追加：

```bash
# XHS_DISCOVERY_MODE=fake
```

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @leadflow/api test
pnpm --filter @leadflow/api typecheck
git add apps/api .env.example
git commit -m "feat: 接入小红书采集通道到 Discovery API"
```

---

### Task 5: Real-Mode Verification

**Files:**

- Modify: `docs/demo/leadflow-demo-script-zh.md`（若 Plan 6 已产出）

- [ ] **Step 1: Manual real-channel check**

前置：启动 xiaohongshu-mcp 并确认已登录；API 以真实配置启动。

```bash
curl http://127.0.0.1:3001/api/devices/xhs-web/login-status
curl -X POST http://127.0.0.1:3001/api/workflows/discovery/run \
  -H "content-type: application/json" \
  -d '{"campaignId":"<seed 出的真实 campaignId>"}'
```

Expected:

- login-status 返回 `loggedIn: true`；
- discovery run 返回真实搜索统计（searched/relevant/leadsCreated），每次运行结果随平台内容变化；
- Dashboard 上新 lead 的来源 URL 可在浏览器中打开并对应真实小红书帖子；
- source_snapshot blob 可从 Walrus aggregator 读回，内容与真实帖子一致。

- [ ] **Step 2: Update demo script**

Demo 操作脚本在"展示线索来源"一步改为：现场打开 lead 的真实小红书帖子链接，与 Walrus source_snapshot 内容互相印证。手动导入路径保留为平台风控时的兜底，并在脚本中注明切换方式。

- [ ] **Step 3: Commit**

```bash
git add docs/demo
git commit -m "docs: 演示脚本加入真实采集通道步骤"
```

---

## Out of Scope

- 多平台 connector、自动翻页、多账号采集（功能文档 MVP 暂缓项）；
- 用 xiaohongshu-mcp 的 publish/comment/like 等写操作（Discovery 只读，避免账号风控面扩大）；
- 评论区分页深采（首版只取 get_feed_detail 返回的评论）；
- 私聊触达（仍由 mcp-xhs-chat 负责，两服务并存）。

## Risks

- **平台风控**：搜索/详情调用频率过高可能触发风控。已用延迟 + 条数上限约束；比赛现场若通道不可用，按功能文档既定兜底切换手动导入真实文本。
- **登录态过期**：浏览器 cookie 会失效。login-status 端点 + 409 错误提示覆盖此场景；演示前检查清单中必须包含登录确认。
- **上游接口变动**：xiaohongshu-mcp 基于网页自动化，字段可能随小红书改版变化。所有映射集中在 mappers + 契约文档，变动时只改一处。

## Success Criteria

- 真实模式下 `POST /api/workflows/discovery/run {campaignId}` 产出的 lead 来源 URL 均为可打开的真实小红书帖子；
- 评论型 lead 的 comment_snapshot 与真实评论一致；
- 全链路（搜索发现 → MemWal → Walrus → Dashboard）无 `fake_blob_` 产物；
- 功能文档 MVP 必须项中"小红书搜索帖子 / 评论区扫描"两项的依赖说明可以移除。

Placeholder scan:

- This plan contains no unresolved implementation placeholders.
