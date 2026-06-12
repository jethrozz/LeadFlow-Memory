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

  return route;
}
