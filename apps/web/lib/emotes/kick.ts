import { apiFetch } from "@/lib/api";
import type { ResolvedEmote } from "./seventv";

type KickEmoteGroup = {
  emotes?: { id?: number; name?: string }[];
};

function kickEmoteUrl(id: number): string {
  return `https://files.kick.com/emotes/${id}/fullsize`;
}

async function fetchKickEmoteGroups(slug: string): Promise<KickEmoteGroup[]> {
  const res = await apiFetch(`/api/kick/emotes/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`kick emotes ${res.status}`);
  return (await res.json()) as KickEmoteGroup[];
}

export async function fetchKickEmotesForChannel(slug: string): Promise<ResolvedEmote[]> {
  const normalized = slug.replace(/^@/, "").toLowerCase();
  const slugs = normalized === "global" ? ["global"] : [normalized, "global"];
  const out: ResolvedEmote[] = [];
  const seen = new Set<string>();

  for (const s of slugs) {
    try {
      const groups = await fetchKickEmoteGroups(s);
      for (const group of groups) {
        for (const e of group.emotes ?? []) {
          if (!e.id || !e.name || seen.has(e.name)) continue;
          seen.add(e.name);
          out.push({
            id: String(e.id),
            name: e.name,
            url: kickEmoteUrl(e.id),
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  return out;
}
