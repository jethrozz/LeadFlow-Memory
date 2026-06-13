Plan 1: Foundation + Data/API Skeleton ✅
Plan 2: Walrus + MemWal adapters ✅
Plan 3: Mastra workflows + LLM provider ✅
Plan 4: mcp-xhs-chat integration ✅
Plan 5: Dashboard real data migration ✅
Plan 6: End-to-end demo flow（演示脚本/文档，部分任务需真实外部服务）
Plan 7: Real data path（共享存储替换 fixtures，2026-06-12-leadflow-real-data-path.md）✅
Plan 8: XHS discovery connector（xiaohongshu-mcp 搜索采集接入，2026-06-12-leadflow-xhs-discovery-connector.md）✅（Task 5 真实模式验证为演示专用，需服务在线）

约束（适用于所有计划）：

- Fake 客户端 / FakeLlmProvider / fixtures 只允许出现在 vitest 测试中；任何运行模式（dev/demo/比赛）必须显式配置真实适配器，配置缺失时启动报错，禁止静默回退 fake。
- 生产入口统一走 `createApp(createServicesFromEnv())`（Plan 2 起引入，Plan 3/4 逐步扩展 env 工厂）。
- Plan 6 Task 6（评委讲解稿）和 Task 7 Steps 2/3（排练/真实模式演示验证）为**演示专用任务**，需真实外部服务连接后执行，不影响代码验收。
- Plan 7 必须在 Plan 6 正式演示前完成，否则 Dashboard 展示的仍是 fixtures。
