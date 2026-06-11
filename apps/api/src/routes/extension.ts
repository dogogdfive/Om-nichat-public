import { Hono } from "hono";
import { randomString } from "../auth/pkce.js";
import {
  consumeSuperAdminPairingCode,
  createSuperAdminPairingCode,
  ensureOperatorToken,
  validateOperatorToken,
} from "../auth/x-operator.js";
import { readEnv } from "../env.js";
import { resolveYoutubeVideoToHandle } from "../adapters/youtube.js";
import { getWatchedChannels, setWatchedChannels } from "../adapters/watch-channels.js";
import { requireSession } from "./user-auth.js";
import {
  consumeExtensionPairing,
  createExtensionPairing,
  ensureSsnIngestToken,
  listAllWorkspaces,
  lookupChannelBySlug,
  validateSsnIngestToken,
} from "../db/repos.js";

export const extensionRoutes = new Hono();

function apiPublicBase(): string {
  return (readEnv("API_PUBLIC_URL") ?? readEnv("WEB_APP_URL") ?? "http://localhost:8787").replace(
    /\/$/,
    "",
  );
}

extensionRoutes.get("/api/public/channels/lookup", async (c) => {
  const slug = c.req.query("slug") ?? "";
  if (!slug) return c.json({ error: "slug required" }, 400);
  const result = await lookupChannelBySlug(slug);
  return c.json(result);
});

extensionRoutes.get("/api/public/youtube/resolve", async (c) => {
  const videoId = (c.req.query("videoId") ?? "").trim();
  if (!videoId) return c.json({ error: "videoId required" }, 400);
  const resolved = await resolveYoutubeVideoToHandle(videoId);
  if (!resolved) {
    return c.json({ error: "Could not resolve that YouTube stream" }, 404);
  }
  return c.json(resolved);
});

extensionRoutes.post("/api/extension/pairing", async (c) => {
  const session = requireSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const code = randomString(8).toUpperCase();
  const { expiresAt } = await createExtensionPairing(session.workspaceId, code);
  return c.json({ code, expiresAt: expiresAt.toISOString(), workspaceId: session.workspaceId });
});

extensionRoutes.post("/api/extension/pair", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { code?: string; apiUrl?: string };
  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return c.json({ error: "code required" }, 400);
  const row = await consumeExtensionPairing(code);
  if (!row) return c.json({ error: "invalid or expired code" }, 400);

  const ingestToken = await ensureSsnIngestToken(row.workspaceId);
  const apiBase = (body.apiUrl ?? apiPublicBase()).replace(/\/$/, "");
  const webhookUrl = `${apiBase}/api/workspaces/${row.workspaceId}/ingest/ssn?token=${encodeURIComponent(ingestToken)}`;
  const xHandles = getWatchedChannels(row.workspaceId, "x");

  return c.json({
    ok: true,
    workspaceId: row.workspaceId,
    roomId: `room:${row.workspaceId}:public`,
    apiUrl: apiBase,
    ingestToken,
    webhookUrl,
    xHandles,
  });
});

/** Extension polls this for X handles added in OMnichat → Settings → Channels. */
extensionRoutes.get("/api/workspaces/:id/extension/x-state", async (c) => {
  const workspaceId = c.req.param("id");
  const token = c.req.query("token") ?? "";
  if (!token || !(await validateSsnIngestToken(workspaceId, token))) {
    return c.json({ error: "invalid token" }, 401);
  }
  return c.json({
    workspaceId,
    xHandles: getWatchedChannels(workspaceId, "x"),
    webhookUrl: `${apiPublicBase()}/api/workspaces/${workspaceId}/ingest/ssn?token=${encodeURIComponent(token)}`,
  });
});

function normalizeXHandle(raw: string): string {
  return raw
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .split("/")[0]
    .toLowerCase();
}

function requireSuperAdmin(c: Parameters<typeof requireSession>[0]) {
  const session = requireSession(c);
  if (!session || session.role !== "super_admin") return null;
  return session;
}

export type CaptureQueueHandle = {
  handle: string;
  targets: { workspaceId: string; webhookUrl: string }[];
};

export async function buildCaptureQueue(): Promise<{
  handles: CaptureQueueHandle[];
  uniqueHandles: string[];
  workspaceCount: number;
  subscriberCount: number;
}> {
  const workspaces = await listAllWorkspaces();
  const byHandle = new Map<string, CaptureQueueHandle["targets"]>();

  for (const ws of workspaces) {
    const handles = getWatchedChannels(ws.id, "x");
    if (handles.length === 0) continue;
    const token = await ensureSsnIngestToken(ws.id);
    const webhookUrl = `${apiPublicBase()}/api/workspaces/${ws.id}/ingest/ssn?token=${encodeURIComponent(token)}`;
    for (const raw of handles) {
      const handle = normalizeXHandle(raw);
      if (!handle) continue;
      const targets = byHandle.get(handle) ?? [];
      targets.push({ workspaceId: ws.id, webhookUrl });
      byHandle.set(handle, targets);
    }
  }

  const handles = [...byHandle.entries()].map(([handle, targets]) => ({ handle, targets }));
  handles.sort((a, b) => a.handle.localeCompare(b.handle));

  let subscriberCount = 0;
  for (const row of handles) subscriberCount += row.targets.length;

  return {
    handles,
    uniqueHandles: handles.map((h) => h.handle),
    workspaceCount: workspaces.length,
    subscriberCount,
  };
}

/** Super admin: one extension on the operator machine captures X chat for every workspace. */
extensionRoutes.post("/api/extension/super-admin/pairing", async (c) => {
  const session = requireSuperAdmin(c);
  if (!session) return c.json({ error: "forbidden" }, 403);
  const { code, expiresAt } = createSuperAdminPairingCode(session.email);
  return c.json({ code, expiresAt: expiresAt.toISOString(), mode: "super_admin" });
});

extensionRoutes.post("/api/extension/super-admin/pair", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { code?: string; apiUrl?: string };
  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return c.json({ error: "code required" }, 400);
  if (!consumeSuperAdminPairingCode(code)) {
    return c.json({ error: "invalid or expired code" }, 400);
  }

  const operatorToken = ensureOperatorToken();
  const apiBase = (body.apiUrl ?? apiPublicBase()).replace(/\/$/, "");
  const queue = await buildCaptureQueue();

  return c.json({
    ok: true,
    mode: "super_admin",
    apiUrl: apiBase,
    operatorToken,
    ...queue,
  });
});

/** Operator extension polls this for all X handles requested by any user. */
extensionRoutes.get("/api/extension/super-admin/capture-queue", async (c) => {
  const token = c.req.query("token") ?? "";
  if (!validateOperatorToken(token)) return c.json({ error: "invalid token" }, 401);
  const queue = await buildCaptureQueue();
  return c.json({ mode: "super_admin", ...queue });
});

/** Extension can push X handles so OMnichat feed filtering matches. */
extensionRoutes.post("/api/workspaces/:id/extension/x-handles", async (c) => {
  const workspaceId = c.req.param("id");
  const token = c.req.query("token") ?? "";
  if (!token || !(await validateSsnIngestToken(workspaceId, token))) {
    return c.json({ error: "invalid token" }, 401);
  }
  const body = (await c.req.json().catch(() => ({}))) as { handles?: string[] };
  const incoming = (body.handles ?? []).map(normalizeXHandle).filter(Boolean);
  const merged = [...new Set([...getWatchedChannels(workspaceId, "x"), ...incoming])];
  setWatchedChannels(workspaceId, "x", merged);
  return c.json({ workspaceId, xHandles: merged });
});
