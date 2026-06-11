import { apiFetch } from "@/lib/api";
import type { ResolvedEmote } from "./seventv";

export async function searchEmotes(
  workspaceId: string,
  query: string,
  opts?: { platform?: string; login?: string },
): Promise<ResolvedEmote[]> {
  const params = new URLSearchParams({ q: query });
  if (opts?.platform && opts.login) {
    params.set("platform", opts.platform);
    params.set("login", opts.login);
  }
  const res = await apiFetch(
    `/api/emotes/search/${encodeURIComponent(workspaceId)}?${params}`,
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { emotes?: ResolvedEmote[] };
  return json.emotes ?? [];
}
