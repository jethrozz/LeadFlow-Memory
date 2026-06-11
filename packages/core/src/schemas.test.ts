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
