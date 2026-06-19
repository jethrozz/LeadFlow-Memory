import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const leadListResponse = {
  items: [
    {
      id: "lead_001",
      displayName: "重庆买房小陈",
      platform: "xhs",
      intentLevel: "A",
      status: "asking_contact",
      summary: "预算 130 万以内，关注渝北三房。",
      updatedAt: "2026-06-11T10:00:00.000Z",
      isDemoSeed: true,
      district: "渝北",
      needs: ["三房", "近学校"],
    },
  ],
};

const leadDetailResponse = {
  lead: leadListResponse.items[0],
  profile: {
    summary: "客户关注渝北三房。",
    sourceNote: "想在渝北附近买个三房。",
    needs: ["三房", "近学校", "近地铁"],
    concerns: ["预算压力"],
    fields: {
      budget: { label: "预算", value: "130万以内", confidence: 0.92 },
      district: { label: "区域", value: "渝北", confidence: 0.9 },
    },
  },
  conversation: {
    messages: [
      {
        id: "msg_1",
        direction: "inbound",
        content: "预算最好 130 万以内，孩子明年上小学。",
        sentAt: "2026-06-11T10:00:00.000Z",
      },
    ],
  },
  timeline: [
    {
      id: "evt_1",
      type: "lead_discovered",
      summary: "从小红书评论发现购房线索。",
      agentName: "Discovery Agent",
      memoryRefs: [],
      artifactRefs: ["0x8f1a92c"],
      createdAt: "2026-06-11T10:00:00.000Z",
    },
  ],
  memories: [
    {
      id: "mem_1",
      memoryId: "memwal_budget_001",
      kind: "budget",
      summary: "客户预算 130 万以内。",
      confidence: 0.92,
      createdAt: "2026-06-11T10:00:00.000Z",
    },
  ],
  artifacts: [
    {
      id: "art_1",
      artifactType: "source_snapshot",
      blobId: "0x8f1a92c",
      summary: "小红书评论来源快照。",
      createdAt: "2026-06-11T10:00:00.000Z",
    },
  ],
  nextFollowup: {
    message: "我按 130 万以内、渝北三房重新筛了一版，你留个微信我把对比表发你。",
    usedMemoryRefs: ["mem_1"],
    worker: "转化 Worker-2",
    requiresHumanApproval: true,
  },
};

describe("LeadFlow Dashboard", () => {
  beforeEach(() => {
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
  });

  it("renders the prototype layout bound to real lead data", async () => {
    render(<App />);
    // Wait for both list (heading) and detail (budget field) to load
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "重庆买房小陈" })).toBeInTheDocument();
      expect(screen.getByText("130万以内")).toBeInTheDocument();
    });

    // 工作台外壳与画像
    expect(screen.getByText("房产销售 Agent 工作台")).toBeInTheDocument();
    expect(screen.getByText("想在渝北附近买个三房。")).toBeInTheDocument();
    expect(screen.getByText("预算最好 130 万以内，孩子明年上小学。")).toBeInTheDocument();

    // 底部横向时间线进度带渲染 6 段
    expect(screen.getByText("发现线索")).toBeInTheDocument();
    expect(screen.getByText("接力恢复")).toBeInTheDocument();
    // 会话状态条
    expect(screen.getByText(/正在跟进/)).toBeInTheDocument();
    // 实时画面栏
    expect(screen.getByText("实时画面")).toBeInTheDocument();

    // 下一步跟进话术 + 操作按钮
    expect(screen.getByText(/渝北三房重新筛了一版/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入跟进" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "模拟崩溃" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "手动发" })).toBeInTheDocument();
  });
});
