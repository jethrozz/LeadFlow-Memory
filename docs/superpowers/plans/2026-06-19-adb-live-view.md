# ADB 实时画面 + 工作台布局改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Web 工作台实时展示 ADB 真机（小红书 App）的操作画面，并把工作台重排为三栏布局 + 三层中区（会话条 / 画像+跟进含 Inspector Tab / 底部横向时间线进度带）。

**Architecture:** 复用 followup-loop 正在驱动的同一个 Midscene `AndroidAgent`，在 `XhsChatClient` 上新增 `getScreenshot` 截图能力；API 暴露 `GET /api/devices/:deviceId/screenshot`；前端用 `<img>` 每 ~700ms 轮询刷新。布局改动集中在 `App.tsx` + `styles.css`，时间线阶段映射抽成纯函数模块单独测试。

**Tech Stack:** TypeScript、Hono（API）、React 19 + Vite（web）、Vitest、`@midscene/android`、pnpm workspace。

设计来源：`docs/superpowers/specs/2026-06-19-adb-live-view-design.md`

---

## 接口契约（贯穿全计划，先读）

后端方法签名（`XhsChatClient`）：

```ts
getScreenshot(input: { deviceId: string }): Promise<{ imageDataUrl: string; capturedAt: string }>
```

- `imageDataUrl`：可直接赋给 `<img src>` 的 data URL（形如 `data:image/jpeg;base64,...`）。Midscene 的 `page.screenshotBase64()` 已返回带前缀的 data URL；若无前缀则按 jpeg 包装。统一在后端归一化，前端不做拼接。
- `capturedAt`：ISO 时间戳。

HTTP 契约：

- `GET /api/devices/:deviceId/screenshot`
  - 成功 → `200 { imageDataUrl, capturedAt }`
  - 失败（未连接/截图异常）→ `503 { error: { code: "DEVICE_SCREENSHOT_FAILED" } }`
- `GET /api/devices/xhs` → `200 { devices: [{ deviceId, status }] }`，`deviceId` 取自 `AUTO_FOLLOWUP_DEVICE_ID`（缺省 `b759b4fa`，与 `apps/api/src/followup-loop.ts` / `debug-conversion-e2e.ts` 一致）。

时间线 6 个展示阶段（固定顺序）与事件类型映射：

| 阶段 key | 阶段中文 | 命中的 timeline `type` |
|----------|----------|------------------------|
| `discovered` | 发现线索 | `lead_discovered` |
| `scored` | 意向评分 | （无独立事件，跟随 discovered 完成）|
| `contacted` | 首次跟进 | `conversion_decision_made` / `agent_replied` |
| `replied` | 客户回复 | `customer_replied` |
| `updated` | 记忆更新 | `memory_diff`（如有）|
| `handoff` | 接力恢复 | `handoff_recovered` |

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `packages/connectors/src/xhs-chat/types.ts` | `XhsChatClient` 接口 | 加 `getScreenshot` |
| `packages/connectors/src/xhs-chat/midscene-client.ts` | 真机实现 | 实现 `getScreenshot`（归一化 data URL）|
| `packages/connectors/src/xhs-chat/fake-client.ts` | 假实现 | 返回内置占位图 |
| `packages/connectors/src/xhs-chat/mcp-client.ts` | legacy stdio | 抛 `NOT_SUPPORTED` |
| `packages/connectors/src/xhs-chat/xhs-chat.test.ts` | 连接器测试 | 加 fake `getScreenshot` 断言 |
| `apps/api/src/routes/devices.ts` | 设备路由 | 截图端点 + 改造 `/xhs` |
| `apps/api/src/app.test.ts` | API 测试 | 截图端点 200/503 + `/xhs` deviceId |
| `apps/web/src/api.ts` | 前端 API 封装 | `fetchActiveDevice` / `fetchDeviceScreenshot` |
| `apps/web/src/timeline-stage.ts` | 阶段映射纯函数 | 新建 |
| `apps/web/src/timeline-stage.test.ts` | 纯函数单测 | 新建 |
| `apps/web/src/DeviceScreen.tsx` | 实时画面组件 | 新建 |
| `apps/web/src/App.tsx` | 工作台布局 | 三栏 + 三层中区重排 |
| `apps/web/src/styles.css` | 样式 | 三栏 grid + 设备栏 + 横向时间线 + Tab |
| `apps/web/src/App.test.tsx` | 工作台测试 | 扩展 mock + 新断言 |

执行约定：每个 task 末尾 commit，message 用中文（仓库规范，见 `CLAUDE.md`）。命令在仓库根 `/Users/jethrozz/Documents/UGit/LeadFlow-Memory` 执行。

---

## Task 1: 连接器新增 `getScreenshot`

