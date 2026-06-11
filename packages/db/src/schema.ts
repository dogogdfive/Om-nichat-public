import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["owner", "super_admin"]);

export const platformEnum = pgEnum("platform", ["twitch", "kick", "x", "youtube", "rumble"]);

export const userPlanEnum = pgEnum("user_plan", ["free", "premium"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("owner"),
  plan: userPlanEnum("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeSubscriptionStatus: text("stripe_subscription_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspaces_slug_idx").on(t.slug)],
);

export const platformConnections = pgTable(
  "platform_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    platformUserId: text("platform_user_id"),
    platformUsername: text("platform_username"),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("platform_connections_ws_platform_idx").on(t.workspaceId, t.platform)],
);

export type OmnibotConfigJson = {
  enabled: boolean;
  /** When true, wallet scanning is suspended until a mod runs @omnibunnybot start */
  paused?: boolean;
  walletScanner: boolean;
  walletTimeoutSeconds: number;
  platforms: { twitch: boolean; kick: boolean; x: boolean; youtube: boolean; rumble: boolean };
  viewerCollective: boolean;
  locked: Partial<Record<string, boolean>>;
  /** False until streamer picks Om-nichat username after first OAuth login */
  profileSetupComplete?: boolean;
  /** Token for Social Stream Ninja webhook ingest (X Live chat) */
  ssnIngestToken?: string;
};

export const omnibotConfig = pgTable("omnibot_config", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  config: jsonb("config").$type<OmnibotConfigJson>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const extensionPairings = pgTable("extension_pairings", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceSlugs = pgTable(
  "workspace_slugs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    slug: text("slug").notNull(),
  },
  (t) => [uniqueIndex("workspace_slugs_platform_slug_idx").on(t.platform, t.slug)],
);

/** Channels a workspace wants to ingest (server-side watch list). */
export const watchedChannels = pgTable(
  "watched_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("watched_channels_ws_platform_slug_idx").on(t.workspaceId, t.platform, t.slug),
  ],
);

export const automodRuleEnum = pgEnum("automod_rule", ["wallet"]);
export const automodActionEnum = pgEnum("automod_action", [
  "timeout",
  "mute",
  "skipped",
  "failed",
]);

export const automodAudit = pgTable("automod_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  rule: automodRuleEnum("rule").notNull().default("wallet"),
  targetUserId: text("target_user_id").notNull(),
  targetDisplayName: text("target_display_name").notNull(),
  matchedPattern: text("matched_pattern").notNull(),
  action: automodActionEnum("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AutomodAuditRow = typeof automodAudit.$inferSelect;
