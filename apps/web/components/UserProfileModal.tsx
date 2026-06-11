"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { EmoteText } from "@/components/EmoteText";
import { PlatformBadge, PlatformEmblem } from "@/components/PlatformLogos";
import type { ResolvedEmote } from "@/lib/emotes/seventv";

export type ChatUserProfile = {
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  joinedAt: string | null;
  followerCount: number | null;
  role: string | null;
  channelSlug: string | null;
  channelDisplayName: string | null;
};

export type RecentChatMessage = {
  time: string;
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  user: string;
  color?: string;
  text: string;
};

export type ModActionRecord = {
  id: string;
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  userId: string;
  login: string;
  action: "timeout" | "ban" | "unban" | "warn";
  durationSeconds?: number;
  at: string;
};

type Props = {
  workspaceId: string;
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  userId: string;
  displayName: string;
  login?: string;
  channelLogin?: string;
  userMessages: RecentChatMessage[];
  modActions: ModActionRecord[];
  emotes: Map<string, ResolvedEmote>;
  emoteSize: number;
  onModAction: (record: ModActionRecord) => void;
  onClose: () => void;
};

const TIMEOUT_PRESETS = [
  { label: "1s", seconds: 1 },
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "10m", seconds: 600 },
  { label: "30m", seconds: 1800 },
  { label: "1h", seconds: 3600 },
  { label: "4h", seconds: 14400 },
  { label: "12h", seconds: 43200 },
  { label: "1d", seconds: 86400 },
  { label: "7d", seconds: 604800 },
  { label: "14d", seconds: 1209600 },
] as const;

type ProfileTab = "messages" | "warnings" | "timeouts" | "bans";

