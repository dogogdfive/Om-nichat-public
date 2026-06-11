import { apiFetch } from "@/lib/api";
import type { ResolvedEmote } from "./seventv";

export async function fetchWorkspaceEmotes(
  workspaceId: string,
  query?: string,
): Promise<ResolvedEmote[]> {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  const res = await apiFetch(`/api/emotes/workspace/${encodeURIComponent(workspaceId)}${params}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { emotes?: ResolvedEmote[] };
  return json.emotes ?? [];
}
