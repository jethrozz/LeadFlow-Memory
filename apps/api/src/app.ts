import { Hono } from "hono";
import { FakeMemWalClient, type MemWalClient } from "@leadflow/memwal";
import { FakeWalrusArtifactClient, type WalrusArtifactClient } from "@leadflow/walrus";
import { artifactsRoute } from "./routes/artifacts.js";
import { campaignsRoutes } from "./routes/campaigns.js";
import { conversationsRoutes } from "./routes/conversations.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { devicesRoutes } from "./routes/devices.js";
import { leadsRoutes } from "./routes/leads.js";
import { memoriesRoute } from "./routes/memories.js";
import { workflowsRoutes } from "./routes/workflows.js";

export type ApiServices = {
  memwal: MemWalClient;
  walrus: WalrusArtifactClient;
};

export function createApp(services: ApiServices = {
  memwal: new FakeMemWalClient(),
  walrus: new FakeWalrusArtifactClient(),
}) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/api/artifacts", artifactsRoute(services));
  app.route("/api/campaigns", campaignsRoutes);
  app.route("/api/leads", leadsRoutes);
  app.route("/api/leads", conversationsRoutes);
  app.route("/api/dashboard", dashboardRoutes);
  app.route("/api/devices", devicesRoutes);
  app.route("/api/memories", memoriesRoute(services));
  app.route("/api/workflows", workflowsRoutes);

  return app;
}
