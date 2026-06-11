import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { Platform } from "@omnichat/chat-types";
import { PLATFORMS } from "@omnichat/chat-types";
import type { OmnibotConfigJson } from "@omnichat/db";
import { DEFAULT_OMNIBOT, normalizeOmnibotConfig } from "../settings/omnibot-defaults.js";
import { localDbPath } from "./storage.js";

type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  role: "owner" | "super_admin";
  plan?: "free" | "premium";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
  createdAt: string;
};

type WorkspaceRow = {
  id: string;
  ownerUserId: string;
  slug: string;
  displayName: string;
  createdAt: string;
};

type ConnectionRow = {
  id: string;
  workspaceId: string;
  platform: Platform;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  platformUserId: string | null;
  platformUsername: string | null;
  scope: string | null;
  expiresAt: string | null;
  updatedAt: string;
};

type OmnibotRow = { workspaceId: string; config: OmnibotConfigJson; updatedAt: string };
type SlugRow = { id: string; workspaceId: string; platform: Platform; slug: string };
type WatchedChannelRow = { workspaceId: string; platform: Platform; slug: string };
type PairingRow = {
  id: string;
  code: string;
  workspaceId: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

type AutomodAuditRow = {
  id: string;
  workspaceId: string;
  platform: Platform;
  rule: "wallet";
  targetUserId: string;
  targetDisplayName: string;
  matchedPattern: string;
  action: "timeout" | "mute" | "skipped" | "failed";
  createdAt: string;
};

type Store = {
  users: UserRow[];
  workspaces: WorkspaceRow[];
  platformConnections: ConnectionRow[];
  omnibotConfig: OmnibotRow[];
  workspaceSlugs: SlugRow[];
  watchedChannels: WatchedChannelRow[];
  extensionPairings: PairingRow[];
  automodAudit: AutomodAuditRow[];
};

const empty = (): Store => ({
  users: [],
  workspaces: [],
  platformConnections: [],
  omnibotConfig: [],
  workspaceSlugs: [],
  watchedChannels: [],
  extensionPairings: [],
  automodAudit: [],
});

function load(): Store {
  try {
    const parsed = JSON.parse(readFileSync(localDbPath(), "utf8")) as Partial<Store>;
    // Merge with defaults so DB files written before a table existed don't crash.
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

function save(data: Store): void {
  writeFileSync(localDbPath(), JSON.stringify(data, null, 2), "utf8");
}

function mutate(fn: (data: Store) => void): void {
  const data = load();
  fn(data);
  save(data);
}

const defaultOmnibot = DEFAULT_OMNIBOT;

export const localDb = {
  createUserWithWorkspace(
    email: string,
    passwordHash: string,
    slug: string,
    displayName: string,
    role: "owner" | "super_admin" = "owner",
  ) {
    const user: UserRow = {
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      role,
      plan: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      createdAt: new Date().toISOString(),
    };
    const ws: WorkspaceRow = {
      id: randomUUID(),
      ownerUserId: user.id,
      slug,
      displayName,
      createdAt: new Date().toISOString(),
    };
    mutate((d) => {
      d.users.push(user);
      d.workspaces.push(ws);
      d.omnibotConfig.push({
        workspaceId: ws.id,
        config: defaultOmnibot,
        updatedAt: new Date().toISOString(),
      });
    });
    return { user, workspace: ws };
  },

  findUserByEmail(email: string) {
    return load().users.find((u) => u.email === email.toLowerCase()) ?? null;
  },

  findUserByLogin(login: string) {
    const raw = login.trim().replace(/^@/, "");
    if (!raw) return null;
    if (raw.includes("@")) return localDb.findUserByEmail(raw);
    const slug = raw.toLowerCase();
    const ws = load().workspaces.find((w) => w.slug === slug);
    if (!ws) return null;
    return localDb.findUserById(ws.ownerUserId);
  },

  findUserById(id: string) {
    return load().users.find((u) => u.id === id) ?? null;
  },

  findOwnerByPlatformUser(platform: Platform, platformUserId: string) {
    const d = load();
    const conn = d.platformConnections.find(
      (c) => c.platform === platform && c.platformUserId === platformUserId,
    );
    if (!conn) return null;
    const ws = d.workspaces.find((w) => w.id === conn.workspaceId);
    if (!ws) return null;
    const user = d.users.find((u) => u.id === ws.ownerUserId);
    if (!user) return null;
    return { user, workspace: ws, connectionWorkspaceId: conn.workspaceId };
  },

  createOAuthUserWithWorkspace(
    platform: Platform,
    platformUserId: string,
    username: string,
    displayName: string,
    passwordHash: string,
    role: "owner" | "super_admin",
  ) {
    const email = `${platform}:${platformUserId}@oauth.omnichat.local`;
    const existing = localDb.findUserByEmail(email);
    if (existing) {
      const ws = localDb.getWorkspaceForUser(existing.id);
      if (ws) return { user: existing, workspace: ws, created: false as const };
    }
    let slug = username.replace(/[^a-z0-9]/gi, "").toLowerCase() || "streamer";
    const d = load();
    if (d.workspaces.some((w) => w.slug === slug)) {
      slug = `${slug}-${randomBytes(3).toString("hex")}`;
    }
    const created = localDb.createUserWithWorkspace(email, passwordHash, slug, displayName, role);
    return { ...created, created: true as const };
  },

  getWorkspaceForUser(userId: string) {
    return load().workspaces.find((w) => w.ownerUserId === userId) ?? null;
  },

  getWorkspaceById(id: string) {
    return load().workspaces.find((w) => w.id === id) ?? null;
  },

  listAllWorkspaces() {
    return load().workspaces;
  },

  upsertPlatformTokens(
    workspaceId: string,
    platform: Platform,
    values: Omit<ConnectionRow, "id" | "workspaceId" | "platform">,
  ) {
    mutate((d) => {
      const i = d.platformConnections.findIndex(
        (c) => c.workspaceId === workspaceId && c.platform === platform,
      );
      const row: ConnectionRow = {
        id: i >= 0 ? d.platformConnections[i].id : randomUUID(),
        workspaceId,
        platform,
        ...values,
      };
      if (i >= 0) d.platformConnections[i] = row;
      else d.platformConnections.push(row);
      if (values.platformUsername) {
        const slug = values.platformUsername.toLowerCase();
        if (
          !d.workspaceSlugs.some(
            (s) => s.workspaceId === workspaceId && s.platform === platform && s.slug === slug,
          )
        ) {
          d.workspaceSlugs.push({
            id: randomUUID(),
            workspaceId,
            platform,
            slug,
          });
        }
      }
    });
  },

  getPlatformConnections(workspaceId: string) {
    return load().platformConnections.filter((c) => c.workspaceId === workspaceId);
  },

  getOmnibotConfig(workspaceId: string): OmnibotConfigJson {
    const raw = load().omnibotConfig.find((o) => o.workspaceId === workspaceId)?.config;
    return normalizeOmnibotConfig(raw);
  },

  saveOmnibotConfig(workspaceId: string, config: OmnibotConfigJson) {
    mutate((d) => {
      const i = d.omnibotConfig.findIndex((o) => o.workspaceId === workspaceId);
      const row = { workspaceId, config, updatedAt: new Date().toISOString() };
      if (i >= 0) d.omnibotConfig[i] = row;
      else d.omnibotConfig.push(row);
    });
    return config;
  },

  lookupChannelBySlug(slug: string) {
    const normalized = slug.toLowerCase().replace(/^@/, "");
    const d = load();
    const byWs = d.workspaces.find((w) => w.slug === normalized);
    if (byWs) {
      const conns = localDb.getPlatformConnections(byWs.id);
      const active = PLATFORMS.filter((p) =>
        conns.some((c) => c.platform === p),
      );
      return {
        enabled: active.length > 0,
        roomId: `room:${byWs.id}:public`,
        workspaceId: byWs.id,
        displayName: byWs.displayName,
        platformsActive: active,
        live: active.length > 0,
      };
    }
    const slugRow = d.workspaceSlugs.find((s) => s.slug === normalized);
    if (!slugRow) {
      return {
        enabled: false,
        roomId: null,
        workspaceId: null,
        displayName: slug,
        platformsActive: [] as Platform[],
        live: false,
      };
    }
    const ws = d.workspaces.find((w) => w.id === slugRow.workspaceId);
    const conns = localDb.getPlatformConnections(slugRow.workspaceId);
    const active = PLATFORMS.filter((p) =>
      conns.some((c) => c.platform === p),
    );
    return {
      enabled: active.length > 0,
      roomId: `room:${slugRow.workspaceId}:public`,
      workspaceId: slugRow.workspaceId,
      displayName: ws?.displayName ?? slug,
      platformsActive: active,
      live: active.length > 0,
    };
  },

  createExtensionPairing(workspaceId: string, code: string, ttlMinutes = 15) {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    mutate((d) => {
      d.extensionPairings.push({
        id: randomUUID(),
        code,
        workspaceId,
        expiresAt,
        usedAt: null,
        createdAt: new Date().toISOString(),
      });
    });
    return { code, expiresAt: new Date(expiresAt) };
  },

  consumeExtensionPairing(code: string) {
    const d = load();
    const now = Date.now();
    const row = d.extensionPairings.find(
      (p) => p.code === code && !p.usedAt && new Date(p.expiresAt).getTime() > now,
    );
    if (!row) return null;
    mutate((data) => {
      const r = data.extensionPairings.find((p) => p.id === row.id);
      if (r) r.usedAt = new Date().toISOString();
    });
    return row;
  },

  isSlugAvailable(slug: string, exceptWorkspaceId?: string) {
    const normalized = slug.toLowerCase().replace(/^@/, "").trim();
    if (!normalized || normalized.length < 3) return false;
    const row = load().workspaces.find((w) => w.slug === normalized);
    if (!row) return true;
    return exceptWorkspaceId ? row.id === exceptWorkspaceId : false;
  },

  insertAutomodAudit(row: Omit<AutomodAuditRow, "id" | "createdAt">) {
    mutate((d) => {
      d.automodAudit.unshift({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...row,
      });
      if (d.automodAudit.length > 500) d.automodAudit.length = 500;
    });
  },

  listAutomodAudit(workspaceId: string, limit = 50): AutomodAuditRow[] {
    return load()
      .automodAudit.filter((a) => a.workspaceId === workspaceId)
      .slice(0, limit);
  },

  listWorkspaceSlugs(workspaceId: string): SlugRow[] {
    return load().workspaceSlugs.filter((s) => s.workspaceId === workspaceId);
  },

  /** Replace the persisted watch list for a workspace+platform. */
  setWatchedChannels(workspaceId: string, platform: Platform, slugs: string[]): void {
    const normalized = [
      ...new Set(slugs.map((s) => s.toLowerCase().replace(/^@/, "").replace(/^#/, "").trim())),
    ].filter(Boolean);
    mutate((d) => {
      if (!d.watchedChannels) d.watchedChannels = [];
      d.watchedChannels = d.watchedChannels.filter(
        (w) => !(w.workspaceId === workspaceId && w.platform === platform),
      );
      for (const slug of normalized) {
        d.watchedChannels.push({ workspaceId, platform, slug });
      }
    });
  },

  listWatchedChannels(workspaceId: string): WatchedChannelRow[] {
    return load().watchedChannels.filter((w) => w.workspaceId === workspaceId);
  },

  updateWorkspaceProfile(workspaceId: string, displayName: string, slug: string) {
    const normalized = slug.toLowerCase().replace(/^@/, "").trim();
    const name = displayName.trim() || normalized;
    mutate((d) => {
      const ws = d.workspaces.find((w) => w.id === workspaceId);
      if (ws) {
        ws.slug = normalized;
        ws.displayName = name;
      }
      const i = d.omnibotConfig.findIndex((o) => o.workspaceId === workspaceId);
      const cfg = i >= 0 ? d.omnibotConfig[i].config : { ...defaultOmnibot };
      const next = { ...cfg, profileSetupComplete: true };
      const row = { workspaceId, config: next, updatedAt: new Date().toISOString() };
      if (i >= 0) d.omnibotConfig[i] = row;
      else d.omnibotConfig.push(row);
    });
    return { slug: normalized, displayName: name };
  },

  findUserByStripeCustomerId(customerId: string) {
    return load().users.find((u) => u.stripeCustomerId === customerId) ?? null;
  },

  updateUserBilling(
    userId: string,
    patch: {
      plan?: "free" | "premium";
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      stripeSubscriptionStatus?: string | null;
    },
  ) {
    mutate((d) => {
      const user = d.users.find((u) => u.id === userId);
      if (!user) return;
      if (patch.plan !== undefined) user.plan = patch.plan;
      if (patch.stripeCustomerId !== undefined) user.stripeCustomerId = patch.stripeCustomerId;
      if (patch.stripeSubscriptionId !== undefined) {
        user.stripeSubscriptionId = patch.stripeSubscriptionId;
      }
      if (patch.stripeSubscriptionStatus !== undefined) {
        user.stripeSubscriptionStatus = patch.stripeSubscriptionStatus;
      }
    });
  },
};
