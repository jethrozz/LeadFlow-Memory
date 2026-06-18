# LeadFlow Dashboard Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prototype-only Dashboard with a real `apps/web` React + Vite application that reads LeadFlow API data and presents the judge-facing Memory Inspector.

**Architecture:** `apps/web` owns the production dashboard UI while preserving the current prototype layout: lead list, profile/timeline center, and inspector panel. Data access goes through a typed API client and dashboard route contracts from `@leadflow/core`; no direct adapter calls happen in the browser.

**Tech Stack:** React, Vite, TypeScript, CSS, Vitest, Testing Library, Hono API contract.

---

## Prerequisites

This plan assumes Plans 1-4 are complete and API endpoints exist for:

```text
GET /api/dashboard/leads
GET /api/dashboard/leads/:leadId
POST /api/leads/:leadId/conversation/sync
POST /api/leads/:leadId/conversation/send
POST /api/workflows/handoff/run
```

Existing prototype reference:

```text
leadflow-memory-prototype/src/App.jsx
leadflow-memory-prototype/src/styles.css
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
apps/web/package.json
apps/web/tsconfig.json
apps/web/index.html
apps/web/vite.config.ts
apps/web/src/main.tsx
apps/web/src/App.tsx
apps/web/src/api.ts
apps/web/src/types.ts
apps/web/src/components/LeadList.tsx
apps/web/src/components/ProfilePanel.tsx
apps/web/src/components/Timeline.tsx
apps/web/src/components/Inspector.tsx
apps/web/src/components/FollowupPanel.tsx
apps/web/src/styles.css
apps/web/src/App.test.tsx
```

Modify:

```text
package.json
```

Reference:

```text
docs/features/dashboard-memory-inspector-zh.md
leadflow-memory-prototype/design-qa.md
```

---

### Task 1: Create Web App Shell

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/App.test.tsx`
- Modify: `package.json`

- [ ] **Step 1: Create web package**

Create `apps/web/package.json`:

```json
{
  "name": "@leadflow/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -p tsconfig.json && vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --environment jsdom"
  },
  "dependencies": {
    "@leadflow/core": "workspace:*",
    "@vitejs/plugin-react": "^4.3.3",
    "vite": "^5.4.10",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
}
```

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LeadFlow Memory</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
```

- [ ] **Step 2: Add root web script**

Modify root `package.json` scripts to include:

```json
{
  "scripts": {
    "dev:web": "pnpm --filter @leadflow/web dev"
  }
}
```

- [ ] **Step 3: Write failing app test**

Create `apps/web/src/App.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("LeadFlow Dashboard", () => {
  it("renders the dashboard shell", () => {
    render(<App />);
    expect(screen.getByText("LeadFlow Memory")).toBeInTheDocument();
    expect(screen.getByText("客户长期记忆")).toBeInTheDocument();
  });
});
```

Run:

```bash
pnpm --filter @leadflow/web test
```

Expected: FAIL because `App` does not exist.

- [ ] **Step 4: Implement dashboard shell**

Create `apps/web/src/App.tsx`:

```tsx
import "./styles.css";

export function App() {
  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Walrus Track Demo</p>
        <h1>LeadFlow Memory</h1>
        <p>可验证长期记忆销售 Agent 工作台</p>
      </header>
      <section className="dashboard-grid">
        <aside className="panel">
          <h2>线索列表</h2>
        </aside>
        <section className="panel">
          <h2>客户长期记忆</h2>
        </section>
        <aside className="panel">
          <h2>Inspector</h2>
        </aside>
      </section>
    </main>
  );
}
```

