import type { DashboardSummary, HomePayload, ActivitySnapshot } from "@/lib/types";
import { fetchJSON } from "./_core";

export function getSummary(params: {
  from: string;
  to: string;
  months?: number;
}) {
  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
  });
  if (params.months) searchParams.set("months", String(params.months));
  return fetchJSON<DashboardSummary>(`/api/summary?${searchParams}`);
}

export function getHome() {
  return fetchJSON<HomePayload>(`/api/home`);
}

export function getActivity() {
  return fetchJSON<ActivitySnapshot>(`/api/activity`);
}
