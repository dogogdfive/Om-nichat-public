import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ChatHub } from "../hub.js";
import { ingestWithAutomod } from "../automod/pipeline.js";
import {
  ensureSsnIngestToken,
  getSsnIngestToken,
  rotateSsnIngestToken,
  validateSsnIngestToken,
} from "../db/repos.js";
import { getWatchedChannels } from "../adapters/watch-channels.js";
import {
  normalizeSsnPayload,
  ssnPayloadToChatMessage,
} from "../ingest/ssn-mapper.js";
import { requireSession } from "./user-auth.js";

function requireWorkspaceAccess(
  c: { req: { param: (n: string) => string } },
  session: { workspaceId: string; role: string } | null,
): string | null {
  if (!session) return null;
  const id = c.req.param("id");
  if (session.workspaceId !== id && session.role !== "super_admin") return null;
  return id;
}

export function createSsnIngestRoutes(hub: ChatHub): Hono {
  const routes = new Hono();

  routes.get("/api/workspaces/:id/ingest/ssn-token", async (c) => {
    const session = requireSession(c);
    const workspaceId = session ? requireWorkspaceAccess(c, session) : null;
    if (!workspaceId) return c.json({ error: "unauthorized" }, 401);
    const token = (await getSsnIngestToken(workspaceId)) ?? (await ensureSsnIngestToken(workspaceId));
    return c.json({ token, workspaceId });
  });

  routes.post("/api/workspaces/:id/ingest/ssn-token/rotate", async (c) => {
    const session = requireSession(c);
    const workspaceId = session ? requireWorkspaceAccess(c, session) : null;
    if (!workspaceId) return c.json({ error: "unauthorized" }, 401);
    const token = await rotateSsnIngestToken(workspaceId);
    return c.json({ token, workspaceId });
  });

  const webhook = new Hono();
  webhook.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  webhook.post("/api/workspaces/:id/ingest/ssn", async (c) => {
    const workspaceId = c.req.param("id");
    const token = c.req.query("token") ?? "";
    if (!token || !(await validateSsnIngestToken(workspaceId, token))) {
      return c.json({ error: "invalid token" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const payloads = normalizeSsnPayload(body);
    if (payloads.length === 0) {
      return c.json({ error: "no messages" }, 400);
    }

    const watched = getWatchedChannels(workspaceId, "x");
    const channelHint = watched[0];

    let ingested = 0;
    let skipped = 0;
    for (const payload of payloads) {
      const message = ssnPayloadToChatMessage(payload, channelHint);
      if (!message) {
        skipped += 1;
        continue;
      }
      if (watched.length > 0) {
        const msgChannel = message.channelId.replace(/^@/, "").toLowerCase();
        const matches = watched.some(
          (w) => w === msgChannel || msgChannel.includes(w) || w.includes(msgChannel),
        );
        if (!matches && message.channelId !== "x" && message.channelId !== "twitter") {
          skipped += 1;
          continue;
        }
        message.channelId = watched.find((w) => msgChannel.includes(w)) ?? watched[0] ?? message.channelId;
      }
      await ingestWithAutomod(workspaceId, message, hub);
      ingested += 1;
    }

    return c.json({ ok: true, ingested, skipped });
  });

  routes.route("/", webhook);
  return routes;
}
