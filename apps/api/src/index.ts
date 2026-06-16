import { serve } from "@hono/node-server";
import { createApp, createServicesFromEnv } from "./app.js";
import { startScheduler } from "./scheduler.js";

const port = Number(process.env.PORT ?? 3001);

async function main() {
  const services = await createServicesFromEnv();

  // 启动定时调度器（仅在有 DATABASE_URL 时启用，内存 store 重启即丢无意义）
  if (process.env.DATABASE_URL) {
    const scheduler = startScheduler(services);
    console.log("[scheduler] Started — checking campaigns every minute");
    process.on("SIGTERM", () => scheduler.stop());
    process.on("SIGINT", () => scheduler.stop());
  }

  // 启动自动跟进循环（受 AUTO_FOLLOWUP_ENABLED 控制）
  const { startFollowupLoop } = await import("./followup-loop.js");
  const followupLoop = startFollowupLoop(services);
  process.on("SIGTERM", () => followupLoop.stop());
  process.on("SIGINT", () => followupLoop.stop());

  serve({
    fetch: createApp(services).fetch,
    port,
  });
  console.log(`LeadFlow API listening on http://127.0.0.1:${port}`);
}

main();
