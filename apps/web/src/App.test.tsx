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
    expect(screen.getByText("Memory Timeline")).toBeInTheDocument();
    expect(screen.getByText("Walrus Artifacts")).toBeInTheDocument();
    expect(screen.getByText("Next Follow-up")).toBeInTheDocument();
  });
});
