// 直接对指定 contacting 线索跑一次 processLead，暴露完整错误堆栈（排查回复轮）。
// 运行：node_modules/.bin/tsx --env-file=.env apps/api/src/debug-followup-reply.ts <leadId>
import { createServicesFromEnv } from "./app.js";
import { processLead, readFollowupConfig } from "./followup-loop.js";

const leadId = process.argv[2] || "lead_mock_826bcda3";
const services = await createServicesFromEnv();
const lead = await services.store.getLead(leadId);
if (!lead) {
  console.error("lead 未找到:", leadId);
  process.exit(1);
}
console.log(`[dbg] 对 ${leadId} (status=${lead.status}) 跑 processLead…`);
try {
  const r = await processLead(services, lead, readFollowupConfig(), new Date());
  console.log("[dbg] 结果:", JSON.stringify(r));
} catch (e) {
  console.error("[dbg] 抛错完整堆栈:\n", e);
}
const msgs = await services.store.listConversationMessages(leadId);
console.log("[dbg] 会话条数:", msgs.length);
process.exit(0);
