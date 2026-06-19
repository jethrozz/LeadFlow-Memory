import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { LanguageProvider } from "./i18n";

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
    {
      id: "evt_2",
      type: "agent_replied",
      summary: "发送首次跟进话术。",
      agentName: "转化 Worker-1",
      memoryRefs: [],
      artifactRefs: [],
      createdAt: "2026-06-11T10:05:00.000Z",
    },
    {
      id: "evt_3",
      type: "customer_replied",
      summary: "客户追问月供压力。",
      agentName: "客户",
      memoryRefs: [],
      artifactRefs: [],
      createdAt: "2026-06-11T10:10:00.000Z",
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
  afterEach(() => {
    cleanup(); // 卸载上个用例的 DOM，避免多个 <App /> 并存导致文案重复匹配
  });

  beforeEach(() => {
    window.localStorage.clear(); // 语言偏好持久化在 localStorage，避免用例间串味
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
    expect(screen.getByText("转化 Agent 工作台")).toBeInTheDocument();
    expect(screen.getByText("想在渝北附近买个三房。")).toBeInTheDocument();
    expect(screen.getByText("预算最好 130 万以内，孩子明年上小学。")).toBeInTheDocument();

    // 底部横向时间线：真实事件流，每个事件一个节点（含每次发送的"发送跟进"）
    expect(screen.getByText("发现线索")).toBeInTheDocument();
    expect(screen.getByText("发送跟进")).toBeInTheDocument();
    // 会话状态条
    expect(screen.getByText(/正在跟进/)).toBeInTheDocument();
    // 设备实时画面栏
    expect(screen.getByText("设备实时画面")).toBeInTheDocument();

    // 下一步跟进话术 + 操作按钮
    expect(screen.getByText(/渝北三房重新筛了一版/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入跟进" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "模拟崩溃" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "手动发" })).toBeInTheDocument();
  });

  it("切换语言后 UI 文案变英文", async () => {
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText("转化 Agent 工作台")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "切换语言 / Switch language" }));

    expect(screen.getByText("Conversion Agent Workbench")).toBeInTheDocument();
    expect(screen.getByText("Live Device Feed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start follow-up" })).toBeInTheDocument();
  });

  it("switches leads without briefly showing stale detail", async () => {
    const secondLead = {
      id: "lead_002",
      displayName: "杭州置业李姐",
      platform: "xhs",
      intentLevel: "B",
      status: "contacting",
      summary: "预算 220 万以内，关注滨江两房。",
      updatedAt: "2026-06-11T11:00:00.000Z",
      district: "滨江",
      needs: ["两房", "地铁口"],
    };

    const secondDetailResponse = {
      ...leadDetailResponse,
      lead: secondLead,
      profile: {
        ...leadDetailResponse.profile,
        sourceNote: "想在滨江看两房，地铁通勤方便一点。",
        needs: ["两房", "地铁口"],
        fields: {
          budget: { label: "预算", value: "220万以内", confidence: 0.9 },
          district: { label: "区域", value: "滨江", confidence: 0.88 },
        },
      },
      conversation: {
        messages: [
          {
            id: "msg_2",
            direction: "inbound" as const,
            content: "总价控制在 220 万内，最好离地铁近一点。",
            sentAt: "2026-06-11T11:00:00.000Z",
          },
        ],
      },
      memories: [],
      artifacts: [
        {
          id: "art_2",
          artifactType: "source_snapshot",
          blobId: "0x9b2c44d",
          summary: "小红书私信来源快照。",
          createdAt: "2026-06-11T11:00:00.000Z",
        },
      ],
      nextFollowup: {
        message: "我整理了几套滨江两房，先发你一版通勤和总价对比。",
        usedMemoryRefs: [],
        worker: "转化 Worker-3",
        requiresHumanApproval: true,
      },
    };

    const secondDetailRequest: { resolve?: (value: Response) => void } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/api/devices/xhs")) {
          return Promise.resolve(
            Response.json({ devices: [{ deviceId: "b759b4fa", status: "connected" }] }),
          );
        }
        if (url.includes("/screenshot")) {
          return Promise.resolve(
            Response.json({
              imageDataUrl: "data:image/png;base64,AAAA",
              capturedAt: "2026-06-19T03:00:00.000Z",
            }),
          );
        }
        if (url.endsWith("/api/dashboard/leads")) {
          return Promise.resolve(Response.json({ items: [...leadListResponse.items, secondLead] }));
        }
        if (url.endsWith("/api/dashboard/leads/lead_002")) {
          return new Promise<Response>((resolve) => {
            secondDetailRequest.resolve = resolve;
          });
        }
        return Promise.resolve(Response.json(leadDetailResponse));
      }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "重庆买房小陈" })).toBeInTheDocument();
      expect(screen.getByText("130万以内")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /杭州置业李姐/ }));

    const secondHeading = await screen.findByRole("heading", { name: "杭州置业李姐" });
    const detailSection = secondHeading.closest("section");
    expect(detailSection).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("130万以内")).not.toBeInTheDocument();

    if (!secondDetailRequest.resolve) {
      throw new Error("Expected the second lead detail request to be pending.");
    }
    secondDetailRequest.resolve(Response.json(secondDetailResponse));

    await waitFor(() => {
      expect(screen.getByText("220万以内")).toBeInTheDocument();
      expect(screen.getByText("想在滨江看两房，地铁通勤方便一点。")).toBeInTheDocument();
    });

    expect(detailSection).toHaveAttribute("aria-busy", "false");
  });
});
