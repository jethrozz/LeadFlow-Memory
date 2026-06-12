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
};

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

export type ApiStore = ReturnType<typeof createStore>;

export function createStore() {
  const campaigns = new Map<string, Record<string, unknown>>();
  const leads = new Map<string, StoredLead>();
  const memoryRefs = new Map<string, StoredMemoryRef[]>();
  const artifactRefs = new Map<string, StoredArtifactRef[]>();
  const timelineEvents = new Map<string, StoredTimelineEvent[]>();
  const conversations = new Map<string, StoredConversationMessage[]>();

  const push = <T>(map: Map<string, T[]>, key: string, item: T): T => {
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
    return item;
  };

  return {
    campaigns,

    upsertLead(lead: StoredLead): StoredLead {
      const next = { ...lead, updatedAt: new Date().toISOString() };
      leads.set(lead.id, next);
      return next;
    },
    getLead: (leadId: string) => leads.get(leadId),
    listLeads: () => [...leads.values()],

    appendMemoryRef(input: Omit<StoredMemoryRef, "id" | "createdAt">): StoredMemoryRef {
      return push(memoryRefs, input.leadId, {
        ...input,
        id: `memref_${randomUUID()}`,
        createdAt: new Date().toISOString(),
      });
    },
    listMemoryRefs: (leadId: string) => memoryRefs.get(leadId) ?? [],

    appendArtifactRef(input: Omit<StoredArtifactRef, "id" | "createdAt">): StoredArtifactRef {
      return push(artifactRefs, input.leadId, {
        ...input,
        id: `artref_${randomUUID()}`,
        createdAt: new Date().toISOString(),
      });
    },
    listArtifactRefs: (leadId: string) => artifactRefs.get(leadId) ?? [],

    appendTimelineEvent(input: Omit<StoredTimelineEvent, "id" | "createdAt">): StoredTimelineEvent {
      return push(timelineEvents, input.leadId, {
        ...input,
        id: `evt_${randomUUID()}`,
        createdAt: new Date().toISOString(),
      });
    },
    listTimelineEvents: (leadId: string) => timelineEvents.get(leadId) ?? [],

    appendConversationMessage(
      leadId: string,
      input: Omit<StoredConversationMessage, "id">,
    ): StoredConversationMessage {
      return push(conversations, leadId, { ...input, id: `msg_${randomUUID()}` });
    },
    listConversationMessages: (leadId: string) => conversations.get(leadId) ?? [],
  };
}
