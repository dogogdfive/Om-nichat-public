import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { hashPassword } from "../auth/password.js";
import { randomString } from "../auth/pkce.js";
import type { Platform } from "@omnichat/chat-types";
import { DEFAULT_OMNIBOT, normalizeOmnibotConfig } from "../settings/omnibot-defaults.js";
import { PLATFORMS } from "@omnichat/chat-types";
import {
  automodAudit,
  extensionPairings,
  getDb,
  omnibotConfig,
  platformConnections,
  type AutomodAuditRow,
  type OmnibotConfigJson,
  users,
  watchedChannels,
  workspaceSlugs,
  workspaces,
} from "@omnichat/db";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { localDb } from "./local-db.js";
import { getDbMode } from "./storage.js";

/** Stable list — do not rely on package build order at runtime. */
const CONNECTION_PLATFORMS: Platform[] = PLATFORMS?.length
  ? [...PLATFORMS]
  : ["twitch", "kick", "x", "youtube"];

const defaultOmnibot = DEFAULT_OMNIBOT;

export async function isProfileSetupComplete(workspaceId: string): Promise<boolean> {
  const cfg = await getOmnibotConfig(workspaceId);
  return cfg.profileSetupComplete === true;
}

export async function markProfileSetupComplete(workspaceId: string): Promise<void> {
  const cfg = await getOmnibotConfig(workspaceId);
  await saveOmnibotConfig(workspaceId, { ...cfg, profileSetupComplete: true });
}

export async function isSlugAvailable(slug: string, exceptWorkspaceId?: string): Promise<boolean> {
  const normalized = slug.toLowerCase().replace(/^@/, "").trim();
  if (!normalized || normalized.length < 3) return false;
  if (getDbMode() === "local") return localDb.isSlugAvailable(normalized, exceptWorkspaceId);
  const db = getDb();
  const [row] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, normalized))
    .limit(1);
  if (!row) return true;
  return exceptWorkspaceId ? row.id === exceptWorkspaceId : false;
}

export async function updateWorkspaceProfile(
  workspaceId: string,
  displayName: string,
  slug: string,
): Promise<{ slug: string; displayName: string }> {
  const normalized = slug.toLowerCase().replace(/^@/, "").trim();
  const name = displayName.trim() || normalized;
  if (getDbMode() === "local") {
    return localDb.updateWorkspaceProfile(workspaceId, name, normalized);
  }
  const db = getDb();
  const [ws] = await db
    .update(workspaces)
    .set({ slug: normalized, displayName: name })
    .where(eq(workspaces.id, workspaceId))
    .returning();
  if (!ws) throw new Error("workspace not found");
  await markProfileSetupComplete(workspaceId);
  return { slug: ws.slug, displayName: ws.displayName };
}

export async function createUserWithWorkspace(
  email: string,
  passwordHash: string,
  slug: string,
  displayName: string,
  role: "owner" | "super_admin" = "owner",
) {
  if (getDbMode() === "local") {
    return localDb.createUserWithWorkspace(email, passwordHash, slug, displayName, role);
  }
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ email: email.toLowerCase(), passwordHash, role })
    .returning();
  const [ws] = await db
    .insert(workspaces)
    .values({ ownerUserId: user.id, slug, displayName })
    .returning();
  await db.insert(omnibotConfig).values({ workspaceId: ws.id, config: defaultOmnibot });
  return { user, workspace: ws };
}

export async function findUserByEmail(email: string) {
  if (getDbMode() === "local") return localDb.findUserByEmail(email);
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return row ?? null;
}

export async function findUserByLogin(login: string) {
  const raw = login.trim().replace(/^@/, "");
  if (!raw) return null;
  if (raw.includes("@")) return findUserByEmail(raw);
  const slug = raw.toLowerCase();
  if (getDbMode() === "local") return localDb.findUserByLogin(raw);
  const db = getDb();
  const [ws] = await db
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  if (!ws) return null;
  return findUserById(ws.ownerUserId);
}

