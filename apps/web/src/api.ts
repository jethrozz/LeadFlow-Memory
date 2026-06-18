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
  const json = await requestJson<{ items: DashboardLeadItem[] }>("/api/dashboard/leads");
  return json.items;
}

export async function fetchDashboardLeadDetail(leadId: string): Promise<DashboardLeadDetail> {
  return requestJson<DashboardLeadDetail>(`/api/dashboard/leads/${leadId}`);
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

export async function startFollowup(leadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/start-followup`, { method: "POST" });
  if (!response.ok) throw new Error(`start-followup failed: ${response.status}`);
  return response.json();
}

export async function simulateCrash(leadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/simulate-crash`, { method: "POST" });
  if (!response.ok) throw new Error(`simulate-crash failed: ${response.status}`);
  return response.json();
}
