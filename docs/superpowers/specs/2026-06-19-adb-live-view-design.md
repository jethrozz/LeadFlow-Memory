# ADB 实时画面 + 工作台布局改版 设计文档

日期：2026-06-19
状态：已确认，待实现

## 目标

1. 在 Web 工作台实时展示 ADB 真机（小红书 App）的操作画面，让用户能直观看到转化 Agent 此刻在真机上的动作。
2. 配合实时画面，重排工作台布局，并新增"当前进行到哪一步"的进度可视化。

## 范围

**做：**
- 纯观看的实时手机画面（截图轮询）。
- 工作台改为三栏布局 + 中区三层重排。
- 横向时间线进度带，高亮当前步骤。

**不做（YAGNI）：**
- 网页端反向操控手机（点击/输入回传 ADB）。
- scrcpy 视频流（H.264 / WebSocket）。
- 工作台面板与手机动作的实时高亮联动（Midscene 无现成动作事件流）。
- 关键节点自动截图存 Walrus。

## 技术方案：截图轮询

复用 followup-loop 正在驱动的**同一个** Midscene agent 截图——网页看到的就是 Agent 此刻操作的那个会话，而非另开一路连接。

`@midscene/android` 的 `AndroidAgent.page` 暴露 `screenshotBase64(): Promise<string>`，`DevicePool` 在 `services.xhsChat`（`XhsMidsceneClient` 单例）中全局共享，截图端点与 followup-loop 复用同一连接。

**并发**：截图请求与 Agent 动作并发走 ADB，`adb exec-out screencap` 由 adb server 排队，偶有单帧延迟但互不阻塞。每个请求只截一帧，节流由前端控制（~700ms）。

## 架构

### 后端

**1. `XhsChatClient` 接口新增方法**（`packages/connectors/src/xhs-chat/types.ts`）

```ts
getScreenshot(input: { deviceId: string }): Promise<{ imageBase64: string; capturedAt: string }>
```

实现：
- `XhsMidsceneClient`（`midscene-client.ts`）：`ensureConnected(deviceId)` → `this.devices.getAgent(deviceId).page.screenshotBase64()` → 返回 `{ imageBase64, capturedAt: new Date().toISOString() }`。
- `FakeXhsChatClient`（`fake-client.ts`）：返回内置占位 base64 图（保证无真机时 dev / 测试可跑）。
- `mcp-client.ts`（legacy）：抛 `NOT_SUPPORTED`，不影响默认链路。

**2. devices 路由**（`apps/api/src/routes/devices.ts`）

- 新增 `GET /api/devices/:deviceId/screenshot`
  - 成功 → `200 { imageBase64, capturedAt }`
  - 设备未连接 / 截图失败 → `503 { error: { code: "DEVICE_SCREENSHOT_FAILED" } }`
- 改造 `GET /api/devices/xhs`：返回真实默认设备（读 `AUTO_FOLLOWUP_DEVICE_ID`），替换当前写死的 `device-1`，让前端知道该轮询哪个 deviceId。

### 前端

**1. `api.ts`（web）新增**
- `fetchActiveDevice(): Promise<{ deviceId: string }>`
- `fetchDeviceScreenshot(deviceId): Promise<{ imageBase64: string; capturedAt: string }>`

**2. 新组件 `DeviceScreen.tsx`**（右栏）
- 竖屏手机外框 + `<img>`，`setInterval` ~700ms 拉一帧刷新 `src`。
- **节流防堆积**：上一帧 fetch 未结束则跳过本拍（in-flight 守卫）。
- **省电**：`document.hidden` 时暂停轮询。
- **状态机**：
  - `连接中` — 首帧未到
  - `LIVE` — 正常出帧，显示脉冲徽章 + `capturedAt` 时间戳
  - `设备未连接` — 端点 503，提示"等待 Agent 启动会话"
  - `画面已暂停` — 连续 N 次失败，保留最后一帧并标记

### 布局（`App.tsx` + `styles.css`）

