// 端到端调试：真实服务 mock 一条线索 → 跑真实转化 agent（processLead 开场模式）→ 真机发送。
// 运行：node_modules/.bin/tsx --env-file=.env apps/api/src/debug-conversion-e2e.ts
import { createServicesFromEnv } from "./app.js";
import { processLead, readFollowupConfig } from "./followup-loop.js";

const DEVICE = process.env.AUTO_FOLLOWUP_DEVICE_ID || "b759b4fa";
const USER = "jethrozz";

async function main() {
  console.log("[e2e] 初始化真实服务…");
  const services = await createServicesFromEnv();

  const leadId = `lead_jethrozz_${Date.now().toString().slice(-6)}`;
  const memorySpaceId = `space_${leadId}`;
  const campaignId = "manual_test";

  // 1. 兜底 campaign
  if (!(await services.store.getCampaign(campaignId))) {
    await services.store.upsertCampaign({ id: campaignId, name: "手动调试", status: "draft" });
  }

  // 2. 线索（入列自动跟进：discovered + enabled + 立即到期）
  const sourceText =
    "求推荐渝北的三房，预算130万以内，孩子明年上学想要学区房，有合适的吗？";
  const summary = "渝北三房，预算130万，关注学区，孩子明年上学";
  await services.store.upsertLead({
    id: leadId,
    campaignId,
    platform: "xhs",
    status: "discovered",
    memorySpaceId,
    displayName: USER,
    summary,
    intentLevel: "A",
    autoFollowupEnabled: true,
    nextActionAt: new Date(),
  });

  // 3. profile
  await services.store.upsertProfile({
    leadId,
    summary,
    sourceNote: sourceText,
    needs: ["三房", "学区房"],
    concerns: ["预算有限"],
    fields: {
      budget: { label: "预算", value: "130万以内" },
      district: { label: "区域", value: "渝北" },
      layout: { label: "户型", value: "三房" },
    },
  });

  // 4. 写入长期记忆（供开场召回）
  try {
    await services.memwal.writeMemory({
      leadId,
      memorySpaceId,
      content: sourceText,
      metadata: { source: "manual", confidence: 0.9, artifactRefs: [] },
    });
    console.log("[e2e] 记忆写入成功");
  } catch (e) {
    console.warn("[e2e] 记忆写入失败（继续）:", e instanceof Error ? e.message : e);
  }

  // 5. 小红书身份：redId / username 都是 jethrozz
  await services.store.upsertSocialIdentity({
    leadId,
    platform: "xhs",
    externalUserId: USER,
    redId: USER,
    username: USER,
  });

  console.log(`[e2e] 线索就绪 leadId=${leadId}, redId=${USER}, device=${DEVICE}`);
  console.log("[e2e] 跑转化 agent（开场模式：召回 → LLM 生成开场白 → 真机发送）…");

  const lead = await services.store.getLead(leadId);
  if (!lead) throw new Error("lead 未找到");

  const result = await processLead(
    services,
    lead,
    { ...readFollowupConfig(), deviceId: DEVICE },
    new Date(),
  );

  console.log("[e2e] processLead 结果:", JSON.stringify(result));

  const after = await services.store.getLead(leadId);
  console.log(`[e2e] 线索状态: status=${after?.status}, touchCount=${after?.followupTouchCount}`);
  const msgs = await services.store.listConversationMessages(leadId);
  console.log("[e2e] 会话记录:");
  for (const m of msgs) console.log(`   [${m.direction}] ${m.content}`);

  process.exit(0);
}

main().catch((e) => {
  console.error("[e2e] 失败:", e);
  process.exit(1);
});
