import { Hono } from "hono";
import type { ApiServices } from "../app.js";
import type { StoredLead, StoredProfile } from "../store.js";

function toLeadListItem(lead: StoredLead, profile: StoredProfile | undefined) {
  return {
    id: lead.id,
    displayName: lead.displayName,
    platform: lead.platform,
    status: lead.status,
    intentLevel: lead.intentLevel,
    summary: lead.summary,
    updatedAt: lead.updatedAt,
    isDemoSeed: lead.isDemoSeed ?? false,
    // 侧边栏线索卡片展示区域与前两个需求标签
    district: profile?.fields.district?.value,
    needs: profile?.needs ?? [],
    workerId: lead.workerId ?? null,
    leaseExpiresAt: lead.leaseExpiresAt ? lead.leaseExpiresAt.toISOString() : null,
    followupTouchCount: lead.followupTouchCount ?? 0,
  };
}

export function dashboardRoutes(services: ApiServices) {
  const route = new Hono();

  route.get("/leads", async (c) => {
    const leads = await services.store.listLeads();
    const items = await Promise.all(
      leads.map(async (lead) => {
        const profile = await services.store.getProfile(lead.id);
        return toLeadListItem(lead, profile);
      }),
    );
    return c.json({ items });
  });

  route.get("/leads/:leadId", async (c) => {
    const leadId = c.req.param("leadId");
    const lead = await services.store.getLead(leadId);
    if (!lead) {
      return c.json(
        { error: { code: "LEAD_NOT_FOUND", message: `Lead '${leadId}' was not found.` } },
        404,
      );
    }
    const profile = await services.store.getProfile(leadId);
    const conversation = await services.store.listConversationMessages(leadId);
    const timeline = await services.store.listTimelineEvents(leadId);
    const memories = await services.store.listMemoryRefs(leadId);
    const artifacts = await services.store.listArtifactRefs(leadId);
    const nextFollowup = await services.store.getNextFollowup(leadId);
    return c.json({
      lead: toLeadListItem(lead, profile),
      profile: {
        summary: profile?.summary ?? lead.summary ?? "",
        sourceNote: profile?.sourceNote,
        needs: profile?.needs ?? [],
        concerns: profile?.concerns ?? [],
        fields: profile?.fields ?? {},
      },
      conversation: { messages: conversation },
      timeline,
      memories,
      artifacts,
      nextFollowup: nextFollowup ?? null,
    });
  });

  return route;
}
