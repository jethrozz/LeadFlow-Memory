// 检查 MemWal 召回有没有用上：对指定线索写一条 + 召回，打印返回。
// 运行：node_modules/.bin/tsx --env-file=.env apps/api/src/debug-memwal.ts <leadId>
import { createServicesFromEnv } from "./app.js";

const leadId = process.argv[2] || "lead_mock_2bf5ca8a";
const memorySpaceId = `space_${leadId}`;
const services = await createServicesFromEnv();

const OPENING_RECALL_QUERY = "客户购房需求 预算 区域 户型 顾虑";

console.log(`[memwal] lead=${leadId} namespace=${memorySpaceId}`);

// 1. 先召回（看历史写入有没有）
try {
  const recalled = await services.memwal.recall({
    leadId,
    memorySpaceId,
    query: OPENING_RECALL_QUERY,
    limit: 5,
  });
  console.log(`[memwal] 召回(opening query) 命中 ${recalled.length} 条:`);
  for (const m of recalled) console.log(`   - conf=${m.metadata?.confidence?.toFixed(3)} : ${m.content}`);
} catch (e) {
  console.error("[memwal] 召回失败:", e instanceof Error ? e.message : e);
}

// 2. 写一条新记忆，再召回，验证 round-trip
try {
  console.log("[memwal] 写入测试记忆…");
  await services.memwal.writeMemory({
    leadId,
    memorySpaceId,
    content: "客户明确说预算130万、要渝北学区三房、最好靠轻轨。",
    metadata: { source: "manual", confidence: 0.9, artifactRefs: [] },
  });
  console.log("[memwal] 写入成功");
  const again = await services.memwal.recall({ leadId, memorySpaceId, query: "预算 学区 轻轨", limit: 5 });
  console.log(`[memwal] 二次召回 命中 ${again.length} 条:`);
  for (const m of again) console.log(`   - conf=${m.metadata?.confidence?.toFixed(3)} : ${m.content}`);
} catch (e) {
  console.error("[memwal] 写入/二次召回失败:", e instanceof Error ? e.message : e);
}

process.exit(0);
