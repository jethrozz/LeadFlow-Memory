import { z } from "zod";
import {
  ArtifactRefSchema,
  ConversationSchema,
  LeadProfileSchema,
  LeadSchema,
  MemoryRefSchema,
  TimelineEventSchema,
  WorkflowRunSchema,
} from "./schemas.js";

export const NextFollowUpSchema = z.object({
  nextBestAction: z.string(),
  message: z.string(),
  rationale: z.string(),
  usedMemoryRefs: z.array(z.string()),
  requiresHumanApproval: z.boolean(),
});

export const PlaybookSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string(),
  city: z.string().optional(),
  primaryGoals: z.array(z.string()),
  rules: z.array(z.string()),
});

export const DashboardLeadListItemSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  platform: z.string(),
  sourceType: z.string(),
  status: z.string(),
  intentLevel: z.string(),
  summary: z.string(),
  updatedAt: z.string().datetime(),
});

export const DashboardLeadDetailSchema = z.object({
  lead: LeadSchema,
  profile: LeadProfileSchema,
  conversation: ConversationSchema,
  timeline: z.array(TimelineEventSchema),
  memories: z.array(MemoryRefSchema),
  artifacts: z.array(ArtifactRefSchema),
  nextFollowUp: NextFollowUpSchema,
  playbook: PlaybookSummarySchema,
  activeWorkflowRun: WorkflowRunSchema.optional(),
});

export type DashboardLeadListItem = z.infer<typeof DashboardLeadListItemSchema>;
export type DashboardLeadDetail = z.infer<typeof DashboardLeadDetailSchema>;
export type NextFollowUp = z.infer<typeof NextFollowUpSchema>;
export type PlaybookSummary = z.infer<typeof PlaybookSummarySchema>;