export async function findUserById(id: string) {
  if (getDbMode() === "local") return localDb.findUserById(id);
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function findOwnerByPlatformUser(platform: Platform, platformUserId: string) {
  if (getDbMode() === "local") return localDb.findOwnerByPlatformUser(platform, platformUserId);
  const db = getDb();
  const [conn] = await db
    .select()
    .from(platformConnections)
    .where(
      and(
        eq(platformConnections.platform, platform),
        eq(platformConnections.platformUserId, platformUserId),
      ),
    )
    .limit(1);
  if (!conn) return null;
  const ws = await getWorkspaceById(conn.workspaceId);
  if (!ws) return null;
  const user = await findUserById(ws.ownerUserId);
  if (!user) return null;
  return { user, workspace: ws, connectionWorkspaceId: conn.workspaceId };
}

function oauthEmail(platform: Platform, platformUserId: string): string {
  return `${platform}:${platformUserId}@oauth.omnichat.local`;
}

function slugifyUsername(username: string): string {
  const base = username.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return base || "streamer";
}

export async function createOAuthUserWithWorkspace(
  platform: Platform,
  platformUserId: string,
  username: string,
  displayName: string,
) {
  const email = oauthEmail(platform, platformUserId);
  const existing = await findUserByEmail(email);
  if (existing) {
    const ws = await getWorkspaceForUser(existing.id);
    if (ws) return { user: existing, workspace: ws, created: false };
  }
  const passwordHash = hashPassword(randomBytes(32).toString("hex"));
  const role = resolveSuperAdminRole(email);
  if (getDbMode() === "local") {
    return localDb.createOAuthUserWithWorkspace(
      platform,
      platformUserId,
      username,
      displayName,
      passwordHash,
      role,
    );
  }
  let slug = slugifyUsername(username);
  const db = getDb();
  const taken = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  if (taken.length > 0) {
    slug = `${slug}-${randomBytes(3).toString("hex")}`;
  }
  return {
    ...(await createUserWithWorkspace(email, passwordHash, slug, displayName, role)),
    created: true,
  };
}

export async function getWorkspaceForUser(userId: string) {
  if (getDbMode() === "local") return localDb.getWorkspaceForUser(userId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, userId))
    .limit(1);
  return row ?? null;
}

export async function getWorkspaceById(id: string) {
  if (getDbMode() === "local") return localDb.getWorkspaceById(id);
  const db = getDb();
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  return row ?? null;
}

export async function listAllWorkspaces() {
  if (getDbMode() === "local") return localDb.listAllWorkspaces();
  const db = getDb();
  return db.select().from(workspaces);
}

export async function upsertPlatformTokens(
  workspaceId: string,
  platform: Platform,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    platformUserId?: string;
    platformUsername?: string;
    scope?: string;
    expiresAt?: Date;
  },
) {
  const values = {
    workspaceId,
    platform,
    accessTokenEnc: encryptSecret(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    platformUserId: tokens.platformUserId ?? null,
    platformUsername: tokens.platformUsername ?? null,
    scope: tokens.scope ?? null,
    expiresAt: tokens.expiresAt ?? null,
    updatedAt: new Date(),
  };
  if (getDbMode() === "local") {
    localDb.upsertPlatformTokens(workspaceId, platform, {
      accessTokenEnc: values.accessTokenEnc,
      refreshTokenEnc: values.refreshTokenEnc,
      platformUserId: values.platformUserId,
      platformUsername: values.platformUsername,
      scope: values.scope,
      expiresAt: values.expiresAt?.toISOString() ?? null,
      updatedAt: values.updatedAt.toISOString(),
    });
    return;
  }
  const db = getDb();
  await db
    .insert(platformConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [platformConnections.workspaceId, platformConnections.platform],
      set: values,
    });

  if (tokens.platformUsername) {
    await db
      .insert(workspaceSlugs)
      .values({
        workspaceId,
        platform,
        slug: tokens.platformUsername.toLowerCase(),
      })
      .onConflictDoNothing();
  }
}

export async function getPlatformTokens(workspaceId: string, platform: Platform) {
  if (getDbMode() === "local") {
    const row = localDb
      .getPlatformConnections(workspaceId)
      .find((c) => c.platform === platform);
    if (!row) return undefined;
    return {
      accessToken: decryptSecret(row.accessTokenEnc),
      refreshToken: row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) : undefined,
      platformUserId: row.platformUserId ?? undefined,
      platformUsername: row.platformUsername ?? undefined,
      scope: row.scope ?? undefined,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).getTime() : undefined,
    };
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(platformConnections)
    .where(
      and(
        eq(platformConnections.workspaceId, workspaceId),
        eq(platformConnections.platform, platform),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  return {
    accessToken: decryptSecret(row.accessTokenEnc),
    refreshToken: row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) : undefined,
    platformUserId: row.platformUserId ?? undefined,
    platformUsername: row.platformUsername ?? undefined,
    scope: row.scope ?? undefined,
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : undefined,
  };
}

