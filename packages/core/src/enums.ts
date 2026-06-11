export const socialPlatforms = [
  "xhs",
  "douyin",
  "kuaishou",
  "weibo",
  "zhihu",
  "bilibili",
  "wechat_official_account",
] as const;

export const sourceTypes = [
  "post",
  "comment",
  "creator_profile",
  "manual_import",
] as const;

export const leadStatuses = [
  "discovered",
  "qualified",
  "assigned",
  "contacting",
  "replied",
  "nurturing",
  "asking_contact",
  "contact_obtained",
  "viewing_scheduled",
  "converted",
  "paused",
  "lost",
] as const;

export const intentLevels = ["S", "A", "B", "C", "Ignore"] as const;

export const conversationStatuses = [
  "not_started",
  "opened",
  "waiting_reply",
  "customer_replied",
  "agent_replied",
  "contact_shared",
  "viewing_discussed",
  "closed",
] as const;

export const workflowRunStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "retrying",
] as const;

export const timelineEventTypes = [
  "campaign_started",
  "source_captured",
  "lead_discovered",
  "lead_scored",
  "memory_written",
  "lead_assigned",
  "conversation_started",
  "customer_replied",
  "conversion_decision_made",
  "memory_updated",
  "contact_requested",
  "contact_obtained",
  "viewing_scheduled",
  "handoff_triggered",
  "handoff_recovered",
  "lead_paused",
  "lead_lost",
] as const;
