# LeadFlow Foundation + Data/API Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TypeScript monorepo foundation, shared domain schemas, configurable Playbook loader, Prisma data model, and Hono API skeleton for LeadFlow Memory.

**Architecture:** This plan creates the formal codebase without integrating live Walrus, MemWal, Mastra, or mcp-xhs-chat yet. The foundation exposes typed contracts and deterministic in-memory API responses so later plans can replace adapters with real implementations without changing frontend/API boundaries.

**Tech Stack:** pnpm workspace, TypeScript, Vitest, Zod, Hono, Prisma, PostgreSQL schema, YAML.

---

## Scope

This plan implements only the foundation and API skeleton.

Included:

- Monorepo setup with `apps/api`, `packages/core`, `packages/playbook`, and `packages/db`.
- Shared Zod schemas and TypeScript types for Campaign, Lead, LeadProfile, Conversation, TimelineEvent, MemoryRef, ArtifactRef, SocialIdentity, and DeviceConfig.
- YAML Conversion Playbook schema and loader.
- Prisma schema matching the current state model.
- Hono API skeleton with dashboard, campaign, lead, conversation, workflow, memory, artifact, and device routes.
- Deterministic in-memory fixtures for API development and frontend integration.
  **注意：fixtures 是临时脚手架**，Plan 7（`2026-06-12-leadflow-real-data-path.md`）会用共享存储替换所有业务路由的 fixtures 引用；fixtures 最终只允许被 Demo seed 端点使用。正式演示前必须完成 Plan 7。

Excluded:

- Real Walrus uploads.
- Real MemWal writes/recall.
- Mastra workflow execution.
- DeepSeek/MiMo provider implementation.
- Real `mcp-xhs-chat` process calls.
- Dashboard migration from `leadflow-memory-prototype`.

## File Structure

Create:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
.gitignore

apps/api/package.json
apps/api/tsconfig.json
apps/api/src/index.ts
apps/api/src/app.ts
apps/api/src/routes/campaigns.ts
apps/api/src/routes/leads.ts
apps/api/src/routes/conversations.ts
apps/api/src/routes/workflows.ts
apps/api/src/routes/memories.ts
apps/api/src/routes/artifacts.ts
apps/api/src/routes/dashboard.ts
apps/api/src/routes/devices.ts
apps/api/src/fixtures/demo-data.ts
apps/api/src/app.test.ts

packages/core/package.json
packages/core/tsconfig.json
packages/core/src/index.ts
packages/core/src/enums.ts
packages/core/src/schemas.ts
packages/core/src/dashboard.ts
packages/core/src/schemas.test.ts

packages/playbook/package.json
packages/playbook/tsconfig.json
packages/playbook/src/index.ts
packages/playbook/src/schema.ts
packages/playbook/src/loader.ts
packages/playbook/src/loader.test.ts

packages/db/package.json
packages/db/tsconfig.json
packages/db/src/index.ts