Create `apps/web/src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

Create `apps/web/src/styles.css`:

```css
:root {
  color: #18201a;
  background: #f5efe2;
  font-family: "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  padding: 32px;
  background:
    radial-gradient(circle at 12% 18%, rgba(225, 109, 57, 0.26), transparent 28%),
    linear-gradient(135deg, #f5efe2 0%, #dfe8d2 55%, #c9ddd5 100%);
}

.hero {
  margin-bottom: 24px;
}

.eyebrow {
  color: #9a4e24;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero h1 {
  margin: 0;
  font-size: clamp(40px, 7vw, 88px);
  line-height: 0.92;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 300px minmax(360px, 1fr) 360px;
  gap: 18px;
}

.panel {
  min-height: 320px;
  border: 1px solid rgba(24, 32, 26, 0.14);
  border-radius: 28px;
  padding: 20px;
  background: rgba(255, 252, 243, 0.76);
  box-shadow: 0 24px 70px rgba(48, 55, 43, 0.12);
}

@media (max-width: 980px) {
  .app-shell {
    padding: 18px;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Verify shell**

Run:

```bash
pnpm --filter @leadflow/web test
pnpm --filter @leadflow/web typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit web shell**

Run:

```bash
git add apps/web package.json
git commit -m "feat: add leadflow web dashboard shell"
```

Expected: commit succeeds.

---

### Task 2: Add Typed API Client and Loading States

**Files:**

- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/types.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Add API client tests**

Replace `apps/web/src/App.test.tsx` with:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const leadListResponse = {
  leads: [
    {
      id: "lead_001",
      displayName: "重庆买房小陈",
      platform: "xhs",
      intentLevel: "A",
      status: "replied",
      summary: "预算 130 万以内，关注渝北三房。",
      updatedAt: "2026-06-11T10:00:00.000Z"
    }
  ]
};

const leadDetailResponse = {
  lead: leadListResponse.leads[0],
  profile: {
    summary: "客户关注渝北三房。",
    fields: {
      budget: { label: "预算", value: "130万以内", confidence: 0.92 },
      district: { label: "区域", value: "渝北", confidence: 0.9 }
    }
  },
  timeline: [],
  memories: [],
  artifacts: [],
  nextFollowup: "索要微信发送房源对比。"
};

describe("LeadFlow Dashboard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/api/dashboard/leads")) {
        return Response.json(leadListResponse);
      }
      return Response.json(leadDetailResponse);
    }));
  });

  it("loads leads and selected lead detail", async () => {
    render(<App />);
    expect(screen.getByText("加载线索中...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("重庆买房小陈")).toBeInTheDocument());
    expect(screen.getByText("客户关注渝北三房。")).toBeInTheDocument();
  });
});
```

Run:

```bash
pnpm --filter @leadflow/web test
```

Expected: FAIL because app does not fetch data.

- [ ] **Step 2: Add web types**

Create `apps/web/src/types.ts`:

```ts
export type DashboardLeadItem = {
  id: string;
  displayName: string;
  platform: string;
  intentLevel: string;
  status: string;
  summary: string;
  updatedAt: string;
};

export type DashboardLeadDetail = {
  lead: DashboardLeadItem;
  profile: {
    summary: string;
    fields: Record<string, { label: string; value: string; confidence: number }>;
  };
  timeline: Array<{
    id: string;
    type: string;
    summary: string;
    createdAt: string;
    memoryRefs: string[];
    artifactRefs: string[];
  }>;
  memories: Array<{ id: string; content: string; confidence: number; updatedAt: string }>;
  artifacts: Array<{ id: string; type: string; blobId: string; createdAt: string }>;
  nextFollowup: string;
};
```

Create `apps/web/src/api.ts`:

```ts
import type { DashboardLeadDetail, DashboardLeadItem } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchDashboardLeads(): Promise<DashboardLeadItem[]> {
  const json = await requestJson<{ leads: DashboardLeadItem[] }>("/api/dashboard/leads");
  return json.leads;
}

export async function fetchDashboardLeadDetail(leadId: string): Promise<DashboardLeadDetail> {
  return requestJson<DashboardLeadDetail>(`/api/dashboard/leads/${leadId}`);
}
```

- [ ] **Step 3: Update App to fetch data**

Modify `apps/web/src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { fetchDashboardLeadDetail, fetchDashboardLeads } from "./api";
import type { DashboardLeadDetail, DashboardLeadItem } from "./types";
import "./styles.css";

export function App() {
  const [leads, setLeads] = useState<DashboardLeadItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DashboardLeadDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchDashboardLeads().then((items) => {
      if (!active) return;
      setLeads(items);
      setSelectedLeadId(items[0]?.id ?? null);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedLeadId) return;
    let active = true;
    fetchDashboardLeadDetail(selectedLeadId).then((data) => {
      if (active) setDetail(data);
    });
    return () => {
      active = false;
    };
  }, [selectedLeadId]);

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Walrus Track Demo</p>
        <h1>LeadFlow Memory</h1>
        <p>可验证长期记忆销售 Agent 工作台</p>
      </header>
      <section className="dashboard-grid">
        <aside className="panel">
          <h2>线索列表</h2>
          {isLoading ? <p>加载线索中...</p> : null}
          {leads.map((lead) => (
            <button className="lead-card" key={lead.id} onClick={() => setSelectedLeadId(lead.id)}>
              <strong>{lead.displayName}</strong>
              <span>{lead.intentLevel} · {lead.status}</span>
              <small>{lead.summary}</small>
            </button>
          ))}
        </aside>
        <section className="panel">
          <h2>客户长期记忆</h2>
          <p>{detail?.profile.summary ?? "选择一个线索查看长期记忆。"}</p>
          {detail ? Object.entries(detail.profile.fields).map(([key, field]) => (
            <div className="field-row" key={key}>
              <span>{field.label}</span>
              <strong>{field.value}</strong>
            </div>
          )) : null}
        </section>
        <aside className="panel">
          <h2>Inspector</h2>
          <p>{detail?.nextFollowup ?? "等待 Agent 生成下一步。"}</p>
        </aside>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Add card styles**

Append to `apps/web/src/styles.css`:

```css
.lead-card {
  display: grid;
  width: 100%;
  margin: 12px 0;
  padding: 14px;
  border: 1px solid rgba(24, 32, 26, 0.12);
  border-radius: 18px;
  background: #fffaf0;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.lead-card span {
  color: #9a4e24;
}

.lead-card small {
  margin-top: 8px;
  color: rgba(24, 32, 26, 0.68);
}

.field-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin: 10px 0;
  padding: 12px 0;
  border-bottom: 1px solid rgba(24, 32, 26, 0.1);
}
```

- [ ] **Step 5: Verify data loading**

Run:

```bash
pnpm --filter @leadflow/web test
pnpm --filter @leadflow/web typecheck
```

Expected: both commands pass.

---

### Task 3: Add Lead List, Timeline, Inspector Components

**Files:**

- Create: `apps/web/src/components/LeadList.tsx`
- Create: `apps/web/src/components/ProfilePanel.tsx`
- Create: `apps/web/src/components/Timeline.tsx`
- Create: `apps/web/src/components/Inspector.tsx`
- Create: `apps/web/src/components/FollowupPanel.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Add component test expectations**

Append to the existing test in `apps/web/src/App.test.tsx` after the detail assertion:

```tsx
expect(screen.getByText("Memory Timeline")).toBeInTheDocument();
expect(screen.getByText("Walrus Artifacts")).toBeInTheDocument();
expect(screen.getByText("Next Follow-up")).toBeInTheDocument();
```

Run:

```bash
pnpm --filter @leadflow/web test
```

Expected: FAIL because component headings are missing.

- [ ] **Step 2: Create LeadList**

Create `apps/web/src/components/LeadList.tsx`:

```tsx
import type { DashboardLeadItem } from "../types";

export function LeadList(props: {
  leads: DashboardLeadItem[];
  selectedLeadId: string | null;
  onSelectLead: (leadId: string) => void;
}) {
  return (
    <>
      <h2>线索列表</h2>
      {props.leads.map((lead) => (
        <button
          className={lead.id === props.selectedLeadId ? "lead-card is-selected" : "lead-card"}
          key={lead.id}
          onClick={() => props.onSelectLead(lead.id)}
        >
          <strong>{lead.displayName}</strong>
          <span>{lead.intentLevel} · {lead.status}</span>
          <small>{lead.summary}</small>
        </button>
      ))}
    </>
  );
}
```

- [ ] **Step 3: Create ProfilePanel**

Create `apps/web/src/components/ProfilePanel.tsx`:

```tsx
import type { DashboardLeadDetail } from "../types";

export function ProfilePanel({ detail }: { detail: DashboardLeadDetail | null }) {
  return (
    <>
      <h2>客户长期记忆</h2>
      <p>{detail?.profile.summary ?? "选择一个线索查看长期记忆。"}</p>
      {detail ? Object.entries(detail.profile.fields).map(([key, field]) => (
        <div className="field-row" key={key}>
          <span>{field.label}</span>
          <strong>{field.value}</strong>
        </div>
      )) : null}
    </>
  );
}
```

- [ ] **Step 4: Create Timeline**

Create `apps/web/src/components/Timeline.tsx`:

```tsx
import type { DashboardLeadDetail } from "../types";

export function Timeline({ detail }: { detail: DashboardLeadDetail | null }) {
  return (
    <section className="timeline-card">
      <h2>Memory Timeline</h2>
      {(detail?.timeline ?? []).map((event) => (
        <article className="timeline-event" key={event.id}>
          <strong>{event.type}</strong>
          <p>{event.summary}</p>
          <small>{event.createdAt}</small>
        </article>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Create Inspector**

Create `apps/web/src/components/Inspector.tsx`:

```tsx
import type { DashboardLeadDetail } from "../types";

export function Inspector({ detail }: { detail: DashboardLeadDetail | null }) {
  return (
    <>
      <h2>Inspector</h2>
      <section>
        <h3>MemWal Memory</h3>
        {(detail?.memories ?? []).map((memory) => (
          <p className="inspector-item" key={memory.id}>{memory.content}</p>
        ))}
      </section>
      <section>
        <h3>Walrus Artifacts</h3>
        {(detail?.artifacts ?? []).map((artifact) => (
          <p className="inspector-item" key={artifact.id}>{artifact.type}: {artifact.blobId}</p>
        ))}
      </section>
    </>
  );
}
```

- [ ] **Step 6: Create FollowupPanel**

Create `apps/web/src/components/FollowupPanel.tsx`:

```tsx
import type { DashboardLeadDetail } from "../types";

export function FollowupPanel({ detail }: { detail: DashboardLeadDetail | null }) {
  return (
    <section className="followup-card">
      <h2>Next Follow-up</h2>
      <p>{detail?.nextFollowup ?? "等待 Agent 生成下一步。"}</p>
    </section>
  );
}
```

- [ ] **Step 7: Update App composition**

Modify `apps/web/src/App.tsx` imports and dashboard body:

```tsx
import { useEffect, useState } from "react";
import { fetchDashboardLeadDetail, fetchDashboardLeads } from "./api";
import { FollowupPanel } from "./components/FollowupPanel";
import { Inspector } from "./components/Inspector";
import { LeadList } from "./components/LeadList";
import { ProfilePanel } from "./components/ProfilePanel";
import { Timeline } from "./components/Timeline";
import type { DashboardLeadDetail, DashboardLeadItem } from "./types";
import "./styles.css";
```

Use this inside `<section className="dashboard-grid">`:

```tsx
<aside className="panel">
  {isLoading ? <p>加载线索中...</p> : null}
  <LeadList leads={leads} selectedLeadId={selectedLeadId} onSelectLead={setSelectedLeadId} />
</aside>
<section className="panel main-panel">
  <ProfilePanel detail={detail} />
  <Timeline detail={detail} />
</section>
<aside className="panel">
  <FollowupPanel detail={detail} />
  <Inspector detail={detail} />
</aside>
```

- [ ] **Step 8: Add component styles**

Append to `apps/web/src/styles.css`:

```css
.is-selected {
  border-color: #e16d39;
  box-shadow: 0 14px 30px rgba(225, 109, 57, 0.16);
}

.main-panel {
  display: grid;
  gap: 18px;
}

.timeline-card,
.followup-card {
  border-radius: 22px;
  padding: 16px;
  background: rgba(255, 250, 240, 0.72);
}

.timeline-event,
.inspector-item {
  margin: 10px 0;
  padding: 12px;
  border-radius: 16px;
  background: rgba(24, 32, 26, 0.06);
}
```

- [ ] **Step 9: Verify components**

Run:

```bash
pnpm --filter @leadflow/web test
pnpm --filter @leadflow/web typecheck
```

Expected: both commands pass.

- [ ] **Step 10: Commit dashboard components**

Run:

```bash
git add apps/web
git commit -m "feat: build dashboard memory inspector"
```

Expected: commit succeeds.

---

### Task 4: Add Dashboard Actions for Sync, Send, and Handoff

**Files:**

- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/components/FollowupPanel.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Add action API functions**

Append to `apps/web/src/api.ts`:

```ts
export async function syncConversation(leadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/conversation/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId: "device-1",
      xhsUsername: "重庆买房小陈",
    }),
  });
  if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
  return response.json();
}

