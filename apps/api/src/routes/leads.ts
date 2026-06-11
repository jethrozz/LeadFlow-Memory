import { Hono } from "hono";
import { dashboardLeadDetail, dashboardLeadItems } from "../fixtures/demo-data.js";

export const leadsRoutes = new Hono();

leadsRoutes.get("/", (c) => c.json({ items: dashboardLeadItems }));

leadsRoutes.get("/:leadId", (c) => {
  if (c.req.param("leadId") !== dashboardLeadDetail.lead.id) {
    return c.json({ error: { code: "LEAD_NOT_FOUND", message: `Lead '${c.req.param("leadId")}' was not found.` } }, 404);
  }

  return c.json({ lead: dashboardLeadDetail.lead, profile: dashboardLeadDetail.profile });
});