const PLATFORM_LABEL: Record<"twitch" | "kick" | "x" | "youtube" | "rumble", string> = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X",
  youtube: "YouTube",
  rumble: "Rumble",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function UserProfileModal({
  workspaceId,
  platform,
  userId,
  displayName,
  login,
  channelLogin,
  userMessages,
  modActions,
  emotes,
  emoteSize,
  onModAction,
  onClose,
}: Props) {
  const [profile, setProfile] = useState<ChatUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modError, setModError] = useState<string | null>(null);
  const [modBusy, setModBusy] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("messages");

  const [modAccess, setModAccess] = useState<{
    checked: boolean;
    canModerate: boolean;
    reason?: string;
  }>({ checked: false, canModerate: false });

  const resolvedUserId = profile?.userId ?? userId;
  const resolvedLogin = profile?.username ?? login ?? displayName;

  const userMods = useMemo(
    () =>
      modActions.filter(
        (m) =>
          m.platform === platform &&
          (m.userId === resolvedUserId ||
            m.login.toLowerCase() === resolvedLogin.toLowerCase()),
      ),
    [modActions, platform, resolvedUserId, resolvedLogin],
  );

  const counts = useMemo(
    () => ({
      messages: userMessages.length,
      warnings: userMods.filter((m) => m.action === "warn").length,
      timeouts: userMods.filter((m) => m.action === "timeout").length,
      bans: userMods.filter((m) => m.action === "ban").length,
    }),
    [userMessages.length, userMods],
  );

  useEffect(() => {
    const params = new URLSearchParams({
      platform,
      userId,
      displayName,
      login: login ?? displayName.replace(/^@/, ""),
    });
    setLoading(true);
    setError(null);
    apiFetch(`/api/workspaces/${workspaceId}/chat-users/profile?${params}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? "Failed to load profile");
        }
        const j = await res.json();
        setProfile(j.profile);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [workspaceId, platform, userId, displayName, login]);

  useEffect(() => {
    if (platform !== "twitch" || !channelLogin?.trim()) {
      setModAccess({
        checked: true,
        canModerate: false,
        reason:
          platform !== "twitch"
            ? "Moderation is only available on Twitch"
            : "Open a user from a channel chat message to moderate",
      });
      return;
    }

    const params = new URLSearchParams({
      platform,
      channel: channelLogin.replace(/^@/, ""),
    });
    setModAccess({ checked: false, canModerate: false });
    apiFetch(`/api/workspaces/${workspaceId}/chat-users/mod-access?${params}`)
      .then(async (res) => {
        const data = (await res.json()) as { canModerate?: boolean; reason?: string };
        setModAccess({
          checked: true,
          canModerate: Boolean(data.canModerate),
          reason: data.reason,
        });
      })
      .catch(() => {
        setModAccess({
          checked: true,
          canModerate: false,
          reason: "Could not verify moderation access",
        });
      });
  }, [workspaceId, platform, channelLogin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const runModeration = useCallback(
    async (action: "timeout" | "ban" | "unban", durationSeconds?: number) => {
      if (modBusy) return;
      setModBusy(true);
      setModError(null);
      try {
        const res = await apiFetch(`/api/workspaces/${workspaceId}/chat-users/moderate`, {
          method: "POST",
          body: JSON.stringify({
            platform,
            userId: resolvedUserId,
            login: resolvedLogin,
            channel: channelLogin?.replace(/^@/, ""),
            action,
            durationSeconds,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Moderation failed");
        onModAction({
          id: crypto.randomUUID(),
          platform,
          userId: resolvedUserId,
          login: resolvedLogin,
          action,
          durationSeconds,
          at: new Date().toISOString(),
        });
      } catch (e) {
        setModError(e instanceof Error ? e.message : "Moderation failed");
      } finally {
        setModBusy(false);
      }
    },
    [modBusy, workspaceId, platform, resolvedUserId, resolvedLogin, channelLogin, onModAction],
  );

  const tabRows =
    tab === "messages"
      ? null
      : userMods.filter((m) => {
          if (tab === "warnings") return m.action === "warn";
          if (tab === "timeouts") return m.action === "timeout";
          return m.action === "ban" || m.action === "unban";
        });

  return (
    <div
      className="profile-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
      onClick={onClose}
    >
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-banner" aria-hidden />
        <div className="profile-modal-header">
          <div className="profile-modal-avatar-wrap">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="profile-modal-avatar" />
            ) : (
              <div className="profile-modal-avatar profile-modal-avatar--fallback">
                {(profile?.displayName ?? displayName).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="profile-modal-head-main">
            <h2 id="profile-title" className="profile-modal-name">
              {loading ? displayName : (profile?.displayName ?? displayName)}
            </h2>
            <div className="profile-modal-badges">
              <PlatformEmblem platform={platform} size={20} />
              {profile?.role && (
                <span className="profile-modal-badge">{profile.role}</span>
              )}
            </div>
          </div>
          <div className="profile-modal-head-actions">
            {profile?.profileUrl && (
              <a
                href={profile.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="profile-modal-ext-link"
                title={`Open on ${PLATFORM_LABEL[platform]}`}
              >
                <PlatformEmblem platform={platform} size={18} />
              </a>
            )}
            <button type="button" onClick={onClose} className="profile-modal-close" aria-label="Close">
              ×
            </button>
          </div>
        </div>

        {profile?.joinedAt && (
          <p className="profile-modal-joined">Account created on {profile.joinedAt}</p>
        )}

        {loading && <p className="profile-modal-status">Loading profile…</p>}
        {error && <p className="profile-modal-status profile-modal-status--error">{error}</p>}

        {modAccess.checked && modAccess.canModerate && (
          <div className="profile-mod-bar">
            <button
              type="button"
              className="profile-mod-btn profile-mod-btn--ban"
              disabled={modBusy}
              title="Ban user"
              onClick={() => void runModeration("ban")}
            >
              🔨
            </button>
            <div className="profile-mod-timeouts">
              {TIMEOUT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="profile-mod-timeout"
                  disabled={modBusy}
                  title={`Timeout ${p.label}`}
                  onClick={() => void runModeration("timeout", p.seconds)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="profile-mod-btn profile-mod-btn--unban"
              disabled={modBusy}
              title="Unban user"
              onClick={() => void runModeration("unban")}
            >
              ⊘
            </button>
          </div>
        )}
        {modError && <p className="profile-mod-error">{modError}</p>}
        {modAccess.checked && !modAccess.canModerate && modAccess.reason && (
          <p className="profile-mod-note">{modAccess.reason}</p>
        )}
        {!modAccess.checked && platform === "twitch" && channelLogin && (
          <p className="profile-mod-note">Checking moderation access…</p>
        )}

        <div className="profile-stats-tabs">
          {(
            [
              ["messages", counts.messages],
              ["warnings", counts.warnings],
              ["timeouts", counts.timeouts],
              ["bans", counts.bans],
            ] as const
          ).map(([id, count]) => (
            <button
              key={id}
              type="button"
              className={`profile-stats-tab ${tab === id ? "profile-stats-tab--active" : ""}`}
              onClick={() => setTab(id)}
            >
              {id.charAt(0).toUpperCase() + id.slice(1)}: {count}
            </button>
          ))}
        </div>

        <div className="profile-log">
          {tab === "messages" ? (
            userMessages.length === 0 ? (
              <p className="profile-log-empty">No messages from this user in this session</p>
            ) : (
              userMessages.map((m, i) => (
                <div key={i} className="profile-log-row">
                  <span className="profile-log-time">{m.time}</span>
                  <PlatformBadge platform={m.platform} />
                  <p className="profile-log-text">
                    <span className="profile-log-user" style={{ color: m.color ?? "#e4e4e7" }}>
                      {m.user}:{" "}
                    </span>
                    <span className="profile-log-body">
                      <EmoteText text={m.text} emotes={emotes} size={emoteSize} />
                    </span>
                  </p>
                </div>
              ))
            )
          ) : tabRows && tabRows.length > 0 ? (
            tabRows.map((m) => (
              <div key={m.id} className="profile-log-row profile-log-row--mod">
                <span className="profile-log-time">
                  {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="profile-log-mod-action">
                  {m.action}
                  {m.durationSeconds ? ` (${formatDuration(m.durationSeconds)})` : ""}
                </span>
              </div>
            ))
          ) : (
            <p className="profile-log-empty">No {tab} recorded this session</p>
          )}
        </div>
      </div>
    </div>
  );
}
