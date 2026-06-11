import { z } from "zod";
import {
  conversationStatuses,
  intentLevels,
  leadStatuses,
  socialPlatforms,
  sourceTypes,
  timelineEventTypes,
  workflowRunStatuses,
} from "./enums.js";

const IsoDateStringSchema = z.string().datetime();

export const SocialPlatformSchema = z.enum(socialPlatforms);
export const SourceTypeSchema = z.enum(sourceTypes);
export const IntentLevelSchema = z.enum(intentLevels);
export const LeadStatusSchema = z.enum(leadStatuses);
export const ConversationStatusSchema = z.enum(conversationStatuses);
export const WorkflowRunStatusSchema = z.enum(workflowRunStatuses);
export const TimelineEventTypeSchema = z.enum(timelineEventTypes);

export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string(),
  city: z.string().optional(),
  targetCustomer: z.string(),
  seedKeywords: z.array(z.string()),
  targetCreators: z.array(
    z.object({
      platform: SocialPlatformSchema,
      name: z.string().optional(),
      profileUrl: z.string().url().optional(),
      externalId: z.string().optional(),
    }),
  ),
  sourceModes: z.array(z.enum(["search_posts", "creator_posts", "comments", "manual_import"])),
  maxPostsPerRun: z.number().int().positive(),
  maxCommentsPerPost: z.number().int().nonnegative(),
  playbookId: z.string(),
  status: z.enum(["draft", "active", "running", "paused", "completed", "failed"]),
  createdAt: IsoDateStringSchema,
  updatedAt: IsoDateStringSchema,
});

export const SocialSourceSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  platform: SocialPlatformSchema,
  sourceType: SourceTypeSchema,
  externalId: z.string().optional(),
  url: z.string().url().optional(),
  authorName: z.string().optional(),
  content: z.string(),
  status: z.enum(["captured", "relevant", "irrelevant", "analyzed", "lead_created", "ignored", "failed"]),
  capturedAt: IsoDateStringSchema,
});

export const LeadSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  playbookId: z.string(),
  platform: SocialPlatformSchema,
  sourceType: SourceTypeSchema,
  status: LeadStatusSchema,
  intentLevel: IntentLevelSchema,
  sourceUrl: z.string().url().optional(),
  sourceAuthor: z.string().optional(),
  memorySpaceId: z.string().optional(),
  createdAt: IsoDateStringSchema,
  updatedAt: IsoDateStringSchema,
});

export const ProfileFieldValueSchema = z.object({
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
  sourceMemoryRef: z.string().optional(),
  sourceArtifactRef: z.string().optional(),
  updatedAt: IsoDateStringSchema,
});

export const LeadProfileSchema = z.object({
  leadId: z.string(),
  industry: z.string(),
  playbookId: z.string(),
  summary: z.string(),
  intentLevel: IntentLevelSchema,
  profileCompleteness: z.number().min(0).max(1),
  missingRequiredFields: z.array(z.string()),
  common: z.object({
    needs: z.array(z.string()),
    concerns: z.array(z.string()),
    timeline: z.string().optional(),
    decisionMakers: z.array(z.string()).optional(),
    contactInfo: z
      .object({
        phone: z.string().optional(),
        wechat: z.string().optional(),
      })
      .optional(),
  }),
  fields: z.record(ProfileFieldValueSchema),
});

export const ConversationMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  from: z.enum(["agent", "customer", "system"]),
  content: z.string(),
  sentAt: IsoDateStringSchema,
});

export const ConversationSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  status: ConversationStatusSchema,
  platform: SocialPlatformSchema,
  externalThreadId: z.string().optional(),
  lastMessageAt: IsoDateStringSchema.optional(),
  messages: z.array(ConversationMessageSchema),
});

export const WorkflowRunSchema = z.object({
  id: z.string(),
  type: z.enum(["discovery", "conversion", "handoff_recovery", "memory_update", "artifact_store"]),
  status: WorkflowRunStatusSchema,
  leadId: z.string().optional(),
  campaignId: z.string().optional(),
  startedAt: IsoDateStringSchema.optional(),
  completedAt: IsoDateStringSchema.optional(),
  errorMessage: z.string().optional(),
});

export const MemoryRefSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  memorySpaceId: z.string(),
  memoryId: z.string(),
  kind: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  sourceArtifactId: z.string().optional(),
  createdAt: IsoDateStringSchema,
});

export const ArtifactRefSchema = z.object({
  id: z.string(),
  leadId: z.string().optional(),
  workflowRunId: z.string().optional(),
  artifactType: z.enum([
    "source_snapshot",
    "lead_discovery_report",
    "conversation_log",
    "conversion_decision",
    "memory_diff",
    "followup_report",
    "handoff_proof",
  ]),
  blobId: z.string(),
  suiObjectId: z.string().optional(),
  summary: z.string(),
  createdAt: IsoDateStringSchema,
  verifiedStatus: z.enum(["verified", "missing", "expired", "failed"]),
});

export const TimelineEventSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  workflowRunId: z.string().optional(),
  type: TimelineEventTypeSchema,
  summary: z.string(),
  memoryRefs: z.array(z.string()),
  artifactRefs: z.array(z.string()),
  agentName: z.string().optional(),
  workerId: z.string().optional(),
  createdAt: IsoDateStringSchema,
});

export const SocialIdentitySchema = z.object({
  id: z.string().optional(),
  leadId: z.string(),
  platform: SocialPlatformSchema,
  externalUserId: z.string(),
  username: z.string(),
  profileUrl: z.string().url().optional(),
  raw: z.unknown().optional(),
});

export const DeviceConfigSchema = z.object({
  id: z.string(),
  platform: SocialPlatformSchema,
  deviceId: z.string(),
  adbAddress: z.string(),
  status: z.enum(["connected", "disconnected", "unavailable"]),
  lastConnectedAt: IsoDateStringSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Campaign = z.infer<typeof CampaignSchema>;
export type SocialSource = z.infer<typeof SocialSourceSchema>;
export type Lead = z.infer<typeof LeadSchema>;
export type LeadProfile = z.infer<typeof LeadProfileSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export type MemoryRef = z.infer<typeof MemoryRefSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type SocialIdentity = z.infer<typeof SocialIdentitySchema>;
export type DeviceConfig = z.infer<typeof DeviceConfigSchema>;
