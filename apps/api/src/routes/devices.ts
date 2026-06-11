import { Hono } from "hono";
import { z } from "zod";
import { deviceFixtures } from "../fixtures/demo-data.js";

export const devicesRoutes = new Hono();

devicesRoutes.get("/xhs", (c) => {
  return c.json({ items: deviceFixtures });
});

const connectSchema = z.object({
  deviceId: z.string().min(1),
  adbAddress: z.string().min(1),
});

devicesRoutes.post("/xhs/connect", async (c) => {
  const parsed = connectSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join("; ") } },
      400,
    );
  }
  return c.json({
    channel: "mcp-xhs-chat",
    tool: "xhs_connect_device",
    deviceId: parsed.data.deviceId,
    adbAddress: parsed.data.adbAddress,
    status: "queued",
  }, 202);
});

const disconnectSchema = z.object({
  deviceId: z.string().min(1),
});

devicesRoutes.post("/xhs/disconnect", async (c) => {
  const parsed = disconnectSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join("; ") } },
      400,
    );
  }
  return c.json({
    channel: "mcp-xhs-chat",
    tool: "xhs_disconnect_device",
    deviceId: parsed.data.deviceId,
    status: "queued",
  }, 202);
});
