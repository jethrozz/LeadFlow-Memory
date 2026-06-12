import { Hono } from "hono";

export const devicesRoutes = new Hono();

devicesRoutes.get("/xhs", (c) => {
  return c.json({
    items: [
      {
        platform: "xhs",
        deviceId: "device-1",
        adbAddress: "emulator-5554",
        status: "disconnected",
      },
    ],
  });
});

devicesRoutes.post("/xhs/connect", async (c) => {
  const body = await c.req.json();
  return c.json({
    channel: "mcp-xhs-chat",
    tool: "xhs_connect_device",
    deviceId: body.deviceId,
    adbAddress: body.adbAddress,
    status: "queued",
  }, 202);
});

devicesRoutes.post("/xhs/disconnect", async (c) => {
  const body = await c.req.json();
  return c.json({
    channel: "mcp-xhs-chat",
    tool: "xhs_disconnect_device",
    deviceId: body.deviceId,
    status: "queued",
  }, 202);
});