**Files:**
- Modify: `packages/connectors/src/xhs-chat/types.ts`
- Modify: `packages/connectors/src/xhs-chat/fake-client.ts`
- Modify: `packages/connectors/src/xhs-chat/midscene-client.ts`
- Modify: `packages/connectors/src/xhs-chat/mcp-client.ts`
- Test: `packages/connectors/src/xhs-chat/xhs-chat.test.ts`

- [ ] **Step 1: 写失败测试**

在 `packages/connectors/src/xhs-chat/xhs-chat.test.ts` 的第一个 `describe("XHS chat connector", ...)` 内，`sends private messages` 用例之后追加：

```ts
  it("returns a screenshot data url from the fake client", async () => {
    const client = new FakeXhsChatClient();
    const result = await client.getScreenshot({ deviceId: "device-1" });

    expect(result.imageDataUrl).toMatch(/^data:image\/(png|jpeg);base64,/);
    expect(typeof result.capturedAt).toBe("string");
    expect(Number.isNaN(Date.parse(result.capturedAt))).toBe(false);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @leadflow/connectors test`
Expected: 失败，TS 报 `Property 'getScreenshot' does not exist on type 'FakeXhsChatClient'`（或运行期 `getScreenshot is not a function`）。

- [ ] **Step 3: 接口加方法**

在 `packages/connectors/src/xhs-chat/types.ts`，先在 `XhsDeviceResult` 之后加返回类型，再在 `XhsChatClient` 末尾加方法：

```ts
export type XhsScreenshotResult = {
  imageDataUrl: string;
  capturedAt: string;
};
```

```ts
export type XhsChatClient = {
  connectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult>;
  disconnectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult>;
  getConversation(input: XhsGetConversationInput): Promise<XhsGetConversationResult>;
  sendPrivateMessage(input: XhsSendPrivateMessageInput): Promise<XhsSendPrivateMessageResult>;
  getScreenshot(input: XhsDeviceInput): Promise<XhsScreenshotResult>;
};
```

- [ ] **Step 4: Fake 实现**

在 `packages/connectors/src/xhs-chat/fake-client.ts`：先把 import 的类型补上 `XhsScreenshotResult`，再在类内 `sendPrivateMessage` 之后加方法。占位图用一张 1×1 透明 PNG 的 base64 常量（够测试、够 dev 占位）。

import 行改为：

```ts
import type {
  XhsChatClient,
  XhsConversationMessage,
  XhsDeviceInput,
  XhsDeviceResult,
  XhsGetConversationInput,
  XhsGetConversationResult,
  XhsScreenshotResult,
  XhsSendPrivateMessageInput,
  XhsSendPrivateMessageResult,
} from "./types.js";
```

类内追加：

```ts
  async getScreenshot(_input: XhsDeviceInput): Promise<XhsScreenshotResult> {
    // 1×1 透明 PNG 占位：无真机时 dev/测试可渲染一帧。
    const onePxPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    return {
      imageDataUrl: `data:image/png;base64,${onePxPng}`,
      capturedAt: new Date().toISOString(),
    };
  }
```

- [ ] **Step 5: Midscene 真机实现**

在 `packages/connectors/src/xhs-chat/midscene-client.ts`：先在类型 import 里补 `XhsScreenshotResult`，再在 `sendPrivateMessage` 之后、`close` 之前加方法。`page.screenshotBase64()` 可能返回带或不带 `data:` 前缀的字符串，统一归一化。

import 块补一行 `XhsScreenshotResult,`（与现有 `XhsSendPrivateMessageResult,` 同列表）。

类内追加：

```ts
  async getScreenshot(input: XhsDeviceInput): Promise<XhsScreenshotResult> {
    const { deviceId } = input;
    await this.ensureConnected(deviceId);
    const agent = this.devices.getAgent(deviceId);
    const raw = await agent.page.screenshotBase64();
    const imageDataUrl = raw.startsWith("data:") ? raw : `data:image/jpeg;base64,${raw}`;
    return { imageDataUrl, capturedAt: new Date().toISOString() };
  }
```

- [ ] **Step 6: MCP legacy stub**

在 `packages/connectors/src/xhs-chat/mcp-client.ts`：import 类型补 `XhsScreenshotResult,`，类内任意公开方法旁加：