export async function getConnections(workspaceId: string) {
  if (getDbMode() === "local") {
    const rows = localDb.getPlatformConnections(workspaceId);
    const out = {} as Record<
      Platform,
      { status: "connected" | "disconnected"; username?: string }
    >;
    for (const p of CONNECTION_PLATFORMS) {
      const r = rows.find((x) => x.platform === p);
      out[p] = r
        ? { status: "connected", username: r.platformUsername ?? undefined }
        : { status: "disconnected" };
    }
    return out;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(platformConnections)
    .where(eq(platformConnections.workspaceId, workspaceId));
  const out = {} as Record<
    Platform,
    { status: "connected" | "disconnected"; username?: string }
  >;
  for (const p of CONNECTION_PLATFORMS) {
    const r = rows.find((x) => x.platform === p);
    out[p] = r
      ? { status: "connected", username: r.platformUsername ?? undefined }
      : { status: "disconnected" };
  }
  return out;
}

export async function getOmnibotConfig(workspaceId: string): Promise<OmnibotConfigJson> {
  if (getDbMode() === "local") return localDb.getOmnibotConfig(workspaceId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(omnibotConfig)
    .where(eq(omnibotConfig.workspaceId, workspaceId))
    .limit(1);
  return normalizeOmnibotConfig(row?.config);
}

export async function saveOmnibotConfig(workspaceId: string, config: OmnibotConfigJson) {
  if (getDbMode() === "local") return localDb.saveOmnibotConfig(workspaceId, config);
  const db = getDb();
  await db
    .insert(omnibotConfig)
    .values({ workspaceId, config })
    .onConflictDoUpdate({
      target: omnibotConfig.workspaceId,
      set: { config, updatedAt: new Date() },
    });
  return config;
}

export async function getSsnIngestToken(workspaceId: string): Promise<string | null> {
  const cfg = await getOmnibotConfig(workspaceId);
  return cfg.ssnIngestToken ?? null;
}

export async function ensureSsnIngestToken(workspaceId: string): Promise<string> {
  const cfg = await getOmnibotConfig(workspaceId);
  if (cfg.ssnIngestToken) return cfg.ssnIngestToken;
  const token = randomString(24);
  await saveOmnibotConfig(workspaceId, { ...cfg, ssnIngestToken: token });
  return token;
}

export async function rotateSsnIngestToken(workspaceId: string): Promise<string> {
  const cfg = await getOmnibotConfig(workspaceId);
  const token = randomString(24);
  await saveOmnibotConfig(workspaceId, { ...cfg, ssnIngestToken: token });
  return token;
}

export async function validateSsnIngestToken(workspaceId: string, token: string): Promise<boolean> {
  const stored = await getSsnIngestToken(workspaceId);
  return !!stored && stored === token;
}

export async function lookupChannelBySlug(slug: string) {
  if (getDbMode() === "local") return localDb.lookupChannelBySlug(slug);
  const db = getDb();
  const normalized = slug.toLowerCase().replace(/^@/, "");
  const [byWs] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, normalized))
    .limit(1);
  if (byWs) {
    const platforms = await getConnections(byWs.id);
    const active = CONNECTION_PLATFORMS.filter((p) => platforms[p].status === "connected");
    return {
      enabled: active.length > 0,
      roomId: `room:${byWs.id}:public`,
      workspaceId: byWs.id,
      displayName: byWs.displayName,
      platformsActive: active,
      live: active.length > 0,
    };
  }
  const slugRows = await db
    .select()
    .from(workspaceSlugs)
    .where(eq(workspaceSlugs.slug, normalized));
  if (slugRows.length === 0) {
    return {
      enabled: false,
      roomId: null,
      workspaceId: null,
      displayName: slug,
      platformsActive: [] as Platform[],
      live: false,
    };
  }
  const wsId = slugRows[0].workspaceId;
  const ws = await getWorkspaceById(wsId);
  const platforms = await getConnections(wsId);
  const active = CONNECTION_PLATFORMS.filter((p) => platforms[p].status === "connected");
  return {
    enabled: active.length > 0,
    roomId: `room:${wsId}:public`,
    workspaceId: wsId,
    displayName: ws?.displayName ?? slug,
    platformsActive: active,
    live: active.length > 0,
  };
}

