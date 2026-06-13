import { Hono } from "hono";
import { z } from "zod";
import type { ApiServices } from "../app.js";

const DeviceBodySchema = z.object({
  deviceId: z.string(),
  adbAddress: z.string().optional(),
});

export function devicesRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/xhs/connect", async (c) => {
    const body = DeviceBodySchema.parse(await c.req.json());
    return c.json(await services.xhsChat.connectDevice(body));
  });

  route.post("/xhs/disconnect", async (c) => {
    const body = DeviceBodySchema.parse(await c.req.json());
    return c.json(await services.xhsChat.disconnectDevice(body));
  });

  route.get("/xhs", (c) =>
    c.json({
      devices: [{ deviceId: "device-1", status: "connected" }],
    }),
  );

  route.get("/xhs-web/login-status", async (c) => {
    try {
      const status = await services.xhsDiscovery.checkLoginStatus();
      return c.json(status);
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === "XHS_DISCOVERY_LOGIN_REQUIRED") {
        return c.json(
          { loggedIn: false, error: "请启动 xiaohongshu-mcp 并完成扫码登录", code: "XHS_DISCOVERY_LOGIN_REQUIRED" },
          409,
        );
      }
      throw err;
    }
  });

  return route;
}
