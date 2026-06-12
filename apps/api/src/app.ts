import { Hono } from "hono";
import { artifactsRoutes } from "./routes/artifacts.js";
import { campaignsRoutes } from "./routes/campaigns.js";
import { conversationsRoutes } from "./routes/conversations.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { devicesRoutes } from "./routes/devices.js";
import { leadsRoutes } from "./routes/leads.js";
import { memoriesRoutes } from "./routes/memories.js";
import { workflowsRoutes } from "./routes/workflows.js";

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/api/dashboard", dashboardRoutes);
  app.route("/api/campaigns", campaignsRoutes);
  app.route("/api/leads", leadsRoutes);
  app.route("/api/leads", conversationsRoutes);
  app.route("/api/leads", memoriesRoutes);
  app.route("/api/leads", artifactsRoutes);
  app.route("/api/workflows", workflowsRoutes);
  app.route("/api/devices", devicesRoutes);

  return app;
}
