import { createWorkflowService } from "@leadflow/agents";
import {
  createXhsChatClientFromEnv,
  FakeXhsChatClient,
  type XhsChatClient,
} from "@leadflow/connectors";
import { createLlmProviderFromEnv, FakeLlmProvider, type LlmProvider } from "@leadflow/llm";
import { Hono } from "hono";
import {
  createMemWalClientFromEnv,
  FakeMemWalClient,
  type MemWalClient,
} from "@leadflow/memwal";
import {
  createWalrusClientFromEnv,
  FakeWalrusArtifactClient,
  type WalrusArtifactClient,
} from "@leadflow/walrus";
import { createStore, type ApiStore } from "./store.js";
import { artifactsRoute } from "./routes/artifacts.js";
import { campaignsRoutes } from "./routes/campaigns.js";
import { conversationsRoute } from "./routes/conversations.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { demoRoute } from "./routes/demo.js";
import { devicesRoute } from "./routes/devices.js";
import { leadsRoutes } from "./routes/leads.js";
import { memoriesRoute } from "./routes/memories.js";
import { workflowsRoute } from "./routes/workflows.js";

export type ApiServices = {
  llm: LlmProvider;
  memwal: MemWalClient;
  walrus: WalrusArtifactClient;
  xhsChat: XhsChatClient;
  workflows: ReturnType<typeof createWorkflowService>;
  store: ApiStore;
};

export function createFakeServices(): ApiServices {
  const llm = new FakeLlmProvider({
    content: JSON.stringify({
      intentLevel: "A",
      summary: "客户关注渝北三房。",
      memory: "客户预算 130 万以内，关注渝北三房。",
      message: "我按预算和区域整理几套渝北三房，可以加微信发你吗？",
      extractedFields: { budget: "130万以内", district: "渝北", layout: "三房" },
      recoverySummary: "Worker-2 已恢复客户画像和下一步策略。",
    }),
  });
  const memwal = new FakeMemWalClient();
  const walrus = new FakeWalrusArtifactClient();
  const xhsChat = new FakeXhsChatClient();
  return {
    llm,
    memwal,
    walrus,
    xhsChat,
    workflows: createWorkflowService({ llm, memwal, walrus }),
    store: createStore(),
  };
}

export function createServicesFromEnv(env: NodeJS.ProcessEnv = process.env): ApiServices {
  const llm = createLlmProviderFromEnv(env);
  const memwal = createMemWalClientFromEnv(env);
  const walrus = createWalrusClientFromEnv(env);
  const xhsChat = createXhsChatClientFromEnv(env);
  return {
    llm,
    memwal,
    walrus,
    xhsChat,
    workflows: createWorkflowService({ llm, memwal, walrus }),
    store: createStore(),
  };
}

export function createApp(services: ApiServices) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/api/artifacts", artifactsRoute(services));
  app.route("/api/campaigns", campaignsRoutes(services));
  app.route("/api/leads", leadsRoutes(services));
  app.route("/api/leads", conversationsRoute(services));
  app.route("/api/dashboard", dashboardRoutes(services));
  app.route("/api/devices", devicesRoute(services));
  app.route("/api/memories", memoriesRoute(services));
  app.route("/api/workflows", workflowsRoute(services));
  app.route("/api/demo", demoRoute(services));

  return app;
}
