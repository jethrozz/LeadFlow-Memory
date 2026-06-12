/// <reference types="vite/client" />
import type { DashboardLeadDetail, DashboardLeadItem } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchDashboardLeads(): Promise<DashboardLeadItem[]> {
  const json = await requestJson<{ leads: DashboardLeadItem[] }>("/api/dashboard/leads");
  return json.leads;
}

export async function fetchDashboardLeadDetail(leadId: string): Promise<DashboardLeadDetail> {
  return requestJson<DashboardLeadDetail>(`/api/dashboard/leads/${leadId}`);
}

export async function syncConversation(leadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/conversation/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId: "device-1",
      xhsUsername: "重庆买房小陈",
    }),
  });
  if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
  return response.json();
}

export async function sendFollowup(leadId: string, message: string) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/conversation/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId: "device-1",
      xhsUsername: "重庆买房小陈",
      message,
    }),
  });
  if (!response.ok) throw new Error(`Send failed: ${response.status}`);
  return response.json();
}

export async function runHandoff(leadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/workflows/handoff/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leadId,
      memorySpaceId: "space_001",
      fromWorkerId: "worker-1",
      toWorkerId: "worker-2",
    }),
  });
  if (!response.ok) throw new Error(`Handoff failed: ${response.status}`);
  return response.json();
}