**三栏外壳**：`.app-shell` 由两列改三列
`grid-template-columns: 260px 1fr 320px`（左侧栏 | 工作台 | 设备栏）。
新增 `<aside className="device-rail">` 承载 `DeviceScreen`。

**工作台中区，从上到下三层：**

1. **① 会话状态条**（细）：`⬤ 正在跟进 {displayName} · {intentLevel} 级 · 触达 {followupTouchCount}`。
2. **② 画像 + 跟进控制台同行**：
   - 左：用户画像（预算/区域/需求 chips/来源信号/最近客户回复）。
   - 右：跟进控制台，顶部 Tab 栏 `跟进话术 / Artifacts / 记忆 / Trace`——原 Inspector 三个 Tab 并入此处，默认停在「跟进话术」（话术预览 + 加入跟进/模拟崩溃/手动发 操作）。
3. **③ 横向时间线进度带**（底部，**占较大高度比**）：
   - 6 节点横向 stepper：发现线索 → 意向评分 → 首次跟进 → 客户回复 → 记忆更新 → 接力恢复。
   - 状态：已完成（绿实心）/ 当前（蓝脉冲 + "进行中"标签）/ 未到（灰空心）。
   - 当前节点下方一行详情：当前事件 `summary` + 对应 `artifactRefs[0]`（复用原 event-detail 内容）。
   - 当前步骤由 `detail.timeline` 最新事件的 `type` 映射到 6 个阶段之一。

**响应式**：窄屏（`<1200px`）设备栏降级到工作台下方或隐藏，中区不被挤垮。

**移除**：原 2×2 `content-grid` 中独立的 Inspector 面板（并入跟进控制台）与纵向 timeline 列表（改横向底部带）。

## 数据流

```
followup-loop ──drives──> Midscene AndroidAgent ──ADB──> 真机(小红书)
                                  │
DeviceScreen ──GET /screenshot──> 同一 agent.page.screenshotBase64()
                                  │
            <img src="data:image/jpeg;base64,...">  每 ~700ms
```

时间线 / 画像 / 跟进数据沿用现有 `fetchDashboardLeadDetail` 轮询（4s），不变。

## 错误与边界

- 无设备 / 设备离线 → 503 → 前端「设备未连接」态。
- tab 隐藏 → 暂停轮询，省真机负载。
- 截图解码失败 → 保留最后一帧，连续失败标「画面已暂停」。
- 慢截图堆积 → 前端 in-flight 守卫，跳过本拍。

## 测试

- **后端**：截图路由——fake client 返回桩图，断言 `200` + base64 形状；client 抛错断言 `503`。`GET /api/devices/xhs` 返回 env 配置的 deviceId。
- **前端**：扩展 `App.test.tsx` 的 fetch mock 覆盖 `/screenshot` 与 `/devices/xhs`（避免轮询打挂测试）；新增轻量断言：设备栏手机外框渲染 + 发起首次截图请求；时间线进度带渲染 6 节点且当前步高亮。

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `packages/connectors/src/xhs-chat/types.ts` | 接口加 `getScreenshot` |
| `packages/connectors/src/xhs-chat/midscene-client.ts` | 实现 `getScreenshot` |
| `packages/connectors/src/xhs-chat/fake-client.ts` | 桩实现 |
| `packages/connectors/src/xhs-chat/mcp-client.ts` | `NOT_SUPPORTED` |
| `apps/api/src/routes/devices.ts` | 截图端点 + 改造 `/xhs` |
| `apps/web/src/api.ts` | `fetchActiveDevice` / `fetchDeviceScreenshot` |
| `apps/web/src/DeviceScreen.tsx` | 新建 |
| `apps/web/src/App.tsx` | 三栏 + 中区三层重排 |
| `apps/web/src/styles.css` | 三栏 grid + 设备栏 + 横向时间线 + Tab 样式 |
| `apps/api/src/routes/devices.test.ts`（如无则新建） | 截图端点测试 |
| `apps/web/src/App.test.tsx` | 扩展 mock + 断言 |
