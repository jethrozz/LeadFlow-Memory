import { randomUUID } from "node:crypto";

// Fields like status, kind, and type are intentionally string (not union) —
// route-layer Zod schemas own the validation; the store is a thin persistence layer.
export type StoredLead = {
  id: string;
  campaignId: string;
  platform: string;
  status: string;
  memorySpaceId: string;
  displayName: string;
  intentLevel?: string;
  summary?: string;
  updatedAt?: string;
  isDemoSeed?: boolean;
  autoFollowupEnabled?: boolean;
  nextActionAt?: Date | null;
  followupTouchCount?: number;
  workerId?: string | null;
  leaseExpiresAt?: Date | null;
};

export type ClaimedLead = { lead: StoredLead; prevWorkerId: string | null };

export type StoredMemoryRef = {
  id: string;
  leadId: string;
  memoryId: string;
  kind: string;
  summary: string;
  confidence?: number;
  sourceArtifactBlobId?: string;
  createdAt: string;
};

export type StoredArtifactRef = {
  id: string;
  leadId: string;
  artifactType: string;
  blobId: string;
  suiObjectId?: string;
  summary?: string;
  createdAt: string;
};

export type StoredTimelineEvent = {
  id: string;
  leadId: string;
  type: string;
  summary: string;
  agentName?: string;
  workerId?: string;
  memoryRefs: string[];
  artifactRefs: string[];
  createdAt: string;
};

export type StoredConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  sentAt: string;
};

export type StoredProfileField = {
  label: string;
  value: string;
  confidence?: number;
};

// Profile/nextFollowup live alongside the lead so the dashboard can render the
// rich prototype view. Workflows write thin slices; the demo seed writes the full set.
export type StoredProfile = {
  leadId: string;
  summary: string;
  sourceNote?: string;
  needs: string[];
  concerns: string[];
  fields: Record<string, StoredProfileField>;
};

export type StoredNextFollowup = {
  leadId: string;
  message: string;
  usedMemoryRefs: string[];
  worker?: string;
  nextBestAction?: string;
  requiresHumanApproval?: boolean;
};

export type StoredSocialIdentity = {
  leadId: string;
  platform: string;
  externalUserId: string;
  redId?: string;
  username?: string;
};

export type StoredDevice = {
  deviceId: string;
  adbAddress: string;
  status: string;
};

// --- Async store interface ---

export interface ApiStore {
  // Campaigns
  listCampaigns(): Promise<Record<string, unknown>[]>;
  getCampaign(id: string): Promise<Record<string, unknown> | undefined>;
  upsertCampaign(campaign: Record<string, unknown>): Promise<Record<string, unknown>>;

  // Leads
  upsertLead(lead: StoredLead): Promise<StoredLead>;
  getLead(leadId: string): Promise<StoredLead | undefined>;
  listLeads(): Promise<StoredLead[]>;
  listActiveFollowupLeads(now: Date, limit: number): Promise<StoredLead[]>;
  claimDueLeads(
    workerId: string,
    now: Date,
    leaseMs: number,
    limit: number,
  ): Promise<ClaimedLead[]>;
  updateLeadFollowupState(
    leadId: string,
    patch: {
      status?: string;
      nextActionAt?: Date | null;
      followupTouchCount?: number;
      autoFollowupEnabled?: boolean;
      workerId?: string | null;
      leaseExpiresAt?: Date | null;
    },
  ): Promise<void>;
  getDefaultDevice(): Promise<StoredDevice | undefined>;

  // Memory refs
  appendMemoryRef(input: Omit<StoredMemoryRef, "id" | "createdAt">): Promise<StoredMemoryRef>;
  listMemoryRefs(leadId: string): Promise<StoredMemoryRef[]>;

  // Artifact refs
  appendArtifactRef(input: Omit<StoredArtifactRef, "id" | "createdAt">): Promise<StoredArtifactRef>;
  listArtifactRefs(leadId: string): Promise<StoredArtifactRef[]>;

  // Timeline events
  appendTimelineEvent(input: Omit<StoredTimelineEvent, "id" | "createdAt">): Promise<StoredTimelineEvent>;
  listTimelineEvents(leadId: string): Promise<StoredTimelineEvent[]>;

  // Conversations
  appendConversationMessage(
    leadId: string,
    input: Omit<StoredConversationMessage, "id">,
  ): Promise<StoredConversationMessage>;
  listConversationMessages(leadId: string): Promise<StoredConversationMessage[]>;

