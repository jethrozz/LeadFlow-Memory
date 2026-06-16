// 清理：把所有线索的 autoFollowupEnabled 关掉、nextActionAt 置空，给循环演示腾干净场地。
// 运行：node_modules/.bin/tsx --env-file=.env apps/api/src/debug-deactivate-followups.ts
import { createServicesFromEnv } from "./app.js";

const services = await createServicesFromEnv();
const leads = await services.store.listLeads();
let n = 0;
for (const lead of leads) {
  if (lead.autoFollowupEnabled) {
    await services.store.updateLeadFollowupState(lead.id, {
      autoFollowupEnabled: false,
      nextActionAt: null,
    });
    n++;
    console.log(`  关闭 ${lead.id} (status=${lead.status})`);
  }
}
console.log(`[cleanup] 共关闭 ${n} 条自动跟进线索`);
process.exit(0);