playbooks/real-estate-chongqing.yml
prisma/schema.prisma
```

Modify:

```text
docs/superpowers/plans/2026-06-11-leadflow-foundation-data-api.md
```

Reference:

```text
docs/superpowers/specs/2026-06-11-leadflow-memory-design.md
docs/architecture/data-state-model-zh.md
docs/architecture/api-design-zh.md
docs/features/conversion-playbook-zh.md
```

---

### Task 1: Initialize Workspace Tooling

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

- [ ] **Step 1: Write workspace files**

Create `package.json`:

```json
{
  "name": "leadflow-memory",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "dev:api": "pnpm --filter @leadflow/api dev",
    "prisma:format": "prisma format --schema prisma/schema.prisma",
    "prisma:validate": "prisma validate --schema prisma/schema.prisma"
  },
  "devDependencies": {
    "@types/node": "^20.14.12",
    "prisma": "^5.22.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

Create `.gitignore`:

```gitignore
node_modules
dist
.env
.env.local
.DS_Store
coverage
*.log
.turbo
```

- [ ] **Step 2: Initialize git if needed**

Run:

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 || git init
```

Expected: repository exists or initializes successfully.

- [ ] **Step 3: Install dependencies**

Run:

```bash
pnpm install
```

Expected: `node_modules` and `pnpm-lock.yaml` are created.

- [ ] **Step 4: Run root commands before packages exist**

Run:

```bash
pnpm typecheck
```

Expected: command exits successfully with no matching package work to run, or prints that no projects were selected.

- [ ] **Step 5: Commit workspace tooling**

Run:

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore pnpm-lock.yaml
git commit -m "chore: initialize leadflow workspace"
```

Expected: commit succeeds.

---

### Task 2: Create Shared Core Schemas

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/enums.ts`
- Create: `packages/core/src/schemas.ts`
- Create: `packages/core/src/dashboard.ts`
- Create: `packages/core/src/schemas.test.ts`

- [ ] **Step 1: Create core package manifest**

Create `packages/core/package.json`:

```json
{
  "name": "@leadflow/core",
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

Create `packages/core/tsconfig.json`:

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

- [ ] **Step 2: Write failing schema tests**

Create `packages/core/src/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LeadProfileSchema,
  LeadSchema,
  TimelineEventSchema,
} from "./schemas.js";

describe("core schemas", () => {
  it("accepts an industry-agnostic lead profile with playbook-defined fields", () => {
    const parsed = LeadProfileSchema.parse({
      leadId: "lead_001",
      industry: "real_estate",
      playbookId: "real-estate-chongqing",
      summary: "客户预算 130 万以内，关注渝北三房。",
      intentLevel: "A",
      profileCompleteness: 0.65,
      missingRequiredFields: ["property_market"],
      common: {
        needs: ["三房", "近地铁"],
        concerns: ["预算压力"],
        timeline: "孩子明年上小学",
        contactInfo: {}
      },
      fields: {
        budget: {
          value: "130万以内",
          confidence: 0.92,
          sourceMemoryRef: "mem_001",
          sourceArtifactRef: "artifact_001",
          updatedAt: "2026-06-11T10:00:00.000Z"
        }
      }
    });

    expect(parsed.fields.budget.value).toBe("130万以内");
  });

  it("rejects invalid lead status", () => {
    expect(() =>
      LeadSchema.parse({
        id: "lead_001",
        campaignId: "campaign_001",
        playbookId: "real-estate-chongqing",
        platform: "xhs",
        sourceType: "comment",
        status: "almost_done",
        intentLevel: "A",
        createdAt: "2026-06-11T10:00:00.000Z",
        updatedAt: "2026-06-11T10:00:00.000Z"
      }),
    ).toThrow();
  });

  it("accepts timeline events that connect memories and artifacts", () => {
    const parsed = TimelineEventSchema.parse({
      id: "event_001",
      leadId: "lead_001",
      type: "handoff_recovered",
      summary: "Worker-2 从 MemWal 恢复客户上下文。",
      memoryRefs: ["mem_001"],
      artifactRefs: ["artifact_001"],
      agentName: "Conversion Agent",
      workerId: "worker-2",
      createdAt: "2026-06-11T10:00:00.000Z"
    });

    expect(parsed.type).toBe("handoff_recovered");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm --filter @leadflow/core test
```

Expected: FAIL because `./schemas.js` does not exist.

- [ ] **Step 4: Add enum definitions**

Create `packages/core/src/enums.ts`:

```ts
export const socialPlatforms = [
  "xhs",
  "douyin",
  "kuaishou",
  "weibo",
  "zhihu",
  "bilibili",
  "wechat_official_account",
] as const;

export const sourceTypes = [
  "post",
  "comment",
  "creator_profile",
  "manual_import",
] as const;

export const leadStatuses = [
  "discovered",
  "qualified",
  "assigned",
  "contacting",
  "replied",
  "nurturing",
  "asking_contact",
  "contact_obtained",
  "viewing_scheduled",
  "converted",
  "paused",
  "lost",
] as const;

export const intentLevels = ["S", "A", "B", "C", "Ignore"] as const;

export const conversationStatuses = [
  "not_started",
  "opened",
  "waiting_reply",
  "customer_replied",
  "agent_replied",
  "contact_shared",
  "viewing_discussed",
  "closed",
] as const;

export const workflowRunStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "retrying",
] as const;

export const timelineEventTypes = [
  "campaign_started",
  "source_captured",
  "lead_discovered",
  "lead_scored",
  "memory_written",
  "lead_assigned",
  "conversation_started",
  "customer_replied",
  "conversion_decision_made",
  "memory_updated",
  "contact_requested",
  "contact_obtained",
  "viewing_scheduled",
  "handoff_triggered",
  "handoff_recovered",
  "lead_paused",
  "lead_lost",
] as const;
```

- [ ] **Step 5: Add Zod schemas**

Create `packages/core/src/schemas.ts`:

```ts
import { z } from "zod";
import {
  conversationStatuses,
  intentLevels,
  leadStatuses,
  socialPlatforms,
  sourceTypes,
  timelineEventTypes,
  workflowRunStatuses,
} from "./enums.js";

const IsoDateStringSchema = z.string().datetime();

export const SocialPlatformSchema = z.enum(socialPlatforms);
export const SourceTypeSchema = z.enum(sourceTypes);
export const IntentLevelSchema = z.enum(intentLevels);
export const LeadStatusSchema = z.enum(leadStatuses);
export const ConversationStatusSchema = z.enum(conversationStatuses);
export const WorkflowRunStatusSchema = z.enum(workflowRunStatuses);
export const TimelineEventTypeSchema = z.enum(timelineEventTypes);

export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string(),
  city: z.string().optional(),
  targetCustomer: z.string(),
  seedKeywords: z.array(z.string()),
  targetCreators: z.array(
    z.object({
      platform: SocialPlatformSchema,
      name: z.string().optional(),
      profileUrl: z.string().url().optional(),
      externalId: z.string().optional(),
    }),
  ),
  sourceModes: z.array(z.enum(["search_posts", "creator_posts", "comments", "manual_import"])),
  maxPostsPerRun: z.number().int().positive(),
  maxCommentsPerPost: z.number().int().nonnegative(),
  playbookId: z.string(),
  status: z.enum(["draft", "active", "running", "paused", "completed", "failed"]),
  createdAt: IsoDateStringSchema,
  updatedAt: IsoDateStringSchema,
});

export const SocialSourceSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  platform: SocialPlatformSchema,
  sourceType: SourceTypeSchema,
  externalId: z.string().optional(),
  url: z.string().url().optional(),
  authorName: z.string().optional(),
  content: z.string(),
  status: z.enum(["captured", "relevant", "irrelevant", "analyzed", "lead_created", "ignored", "failed"]),
  capturedAt: IsoDateStringSchema,
});

export const LeadSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  playbookId: z.string(),
  platform: SocialPlatformSchema,
  sourceType: SourceTypeSchema,
  status: LeadStatusSchema,
  intentLevel: IntentLevelSchema,
  sourceUrl: z.string().url().optional(),
  sourceAuthor: z.string().optional(),
  memorySpaceId: z.string().optional(),
  createdAt: IsoDateStringSchema,
  updatedAt: IsoDateStringSchema,
});

export const ProfileFieldValueSchema = z.object({
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
  sourceMemoryRef: z.string().optional(),
  sourceArtifactRef: z.string().optional(),
  updatedAt: IsoDateStringSchema,
});

export const LeadProfileSchema = z.object({
  leadId: z.string(),
  industry: z.string(),
  playbookId: z.string(),
  summary: z.string(),
  intentLevel: IntentLevelSchema,
  profileCompleteness: z.number().min(0).max(1),
  missingRequiredFields: z.array(z.string()),
  common: z.object({
    needs: z.array(z.string()),
    concerns: z.array(z.string()),
    timeline: z.string().optional(),
    decisionMakers: z.array(z.string()).optional(),
    contactInfo: z
      .object({
        phone: z.string().optional(),
        wechat: z.string().optional(),
      })
      .optional(),
  }),
  fields: z.record(ProfileFieldValueSchema),
});

export const ConversationMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  from: z.enum(["agent", "customer", "system"]),
  content: z.string(),
  sentAt: IsoDateStringSchema,
});

export const ConversationSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  status: ConversationStatusSchema,
  platform: SocialPlatformSchema,
  externalThreadId: z.string().optional(),
  lastMessageAt: IsoDateStringSchema.optional(),
  messages: z.array(ConversationMessageSchema),
});

export const WorkflowRunSchema = z.object({
  id: z.string(),
  type: z.enum(["discovery", "conversion", "handoff_recovery", "memory_update", "artifact_store"]),
  status: WorkflowRunStatusSchema,
  leadId: z.string().optional(),
  campaignId: z.string().optional(),
  startedAt: IsoDateStringSchema.optional(),
  completedAt: IsoDateStringSchema.optional(),
  errorMessage: z.string().optional(),
});

export const MemoryRefSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  memorySpaceId: z.string(),
  memoryId: z.string(),
  kind: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  sourceArtifactId: z.string().optional(),
  createdAt: IsoDateStringSchema,
});

export const ArtifactRefSchema = z.object({
  id: z.string(),
  leadId: z.string().optional(),
  workflowRunId: z.string().optional(),
  artifactType: z.enum([
    "source_snapshot",
    "lead_discovery_report",
    "conversation_log",
    "conversion_decision",
    "memory_diff",
    "followup_report",
    "handoff_proof",
  ]),
  blobId: z.string(),
  suiObjectId: z.string().optional(),
  summary: z.string(),
  createdAt: IsoDateStringSchema,
  verifiedStatus: z.enum(["verified", "missing", "expired", "failed"]),
});

export const TimelineEventSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  workflowRunId: z.string().optional(),
  type: TimelineEventTypeSchema,
  summary: z.string(),
  memoryRefs: z.array(z.string()),
  artifactRefs: z.array(z.string()),
  agentName: z.string().optional(),
  workerId: z.string().optional(),
  createdAt: IsoDateStringSchema,
});

export const SocialIdentitySchema = z.object({
  id: z.string().optional(),
  leadId: z.string(),
  platform: SocialPlatformSchema,
  externalUserId: z.string(),
  username: z.string(),
  profileUrl: z.string().url().optional(),
  raw: z.unknown().optional(),
});

export const DeviceConfigSchema = z.object({
  id: z.string(),
  platform: SocialPlatformSchema,
  deviceId: z.string(),
  adbAddress: z.string(),
  status: z.enum(["connected", "disconnected", "unavailable"]),
  lastConnectedAt: IsoDateStringSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Campaign = z.infer<typeof CampaignSchema>;
export type SocialSource = z.infer<typeof SocialSourceSchema>;
export type Lead = z.infer<typeof LeadSchema>;
export type LeadProfile = z.infer<typeof LeadProfileSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export type MemoryRef = z.infer<typeof MemoryRefSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type SocialIdentity = z.infer<typeof SocialIdentitySchema>;
export type DeviceConfig = z.infer<typeof DeviceConfigSchema>;
```

- [ ] **Step 6: Add dashboard contract schemas**

Create `packages/core/src/dashboard.ts`:

```ts
import { z } from "zod";
import {
  ArtifactRefSchema,
  ConversationSchema,
  LeadProfileSchema,
  LeadSchema,
  MemoryRefSchema,
  TimelineEventSchema,
  WorkflowRunSchema,
} from "./schemas.js";

export const NextFollowUpSchema = z.object({
  nextBestAction: z.string(),
  message: z.string(),
  rationale: z.string(),
  usedMemoryRefs: z.array(z.string()),
  requiresHumanApproval: z.boolean(),
});

export const PlaybookSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string(),
  city: z.string().optional(),
  primaryGoals: z.array(z.string()),
  rules: z.array(z.string()),
});

export const DashboardLeadListItemSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  platform: z.string(),
  sourceType: z.string(),
  status: z.string(),
  intentLevel: z.string(),
  summary: z.string(),
  updatedAt: z.string().datetime(),
});

export const DashboardLeadDetailSchema = z.object({
  lead: LeadSchema,
  profile: LeadProfileSchema,
  conversation: ConversationSchema,
  timeline: z.array(TimelineEventSchema),
  memories: z.array(MemoryRefSchema),
  artifacts: z.array(ArtifactRefSchema),
  nextFollowUp: NextFollowUpSchema,
  playbook: PlaybookSummarySchema,
  activeWorkflowRun: WorkflowRunSchema.optional(),
});

export type DashboardLeadListItem = z.infer<typeof DashboardLeadListItemSchema>;
export type DashboardLeadDetail = z.infer<typeof DashboardLeadDetailSchema>;
export type NextFollowUp = z.infer<typeof NextFollowUpSchema>;
export type PlaybookSummary = z.infer<typeof PlaybookSummarySchema>;
```

- [ ] **Step 7: Export core modules**

Create `packages/core/src/index.ts`:

```ts
export * from "./dashboard.js";
export * from "./enums.js";
export * from "./schemas.js";
```

- [ ] **Step 8: Run tests and typecheck**

Run:

```bash
pnpm --filter @leadflow/core test
pnpm --filter @leadflow/core typecheck
```

Expected: both commands pass.

- [ ] **Step 9: Commit core schemas**

Run:

```bash
git add packages/core
git commit -m "feat: add shared leadflow domain schemas"
```

Expected: commit succeeds.

---

### Task 3: Add Conversion Playbook Schema and Loader

**Files:**

- Create: `packages/playbook/package.json`
- Create: `packages/playbook/tsconfig.json`
- Create: `packages/playbook/src/index.ts`
- Create: `packages/playbook/src/schema.ts`
- Create: `packages/playbook/src/loader.ts`
- Create: `packages/playbook/src/loader.test.ts`
- Create: `playbooks/real-estate-chongqing.yml`

- [ ] **Step 1: Create playbook package manifest**

Create `packages/playbook/package.json`:

```json
{
  "name": "@leadflow/playbook",
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
    "yaml": "^2.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Create `packages/playbook/tsconfig.json`:

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

- [ ] **Step 2: Write failing playbook loader test**

Create `packages/playbook/src/loader.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadPlaybookFromString } from "./loader.js";

describe("playbook loader", () => {
  it("loads the Chongqing real estate playbook", async () => {
    const yaml = await readFile("../../playbooks/real-estate-chongqing.yml", "utf8");
    const playbook = loadPlaybookFromString(yaml);

    expect(playbook.id).toBe("real-estate-chongqing");
    expect(playbook.primary_goals).toContain("get_wechat");
    expect(playbook.profile_fields.map((field) => field.key)).toContain("budget");
    expect(playbook.conversation_rules.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm --filter @leadflow/playbook test
```

Expected: FAIL because `loader.js` does not exist.

- [ ] **Step 4: Add Playbook schema**

Create `packages/playbook/src/schema.ts`:

```ts
import { z } from "zod";

export const ProfileFieldConfigSchema = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  priority: z.number().int().positive(),
  description: z.string(),
  examples: z.array(z.string()).optional(),
});

export const ConversionPlaybookSchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string(),
  city: z.string().optional(),
  platforms: z.array(z.string()),
  agent: z.object({
    role: z.string(),
    tone: z.array(z.string()),
    objective: z.string(),
  }),
  primary_goals: z.array(z.string()),
  secondary_goals: z.array(z.string()),
  profile_fields: z.array(ProfileFieldConfigSchema),
  conversation_rules: z.array(z.string()),
  forbidden_claims: z.array(z.string()),
  local_knowledge: z.array(z.string()),
  success_criteria: z.record(
    z.object({
      description: z.string(),
    }),
  ),
});

export type ProfileFieldConfig = z.infer<typeof ProfileFieldConfigSchema>;
export type ConversionPlaybook = z.infer<typeof ConversionPlaybookSchema>;
```

- [ ] **Step 5: Add Playbook loader**

Create `packages/playbook/src/loader.ts`:

```ts
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { ConversionPlaybookSchema, type ConversionPlaybook } from "./schema.js";

export function loadPlaybookFromString(input: string): ConversionPlaybook {
  const parsed = YAML.parse(input);
  return ConversionPlaybookSchema.parse(parsed);
}

export async function loadPlaybookFromFile(path: string): Promise<ConversionPlaybook> {
  const file = await readFile(path, "utf8");
  return loadPlaybookFromString(file);
}
```

Create `packages/playbook/src/index.ts`:

```ts
export * from "./loader.js";
export * from "./schema.js";
```

- [ ] **Step 6: Add default Chongqing real estate playbook**

Create `playbooks/real-estate-chongqing.yml`:

```yaml
id: real-estate-chongqing
name: 重庆房产销售 Playbook
industry: real_estate
city: 重庆
platforms:
  - xhs

agent:
  role: 重庆房产顾问
  tone:
    - 专业
    - 自然
    - 不推销感
  objective: >
    通过多轮自然沟通了解客户需求，在合适时机获取微信号/手机号，
    或直接预约看房。

primary_goals:
  - get_wechat
  - get_phone
  - schedule_viewing

secondary_goals:
  - qualify_budget
  - qualify_district
  - qualify_layout
  - qualify_property_market
  - qualify_property_condition
  - qualify_subsidy_interest
  - qualify_viewing_time

profile_fields:
  - key: budget
    label: 预算
    required: true
    priority: 1
    description: 客户可接受的总价、首付或月供范围
    examples:
      - 130万以内
      - 首付40万
      - 月供不想太高
  - key: district
    label: 看房区域
    required: true
    priority: 2
    description: 客户主要关注的重庆区域
  - key: layout
    label: 户型
    required: true
    priority: 3
    description: 几室几厅或面积需求
  - key: property_market
    label: 新房/二手
    required: false
    priority: 4
    description: 客户倾向新房还是二手房
  - key: property_condition
    label: 清水/精装
    required: false
    priority: 5
    description: 客户是否接受清水房或更偏好精装房
  - key: subsidy_interest
    label: 补贴兴趣
    required: false
    priority: 6
    description: 是否关注重庆新房补贴政策
  - key: contact
    label: 联系方式
    required: true
    priority: 99
    description: 微信号或手机号

conversation_rules:
  - 不要一开始就索要联系方式
  - 每轮最多追问 1-2 个问题
  - 先承接客户已表达的需求，再提出问题
  - 客户表达强意向时，可以自然引导加微信或留电话
  - 客户想看房时，优先确认看房区域和时间
  - 客户连续拒绝 2 次后，停止推进联系方式

forbidden_claims:
  - 不承诺学区结果
  - 不承诺一定享受补贴
  - 不夸大升值空间
  - 不制造虚假紧迫感
  - 不频繁骚扰客户

local_knowledge:
  - 重庆部分新房可能有补贴，但需要以具体楼盘和最新政策为准
  - 新房可能有补贴和更低首付活动，但要关注交付周期
  - 二手房更适合想快速入住或明确区域的客户
  - 清水房需要把装修成本计入预算
  - 精装房省事，但要关注装修标准和后期维护

success_criteria:
  get_wechat:
    description: 客户提供微信号，或同意添加微信
  get_phone:
    description: 客户提供手机号
  schedule_viewing:
    description: 客户确认看房区域和时间，并留下可联系渠道
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
pnpm --filter @leadflow/playbook test
pnpm --filter @leadflow/playbook typecheck
```

Expected: both commands pass.

- [ ] **Step 8: Commit playbook loader**

Run:

```bash
git add packages/playbook playbooks/real-estate-chongqing.yml
git commit -m "feat: add configurable conversion playbook"
```

Expected: commit succeeds.

---

### Task 4: Add Prisma Data Model Skeleton

**Files:**

- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/index.ts`
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Create db package manifest**

Create `packages/db/package.json`:

```json
{
  "name": "@leadflow/db",
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
    "@prisma/client": "^5.22.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Create `packages/db/tsconfig.json`:

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

- [ ] **Step 2: Add Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum CampaignStatus {
  draft
  active
  running
  paused
  completed
  failed
}

enum LeadStatus {
  discovered
  qualified
  assigned
  contacting
  replied
  nurturing
  asking_contact
  contact_obtained
  viewing_scheduled
  converted
  paused
  lost
}

enum IntentLevel {
  S
  A
  B
  C
  Ignore
}

enum ConversationStatus {
  not_started
  opened
  waiting_reply
  customer_replied
  agent_replied
  contact_shared
  viewing_discussed
  closed
}

enum WorkflowRunStatus {
  queued
  running
  succeeded
  failed
  cancelled
  retrying
}

enum DeviceStatus {
  connected
  disconnected
  unavailable
}

model Campaign {
  id                 String         @id @default(cuid())
  name               String
  industry           String
  city               String?
  targetCustomer     String
  seedKeywords       String[]
  targetCreators     Json
  sourceModes        String[]
  maxPostsPerRun     Int
  maxCommentsPerPost Int
  playbookId         String
  status             CampaignStatus @default(draft)
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt
  leads              Lead[]
  sources            SocialSource[]
  workflowRuns       WorkflowRun[]
}

model SocialSource {
  id         String   @id @default(cuid())
  campaignId String
  platform   String
  sourceType String
  externalId String?
  url        String?
  authorName String?
  content    String
  status     String
  capturedAt DateTime
  raw        Json?
  campaign   Campaign @relation(fields: [campaignId], references: [id])
  leads      Lead[]
}

model Lead {
  id              String          @id @default(cuid())
  campaignId      String
  socialSourceId  String?
  playbookId      String
  platform        String
  sourceType      String
  status          LeadStatus      @default(discovered)
  intentLevel     IntentLevel
  sourceUrl       String?
  sourceAuthor    String?
  memorySpaceId   String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  campaign        Campaign        @relation(fields: [campaignId], references: [id])
  socialSource    SocialSource?   @relation(fields: [socialSourceId], references: [id])
  profile         LeadProfile?
  conversation    Conversation?
  workflowRuns    WorkflowRun[]
  memoryRefs      MemoryRef[]
  artifactRefs    ArtifactRef[]
  timelineEvents  TimelineEvent[]
  socialIdentity  SocialIdentity?
}

model LeadProfile {
  id                    String   @id @default(cuid())
  leadId                String   @unique
  industry              String
  playbookId            String
  summary               String
  intentLevel           IntentLevel
  profileCompleteness   Float
  missingRequiredFields String[]
  common                Json
  fields                Json
  updatedAt             DateTime @updatedAt
  lead                  Lead     @relation(fields: [leadId], references: [id])
}

model Conversation {
  id               String               @id @default(cuid())
  leadId           String               @unique
  status           ConversationStatus   @default(not_started)
  platform         String
  externalThreadId String?
  lastMessageAt    DateTime?
  lead             Lead                 @relation(fields: [leadId], references: [id])
  messages         ConversationMessage[]
}

model ConversationMessage {
  id             String       @id @default(cuid())
  conversationId String
  from           String
  content        String
  sentAt         DateTime
  raw            Json?
  conversation   Conversation @relation(fields: [conversationId], references: [id])
}

model WorkflowRun {
  id            String            @id @default(cuid())
  type          String
  status        WorkflowRunStatus @default(queued)
  leadId        String?
  campaignId    String?
  startedAt     DateTime?
  completedAt   DateTime?
  errorMessage  String?
  metadata      Json?
  lead          Lead?             @relation(fields: [leadId], references: [id])
  campaign      Campaign?         @relation(fields: [campaignId], references: [id])
  artifactRefs  ArtifactRef[]
  timelineEvents TimelineEvent[]
}

model MemoryRef {
  id               String   @id @default(cuid())
  leadId           String
  memorySpaceId    String
  memoryId         String
  kind             String
  summary          String
  confidence       Float
  sourceArtifactId String?
  createdAt        DateTime @default(now())
  lead             Lead     @relation(fields: [leadId], references: [id])
}

model ArtifactRef {
  id              String       @id @default(cuid())
  leadId          String?
  workflowRunId   String?
  artifactType    String
  blobId          String
  suiObjectId     String?
  summary         String
  createdAt       DateTime     @default(now())
  verifiedStatus  String
  lead            Lead?        @relation(fields: [leadId], references: [id])
  workflowRun     WorkflowRun? @relation(fields: [workflowRunId], references: [id])
}

model TimelineEvent {
  id            String       @id @default(cuid())
  leadId        String
  workflowRunId String?
  type          String
  summary       String
  memoryRefs    String[]
  artifactRefs  String[]
  agentName     String?
  workerId      String?
  createdAt     DateTime     @default(now())
  lead          Lead         @relation(fields: [leadId], references: [id])
  workflowRun   WorkflowRun? @relation(fields: [workflowRunId], references: [id])
}

model SocialIdentity {
  id             String   @id @default(cuid())
  leadId         String   @unique
  platform       String
  externalUserId String
  username       String
  profileUrl     String?
  raw            Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  lead           Lead     @relation(fields: [leadId], references: [id])
}

model DeviceConfig {
  id              String       @id @default(cuid())
  platform        String
  deviceId        String
  adbAddress      String
  status          DeviceStatus @default(disconnected)
  lastConnectedAt DateTime?
  metadata        Json?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@unique([platform, deviceId])
}
```

- [ ] **Step 3: Add db package export**

Create `packages/db/src/index.ts`:

```ts
export type {
  ArtifactRef,
  Campaign,
  Conversation,
  ConversationMessage,
  DeviceConfig,
  Lead,
  LeadProfile,
  MemoryRef,
  SocialIdentity,
  SocialSource,
  TimelineEvent,
  WorkflowRun,
} from "@prisma/client";
```

- [ ] **Step 4: Format and validate Prisma schema**

Run:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/leadflow" pnpm prisma:format
DATABASE_URL="postgresql://user:pass@localhost:5432/leadflow" pnpm prisma:validate
```

Expected: Prisma schema formats and validates successfully.

- [ ] **Step 5: Typecheck db package**

Run:

```bash
pnpm --filter @leadflow/db typecheck
```

Expected: typecheck passes after Prisma client types are available. If `@prisma/client` asks for generation, run:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/leadflow" pnpm exec prisma generate --schema prisma/schema.prisma
pnpm --filter @leadflow/db typecheck
```

Expected: generation succeeds and typecheck passes.

- [ ] **Step 6: Commit Prisma skeleton**

Run:

```bash
git add packages/db prisma/schema.prisma package.json pnpm-lock.yaml
git commit -m "feat: add prisma data model skeleton"
```

Expected: commit succeeds.

---

### Task 5: Create Hono API App with Fixture Data

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/fixtures/demo-data.ts`
- Create: `apps/api/src/routes/dashboard.ts`
- Create: `apps/api/src/routes/campaigns.ts`
- Create: `apps/api/src/routes/leads.ts`
- Create: `apps/api/src/routes/conversations.ts`
- Create: `apps/api/src/routes/workflows.ts`
- Create: `apps/api/src/routes/memories.ts`
- Create: `apps/api/src/routes/artifacts.ts`
- Create: `apps/api/src/routes/devices.ts`
- Create: `apps/api/src/app.test.ts`

- [ ] **Step 1: Create API package manifest**

Create `apps/api/package.json`:

```json
{
  "name": "@leadflow/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "@leadflow/core": "workspace:*",
    "hono": "^4.6.8",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Create `apps/api/tsconfig.json`:

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

- [ ] **Step 2: Write failing API tests**

Create `apps/api/src/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("api app", () => {
  const app = createApp();

  it("returns dashboard lead list", async () => {
    const response = await app.request("/api/dashboard/leads");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0].displayName).toBe("陈薇");
  });

  it("returns dashboard lead detail", async () => {
    const response = await app.request("/api/dashboard/leads/lead_chen");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.lead.id).toBe("lead_chen");
    expect(body.artifacts[0].blobId).toMatch(/^0x/);
  });

  it("returns 404 for unknown lead detail", async () => {
    const response = await app.request("/api/dashboard/leads/missing");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("LEAD_NOT_FOUND");
  });

  it("accepts a conversation sync request as a skeleton endpoint", async () => {
    const response = await app.request("/api/leads/lead_chen/conversation/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sinceTime: "2026-06-11T10:00:00.000Z" }),
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.workflowRun.type).toBe("conversion");
    expect(body.channel).toBe("mcp-xhs-chat");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm --filter @leadflow/api test
```

Expected: FAIL because `./app.js` does not exist.

- [ ] **Step 4: Create deterministic fixture data**

Create `apps/api/src/fixtures/demo-data.ts`:

```ts
import type {
  ArtifactRef,
  Conversation,
  DashboardLeadDetail,
  DashboardLeadListItem,
  Lead,
  LeadProfile,
  MemoryRef,
  PlaybookSummary,
  TimelineEvent,
  WorkflowRun,
} from "@leadflow/core";

const now = "2026-06-11T10:00:00.000Z";

export const leadChen: Lead = {
  id: "lead_chen",
  campaignId: "campaign_real_estate_cq",
  playbookId: "real-estate-chongqing",
  platform: "xhs",
  sourceType: "comment",
  status: "asking_contact",
  intentLevel: "A",
  sourceUrl: "https://www.xiaohongshu.com/explore/demo",
  sourceAuthor: "重庆买房小白",
  memorySpaceId: "memspace_lead_chen",
  createdAt: now,
  updatedAt: now,
};

export const profileChen: LeadProfile = {
  leadId: "lead_chen",
  industry: "real_estate",
  playbookId: "real-estate-chongqing",
  summary: "客户预算 130 万以内，关注渝北三房，孩子明年上小学。",
  intentLevel: "A",
  profileCompleteness: 0.7,
  missingRequiredFields: ["property_market", "property_condition", "viewing_time"],
  common: {
    needs: ["三房", "近学校", "近地铁"],
    concerns: ["预算压力", "通勤"],
    timeline: "孩子明年上小学",
    contactInfo: {},
  },
  fields: {
    budget: {
      value: "130万以内",
      confidence: 0.92,
      sourceMemoryRef: "mem_budget",
      sourceArtifactRef: "artifact_memory_diff",
      updatedAt: now,
    },
    district: {
      value: "渝北",
      confidence: 0.86,
      updatedAt: now,
    },
    layout: {
      value: "三房",
      confidence: 0.9,
      updatedAt: now,
    },
  },
};

export const conversationChen: Conversation = {
  id: "conversation_chen",
  leadId: "lead_chen",
  status: "customer_replied",
  platform: "xhs",
  externalThreadId: "xhs_user_chen",
  lastMessageAt: now,
  messages: [
    {
      id: "msg_001",
      conversationId: "conversation_chen",
      from: "customer",
      content: "预算最好 130 万以内，孩子明年上小学。",
      sentAt: now,
    },
  ],
};

export const memoriesChen: MemoryRef[] = [
  {
    id: "mem_budget",
    leadId: "lead_chen",
    memorySpaceId: "memspace_lead_chen",
    memoryId: "memwal_budget_001",
    kind: "budget",
    summary: "客户预算 130 万以内。",
    confidence: 0.92,
    sourceArtifactId: "artifact_memory_diff",
    createdAt: now,
  },
  {
    id: "mem_strategy",
    leadId: "lead_chen",
    memorySpaceId: "memspace_lead_chen",
    memoryId: "memwal_strategy_001",
    kind: "strategy",
    summary: "下一步适合索要微信，发送渝北三房对比。",
    confidence: 0.88,
    sourceArtifactId: "artifact_handoff",
    createdAt: now,
  },
];

export const artifactsChen: ArtifactRef[] = [
  {
    id: "artifact_source",
    leadId: "lead_chen",
    workflowRunId: "workflow_discovery_001",
    artifactType: "source_snapshot",
    blobId: "0x8f1a92c",
    summary: "小红书评论来源快照。",
    createdAt: now,
    verifiedStatus: "verified",
  },
  {
    id: "artifact_handoff",
    leadId: "lead_chen",
    workflowRunId: "workflow_handoff_001",
    artifactType: "handoff_proof",
    blobId: "0xe259f03",
    summary: "Worker-2 接力恢复证明。",
    createdAt: now,
    verifiedStatus: "verified",
  },
  {
    id: "artifact_memory_diff",
    leadId: "lead_chen",
    workflowRunId: "workflow_conversion_001",
    artifactType: "memory_diff",
    blobId: "0x6bc42aa",
    summary: "客户预算和学区需求记忆更新。",
    createdAt: now,
    verifiedStatus: "verified",
  },
];

export const timelineChen: TimelineEvent[] = [
  {
    id: "event_discovered",
    leadId: "lead_chen",
    workflowRunId: "workflow_discovery_001",
    type: "lead_discovered",
    summary: "从小红书评论发现购房线索。",
    memoryRefs: ["mem_budget"],
    artifactRefs: ["artifact_source"],
    agentName: "Discovery Agent",
    workerId: "worker-1",
    createdAt: now,
  },
  {
    id: "event_handoff",
    leadId: "lead_chen",
    workflowRunId: "workflow_handoff_001",
    type: "handoff_recovered",
    summary: "Worker-2 从 MemWal 恢复上下文。",
    memoryRefs: ["mem_budget", "mem_strategy"],
    artifactRefs: ["artifact_handoff"],
    agentName: "Conversion Agent",
    workerId: "worker-2",
    createdAt: now,
  },
];

export const playbookSummary: PlaybookSummary = {
  id: "real-estate-chongqing",
  name: "重庆房产销售 Playbook",
  industry: "real_estate",
  city: "重庆",
  primaryGoals: ["get_wechat", "get_phone", "schedule_viewing"],
  rules: ["不要一开始就索要联系方式", "每轮最多追问 1-2 个问题"],
};

export const activeWorkflowRun: WorkflowRun = {
  id: "workflow_conversion_001",
  type: "conversion",
  status: "succeeded",
  leadId: "lead_chen",
  startedAt: now,
  completedAt: now,
};

export const dashboardLeadItems: DashboardLeadListItem[] = [
  {
    id: "lead_chen",
    displayName: "陈薇",
    platform: "xhs",
    sourceType: "comment",
    status: "asking_contact",
    intentLevel: "A",
    summary: "预算 130 万以内，关注渝北三房。",
    updatedAt: now,
  },
];

export const dashboardLeadDetail: DashboardLeadDetail = {
  lead: leadChen,
  profile: profileChen,
  conversation: conversationChen,
  timeline: timelineChen,
  memories: memoriesChen,
  artifacts: artifactsChen,
  nextFollowUp: {
    nextBestAction: "ask_wechat",
    message: "我按你刚补充的 130 万以内、渝北三房重新筛了一版。小红书这边发户型和预算表不太方便，你留个微信，我把对比表发你。",
    rationale: "客户已表达强意向，且需要接收房源对比资料。",
    usedMemoryRefs: ["mem_budget", "mem_strategy"],
    requiresHumanApproval: true,
  },
  playbook: playbookSummary,
  activeWorkflowRun,
};
```

- [ ] **Step 5: Create Hono app and dashboard routes**

Create `apps/api/src/app.ts`:

```ts
import { Hono } from "hono";
import { artifactsRoutes } from "./routes/artifacts.js";
import { campaignsRoutes } from "./routes/campaigns.js";
import { conversationsRoutes } from "./routes/conversations.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { devicesRoutes } from "./routes/devices.js";
import { leadsRoutes } from "./routes/leads.js";
import { memoriesRoutes } from "./routes/memories.js";
import { workflowsRoutes } from "./routes/workflows.js";

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/api/dashboard", dashboardRoutes);
  app.route("/api/campaigns", campaignsRoutes);
  app.route("/api/leads", leadsRoutes);
  app.route("/api/leads", conversationsRoutes);
  app.route("/api/leads", memoriesRoutes);
  app.route("/api/leads", artifactsRoutes);
  app.route("/api/workflows", workflowsRoutes);
  app.route("/api/devices", devicesRoutes);

  return app;
}
```

Create `apps/api/src/routes/dashboard.ts`:

```ts
import { Hono } from "hono";
import {
  dashboardLeadDetail,
  dashboardLeadItems,
} from "../fixtures/demo-data.js";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/leads", (c) => {
  return c.json({ items: dashboardLeadItems });
});

dashboardRoutes.get("/leads/:leadId", (c) => {
  const leadId = c.req.param("leadId");

  if (leadId !== dashboardLeadDetail.lead.id) {
    return c.json(
      {
        error: {
          code: "LEAD_NOT_FOUND",
          message: `Lead '${leadId}' was not found.`,
        },
      },
      404,
    );
  }

  return c.json(dashboardLeadDetail);
});
```

- [ ] **Step 6: Add skeleton route modules**

Create `apps/api/src/routes/campaigns.ts`:

```ts
import { Hono } from "hono";

export const campaignsRoutes = new Hono();

campaignsRoutes.get("/", (c) => c.json({ items: [] }));

campaignsRoutes.post("/", async (c) => {
  const body = await c.req.json();
  return c.json({ campaign: { id: "campaign_created", ...body, status: "draft" } }, 201);
});

campaignsRoutes.post("/:campaignId/run", (c) => {
  return c.json({
    workflowRun: {
      id: "workflow_discovery_queued",
      type: "discovery",
      status: "queued",
      campaignId: c.req.param("campaignId"),
    },
  }, 202);
});
```

Create `apps/api/src/routes/leads.ts`:

```ts
import { Hono } from "hono";
import { dashboardLeadDetail, dashboardLeadItems } from "../fixtures/demo-data.js";

export const leadsRoutes = new Hono();

leadsRoutes.get("/", (c) => c.json({ items: dashboardLeadItems }));

leadsRoutes.get("/:leadId", (c) => {
  if (c.req.param("leadId") !== dashboardLeadDetail.lead.id) {
    return c.json({ error: { code: "LEAD_NOT_FOUND" } }, 404);
  }

  return c.json({ lead: dashboardLeadDetail.lead, profile: dashboardLeadDetail.profile });
});
```

Create `apps/api/src/routes/conversations.ts`:

```ts
import { Hono } from "hono";
import { conversationChen } from "../fixtures/demo-data.js";

export const conversationsRoutes = new Hono();

conversationsRoutes.get("/:leadId/conversation", (c) => {
  if (c.req.param("leadId") !== conversationChen.leadId) {
    return c.json({ error: { code: "CONVERSATION_NOT_FOUND" } }, 404);
  }

  return c.json({ conversation: conversationChen });
});

conversationsRoutes.post("/:leadId/conversation/sync", (c) => {
  return c.json({
    channel: "mcp-xhs-chat",
    workflowRun: {
      id: "workflow_sync_queued",
      type: "conversion",
      status: "queued",
      leadId: c.req.param("leadId"),
    },
  }, 202);
});

conversationsRoutes.post("/:leadId/conversation/send", async (c) => {
  const body = await c.req.json();
  return c.json({
    channel: "mcp-xhs-chat",
    leadId: c.req.param("leadId"),
    message: body.message,
    status: "queued_for_send",
  }, 202);
});

conversationsRoutes.post("/:leadId/conversation/customer-reply", async (c) => {
  const body = await c.req.json();
  return c.json({
    leadId: c.req.param("leadId"),
    reply: body.content,
    status: "accepted",
  }, 202);
});
```

Create `apps/api/src/routes/workflows.ts`:

```ts
import { Hono } from "hono";

export const workflowsRoutes = new Hono();

workflowsRoutes.post("/discovery/run", async (c) => {
  const body = await c.req.json();
  return c.json({ workflowRun: { id: "workflow_discovery_queued", type: "discovery", status: "queued", campaignId: body.campaignId } }, 202);
});

workflowsRoutes.post("/conversion/run", async (c) => {
  const body = await c.req.json();
  return c.json({ workflowRun: { id: "workflow_conversion_queued", type: "conversion", status: "queued", leadId: body.leadId, mode: body.mode } }, 202);
});

workflowsRoutes.post("/handoff/run", async (c) => {
  const body = await c.req.json();
  return c.json({ workflowRun: { id: "workflow_handoff_queued", type: "handoff_recovery", status: "queued", leadId: body.leadId, reason: body.reason } }, 202);
});
```

Create `apps/api/src/routes/memories.ts`:

```ts
import { Hono } from "hono";
import { memoriesChen } from "../fixtures/demo-data.js";

export const memoriesRoutes = new Hono();

memoriesRoutes.get("/:leadId/memories", (c) => {
  return c.json({ leadId: c.req.param("leadId"), memories: memoriesChen });
});

memoriesRoutes.post("/:leadId/memories/recall", async (c) => {
  const body = await c.req.json();
  return c.json({
    leadId: c.req.param("leadId"),
    query: body.query,
    memories: memoriesChen.slice(0, body.limit ?? 8),
  });
});
```

Create `apps/api/src/routes/artifacts.ts`:

```ts
import { Hono } from "hono";
import { artifactsChen } from "../fixtures/demo-data.js";

export const artifactsRoutes = new Hono();

artifactsRoutes.get("/:leadId/artifacts", (c) => {
  return c.json({ leadId: c.req.param("leadId"), artifacts: artifactsChen });
});
```

Create `apps/api/src/routes/devices.ts`:

```ts
import { Hono } from "hono";

export const devicesRoutes = new Hono();

devicesRoutes.get("/xhs", (c) => {
  return c.json({
    items: [
      {
        platform: "xhs",
        deviceId: "device-1",
        adbAddress: "emulator-5554",
        status: "disconnected",
      },
    ],
  });
});

devicesRoutes.post("/xhs/connect", async (c) => {
  const body = await c.req.json();
  return c.json({
    channel: "mcp-xhs-chat",
    tool: "xhs_connect_device",
    deviceId: body.deviceId,
    adbAddress: body.adbAddress,
    status: "queued",
  }, 202);
});

devicesRoutes.post("/xhs/disconnect", async (c) => {
  const body = await c.req.json();
  return c.json({
    channel: "mcp-xhs-chat",
    tool: "xhs_disconnect_device",
    deviceId: body.deviceId,
    status: "queued",
  }, 202);
});
```

- [ ] **Step 7: Add server entrypoint**

Create `apps/api/src/index.ts`:

```ts
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);

serve({
  fetch: createApp().fetch,
  port,
});

console.log(`LeadFlow API listening on http://127.0.0.1:${port}`);
```

- [ ] **Step 8: Run API tests and typecheck**

Run:

```bash
pnpm --filter @leadflow/api test
pnpm --filter @leadflow/api typecheck
```

Expected: both commands pass.

- [ ] **Step 9: Run API server smoke check**

Run:

```bash
pnpm --filter @leadflow/api build
PORT=3001 pnpm --filter @leadflow/api dev
```

Expected: server prints `LeadFlow API listening on http://127.0.0.1:3001`.

In a second terminal, run:

```bash
curl -s http://127.0.0.1:3001/health
```

Expected:

```json
{"ok":true}
```

Stop the dev server with `Ctrl+C`.

- [ ] **Step 10: Commit API skeleton**

Run:

```bash
git add apps/api package.json pnpm-lock.yaml
git commit -m "feat: add hono api skeleton"
```

Expected: commit succeeds.

---

### Task 6: Verify Whole Foundation

**Files:**

- Modify: none

- [ ] **Step 1: Run full test suite**

Run:

```bash
pnpm test
```

Expected: core, playbook, and API tests pass.

- [ ] **Step 2: Run full typecheck**

Run:

```bash
pnpm typecheck
```

Expected: all packages typecheck successfully.

- [ ] **Step 3: Run full build**

Run:

```bash
pnpm build
```

Expected: all packages build successfully.

- [ ] **Step 4: Validate Prisma schema**

Run:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/leadflow" pnpm prisma:validate
```

Expected: Prisma reports the schema is valid.

- [ ] **Step 5: Commit verification note if generated files changed**

Run:

```bash
git status --short
```

Expected: no uncommitted changes. If Prisma generated files or lockfile changes remain, run:

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: finalize foundation verification"
```

Expected: commit succeeds or no commit is needed.

---

## Self-Review

Spec coverage:

- Monorepo foundation: Task 1.
- Shared state model and industry-agnostic `LeadProfile`: Task 2.
- Configurable Conversion Playbook: Task 3.
- Database operational state and references: Task 4.
- Hono API boundaries, Dashboard API, Conversation API, Device API, Memory API, Artifact API, Workflow API: Task 5.
- Verification commands: Task 6.

Deferred to later plans:

- Real Walrus adapter.
- Real MemWal adapter.
- Mastra workflow implementation.
- LLM provider implementation.
- mcp-xhs-chat process integration.
- Dashboard migration to `apps/web`.
- End-to-end demo orchestration.

Placeholder scan:

- This plan contains no unresolved implementation placeholders.

Type consistency:

- `LeadProfile`, `MemoryRef`, `ArtifactRef`, `TimelineEvent`, `SocialIdentity`, and `DeviceConfig` names match the master spec and data-state model.
- API paths match `docs/architecture/api-design-zh.md`.
