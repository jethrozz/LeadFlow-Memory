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
