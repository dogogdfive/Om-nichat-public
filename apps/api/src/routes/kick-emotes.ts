import { Hono } from "hono";
import { fetchKickEmoteJson, getKickEmotesByName } from "../adapters/kick-emotes.js";

export const kickRoutes = new Hono();

kickRoutes.get("/api/kick/emotes/:slug", async (c) => {
  const slug = c.req.param("slug").replace(/^@/, "").toLowerCase();
  try {
    const json = await fetchKickEmoteJson(slug);
    return c.json(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "kick emotes fetch failed";
    return c.json({ error: msg }, 502);
  }
});

kickRoutes.get("/api/kick/emotes/:slug/map", async (c) => {
  const slug = c.req.param("slug").replace(/^@/, "").toLowerCase();
  try {
    const byName = await getKickEmotesByName(slug);
    const emotes = [...byName.values()].map((e) => ({
      id: String(e.id),
      name: e.name,
      url: `https://files.kick.com/emotes/${e.id}/fullsize`,
    }));
    return c.json({ emotes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "kick emotes fetch failed";
    return c.json({ error: msg }, 502);
  }
});
