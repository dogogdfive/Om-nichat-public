export type ResolvedEmote = {
  id: string;
  name: string;
  url: string;
};

type SevenTvEmote = {
  id: string;
  name: string;
};

type SevenTvEmoteSet = {
  emotes?: SevenTvEmote[];
};

type SevenTvUser = {
  emote_set?: SevenTvEmoteSet;
};

function emoteUrl(id: string): string {
  return `https://cdn.7tv.app/emote/${id}/2x.webp`;
}

function collectEmotes(emotes: SevenTvEmote[] | undefined, out: ResolvedEmote[], seen: Set<string>) {
  for (const e of emotes ?? []) {
    if (!e.id || !e.name || seen.has(e.name)) continue;
    seen.add(e.name);
    out.push({ id: e.id, name: e.name, url: emoteUrl(e.id) });
  }
}

/** Global 7TV emotes (REST). */
export async function fetchGlobal7tvEmotes(): Promise<ResolvedEmote[]> {
  const res = await fetch("https://7tv.io/v3/emote-sets/global");
  if (!res.ok) return [];
  const json = (await res.json()) as SevenTvEmoteSet;
  const out: ResolvedEmote[] = [];
  const seen = new Set<string>();
  collectEmotes(json.emotes, out, seen);
  return out;
}

/** Channel 7TV emotes by Twitch numeric user id. */
export async function fetch7tvEmotesForTwitchId(twitchId: string): Promise<ResolvedEmote[]> {
  const res = await fetch(`https://api.7tv.app/v3/users/twitch/${encodeURIComponent(twitchId)}`);
  if (!res.ok) return [];
  const json = (await res.json()) as SevenTvUser;
  const out: ResolvedEmote[] = [];
  const seen = new Set<string>();
  collectEmotes(json.emote_set?.emotes, out, seen);
  return out;
}

/** Fetch global + channel 7TV emotes for a Twitch channel login. */
export async function fetch7tvEmotesForTwitch(login: string): Promise<ResolvedEmote[]> {
  const normalized = login.replace(/^@/, "").toLowerCase();
  const res = await fetch(
    `https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(normalized)}`,
  );
  if (!res.ok) return fetchGlobal7tvEmotes();
  const json = (await res.json()) as { id?: string }[];
  const twitchId = json[0]?.id;
  const out: ResolvedEmote[] = [];
  const seen = new Set<string>();
  collectEmotes((await fetchGlobal7tvEmotes()).map((e) => ({ id: e.id, name: e.name })), out, seen);
  if (twitchId) {
    collectEmotes(
      (await fetch7tvEmotesForTwitchId(twitchId)).map((e) => ({ id: e.id, name: e.name })),
      out,
      seen,
    );
  }
  return out;
}

/** Replace :emoteName: tokens with placeholder markers for rendering. */
export function applyEmotesToText(
  text: string,
  emotes: ResolvedEmote[],
): { text: string; inline: { name: string; url: string; start: number; end: number }[] } {
  const sorted = [...emotes].sort((a, b) => b.name.length - a.name.length);
  const inline: { name: string; url: string; start: number; end: number }[] = [];
  let out = text;
  for (const em of sorted) {
    const token = em.name;
    let idx = out.indexOf(token);
    while (idx >= 0) {
      inline.push({ name: em.name, url: em.url, start: idx, end: idx + token.length });
      idx = out.indexOf(token, idx + token.length);
    }
  }
  return { text: out, inline };
}