  // Profiles
  upsertProfile(input: StoredProfile): Promise<StoredProfile>;
  getProfile(leadId: string): Promise<StoredProfile | undefined>;

  // Next followup
  upsertNextFollowup(input: StoredNextFollowup): Promise<StoredNextFollowup>;
  getNextFollowup(leadId: string): Promise<StoredNextFollowup | undefined>;

  // Social identity (小红书号等外部平台身份)
  // externalUserId 存平台内部 user_id（发现阶段一定能拿到）；
  // redId 存小红书号（需进用户详情页换取，供 mcp-xhs-chat adb 搜索用），两者区分存储。
  upsertSocialIdentity(input: {
    leadId: string;
    platform: string;
    externalUserId: string;
    redId?: string;
    username?: string;
  }): Promise<void>;
  getSocialIdentity(leadId: string): Promise<StoredSocialIdentity | undefined>;

  // Workflow runs
  createWorkflowRun(input: {
    type: string;
    campaignId?: string;
    leadId?: string;
    metadata?: unknown;
  }): Promise<{ id: string; status: string }>;
  updateWorkflowRun(
    id: string,
    data: { status?: string; completedAt?: Date; errorMessage?: string; metadata?: unknown },
  ): Promise<void>;
  listWorkflowRuns(campaignId?: string): Promise<Array<{ id: string; type: string; status: string; startedAt: Date | null; completedAt: Date | null; errorMessage: string | null; metadata: unknown; campaignId: string | null }>>;
}

// --- In-memory implementation (for tests / fake mode) ---

