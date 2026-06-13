import { Hono } from "hono";
import type { ApiServices } from "../app.js";
import {
  artifactsChen,
  conversationChen,
  dashboardLeadDetail,
  leadChen,
  memoriesChen,
  profileChen,
  timelineChen,
} from "../fixtures/demo-data.js";

const FIELD_LABELS: Record<string, string> = {
  budget: "预算",
  district: "区域",
  layout: "户型",
};

// Demo seed API — 仅用于演示前预热界面，把完整的「陈薇」数据集写入共享 store。
// seed 出来的线索带 isDemoSeed 标记，Dashboard 据此渲染原型同款的完整画像视图。
export function demoRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/seed-real-estate", (c) => {
    const lead = services.store.upsertLead({
      id: leadChen.id,
      campaignId: leadChen.campaignId,
      platform: leadChen.platform,
      status: leadChen.status,
      memorySpaceId: leadChen.memorySpaceId ?? "memspace_default",
      displayName: "陈薇",
      intentLevel: profileChen.intentLevel,
      summary: profileChen.summary,
      isDemoSeed: true,
    });

    services.store.upsertProfile({
      leadId: leadChen.id,
      summary: profileChen.summary,
      sourceNote: "想在渝北附近买个三房，预算别太高，孩子明年上小学，最好通勤方便。",
      needs: profileChen.common.needs,
      concerns: profileChen.common.concerns,
      fields: Object.fromEntries(
        Object.entries(profileChen.fields).map(([key, field]) => [
          key,
          {
            label: FIELD_LABELS[key] ?? key,
            value: String(field.value),
            confidence: field.confidence,
          },
        ]),
      ),
    });

    for (const message of conversationChen.messages) {
      services.store.appendConversationMessage(leadChen.id, {
        direction: message.from === "customer" ? "inbound" : "outbound",
        content: message.content,
        sentAt: message.sentAt,
      });
    }

    for (const memory of memoriesChen) {
      services.store.appendMemoryRef({
        leadId: leadChen.id,
        memoryId: memory.memoryId,
        kind: memory.kind,
        summary: memory.summary,
        confidence: memory.confidence,
      });
    }

    for (const artifact of artifactsChen) {
      services.store.appendArtifactRef({
        leadId: leadChen.id,
        artifactType: artifact.artifactType,
        blobId: artifact.blobId,
        summary: artifact.summary,
      });
    }

    // 时间线事件里的 artifactRefs 在 fixture 中是内部引用 id，翻译成真实 blobId，
    // 让事件详情面板展示 Walrus blob 哈希（与原型一致）。
    const blobByArtifactId = new Map(artifactsChen.map((a) => [a.id, a.blobId]));
    for (const event of timelineChen) {
      services.store.appendTimelineEvent({
        leadId: leadChen.id,
        type: event.type,
        summary: event.summary,
        agentName: event.agentName,
        workerId: event.workerId,
        memoryRefs: event.memoryRefs,
        artifactRefs: event.artifactRefs.map((ref) => blobByArtifactId.get(ref) ?? ref),
      });
    }

    const followUp = dashboardLeadDetail.nextFollowUp;
    services.store.upsertNextFollowup({
      leadId: leadChen.id,
      message: followUp.message,
      usedMemoryRefs: followUp.usedMemoryRefs,
      worker: "转化 Worker-2",
      nextBestAction: followUp.nextBestAction,
      requiresHumanApproval: followUp.requiresHumanApproval,
    });

    return c.json({ seeded: true, leadId: lead.id });
  });

  return route;
}
