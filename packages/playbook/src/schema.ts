import { z } from "zod";

export const ProfileFieldConfigSchema = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  priority: z.number().int().positive(),
  description: z.string(),
  examples: z.array(z.string()).optional(),
});

export const ConversionPlaybookSchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string(),
  city: z.string().optional(),
  platforms: z.array(z.string()),
  agent: z.object({
    role: z.string(),
    tone: z.array(z.string()),
    objective: z.string(),
  }),
  primary_goals: z.array(z.string()),
  secondary_goals: z.array(z.string()),
  profile_fields: z.array(ProfileFieldConfigSchema),
  conversation_rules: z.array(z.string()),
  forbidden_claims: z.array(z.string()),
  local_knowledge: z.array(z.string()),
  success_criteria: z.record(
    z.object({
      description: z.string(),
    }),
  ),
});

export type ProfileFieldConfig = z.infer<typeof ProfileFieldConfigSchema>;
export type ConversionPlaybook = z.infer<typeof ConversionPlaybookSchema>;