export async function createExtensionPairing(workspaceId: string, code: string, ttlMinutes = 15) {
  if (getDbMode() === "local") return localDb.createExtensionPairing(workspaceId, code, ttlMinutes);
  const db = getDb();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await db.insert(extensionPairings).values({ code, workspaceId, expiresAt });
  return { code, expiresAt };
}

export async function consumeExtensionPairing(code: string) {
  if (getDbMode() === "local") return localDb.consumeExtensionPairing(code);
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select()
    .from(extensionPairings)
    .where(
      and(
        eq(extensionPairings.code, code),
        gt(extensionPairings.expiresAt, now),
        isNull(extensionPairings.usedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  await db
    .update(extensionPairings)
    .set({ usedAt: now })
    .where(eq(extensionPairings.id, row.id));
  return row;
}

export type AutomodAuditInsert = {
  workspaceId: string;
  platform: Platform;
  rule: "wallet";
  targetUserId: string;
  targetDisplayName: string;
  matchedPattern: string;
  action: "timeout" | "mute" | "skipped" | "failed";
};

export async function insertAutomodAudit(row: AutomodAuditInsert): Promise<void> {
  if (getDbMode() === "local") return localDb.insertAutomodAudit(row);
  const db = getDb();
  await db.insert(automodAudit).values({
    workspaceId: row.workspaceId,
    platform: row.platform,
    rule: row.rule,
    targetUserId: row.targetUserId,
    targetDisplayName: row.targetDisplayName,
    matchedPattern: row.matchedPattern,
    action: row.action,
  });
}

export async function listAutomodAudit(
  workspaceId: string,
  limit = 50,
): Promise<AutomodAuditRow[]> {
  if (getDbMode() === "local") {
    return localDb.listAutomodAudit(workspaceId, limit).map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt),
    }));
  }
  const db = getDb();
  return db
    .select()
    .from(automodAudit)
    .where(eq(automodAudit.workspaceId, workspaceId))
    .orderBy(desc(automodAudit.createdAt))
    .limit(limit);
}

export function resolveSuperAdminRole(email: string): "owner" | "super_admin" {
  const list = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase()) ? "super_admin" : "owner";
}

export type UserBillingPatch = {
  plan?: "free" | "premium";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
};

export async function findUserByStripeCustomerId(customerId: string) {
  if (getDbMode() === "local") return localDb.findUserByStripeCustomerId(customerId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);
  return row ?? null;
}

export async function updateUserBilling(userId: string, patch: UserBillingPatch) {
  if (getDbMode() === "local") {
    localDb.updateUserBilling(userId, patch);
    return;
  }
  const db = getDb();
  await db.update(users).set(patch).where(eq(users.id, userId));
}

function normalizeWatchedSlug(slug: string): string {
  return slug.replace(/^@/, "").replace(/^#/, "").toLowerCase();
}

export async function listWatchedChannelsFromDb(
  workspaceId: string,
): Promise<{ platform: Platform; slug: string }[]> {
  if (getDbMode() === "local") {
    return localDb.listWatchedChannels(workspaceId).map((r) => ({
      platform: r.platform,
      slug: r.slug,
    }));
  }
  const db = getDb();
  const rows = await db
    .select({ platform: watchedChannels.platform, slug: watchedChannels.slug })
    .from(watchedChannels)
    .where(eq(watchedChannels.workspaceId, workspaceId));
  return rows.map((r) => ({ platform: r.platform as Platform, slug: r.slug }));
}

export async function persistWatchedChannelsForPlatform(
  workspaceId: string,
  platform: Platform,
  slugs: string[],
): Promise<void> {
  const normalized = [...new Set(slugs.map(normalizeWatchedSlug).filter(Boolean))];
  if (getDbMode() === "local") {
    localDb.setWatchedChannels(workspaceId, platform, normalized);
    return;
  }
  const db = getDb();
  await db
    .delete(watchedChannels)
    .where(and(eq(watchedChannels.workspaceId, workspaceId), eq(watchedChannels.platform, platform)));
  if (normalized.length === 0) return;
  await db.insert(watchedChannels).values(
    normalized.map((slug) => ({ workspaceId, platform, slug })),
  );
}