export function createMemoryStore(): ApiStore {
  const campaigns = new Map<string, Record<string, unknown>>();
  const leads = new Map<string, StoredLead>();
  const memoryRefs = new Map<string, StoredMemoryRef[]>();
  const artifactRefs = new Map<string, StoredArtifactRef[]>();
  const timelineEvents = new Map<string, StoredTimelineEvent[]>();
  const conversations = new Map<string, StoredConversationMessage[]>();
  const profiles = new Map<string, StoredProfile>();
  const nextFollowups = new Map<string, StoredNextFollowup>();
  const socialIdentities = new Map<string, StoredSocialIdentity>();
  const workflowRuns: Array<{
    id: string;
    type: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    errorMessage: string | null;
    metadata: unknown;
    campaignId: string | null;
    leadId: string | null;
  }> = [];

  const push = <T>(map: Map<string, T[]>, key: string, item: T): T => {
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
    return item;
  };

  return {
    // Campaigns
    listCampaigns: async () => [...campaigns.values()],
    getCampaign: async (id) => campaigns.get(id),
    upsertCampaign: async (campaign) => {
      campaigns.set(campaign.id as string, campaign);
      return campaign;
    },

    // Leads
    upsertLead: async (lead) => {
      const existing = leads.get(lead.id);
      const next: StoredLead = {
        ...existing,
        ...lead,
        autoFollowupEnabled: lead.autoFollowupEnabled ?? existing?.autoFollowupEnabled ?? false,
        nextActionAt: lead.nextActionAt !== undefined ? lead.nextActionAt : (existing?.nextActionAt ?? null),
        followupTouchCount: lead.followupTouchCount ?? existing?.followupTouchCount ?? 0,
        workerId: lead.workerId !== undefined ? lead.workerId : (existing?.workerId ?? null),
        leaseExpiresAt:
          lead.leaseExpiresAt !== undefined ? lead.leaseExpiresAt : (existing?.leaseExpiresAt ?? null),
        updatedAt: new Date().toISOString(),
      };
      leads.set(lead.id, next);
      return next;
    },
    getLead: async (leadId) => leads.get(leadId),
    listLeads: async () => [...leads.values()],

    listActiveFollowupLeads: async (now, limit) =>
      [...leads.values()]
        .filter(
          (l): l is StoredLead & { nextActionAt: Date } =>
            l.autoFollowupEnabled === true &&
            l.nextActionAt != null &&
            l.nextActionAt <= now &&
            (l.status === "discovered" || l.status === "contacting"),
        )
        .sort((a, b) => a.nextActionAt.getTime() - b.nextActionAt.getTime())
        .slice(0, limit),

    updateLeadFollowupState: async (leadId, patch) => {
      const lead = leads.get(leadId);
      if (!lead) return;
      if (patch.status !== undefined) lead.status = patch.status;
      if (patch.nextActionAt !== undefined) lead.nextActionAt = patch.nextActionAt;
      if (patch.followupTouchCount !== undefined) lead.followupTouchCount = patch.followupTouchCount;
      if (patch.autoFollowupEnabled !== undefined) lead.autoFollowupEnabled = patch.autoFollowupEnabled;
      if (patch.workerId !== undefined) lead.workerId = patch.workerId;
      if (patch.leaseExpiresAt !== undefined) lead.leaseExpiresAt = patch.leaseExpiresAt;
      lead.updatedAt = new Date().toISOString();
    },

    claimDueLeads: async () => [],

    getDefaultDevice: async () => undefined, // no device table in memory mode

    // Memory refs
    appendMemoryRef: async (input) =>
      push(memoryRefs, input.leadId, {
        ...input,
        id: `memref_${randomUUID()}`,
        createdAt: new Date().toISOString(),
      }),
    listMemoryRefs: async (leadId) => memoryRefs.get(leadId) ?? [],

    // Artifact refs
    appendArtifactRef: async (input) =>
      push(artifactRefs, input.leadId, {
        ...input,
        id: `artref_${randomUUID()}`,
        createdAt: new Date().toISOString(),
      }),
    listArtifactRefs: async (leadId) => artifactRefs.get(leadId) ?? [],

    // Timeline events
    appendTimelineEvent: async (input) =>
      push(timelineEvents, input.leadId, {
        ...input,
        id: `evt_${randomUUID()}`,
        createdAt: new Date().toISOString(),
      }),
    listTimelineEvents: async (leadId) => timelineEvents.get(leadId) ?? [],

    // Conversations
    appendConversationMessage: async (leadId, input) =>
      push(conversations, leadId, { ...input, id: `msg_${randomUUID()}` }),
    listConversationMessages: async (leadId) => conversations.get(leadId) ?? [],

    // Profiles
    upsertProfile: async (input) => {
      const existing = profiles.get(input.leadId);
      const next: StoredProfile = {
        leadId: input.leadId,
        summary: input.summary || existing?.summary || "",
        sourceNote: input.sourceNote ?? existing?.sourceNote,
        needs: input.needs.length ? input.needs : existing?.needs ?? [],
        concerns: input.concerns.length ? input.concerns : existing?.concerns ?? [],
        fields: { ...(existing?.fields ?? {}), ...input.fields },
      };
      profiles.set(input.leadId, next);
      return next;
    },
    getProfile: async (leadId) => profiles.get(leadId),

    // Next followup
    upsertNextFollowup: async (input) => {
      nextFollowups.set(input.leadId, input);
      return input;
    },
    getNextFollowup: async (leadId) => nextFollowups.get(leadId),

    // Social identity
    upsertSocialIdentity: async (input) => {
      socialIdentities.set(input.leadId, {
        leadId: input.leadId,
        platform: input.platform,
        externalUserId: input.externalUserId,
        redId: input.redId,
        username: input.username,
      });
    },
    getSocialIdentity: async (leadId) => socialIdentities.get(leadId),

    // Workflow runs
    createWorkflowRun: async (input) => {
      const run = {
        id: `run_${randomUUID()}`,
        type: input.type,
        status: "running",
        startedAt: new Date(),
        completedAt: null as Date | null,
        errorMessage: null as string | null,
        metadata: input.metadata ?? null,
        campaignId: input.campaignId ?? null,
        leadId: input.leadId ?? null,
      };
      workflowRuns.push(run);
      return { id: run.id, status: run.status };
    },
    updateWorkflowRun: async (id, data) => {
      const run = workflowRuns.find((r) => r.id === id);
      if (run) {
        if (data.status) run.status = data.status;
        if (data.completedAt) run.completedAt = data.completedAt;
        if (data.errorMessage !== undefined) run.errorMessage = data.errorMessage;
        if (data.metadata !== undefined) run.metadata = data.metadata;
      }
    },
    listWorkflowRuns: async (campaignId) =>
      workflowRuns
        .filter((r) => !campaignId || r.campaignId === campaignId)
        .map((r) => ({
          id: r.id,
          type: r.type,
          status: r.status,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          errorMessage: r.errorMessage,
          metadata: r.metadata,
          campaignId: r.campaignId,
        })),
  };
}

// Backward compat alias
export const createStore = createMemoryStore;