export async function sendFollowup(leadId: string, message: string) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/conversation/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId: "device-1",
      xhsUsername: "重庆买房小陈",
      message,
    }),
  });
  if (!response.ok) throw new Error(`Send failed: ${response.status}`);
  return response.json();
}

export async function runHandoff(leadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/workflows/handoff/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leadId,
      memorySpaceId: "space_001",
      fromWorkerId: "worker-1",
      toWorkerId: "worker-2",
    }),
  });
  if (!response.ok) throw new Error(`Handoff failed: ${response.status}`);
  return response.json();
}
```

- [ ] **Step 2: Add action test expectations**

Update `apps/web/src/App.test.tsx` to assert buttons render:

```tsx
expect(screen.getByRole("button", { name: "同步小红书聊天" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "发送跟进私信" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "触发接力恢复" })).toBeInTheDocument();
```

Run:

```bash
pnpm --filter @leadflow/web test
```

Expected: FAIL because buttons are missing.

- [ ] **Step 3: Update FollowupPanel actions**

Modify `apps/web/src/components/FollowupPanel.tsx`:

```tsx
import type { DashboardLeadDetail } from "../types";

export function FollowupPanel(props: {
  detail: DashboardLeadDetail | null;
  onSync: () => void;
  onSend: () => void;
  onHandoff: () => void;
}) {
  return (
    <section className="followup-card">
      <h2>Next Follow-up</h2>
      <p>{props.detail?.nextFollowup ?? "等待 Agent 生成下一步。"}</p>
      <div className="action-row">
        <button onClick={props.onSync}>同步小红书聊天</button>
        <button onClick={props.onSend}>发送跟进私信</button>
        <button onClick={props.onHandoff}>触发接力恢复</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire actions in App**

Modify `apps/web/src/App.tsx` imports:

```tsx
import {
  fetchDashboardLeadDetail,
  fetchDashboardLeads,
  runHandoff,
  sendFollowup,
  syncConversation,
} from "./api";
```

Add handlers inside `App`:

```tsx
const refreshSelectedLead = async () => {
  if (!selectedLeadId) return;
  setDetail(await fetchDashboardLeadDetail(selectedLeadId));
};

const handleSync = async () => {
  if (!selectedLeadId) return;
  await syncConversation(selectedLeadId);
  await refreshSelectedLead();
};

const handleSend = async () => {
  if (!selectedLeadId || !detail) return;
  await sendFollowup(selectedLeadId, detail.nextFollowup);
  await refreshSelectedLead();
};

const handleHandoff = async () => {
  if (!selectedLeadId) return;
  await runHandoff(selectedLeadId);
  await refreshSelectedLead();
};
```

Pass handlers:

```tsx
<FollowupPanel
  detail={detail}
  onSync={handleSync}
  onSend={handleSend}
  onHandoff={handleHandoff}
/>
```

- [ ] **Step 5: Add action styles**

Append to `apps/web/src/styles.css`:

```css
.action-row {
  display: grid;
  gap: 10px;
}

.action-row button {
  border: 0;
  border-radius: 999px;
  padding: 12px 14px;
  background: #18201a;
  color: #fffaf0;
  font-weight: 700;
  cursor: pointer;
}
```

- [ ] **Step 6: Verify actions**

Run:

```bash
pnpm --filter @leadflow/web test
pnpm --filter @leadflow/web typecheck
```

Expected: both commands pass.

---

### Task 5: Verify Dashboard Plan

**Files:**

- Modify: none

- [ ] **Step 1: Build web app**

Run:

```bash
pnpm --filter @leadflow/web build
```

Expected: Vite build succeeds and writes `apps/web/dist`.

- [ ] **Step 2: Run full workspace checks**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all workspace checks pass.

- [ ] **Step 3: Commit final dashboard integration**

Run:

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat: connect dashboard to leadflow api"
```

Expected: commit succeeds.

---

## Self-Review

Spec coverage:

- Lead list, profile, timeline, inspector: Tasks 2-3.
- MemWal and Walrus visibility: Task 3.
- XHS sync/send and handoff actions: Task 4.
- Real API data path instead of prototype-only mock: Tasks 2-4.

Deferred to later plans:

- End-to-end demo seed and script.
- Browser visual QA and Walrus Sites deployment.
- Authentication and team permissions.

Placeholder scan:

- This plan contains no unresolved implementation placeholders.

Type consistency:

- Dashboard types match API dashboard response names.
- Browser actions call the API paths defined in `docs/architecture/api-design-zh.md`.
