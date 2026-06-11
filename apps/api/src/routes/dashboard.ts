import { Hono } from "hono";
import {
  dashboardLeadDetail,
  dashboardLeadItems,
} from "../fixtures/demo-data.js";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/leads", (c) => {
  return c.json({ items: dashboardLeadItems });
});

dashboardRoutes.get("/leads/:leadId", (c) => {
  const leadId = c.req.param("leadId");

  if (leadId !== dashboardLeadDetail.lead.id) {
    return c.json(
      {
        error: {
          code: "LEAD_NOT_FOUND",
          message: `Lead '${leadId}' was not found.`,
        },
      },
      404,
    );
  }

  return c.json(dashboardLeadDetail);
});