```ts
  async getScreenshot(_input: XhsDeviceInput): Promise<XhsScreenshotResult> {
    throw new Error("NOT_SUPPORTED: getScreenshot is unavailable in legacy MCP stdio mode");
  }
```

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm --filter @leadflow/connectors test`
Expected: 全部 PASS（含新用例）。

- [ ] **Step 8: Commit**

```bash
git add packages/connectors/src/xhs-chat/
git commit -m "feat: 连接器新增 getScreenshot 截图能力(midscene 真机/fake 占位/mcp stub)"
```

---

## Task 2: API 截图端点 + 改造 `/xhs`

**Files:**
- Modify: `apps/api/src/routes/devices.ts`
- Test: `apps/api/src/app.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/api/src/app.test.ts` 顶层 `describe("api app", ...)` 内末尾追加三个用例（用现有 `createApp(createFakeServices())` 的 `app`，以及一个会抛错的自定义 client）：

```ts
  it("GET /api/devices/xhs 返回默认设备 id", async () => {
    const response = await app.request("/api/devices/xhs");
    expect(response.status).toBe(200);
    const json = (await response.json()) as { devices: Array<{ deviceId: string }> };
    expect(json.devices[0]?.deviceId).toBeTruthy();
  });

  it("GET /api/devices/:id/screenshot 返回截图 data url", async () => {
    const response = await app.request("/api/devices/device-1/screenshot");
    expect(response.status).toBe(200);
    const json = (await response.json()) as { imageDataUrl: string; capturedAt: string };
    expect(json.imageDataUrl).toMatch(/^data:image\//);
    expect(json.capturedAt).toBeTruthy();
  });

  it("截图失败时返回 503", async () => {
    const services = createFakeServices();
    services.xhsChat = {
      ...services.xhsChat,
      getScreenshot: async () => {
        throw new Error("device offline");
      },
    };
    const failApp = createApp(services);
    const response = await failApp.request("/api/devices/device-1/screenshot");
    expect(response.status).toBe(503);
    const json = (await response.json()) as { error: { code: string } };
    expect(json.error.code).toBe("DEVICE_SCREENSHOT_FAILED");
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @leadflow/api test`
Expected: 新用例失败——`/screenshot` 命中 404（未注册），`/xhs` 断言可能因写死的 `device-1` 偶然通过也无妨，关注 screenshot 两条失败。

- [ ] **Step 3: 实现路由**

改写 `apps/api/src/routes/devices.ts`：把写死的 `GET /xhs` 改成读 env，并新增 screenshot 端点。完整替换 `route.get("/xhs", ...)` 那段，并在 `return route;` 之前插入截图端点：

```ts
  route.get("/xhs", (c) => {
    const deviceId = process.env.AUTO_FOLLOWUP_DEVICE_ID || "b759b4fa";
    return c.json({ devices: [{ deviceId, status: "connected" }] });
  });

  route.get("/:deviceId/screenshot", async (c) => {
    const deviceId = c.req.param("deviceId");
    try {
      const shot = await services.xhsChat.getScreenshot({ deviceId });
      return c.json(shot);
    } catch (err) {
      console.warn(
        "[devices/screenshot] failed:",
        err instanceof Error ? err.message : err,
      );
      return c.json({ error: { code: "DEVICE_SCREENSHOT_FAILED" } }, 503);
    }
  });
```

注意：`/:deviceId/screenshot` 与既有静态路径 `/xhs`、`/xhs/connect`、`/xhs-web/login-status` 不冲突（静态段优先匹配，且后者多一段路径）。新端点放在 `xhs-web/login-status` 之后、`return route;` 之前即可。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @leadflow/api test`
Expected: 全部 PASS（含 3 条新用例）。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/devices.ts apps/api/src/app.test.ts
git commit -m "feat: 新增 GET /api/devices/:id/screenshot 截图端点并让 /xhs 返回真实设备"
```

---

## Task 3: 前端 API 封装

**Files:**
- Modify: `apps/web/src/api.ts`

- [ ] **Step 1: 加封装函数**

在 `apps/web/src/api.ts` 末尾追加（复用文件顶部已有的 `API_BASE_URL` 与 `requestJson`）：

```ts
export async function fetchActiveDevice(): Promise<{ deviceId: string } | null> {
  const json = await requestJson<{ devices: Array<{ deviceId: string }> }>("/api/devices/xhs");
  return json.devices[0] ?? null;
}

export async function fetchDeviceScreenshot(
  deviceId: string,
): Promise<{ imageDataUrl: string; capturedAt: string }> {
  return requestJson<{ imageDataUrl: string; capturedAt: string }>(
    `/api/devices/${deviceId}/screenshot`,
  );
}
```

- [ ] **Step 2: 类型检查通过**

Run: `pnpm --filter @leadflow/web exec tsc --noEmit`
Expected: 无新增报错（`fetchActiveDevice` / `fetchDeviceScreenshot` 编译通过）。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api.ts
git commit -m "feat: web 新增 fetchActiveDevice / fetchDeviceScreenshot"
```

---

## Task 4: 时间线阶段映射纯函数

**Files:**
- Create: `apps/web/src/timeline-stage.ts`
- Test: `apps/web/src/timeline-stage.test.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/web/src/timeline-stage.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { TIMELINE_STAGES, currentStageIndex } from "./timeline-stage";

describe("timeline-stage", () => {
  it("暴露 6 个有序阶段", () => {
    expect(TIMELINE_STAGES.map((s) => s.key)).toEqual([
      "discovered",
      "scored",
      "contacted",
      "replied",
      "updated",
      "handoff",
    ]);
  });

  it("空时间线返回 -1（未开始）", () => {
    expect(currentStageIndex([])).toBe(-1);
  });

  it("最新事件 customer_replied 映射到 replied 阶段(索引 3)", () => {
    const idx = currentStageIndex([
      { type: "lead_discovered" },
      { type: "agent_replied" },
      { type: "customer_replied" },
    ]);
    expect(idx).toBe(3);
  });

  it("handoff_recovered 映射到最后阶段(索引 5)", () => {
    expect(currentStageIndex([{ type: "handoff_recovered" }])).toBe(5);
  });

  it("未知事件类型回退到 discovered(索引 0)", () => {
    expect(currentStageIndex([{ type: "something_else" }])).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @leadflow/web test -- timeline-stage`
Expected: 失败，`Cannot find module './timeline-stage'`。

- [ ] **Step 3: 实现纯函数**

Create `apps/web/src/timeline-stage.ts`：

```ts
export type TimelineStage = { key: string; label: string };

// 固定的 6 段展示模型（与设计文档一致）。
export const TIMELINE_STAGES: TimelineStage[] = [
  { key: "discovered", label: "发现线索" },
  { key: "scored", label: "意向评分" },
  { key: "contacted", label: "首次跟进" },
  { key: "replied", label: "客户回复" },
  { key: "updated", label: "记忆更新" },
  { key: "handoff", label: "接力恢复" },
];

// 事件 type → 阶段索引。未列出的 type 回退到 0(发现线索)。
const TYPE_TO_STAGE: Record<string, number> = {
  lead_discovered: 0,
  conversion_decision_made: 2,
  agent_replied: 2,
  customer_replied: 3,
  memory_diff: 4,
  handoff_recovered: 5,
};

// 取时间线中"最靠后阶段"的事件作为当前进度；空数组返回 -1。
export function currentStageIndex(timeline: Array<{ type: string }>): number {
  if (timeline.length === 0) return -1;
  let maxIdx = 0;
  for (const ev of timeline) {
    const idx = TYPE_TO_STAGE[ev.type] ?? 0;
    if (idx > maxIdx) maxIdx = idx;
  }
  return maxIdx;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @leadflow/web test -- timeline-stage`
Expected: PASS（5 条）。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/timeline-stage.ts apps/web/src/timeline-stage.test.ts
git commit -m "feat: 时间线 6 段进度映射纯函数 + 单测"
```

---

## Task 5: DeviceScreen 实时画面组件

**Files:**
- Create: `apps/web/src/DeviceScreen.tsx`

- [ ] **Step 1: 实现组件**

Create `apps/web/src/DeviceScreen.tsx`。轮询 700ms，in-flight 守卫防堆积，`document.hidden` 暂停，状态机：连接中 / LIVE / 设备未连接 / 画面已暂停。

```tsx
import { useEffect, useRef, useState } from "react";
import { fetchActiveDevice, fetchDeviceScreenshot } from "./api";

const POLL_MS = 700;
const FAIL_THRESHOLD = 5; // 连续失败这么多次后标记"画面已暂停"

type ScreenStatus = "connecting" | "live" | "no-device" | "stalled";

export function DeviceScreen() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<ScreenStatus>("connecting");
  const inFlight = useRef(false);
  const failCount = useRef(0);

  // 1) 解析要轮询的设备 id
  useEffect(() => {
    let active = true;
    fetchActiveDevice()
      .then((d) => {
        if (!active) return;
        if (d?.deviceId) setDeviceId(d.deviceId);
        else setStatus("no-device");
      })
      .catch(() => active && setStatus("no-device"));
    return () => {
      active = false;
    };
  }, []);

  // 2) 轮询截图
  useEffect(() => {
    if (!deviceId) return;
    let stopped = false;

    async function tick() {
      if (stopped || inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        const shot = await fetchDeviceScreenshot(deviceId!);
        if (stopped) return;
        setFrame(shot.imageDataUrl);
        setCapturedAt(shot.capturedAt);
        setStatus("live");
        failCount.current = 0;
      } catch {
        failCount.current += 1;
        if (failCount.current >= FAIL_THRESHOLD) {
          setStatus((s) => (s === "live" ? "stalled" : "no-device"));
        }
      } finally {
        inFlight.current = false;
      }
    }

    const timer = setInterval(tick, POLL_MS);
    tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [deviceId]);

  const time = capturedAt
    ? new Date(capturedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "";

  return (
    <div className="device-screen">
      <div className="device-screen-head">
        <span className="device-title">实时画面</span>
        <span className={`device-live device-live-${status}`}>
          {status === "live" && <>● LIVE {time}</>}
          {status === "connecting" && "连接中…"}
          {status === "no-device" && "设备未连接"}
          {status === "stalled" && "画面已暂停"}
        </span>
      </div>
      <div className="device-frame">
        {frame ? (
          <img className="device-img" src={frame} alt="设备实时画面" />
        ) : (
          <div className="device-placeholder">
            {status === "no-device" ? "等待 Agent 启动会话" : "等待首帧…"}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查通过**

Run: `pnpm --filter @leadflow/web exec tsc --noEmit`
Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/DeviceScreen.tsx
git commit -m "feat: DeviceScreen 实时画面组件(700ms 轮询/in-flight 守卫/隐藏暂停/状态机)"
```

---

## Task 6: App.tsx 三栏 + 三层中区重排

**Files:**
- Modify: `apps/web/src/App.tsx`

本任务把工作台 `return(...)` 的结构改为：左侧栏不变；工作台中区从上到下为 ① 会话条 → ② 画像 + 跟进控制台(含 Inspector Tab) → ③ 底部横向时间线；新增右侧 `device-rail` 挂 `DeviceScreen`。`activeTab` 类型扩展为 `"followup" | "artifacts" | "memory" | "trace"`，默认 `"followup"`。

- [ ] **Step 1: 顶部 import 与 Tab 类型**

`apps/web/src/App.tsx` 顶部 import 段，在 `import "./styles.css";` 之前加：

```ts
import { DeviceScreen } from "./DeviceScreen";
import { TIMELINE_STAGES, currentStageIndex } from "./timeline-stage";
```

把 `type Tab = "memory" | "artifacts" | "trace";` 改为：

```ts
type Tab = "followup" | "artifacts" | "memory" | "trace";
```

把 `const [activeTab, setActiveTab] = useState<Tab>("artifacts");` 改为：

```ts
  const [activeTab, setActiveTab] = useState<Tab>("followup");
```

- [ ] **Step 2: 计算当前阶段**

在 `App` 组件里，`const activeLead = ...` 这一行之后加：

```ts
  const stageIndex = currentStageIndex(detail?.timeline ?? []);
```

- [ ] **Step 3: 替换工作台 JSX**

把从 `<section className="workspace">` 到其对应 `</section>`（即包住 `topbar` 和 `content-grid` 的整段）整体替换为下面内容。左侧 `<aside className="sidebar">…</aside>` 与底部 `crashState` 浮层**保持不变**。

```tsx
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">从线索发现到客户转化的可携带长期记忆</p>
            <h2>房产销售 Agent 工作台</h2>
          </div>
          <div className="status-cluster">
            <span className="verified-dot">可信数据层已验证</span>
          </div>
        </header>

        {/* ① 会话状态条 */}
        <div className="session-bar">
          {activeLead ? (
            <>
              <span className="session-dot" /> 正在跟进{" "}
              <strong>{activeLead.displayName}</strong> · {activeLead.intentLevel} 级 · 触达{" "}
              {detail?.lead.followupTouchCount ?? 0}
            </>
          ) : (
            <span className="session-muted">未选择线索</span>
          )}
        </div>

        {/* ② 画像 + 跟进控制台(含 Inspector Tab) */}
        <div className="mid-row">
          <section className="lead-profile panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">当前线索</p>
                <h3>{activeLead?.displayName ?? "未选择线索"}</h3>
              </div>
              {activeLead ? <span className="intent-badge">意向 {activeLead.intentLevel}</span> : null}
            </div>

            {detail ? (
              <>
                <div className="requirement-grid">
                  <div>
                    <span>预算</span>
                    <strong>{budgetField?.value ?? "待补充"}</strong>
                  </div>
                  <div>
                    <span>区域</span>
                    <strong>{districtField?.value ?? "待补充"}</strong>
                  </div>
                  <div>
                    <span>阶段</span>
                    <strong>{statusLabel(activeLead?.status ?? "")}</strong>
                  </div>
                </div>

                {detail.profile.needs.length > 0 ? (
                  <div className="chips">
                    {detail.profile.needs.map((need) => (
                      <span key={need}>{need}</span>
                    ))}
                  </div>
                ) : null}

                {detail.profile.sourceNote ? (
                  <div className="source-note">
                    <p className="section-kicker">来源信号</p>
                    <p>{detail.profile.sourceNote}</p>
                  </div>
                ) : null}

                <div className="customer-reply">
                  <p className="section-kicker">最近客户回复</p>
                  <blockquote className={lastReply?.direction === "outbound" ? "outbound" : ""}>
                    {lastInbound?.content ?? "暂无客户回复。"}
                  </blockquote>
                </div>
              </>
            ) : (
              <p className="lead-meta">选择左侧线索查看长期记忆画像。</p>
            )}
          </section>

          <section className="console panel">
            <div className="tab-row" role="tablist" aria-label="跟进与证据">
              {(
                [
                  ["followup", "跟进话术"],
                  ["artifacts", "Walrus Artifacts"],
                  ["memory", "MemWal 记忆"],
                  ["trace", "Agent Trace"],
                ] as Array<[Tab, string]>
              ).map(([key, label]) => (
                <button
                  className={activeTab === key ? "tab active" : "tab"}
                  key={key}
                  onClick={() => setActiveTab(key)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "followup" ? (
              <div className="followup-body">
                <div className="message-preview">
                  <p>{detail?.nextFollowup?.message ?? "等待 Agent 生成下一步跟进话术。"}</p>
                </div>
                {usedMemoryChips.length > 0 ? (
                  <div className="used-memory">
                    <p className="section-kicker">本次使用的记忆</p>
                    <div className="chips compact">
                      {usedMemoryChips.map((chip) => (
                        <span key={chip}>{chip}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="follow-up-actions">
                  <button type="button" disabled={!selectedLeadId || busy}
                    onClick={() => withBusy(() => startFollowup(selectedLeadId!))}>
                    加入跟进
                  </button>
                  <button type="button"
                    disabled={!selectedLeadId || busy || detail?.lead.status !== "contacting"}
                    onClick={handleSimulateCrash}>
                    模拟崩溃
                  </button>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="手动发一句…" />
                  <button type="button" disabled={!selectedLeadId || busy || !draft}
                    onClick={() => withBusy(async () => { await sendFollowup(selectedLeadId!, draft); setDraft(""); })}>
                    手动发
                  </button>
                </div>
              </div>
            ) : null}

            {activeTab === "memory" ? (
              <div className="memory-grid">
                {(detail?.memories ?? []).map((memory) => (
                  <div className="memory-row" key={memory.id}>
                    <span>{KIND_LABELS[memory.kind] ?? memory.kind}</span>
                    <strong>{memory.summary}</strong>
                  </div>
                ))}
                {detail && detail.memories.length === 0
                  ? profileFields.map((field) => (
                      <div className="memory-row" key={field.label}>
                        <span>{field.label}</span>
                        <strong>{field.value}</strong>
                      </div>
                    ))
                  : null}
              </div>
            ) : null}

            {activeTab === "artifacts" ? (
              <div className="artifact-list">
                {(detail?.artifacts ?? []).map((artifact) => (
                  <div className="artifact-row" key={artifact.id}>
                    <div>
                      <strong>{ARTIFACT_LABELS[artifact.artifactType] ?? artifact.artifactType}</strong>
                      <span>{artifact.summary ?? artifact.artifactType}</span>
                    </div>
                    <code>{artifact.blobId}</code>
                    <span className="verified-label">已验证</span>
                  </div>
                ))}
              </div>
            ) : null}

            {activeTab === "trace" ? (
              <div className="trace-list">
                {(detail?.timeline ?? []).map((event) => (
                  <div className="trace-row" key={event.id}>
                    <code>{event.agentName ?? event.type}</code>
                    <span>{event.summary}</span>
                    <strong>{formatTime(event.createdAt)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        {/* ③ 底部横向时间线进度带 */}
        <section className="timeline-strip panel">
          <p className="section-kicker">记忆时间线 · 当前进度</p>
          <div className="hsteps">
            {TIMELINE_STAGES.map((stage, i) => {
              const cls =
                i < stageIndex ? "hstep done" : i === stageIndex ? "hstep cur" : "hstep";
              return (
                <div className={cls} key={stage.key}>
                  <span className="hnode" />
                  <span className="hlabel">{stage.label}</span>
                  {i === stageIndex ? <span className="hcur">进行中</span> : null}
                </div>
              );
            })}
          </div>
          {activeEvent ? (
            <div className="strip-detail">
              <span>{EVENT_LABELS[activeEvent.type] ?? activeEvent.type}：{activeEvent.summary}</span>
              <code>{activeEvent.artifactRefs[0] ?? "—"}</code>
            </div>
          ) : null}
        </section>
      </section>

      <aside className="device-rail">
        <DeviceScreen />
      </aside>
```

注意：`activeEvent` 现仍由既有 `const activeEvent = detail?.timeline.find(...)` 计算，保留不动；底部详情行复用它。`activeEventId` 状态与设置它的 `useEffect` 保留不动（虽然纵向时间线点击没了，但 `activeEvent` 回退取 `timeline[0]`，不影响渲染）。

- [ ] **Step 4: 类型检查通过**

Run: `pnpm --filter @leadflow/web exec tsc --noEmit`
Expected: 无报错。若报 `activeEventId` 或 `setActiveEventId` 未使用，保留即可（仍被既有 effect 使用）；如确为未使用变量报错，则删除对应 `useState`/`useEffect`/`setActiveEventId` 调用。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: 工作台三栏+三层中区重排(会话条/画像+跟进含Inspector Tab/底部横向时间线/右侧实时画面栏)"
```

---

## Task 7: 样式（三栏 grid + 设备栏 + 横向时间线 + Tab）

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: 查看现有外壳样式**

Run: `grep -n "app-shell\|content-grid\|\.panel\b\|\.tab\b\|sidebar" apps/web/src/styles.css | head -30`
Expected: 看到 `.app-shell` 现有 `grid-template-columns`（两列）与 `.content-grid` 定义，确认要改的锚点。

- [ ] **Step 2: 改三栏外壳**

在 `apps/web/src/styles.css` 找到 `.app-shell` 规则，把其 `grid-template-columns`（当前为侧栏 + 工作台两列）改为三列，并让工作台内部纵向排布：

```css
.app-shell {
  display: grid;
  grid-template-columns: 260px 1fr 320px;
  min-height: 100vh;
}

.workspace {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
```

（若 `.app-shell` 原有其他属性如 `gap`/`background`，保留，仅覆盖 `grid-template-columns`；若 `.workspace` 已有规则，合并这几条。）

- [ ] **Step 3: 追加新组件样式**

在 `apps/web/src/styles.css` 末尾追加：

```css
/* ① 会话状态条 */
.session-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #9cc1ff;
  padding: 8px 14px;
  border: 1px solid #2a3550;
  border-radius: 10px;
  background: #121826;
}
.session-bar strong { color: #e7eefc; }
.session-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #3ec46d; display: inline-block;
}
.session-muted { color: #7a808b; }

/* ② 画像 + 跟进控制台同行 */
.mid-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: stretch;
}
.console .tab-row { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.followup-body { display: flex; flex-direction: column; gap: 10px; }

/* ③ 底部横向时间线进度带（占较大高度比） */
.timeline-strip { padding: 16px 18px; }
.hsteps {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  position: relative;
  margin-top: 14px;
}
.hsteps::before {
  content: "";
  position: absolute;
  top: 9px; left: 3%; right: 3%;
  height: 2px; background: #2f323b;
}
.hstep {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.hnode {
  width: 18px; height: 18px; border-radius: 50%;
  background: #22252d; border: 2px solid #3a3d46;
}
.hstep.done .hnode { background: #3ec46d; border-color: #3ec46d; }
.hstep.cur .hnode {
  background: #4f8cff; border-color: #9cc1ff;
  box-shadow: 0 0 0 5px rgba(79, 140, 255, 0.2);
  animation: hstep-pulse 1.4s infinite;
}
@keyframes hstep-pulse {
  0%, 100% { box-shadow: 0 0 0 5px rgba(79, 140, 255, 0.2); }
  50% { box-shadow: 0 0 0 9px rgba(79, 140, 255, 0.12); }
}
.hlabel { font-size: 12px; color: #7a808b; text-align: center; }
.hstep.done .hlabel { color: #9aa6b2; }
.hstep.cur .hlabel { color: #e7eefc; font-weight: 600; }
.hcur {
  font-size: 11px; color: #9cc1ff;
  border: 1px solid rgba(79, 140, 255, 0.4);
  border-radius: 9px; padding: 0 6px;
}
.strip-detail {
  display: flex; align-items: center; gap: 12px;
  margin-top: 16px; padding-top: 12px;
  border-top: 1px solid #23262e;
  font-size: 13px; color: #aeb4bf;
}
.strip-detail code { color: #6fb1ff; font-size: 12px; }

/* 右侧实时画面栏 */
.device-rail {
  border-left: 1px solid #1f222b;
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
}
.device-screen { display: flex; flex-direction: column; gap: 10px; height: 100%; }
.device-screen-head {
  display: flex; align-items: center; justify-content: space-between;
}
.device-title { font-size: 13px; color: #e7eefc; font-weight: 600; }
.device-live { font-size: 11px; }
.device-live-live { color: #3ec46d; }
.device-live-connecting { color: #9cc1ff; }
.device-live-no-device { color: #c46d6d; }
.device-live-stalled { color: #c4a96d; }
.device-frame {
  flex: 1;
  border: 2px solid #4f8cff;
  border-radius: 16px;
  background: #0b0e16;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.device-img { width: 100%; height: 100%; object-fit: contain; display: block; }
.device-placeholder { color: #5a6072; font-size: 13px; text-align: center; padding: 16px; }

/* 响应式：窄屏收起设备栏，避免挤垮中区 */
@media (max-width: 1200px) {
  .app-shell { grid-template-columns: 240px 1fr; }
  .device-rail { display: none; }
}
```

注意：旧的 `.content-grid`、纵向 `.timeline-event`、独立 `.inspector` / `.follow-up` 相关样式可保留（不再被引用，删之亦可，但保留不影响渲染）。新结构用的是 `.mid-row` / `.console` / `.timeline-strip`。

- [ ] **Step 3.5: 复用 panel 容器**

确认 `.lead-profile.panel`、`.console.panel`、`.timeline-strip.panel` 共用既有 `.panel` 卡片底样式（背景/圆角/内边距）。`grep -n "\.panel" apps/web/src/styles.css` 确认 `.panel` 规则存在；存在即无需改动。

- [ ] **Step 4: 启动 dev 验证渲染**（人工/预览）

Run: `pnpm --filter @leadflow/web dev`（若已在跑则跳过）
Expected: 浏览器 `http://127.0.0.1:5173` 看到三栏；中区从上到下：会话条、画像+跟进 Tab、底部横向时间线；右侧手机框显示占位/实时帧。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles.css
git commit -m "style: 三栏布局+设备栏+横向时间线进度带+控制台 Tab 样式"
```

---

## Task 8: 更新前端工作台测试

**Files:**
- Modify: `apps/web/src/App.test.tsx`

现有测试的 fetch mock 只认 `/api/dashboard/leads`，新组件会请求 `/api/devices/xhs` 与 `/api/devices/:id/screenshot`，需扩展 mock；并把对旧结构（纵向时间线/独立 follow-up 面板）的断言改成新结构。

- [ ] **Step 1: 扩展 fetch mock**

把 `beforeEach` 里的 `vi.stubGlobal("fetch", ...)` 替换为：

```ts
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/devices/xhs")) {
          return Response.json({ devices: [{ deviceId: "b759b4fa", status: "connected" }] });
        }
        if (url.includes("/screenshot")) {
          return Response.json({
            imageDataUrl: "data:image/png;base64,AAAA",
            capturedAt: "2026-06-19T03:00:00.000Z",
          });
        }
        if (url.endsWith("/api/dashboard/leads")) {
          return Response.json(leadListResponse);
        }
        return Response.json(leadDetailResponse);
      }),
    );
```

- [ ] **Step 2: 更新断言到新结构**

把测试体里这几处断言调整：

1) 跟进话术默认 Tab 可见——保留 `expect(screen.getByText(/渝北三房重新筛了一版/)).toBeInTheDocument();`（默认 `followup` Tab 即显示话术）。
2) 三个操作按钮断言保留不变。
3) 删除依赖旧纵向时间线"发现线索按钮多次出现"的断言 `expect(screen.getAllByText("发现线索").length)...`，替换为底部横向进度带阶段断言：

```ts
    // 底部横向时间线进度带渲染 6 段
    expect(screen.getByText("发现线索")).toBeInTheDocument();
    expect(screen.getByText("接力恢复")).toBeInTheDocument();
    // 会话状态条
    expect(screen.getByText(/正在跟进/)).toBeInTheDocument();
    // 实时画面栏
    expect(screen.getByText("实时画面")).toBeInTheDocument();
```

4) `expect(screen.getByText("房产销售 Agent 工作台"))...` 与画像断言（`想在渝北附近买个三房。` / `预算最好 130 万以内…`）保留不变。

- [ ] **Step 3: 跑测试确认通过**

Run: `pnpm --filter @leadflow/web test`
Expected: PASS（`App.test.tsx` 与 `timeline-stage.test.ts` 全绿）。

若 `imageDataUrl: "data:image/png;base64,AAAA"` 触发 jsdom 加载告警，无碍（jsdom 不真正解码图片）。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.test.tsx
git commit -m "test: 工作台测试适配三栏新结构(设备截图 mock/横向时间线/会话条断言)"
```

---

## Task 9: 全量回归与收尾

- [ ] **Step 1: 跑全仓测试**

Run: `pnpm -r test`
Expected: connectors / api / web 三个包测试全 PASS。

- [ ] **Step 2: 类型与构建**

Run: `pnpm --filter @leadflow/web exec tsc --noEmit && pnpm --filter @leadflow/api exec tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 3: 真机联调（人工，可选，需连真机）**

设 `XHS_CHAT_MODE` 非 fake、`AUTO_FOLLOWUP_DEVICE_ID=b759b4fa`，启动 API 与 web，触发一次"加入跟进"，确认右侧设备栏出现真机小红书画面且随 Agent 操作刷新；断网/拔设备时显示"画面已暂停 / 设备未连接"。

- [ ] **Step 4: 最终提交（如有零散改动）**

```bash
git add -A
git commit -m "chore: ADB 实时画面 + 工作台改版收尾回归"
```

---

## Self-Review（已核对）

- **Spec 覆盖**：截图链路(接口/midscene/fake/mcp/路由)→Task1-2；前端封装→Task3；阶段映射→Task4；DeviceScreen 状态机/轮询/省电/in-flight→Task5；三栏+三层+Inspector 并入 Tab→Task6；样式+响应式→Task7；测试→Task1/2/4/8/9。非范围项(反控/scrcpy/联动高亮/自动存档)未出现。✓
- **占位符**：无 TBD/TODO，代码步骤均含完整代码。✓
- **类型一致**：`getScreenshot(input: XhsDeviceInput) → XhsScreenshotResult{ imageDataUrl, capturedAt }` 在接口/三实现/路由/前端/测试中字段名统一为 `imageDataUrl`（spec 中 `imageBase64` 已在本计划"接口契约"中明确改名为 `imageDataUrl`，理由：直接可用作 `<img src>`，避免前端拼前缀）；`Tab` 联合类型新增 `"followup"` 在 Task6 定义并在同任务消费；`TIMELINE_STAGES`/`currentStageIndex` 在 Task4 定义、Task6 消费。✓
