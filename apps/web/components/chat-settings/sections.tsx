"use client";

import { useEffect, useState } from "react";
import { PlatformEmblem, type PlatformId } from "@/components/platform-icons";
import { API_URL, apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import {
  discoverStreamerChannels,
  formatDiscoveryMessage,
} from "@/lib/discover-channels";
import { syncChatIngest } from "@/lib/sync-ingest";
import {
  type AppearanceTab,
  type ChatSettings,
  channelsForProfile,
  createStreamerProfile,
  removeChannelEntry,
  shouldAutoLinkSend,
} from "@/lib/chat-settings-storage";
import {
  channelPlatformLabel,
  parseChannelInput,
} from "@/lib/parse-channel-input";
import { resolveYoutubeParsedChannel } from "@/lib/resolve-youtube-video";
import {
  platformChannelHost,
  platformChannelUrl,
} from "@/lib/platform-channel-url";
import {
  requestActivateProfileTab,
  undismissChatTabLabel,
} from "@/lib/chat-tabs-storage";
import {
  BoolSegment,
  ChatPreviewBox,
  ModerateSegment,
  OnOffSegment,
  SegmentedControl,
  SettingCard,
  SettingRow,
  SliderRow,
  SubTabs,
} from "./controls";

export type SettingsPatch = {
  appearance?: Partial<ChatSettings["appearance"]>;
  preferences?: Partial<ChatSettings["preferences"]>;
  overlay?: Partial<ChatSettings["overlay"]>;
  profiles?: ChatSettings["profiles"];
  channels?: ChatSettings["channels"];
};

type SectionProps = {
  settings: ChatSettings;
  patch: (patch: SettingsPatch) => void;
  workspaceId?: string | null;
};

const FONTS = ["Roboto", "Inter", "Open Sans", "Segoe UI"];
const STREAMER_PLATFORMS: PlatformId[] = ["twitch", "kick", "youtube", "rumble", "x"];

function missingPlatformsForProfile(
  channels: ChatSettings["channels"],
  profileId: string,
): PlatformId[] {
  const linked = new Set(
    channelsForProfile(channels, profileId).map((c) =>
      c.platform.toLowerCase(),
    ),
  );
  return STREAMER_PLATFORMS.filter((p) => !linked.has(p));
}

const PLATFORM_ADD_PLACEHOLDERS: Record<PlatformId, string> = {
  kick: "asmongold or kick.com/asmongold",
  twitch: "zackrawrr or twitch.tv/zackrawrr",
  youtube: "@channel, youtube.com/@channel, or youtube.com/live/…",
  x: "handle or x.com/handle",
  tiktok: "",
  rumble: "xqc or rumble.com/c/xqc",
};

function IconGearSmall() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
    </svg>
  );
}

function parsePlatformRowInput(
  platform: PlatformId,
  raw: string,
): { platform: PlatformId; handle: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Enter a channel name or link" };
  const parsed = parseChannelInput(
    trimmed.includes("/") || trimmed.includes(".") ? trimmed : `${platform}/${trimmed}`,
  );
  if ("error" in parsed) return parsed;
  if (parsed.platform !== platform) {
    return {
      error: `That link is for ${channelPlatformLabel(parsed.platform)} — use the ${channelPlatformLabel(platform)} field`,
    };
  }
  return { platform, handle: parsed.handle };
}

function PlatformLinkRows({
  platforms,
  inputs,
  onInputChange,
  showAddButtons = false,
  onAdd,
  addingPlatform,
  onSubmit,
}: {
  platforms: PlatformId[];
  inputs: Partial<Record<PlatformId, string>>;
  onInputChange: (platform: PlatformId, value: string) => void;
  showAddButtons?: boolean;
  onAdd?: (platform: PlatformId) => void;
  addingPlatform?: PlatformId | null;
  onSubmit?: () => void;
}) {
  if (platforms.length === 0) return null;

  return (
    <div
      className={
        showAddButtons ? "prochat-platform-add-grid" : "prochat-platform-link-grid"
      }
    >
      {platforms.map((platform) => (
        <div
          key={platform}
          className={
            showAddButtons ? "prochat-platform-add-row" : "prochat-platform-link-row"
          }
        >
          <span className="prochat-platform-add-label">
            <PlatformEmblem platform={platform} size={18} />
            {channelPlatformLabel(platform)}
          </span>
          <input
            type="text"
            className="prochat-input prochat-platform-add-input"
            value={inputs[platform] ?? ""}
            onChange={(e) => onInputChange(platform, e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (showAddButtons && onAdd) onAdd(platform);
              else onSubmit?.();
            }}
            placeholder={PLATFORM_ADD_PLACEHOLDERS[platform]}
          />
          {showAddButtons && onAdd && (
            <button
              type="button"
              className="prochat-add-btn prochat-platform-add-btn"
              disabled={addingPlatform === platform}
              onClick={() => onAdd(platform)}
            >
              {addingPlatform === platform ? "…" : "Add"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

type StreamerEditorProps = {
  profile: { id: string; label: string };
  allChannels: ChatSettings["channels"];
  profileChannels: ChatSettings["channels"];
  editInputs: Partial<Record<PlatformId, string>>;
  onEditInput: (platform: PlatformId, value: string) => void;
  onRename: (label: string) => void;
  onToggleSend: (channelId: string) => void;
  onRemoveChannel: (channelId: string) => void;
  onAddPlatform: (platform: PlatformId) => void;
  addingPlatform: PlatformId | null;
  connections: Record<string, { status: string; username?: string }> | null;
};

function StreamerProfileEditor({
  profile,
  allChannels,
  profileChannels,
  editInputs,
  onEditInput,
  onRename,
  onToggleSend,
  onRemoveChannel,
  onAddPlatform,
  addingPlatform,
  connections,
}: StreamerEditorProps) {
  const missing = missingPlatformsForProfile(allChannels, profile.id);

  return (
    <div className="prochat-streamer-editor">
      <label className="prochat-field prochat-streamer-name-field">
        <span>Display name</span>
        <input
          type="text"
          className="prochat-input"
          defaultValue={profile.label}
          key={`edit-${profile.id}-${profile.label}`}
          onBlur={(e) => onRename(e.target.value)}
        />
      </label>

      {profileChannels.length > 0 && (
        <>
          <div className="prochat-streamer-links">
            <span className="prochat-streamer-links-label">Profile links</span>
            <div className="prochat-streamer-link-row">
              {profileChannels.map((c) => {
                const url = platformChannelUrl(c.platform, c.handle);
                if (!url) return null;
                return (
                  <a
                    key={c.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="prochat-streamer-link"
                  >
                    <PlatformEmblem platform={c.platform as PlatformId} size={14} />
                    {platformChannelHost(c.platform)}/{c.handle}
                  </a>
                );
              })}
            </div>
          </div>

          <ul className="prochat-channel-list prochat-channel-list--nested">
            {profileChannels.map((c) => {
              const platform = c.platform.toLowerCase() as "twitch" | "kick" | "x" | "youtube" | "rumble";
              const conn = connections?.[platform];
              const sendUsername = conn?.status === "connected" ? conn.username : undefined;
              return (
                <li key={c.id} className="prochat-channel-item">
                  <div className="prochat-channel-item-main">
                    <span className="prochat-channel-item-platform">
                      <PlatformEmblem platform={c.platform as PlatformId} size={16} />
                      <strong>{channelPlatformLabel(c.platform)}</strong> · @{c.handle}
                    </span>
                    {c.sendLinked && sendUsername && (
                      <span className="prochat-channel-send-badge">
                        Sends as @{sendUsername}
                      </span>
                    )}
                  </div>
                  <div className="prochat-channel-actions">
                    <button
                      type="button"
                      className={
                        c.sendLinked
                          ? "prochat-channel-send-link prochat-channel-send-link--active"
                          : "prochat-channel-send-link"
                      }
                      onClick={() => onToggleSend(c.id)}
                    >
                      {c.sendLinked ? "Sending linked" : "Link for sending"}
                    </button>
                    <button
                      type="button"
                      className="prochat-channel-remove"
                      onClick={() => onRemoveChannel(c.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {missing.length > 0 && (
        <div className="prochat-streamer-add-platforms">
          <span className="prochat-streamer-links-label">Add platform</span>
          <PlatformLinkRows
            platforms={missing}
            inputs={editInputs}
            onInputChange={onEditInput}
            showAddButtons
            onAdd={(platform) => void onAddPlatform(platform)}
            addingPlatform={addingPlatform}
          />
        </div>
      )}
    </div>
  );
}

const TIMESTAMP_OPTS = [
  { value: "24h-full", label: "24h 14:32:09" },
  { value: "24h-short", label: "24h 14:32" },
  { value: "12h-full", label: "12h 2:32:09 PM" },
  { value: "12h-short", label: "12h 2:32 PM" },
  { value: "hide", label: "Hide" },
];

const VIEWER_COUNT_OPTS = [
  { value: "icons", label: "👁 1.2k" },
  { value: "compact", label: "1.2k" },
  { value: "none", label: "Off" },
];

export function AppearanceSection({ settings, patch }: SectionProps) {
  const [tab, setTab] = useState<AppearanceTab>("display");
  const a = settings.appearance;

  const setA = (p: Partial<ChatSettings["appearance"]>) => patch({ appearance: p });

  return (
    <>
      <SubTabs
        tabs={[
          { id: "display", label: "Display" },
          { id: "behavior", label: "Behavior" },
          { id: "moderation", label: "Moderation" },
          { id: "emotes", label: "Emotes" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "display" && (
        <div className="prochat-section-stack">
          <SettingCard title="Chat Messages">
            <ChatPreviewBox>
              <span className="prochat-preview-time">14:32:09</span>
              {a.platformIcons && <PlatformEmblem platform="twitch" size={16} />}
              {a.profilePictures && (
                <span className="prochat-preview-avatar" style={{ background: "#ec4899" }} />
              )}
              <strong className="prochat-preview-user">Example Viewer</strong>
              <span className="prochat-preview-text">
                this is an example chat message{" "}
                {a.highlightMentions && (
                  <span className="prochat-preview-mention">@OMnichat</span>
                )}
              </span>
            </ChatPreviewBox>

            <SettingRow label="Font">
              <select
                className="prochat-select"
                value={a.font}
                onChange={(e) => setA({ font: e.target.value })}
              >
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow label="Timestamps">
              <SegmentedControl
                options={TIMESTAMP_OPTS}
                value={a.timestampFormat}
                onChange={(v) => setA({ timestampFormat: v })}
              />
            </SettingRow>

            <SettingRow label="Platform Icons">
              <BoolSegment value={a.platformIcons} onChange={(v) => setA({ platformIcons: v })} />
            </SettingRow>

            <SettingRow label="Profile Pictures" help>
              <BoolSegment value={a.profilePictures} onChange={(v) => setA({ profilePictures: v })} />
            </SettingRow>

            <SettingRow label="Highlight Mentions" help>
              <BoolSegment value={a.highlightMentions} onChange={(v) => setA({ highlightMentions: v })} />
            </SettingRow>
          </SettingCard>

          <SettingCard title="Advanced">
            <SettingRow label="Viewer Count">
              <SegmentedControl
                options={VIEWER_COUNT_OPTS}
                value={a.viewerCount}
                onChange={(v) => setA({ viewerCount: v })}
              />
            </SettingRow>
          </SettingCard>
        </div>
      )}

      {tab === "behavior" && (
        <div className="prochat-section-stack">
          <SettingCard>
            <ChatPreviewBox>
              <span className="prochat-preview-time">14:32:09</span>
              <PlatformEmblem platform="twitch" size={16} />
              <strong className="prochat-preview-user">Viewer</strong>
              <span className="prochat-preview-text">faded message preview</span>
            </ChatPreviewBox>

            <SliderRow
              label="Message Fade Out"
              value={a.messageFadeOut}
              min={0}
              max={120}
              display={a.messageFadeOut === 0 ? "Never" : `${a.messageFadeOut}s`}
              onChange={(v) => setA({ messageFadeOut: v })}
            />

            <SettingRow label="Dim Chat History" help>
              <BoolSegment value={a.dimChatHistory} onChange={(v) => setA({ dimChatHistory: v })} />
            </SettingRow>
            <SettingRow label="Live-Only Chat History" help>
              <BoolSegment value={a.liveOnlyChat} onChange={(v) => setA({ liveOnlyChat: v })} />
            </SettingRow>
            <SettingRow label="Follower Alerts" help>
              <BoolSegment value={a.followerAlerts} onChange={(v) => setA({ followerAlerts: v })} />
            </SettingRow>
          </SettingCard>
        </div>
      )}

      {tab === "moderation" && (
        <div className="prochat-section-stack">
          <SettingCard>
            <ChatPreviewBox>
              <span className="prochat-preview-mod-icons">🕐 ⊘ ✓ 🗑</span>
              <PlatformEmblem platform="twitch" size={16} />
              <span className="prochat-preview-avatar prochat-preview-avatar--mod" />
              <strong className="prochat-preview-user">ModPreview</strong>
              <em className="prochat-preview-deleted">Message deleted.</em>
            </ChatPreviewBox>

            <SettingRow label="Quick Moderation Actions">
              <BoolSegment value={a.quickModActions} onChange={(v) => setA({ quickModActions: v })} />
            </SettingRow>
            <SettingRow label="Show Deleted Messages" help>
              <BoolSegment
                value={a.showDeletedMessages}
                onChange={(v) => setA({ showDeletedMessages: v })}
              />
            </SettingRow>
          </SettingCard>
        </div>
      )}

      {tab === "emotes" && (
        <div className="prochat-section-stack">
          <SettingCard>
            <ChatPreviewBox>
              <span className="prochat-preview-time">14:32:09</span>
              <PlatformEmblem platform="twitch" size={16} />
              <strong className="prochat-preview-user">EmoteEnjoyer:</strong>
              <span className="prochat-preview-text">PogChamp Kappa 4Head</span>
            </ChatPreviewBox>

            <SliderRow
              label="Size:"
              value={a.emoteSize}
              min={16}
              max={48}
              display={`${a.emoteSize}px`}
              onChange={(v) => setA({ emoteSize: v })}
            />
          </SettingCard>

          <SettingCard title="Third-Party Emotes">
            <EmoteProviderRow
              name="BetterTTV"
              note="supports YouTube, Twitch"
              enabled={a.bttv}
              onChange={(v) => setA({ bttv: v })}
            />
            <EmoteProviderRow
              name="FrankerFaceZ"
              note="supports Twitch"
              enabled={a.ffz}
              onChange={(v) => setA({ ffz: v })}
            />
            <EmoteProviderRow
              name="7TV"
              note="Twitch & Kick use OAuth to send chat. X Live is watched automatically when you add channels."
              enabled={a.seventv}
              onChange={(v) => setA({ seventv: v })}
            />
          </SettingCard>
        </div>
      )}
    </>
  );
}

function EmoteProviderRow({
  name,
  note,
  enabled,
  onChange,
}: {
  name: string;
  note: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="prochat-emote-row">
      <div>
        <p className="prochat-emote-name">{name}</p>
        <p className="prochat-emote-note">{note}</p>
      </div>
      <SegmentedControl
        options={[
          { value: "enable", label: "Enable" },
          { value: "disable", label: "Disable" },
        ]}
        value={enabled ? "enable" : "disable"}
        onChange={(v) => onChange(v === "enable")}
      />
    </div>
  );
}

export function PreferencesSection({ settings, patch }: SectionProps) {
  const p = settings.preferences;
  const setP = (u: Partial<ChatSettings["preferences"]>) => patch({ preferences: u });

  return (
    <>
      <h2 className="prochat-modal-title">Preferences</h2>
      <p className="prochat-modal-subtitle">Manage interaction and behavior settings.</p>
      <SettingCard title="Double-Click Actions">
        <SettingRow label="Moderated Messages">
          <SegmentedControl
            options={[
              { value: "toggle", label: "Toggle Original" },
              { value: "nothing", label: "Do Nothing" },
            ]}
            value={p.moderatedDoubleClick}
            onChange={(v) => setP({ moderatedDoubleClick: v as "toggle" | "nothing" })}
          />
        </SettingRow>
      </SettingCard>
    </>
  );
}

export function ChannelsSection({
  settings,
  patch,
  workspaceId,
  connections,
  onConnectPlatform,
}: SectionProps & {
  connections: Record<string, { status: string; username?: string }> | null;
  onConnectPlatform: (p: "twitch" | "kick" | "x" | "youtube" | "rumble") => void;
}) {
  const [newStreamerLinks, setNewStreamerLinks] = useState<
    Partial<Record<PlatformId, string>>
  >({});
  const [editPlatformInputs, setEditPlatformInputs] = useState<
    Record<string, Partial<Record<PlatformId, string>>>
  >({});
  const [addError, setAddError] = useState<string | null>(null);
  const [discoverNote, setDiscoverNote] = useState<string | null>(null);
  const [sendLinkError, setSendLinkError] = useState<string | null>(null);
  const [addingStreamer, setAddingStreamer] = useState(false);
  const [addingPlatform, setAddingPlatform] = useState<PlatformId | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const { profiles, channels } = settings;

  const hasNewStreamerLink = STREAMER_PLATFORMS.some(
    (platform) => (newStreamerLinks[platform]?.trim() ?? "").length > 0,
  );

  const connectedFlags = {
    twitch: connections?.twitch?.status === "connected",
    kick: connections?.kick?.status === "connected",
    x: connections?.x?.status === "connected",
    youtube: connections?.youtube?.status === "connected",
    rumble: connections?.rumble?.status === "connected",
  };

  function toggleSendLink(channelId: string) {
    setSendLinkError(null);
    const row = channels.find((c) => c.id === channelId);
    if (!row) return;

    if (row.sendLinked) {
      patch({
        channels: channels.map((c) =>
          c.id === channelId ? { ...c, sendLinked: false } : c,
        ),
      });
      return;
    }

    const platform = row.platform.toLowerCase() as "twitch" | "kick" | "x" | "youtube" | "rumble";
    const conn = connections?.[platform];
    if (conn?.status !== "connected") {
      setSendLinkError(`Connect ${channelPlatformLabel(row.platform)} in Connections first`);
      onConnectPlatform(platform);
      return;
    }

    patch({
      channels: channels.map((c) =>
        c.id === channelId ? { ...c, sendLinked: true } : c,
      ),
    });
  }

  function renameProfile(profileId: string, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    patch({
      profiles: profiles.map((p) =>
        p.id === profileId ? { ...p, label: trimmed } : p,
      ),
    });
    undismissChatTabLabel(trimmed);
  }

  function removeChannel(channelId: string) {
    const row = channels.find((c) => c.id === channelId);
    const next = removeChannelEntry(settings, channelId);
    patch({ profiles: next.profiles, channels: next.channels });
    if (row && !next.profiles.some((p) => p.id === row.profileId)) {
      setEditingProfileId(null);
    }
    if (workspaceId) {
      void syncChatIngest(workspaceId).catch(() => undefined);
    }
  }

  async function addChannelToProfile(
    profileId: string,
    platform: PlatformId,
    rawInput: string,
    opts?: { runDiscovery?: boolean; clearInput?: () => void },
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const parsed = parsePlatformRowInput(platform, rawInput);
    if ("error" in parsed) {
      return { ok: false, error: parsed.error };
    }

    let channel = parsed;
    if (parsed.platform === "youtube") {
      const resolved = await resolveYoutubeParsedChannel(parsed);
      if ("error" in resolved) {
        return { ok: false, error: resolved.error };
      }
      channel = resolved;
    }

    const duplicate = channels.some(
      (c) =>
        c.platform.toLowerCase() === channel.platform &&
        c.handle.toLowerCase() === channel.handle.toLowerCase(),
    );
    if (duplicate) {
      return { ok: false, error: "That channel is already on your list" };
    }

    const profileChannels = channelsForProfile(channels, profileId);
    const platformTaken = profileChannels.some(
      (c) => c.platform.toLowerCase() === channel.platform.toLowerCase(),
    );
    if (platformTaken) {
      return {
        ok: false,
        error: `This streamer already has a ${channelPlatformLabel(channel.platform)} channel linked`,
      };
    }

    setAddError(null);
    setDiscoverNote(null);

    const autoLink = shouldAutoLinkSend(channel.platform, connectedFlags);
    let nextChannels: ChatSettings["channels"] = [
      ...channels,
      {
        id: crypto.randomUUID(),
        platform: channel.platform,
        handle: channel.handle,
        sendLinked: autoLink,
        profileId,
      },
    ];

    if (opts?.runDiscovery && workspaceId) {
      try {
        const discovery = await discoverStreamerChannels(
          workspaceId,
          channel.platform,
          channel.handle,
        );
        const discoveredChannels = discovery.channels.filter((c) => c.exists);
        for (const ch of discoveredChannels) {
          if (ch.platform === channel.platform && ch.handle === channel.handle) continue;
          if (
            nextChannels.some(
              (c) =>
                c.platform.toLowerCase() === ch.platform &&
                c.handle.toLowerCase() === ch.handle.toLowerCase(),
            )
          ) {
            continue;
          }
          if (
            nextChannels.some(
              (c) =>
                c.profileId === profileId &&
                c.platform.toLowerCase() === ch.platform.toLowerCase(),
            )
          ) {
            continue;
          }
          nextChannels.push({
            id: crypto.randomUUID(),
            platform: ch.platform,
            handle: ch.handle,
            sendLinked: shouldAutoLinkSend(ch.platform, connectedFlags),
            profileId,
          });
        }
        const note = formatDiscoveryMessage(discoveredChannels, {
          platform: channel.platform,
          handle: channel.handle,
        });
        if (note) setDiscoverNote(note);
      } catch {
        /* discovery optional */
      }
    }

    patch({ channels: nextChannels });
    opts?.clearInput?.();
    undismissChatTabLabel(
      profiles.find((p) => p.id === profileId)?.label ?? channel.handle,
    );
    requestActivateProfileTab(profileId);
    setEditingProfileId(profileId);

    if (workspaceId) {
      void syncChatIngest(workspaceId).catch(() => undefined);
    }
    return { ok: true };
  }

  async function submitNewStreamer() {
    const entries: { platform: PlatformId; handle: string }[] = [];

    for (const platform of STREAMER_PLATFORMS) {
      const raw = newStreamerLinks[platform]?.trim() ?? "";
      if (!raw) continue;
      const parsed = parsePlatformRowInput(platform, raw);
      if ("error" in parsed) {
        setAddError(`${channelPlatformLabel(platform)}: ${parsed.error}`);
        return;
      }
      if (parsed.platform === "youtube") {
        const resolved = await resolveYoutubeParsedChannel(parsed);
        if ("error" in resolved) {
          setAddError(`${channelPlatformLabel(platform)}: ${resolved.error}`);
          return;
        }
        entries.push(resolved);
        continue;
      }
      entries.push(parsed);
    }

    if (entries.length === 0) {
      setAddError("Add at least one platform link");
      return;
    }

    for (const entry of entries) {
      const duplicate = channels.some(
        (c) =>
          c.platform.toLowerCase() === entry.platform &&
          c.handle.toLowerCase() === entry.handle.toLowerCase(),
      );
      if (duplicate) {
        setAddError(
          `${channelPlatformLabel(entry.platform)} @${entry.handle} is already on your list`,
        );
        return;
      }
    }

    const platformOrder = new Map(STREAMER_PLATFORMS.map((p, i) => [p, i]));
    entries.sort(
      (a, b) =>
        (platformOrder.get(a.platform) ?? 99) - (platformOrder.get(b.platform) ?? 99),
    );

    setAddingStreamer(true);
    setAddError(null);
    setDiscoverNote(null);

    try {
      const labelSource =
        entries.find((e) => e.platform === "twitch") ??
        entries.find((e) => e.platform === "kick") ??
        entries[0]!;
      const profile = createStreamerProfile(labelSource.handle);

      const nextChannels: ChatSettings["channels"] = [...channels];
      for (const entry of entries) {
        nextChannels.push({
          id: crypto.randomUUID(),
          platform: entry.platform,
          handle: entry.handle,
          sendLinked: shouldAutoLinkSend(entry.platform, connectedFlags),
          profileId: profile.id,
        });
      }

      patch({
        profiles: [...profiles, profile],
        channels: nextChannels,
      });
      setNewStreamerLinks({});
      undismissChatTabLabel(profile.label);
      requestActivateProfileTab(profile.id);
      setEditingProfileId(null);

      if (workspaceId) {
        void syncChatIngest(workspaceId).catch(() => undefined);
      }
    } finally {
      setAddingStreamer(false);
    }
  }

  async function submitEditPlatformRow(profileId: string, platform: PlatformId) {
    const raw = editPlatformInputs[profileId]?.[platform]?.trim() ?? "";
    if (!raw) return;

    setAddingPlatform(platform);
    setAddError(null);
    try {
      const result = await addChannelToProfile(profileId, platform, raw, {
        clearInput: () =>
          setEditPlatformInputs((prev) => ({
            ...prev,
            [profileId]: { ...prev[profileId], [platform]: "" },
          })),
      });
      if (!result.ok) setAddError(result.error);
    } finally {
      setAddingPlatform(null);
    }
  }

  return (
    <>
      <h2 className="prochat-modal-title">Channels</h2>
      <p className="prochat-modal-subtitle">
        Add each platform link separately — when you press Add, every filled link merges into one
        chat tab in OMnichat. Use the settings icon on a profile to edit links or sending later.
      </p>

      {profiles.length === 0 ? (
        <div className="prochat-channels-empty">
          <p>Add your first streamer with the platform links below.</p>
        </div>
      ) : (
        <div className="prochat-streamer-channels-list">
          {profiles.map((profile) => {
            const profileChannels = channelsForProfile(channels, profile.id);
            const isEditing = editingProfileId === profile.id;
            return (
              <div key={profile.id} className="prochat-streamer-channel-card">
                <div className="prochat-streamer-channel-row">
                  <div className="prochat-streamer-channel-main">
                    <span className="prochat-streamer-channel-icons" aria-hidden>
                      {profileChannels.length > 0 ? (
                        profileChannels.map((c) => (
                          <PlatformEmblem
                            key={c.id}
                            platform={c.platform as PlatformId}
                            size={18}
                          />
                        ))
                      ) : (
                        <span className="prochat-streamer-channel-empty-icon">?</span>
                      )}
                    </span>
                    <div className="prochat-streamer-channel-copy">
                      <span className="prochat-streamer-channel-name">{profile.label}</span>
                      <span className="prochat-streamer-channel-handles">
                        {profileChannels.length > 0
                          ? profileChannels
                              .map((c) => `@${c.handle}`)
                              .join(" · ")
                          : "No platforms linked"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`prochat-streamer-settings-btn${isEditing ? " prochat-streamer-settings-btn--active" : ""}`}
                    aria-label={`Settings for ${profile.label}`}
                    aria-expanded={isEditing}
                    onClick={() =>
                      setEditingProfileId(isEditing ? null : profile.id)
                    }
                  >
                    <IconGearSmall />
                  </button>
                </div>

                {isEditing && (
                  <StreamerProfileEditor
                    profile={profile}
                    allChannels={channels}
                    profileChannels={profileChannels}
                    editInputs={editPlatformInputs[profile.id] ?? {}}
                    onEditInput={(platform, value) =>
                      setEditPlatformInputs((prev) => ({
                        ...prev,
                        [profile.id]: { ...prev[profile.id], [platform]: value },
                      }))
                    }
                    onRename={(label) => renameProfile(profile.id, label)}
                    onToggleSend={toggleSendLink}
                    onRemoveChannel={removeChannel}
                    onAddPlatform={(platform) =>
                      void submitEditPlatformRow(profile.id, platform)
                    }
                    addingPlatform={addingPlatform}
                    connections={connections}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <SettingCard title="Add streamer">
        <p className="prochat-card-desc">
          Fill in any platform links for this streamer. One Add creates a single merged chat tab.
        </p>

        <PlatformLinkRows
          platforms={STREAMER_PLATFORMS}
          inputs={newStreamerLinks}
          onInputChange={(platform, value) => {
            setNewStreamerLinks((prev) => ({ ...prev, [platform]: value }));
            setAddError(null);
          }}
          onSubmit={() => void submitNewStreamer()}
        />

        <button
          type="button"
          className="prochat-add-btn prochat-add-streamer-btn prochat-add-streamer-btn--full"
          disabled={addingStreamer || !hasNewStreamerLink}
          onClick={() => void submitNewStreamer()}
        >
          {addingStreamer ? "Adding…" : "Add streamer"}
        </button>

        {discoverNote && <p className="prochat-field-hint">{discoverNote}</p>}
        {sendLinkError && <p className="prochat-field-error">{sendLinkError}</p>}
        {addError && <p className="prochat-field-error">{addError}</p>}
      </SettingCard>
    </>
  );
}

export function OverlaySection({
  settings,
  patch,
  overlayUrl,
  copied,
  onCopy,
  onReset,
  onSendTestAlerts,
  testAlertsState,
  testAlertsError,
  workspaceReady,
}: SectionProps & {
  overlayUrl: string;
  copied: boolean;
  onCopy: () => void;
  onReset: () => void;
  onSendTestAlerts: () => void;
  testAlertsState: "idle" | "sending" | "done" | "error";
  testAlertsError: string;
  workspaceReady: boolean;
}) {
  const o = settings.overlay;
  const setO = (p: Partial<ChatSettings["overlay"]>) => patch({ overlay: p });

  return (
    <div className="prochat-section-stack">
      <SettingCard title="Chat Overlay URL">
        <p className="prochat-card-desc">Use the following URL for chat overlay in your streaming software:</p>
        <div className="prochat-url-row">
          <button type="button" className="prochat-url-field" onClick={onCopy}>
            {copied ? "Copied!" : overlayUrl || "Click to copy chat overlay URL"}
          </button>
          <button type="button" onClick={onReset} className="prochat-reset-btn">
            Reset
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="prochat-reset-btn"
            disabled={!workspaceReady || testAlertsState === "sending"}
            onClick={onSendTestAlerts}
          >
            {testAlertsState === "sending"
              ? "Sending…"
              : testAlertsState === "done"
                ? "Test alerts sent!"
                : "Send test alerts to live chat"}
          </button>
          <span className="text-xs text-zinc-500">
            Twitch sub, bits, Kick sub, gift subs, and Kicks — visible in chat and OBS overlay.
          </span>
        </div>
        {testAlertsState === "error" && testAlertsError ? (
          <p className="text-sm text-red-400 mt-2">{testAlertsError}</p>
        ) : null}
      </SettingCard>

      <SettingCard title="Appearance">
        <p className="prochat-card-desc">Customize the look &amp; feel of your chat overlay</p>
        <SettingRow label="Font">
          <select className="prochat-select" value={o.font} onChange={(e) => setO({ font: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </SettingRow>
        <SliderRow
          label="Font Size:"
          value={o.fontSize}
          min={12}
          max={32}
          display={`${o.fontSize}px`}
          onChange={(v) => setO({ fontSize: v })}
        />
        <SliderRow
          label="Background Transparency:"
          value={o.bgTransparency}
          min={0}
          max={100}
          display={`${o.bgTransparency}%`}
          onChange={(v) => setO({ bgTransparency: v })}
        />
        <p className="text-xs text-zinc-500 -mt-2 mb-2">
          0% matches live chat (#18181b). 100% is fully transparent for OBS.
        </p>
        <SliderRow
          label="Message Fade Out:"
          help
          value={o.messageFadeOut}
          min={0}
          max={120}
          display={o.messageFadeOut === 0 ? "Never" : `${o.messageFadeOut}s`}
          onChange={(v) => setO({ messageFadeOut: v })}
        />
        <SettingRow label="Platform Icons">
          <BoolSegment value={o.platformIcons} onChange={(v) => setO({ platformIcons: v })} />
        </SettingRow>
        <SettingRow label="Event Messages" help>
          <BoolSegment value={o.eventMessages} onChange={(v) => setO({ eventMessages: v })} />
        </SettingRow>
        <SettingRow label="Deleted Messages" help>
          <BoolSegment value={o.deletedMessages} onChange={(v) => setO({ deletedMessages: v })} />
        </SettingRow>
      </SettingCard>
    </div>
  );
}

export function OmnibunnySection({ workspaceId }: { workspaceId: string | null }) {
  type OmnibotConfig = {
    enabled: boolean;
    paused?: boolean;
    walletScanner: boolean;
    walletTimeoutSeconds: number;
    viewerCollective: boolean;
    platforms: { twitch: boolean; kick: boolean; x: boolean };
  };

  type AuditRow = {
    id: string;
    platform: string;
    targetDisplayName: string;
    matchedPattern: string;
    action: string;
    createdAt: string;
  };

  const OMNIBOT_PLATFORMS = [
    { id: "twitch" as const, label: "Twitch" },
    { id: "kick" as const, label: "Kick" },
    { id: "x" as const, label: "X" },
  ];

  const [omnibot, setOmnibot] = useState<OmnibotConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  const patchOmnibot = (patch: Partial<OmnibotConfig>) => {
    setJustSaved(false);
    setOmnibot((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const loadOmnibot = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError("");
    try {
      const obRes = await apiFetch(`/api/workspaces/${workspaceId}/omnibot`);
      if (!obRes.ok) throw new Error("Could not load Omnibunny settings");
      setOmnibot((await obRes.json()).config as OmnibotConfig);
      const auditRes = await apiFetch(`/api/workspaces/${workspaceId}/omnibot/audit?limit=30`);
      if (auditRes.ok) {
        const j = await auditRes.json();
        setAudit(j.audit ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Omnibunny");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOmnibot();
  }, [workspaceId]);

  async function saveOmnibot() {
    if (!workspaceId || !omnibot) return;
    setError("");
    const res = await apiFetch(`/api/workspaces/${workspaceId}/omnibot`, {
      method: "PATCH",
      body: JSON.stringify(omnibot),
    });
    if (!res.ok) {
      setError("Save failed — try again");
      return;
    }
    setJustSaved(true);
    await loadOmnibot();
  }

  async function previewWalletScan() {
    if (!workspaceId) return;
    const res = await apiFetch(`/api/workspaces/${workspaceId}/omnibot/test-wallet`, {
      method: "POST",
      body: JSON.stringify({ text: testText }),
    });
    if (!res.ok) {
      setTestResult("Scan failed");
      return;
    }
    const j = await res.json();
    const matches = (j.matches ?? []) as { kind: string; match: string }[];
    if (matches.length === 0) setTestResult("No wallet addresses detected.");
    else
      setTestResult(
        `Would block: ${j.wouldBlock ? "yes" : "no"} — ${matches.map((m) => `${m.kind}: ${m.match}`).join("; ")}`,
      );
  }

  if (!workspaceId) {
    return (
      <>
        <h2 className="prochat-modal-title">Omnibunny</h2>
        <p className="prochat-modal-subtitle">Log in to configure wallet auto-mod.</p>
      </>
    );
  }

  if (loading && !omnibot) {
    return (
      <>
        <h2 className="prochat-modal-title">Omnibunny</h2>
        <p className="prochat-modal-subtitle">Loading…</p>
      </>
    );
  }

  return (
    <>
      <h2 className="prochat-modal-title">Omnibunny</h2>
      <p className="prochat-modal-subtitle">
        Auto-mod: times out chatters who post SOL, ETH, or BTC wallets on Twitch and Kick. Uses{" "}
        <strong>your</strong> connected channel OAuth — not @omnibunnybot.
      </p>

      {error && <p className="prochat-field-error">{error}</p>}

      {omnibot?.paused && (
        <p className="prochat-card-desc text-amber-400 mb-3">
          Paused in chat — type <code>@omnibunnybot start</code> to resume.
        </p>
      )}

      <SettingCard title="Chat commands">
        <p className="prochat-card-desc">
          <code>@omnibunnybot pause</code> — stop wallet timeouts
        </p>
        <p className="prochat-card-desc mt-1">
          <code>@omnibunnybot start</code> — resume wallet timeouts
        </p>
      </SettingCard>

      {omnibot && (
        <div className="prochat-section-stack">
          <SettingCard title="Bot behavior">
            <p className="prochat-card-desc mb-3">
              Turn Omnibunny on for your connected channels.
            </p>
            <SettingRow label="Auto-mod bot">
              <OnOffSegment
                value={omnibot.enabled}
                onChange={(v) => patchOmnibot({ enabled: v })}
              />
            </SettingRow>
            <SettingRow label="Crypto wallet timeouts">
              <OnOffSegment
                value={omnibot.walletScanner}
                onChange={(v) => patchOmnibot({ walletScanner: v })}
              />
            </SettingRow>
            <p className="prochat-card-desc mb-3 -mt-1">
              Timeout chatters who post SOL, ETH, or BTC addresses.
            </p>
            <SettingRow label="Timeout duration">
              <input
                type="number"
                min={60}
                max={1209600}
                className="prochat-input"
                style={{ maxWidth: "8rem" }}
                value={omnibot.walletTimeoutSeconds ?? 600}
                onChange={(e) =>
                  patchOmnibot({
                    walletTimeoutSeconds: Number(e.target.value) || 600,
                  })
                }
              />
            </SettingRow>
            <p className="prochat-card-desc mb-3 -mt-1">
              How long the timeout lasts (minimum 60 seconds).
            </p>
            <SettingRow label="Viewer collective mode">
              <OnOffSegment
                value={omnibot.viewerCollective}
                onChange={(v) => patchOmnibot({ viewerCollective: v })}
              />
            </SettingRow>
            <p className="prochat-card-desc -mt-1">
              Let viewers coordinate responses in chat (experimental).
            </p>
          </SettingCard>

          <SettingCard title="Platforms">
            <p className="prochat-card-desc mb-3">
              Which chats Omnibunny actively moderates.
            </p>
            {OMNIBOT_PLATFORMS.map((p) => (
              <SettingRow key={p.id} label={p.label}>
                <ModerateSegment
                  value={omnibot.platforms[p.id]}
                  onChange={(v) =>
                    patchOmnibot({
                      platforms: { ...omnibot.platforms, [p.id]: v },
                    })
                  }
                />
              </SettingRow>
            ))}
            <p className="prochat-card-desc mt-2">X is audit-only until the X mod bridge ships.</p>
          </SettingCard>

          <SettingCard title="Test scanner (no timeout)">
            <textarea
              className="prochat-input"
              style={{ minHeight: "4.5rem", resize: "vertical" }}
              placeholder="Paste a message to test…"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              rows={3}
            />
            <button
              type="button"
              className="prochat-muted-btn mt-2"
              onClick={() => void previewWalletScan()}
            >
              Preview scan
            </button>
            {testResult && <p className="prochat-card-desc mt-2">{testResult}</p>}
          </SettingCard>

          {audit.length > 0 && (
            <SettingCard title="Recent actions">
              <ul className="prochat-card-desc space-y-1 max-h-40 overflow-auto text-xs">
                {audit.map((a) => (
                  <li key={a.id}>
                    {new Date(a.createdAt).toLocaleString()} · {a.platform} · @
                    {a.targetDisplayName} · {a.action} · {a.matchedPattern.slice(0, 40)}
                  </li>
                ))}
              </ul>
            </SettingCard>
          )}

          <button
            type="button"
            className={`prochat-premium-upgrade${justSaved ? " prochat-premium-upgrade--saved" : ""}`}
            onClick={() => void saveOmnibot()}
          >
            {justSaved ? "Saved" : "Save Omnibunny"}
          </button>
        </div>
      )}
    </>
  );
}

export function AccountSection() {
  return (
    <>
      <h2 className="prochat-modal-title">Your OMnichat Account</h2>
      <p className="prochat-modal-subtitle">Manage sign-in and session access.</p>

      <SettingCard title="Security">
        <div className="prochat-account-row">
          <div>
            <p className="prochat-account-row-title">Password</p>
            <p className="prochat-card-desc">
              Your account uses external sign-in and does not have an OMnichat password.
            </p>
          </div>
          <button type="button" className="prochat-muted-btn" disabled>
            No OMnichat Password
          </button>
        </div>
      </SettingCard>

      <SettingCard title="Sessions">
        <div className="prochat-account-row">
          <div>
            <p className="prochat-account-row-title">This Session</p>
            <p className="prochat-card-desc">End the current session on this device</p>
          </div>
          <button
            type="button"
            className="prochat-muted-btn"
            onClick={() => {
              clearToken();
              window.location.href = "/login";
            }}
          >
            Log Out
          </button>
        </div>
      </SettingCard>

      <p className="prochat-legal-links">
        <a href="/features">Terms of Service</a> · <a href="/features">Privacy Policy</a>
      </p>
    </>
  );
}

export function ConnectionsSection({
  connections,
  loading,
  connectingPlatform,
  error,
  onConnect,
  showOnboarding,
  onDismissOnboarding,
}: {
  connections: Record<string, { status: string; username?: string }> | null;
  loading: boolean;
  connectingPlatform?: "twitch" | "kick" | "x" | "youtube" | "rumble" | null;
  error: string;
  onConnect: (p: "twitch" | "kick" | "x" | "youtube" | "rumble") => void;
  showOnboarding?: boolean;
  onDismissOnboarding?: () => void;
}) {
  const PLATFORMS: { id: "twitch" | "kick" | "x" | "youtube" | "rumble"; label: string }[] = [
    { id: "youtube", label: "YouTube" },
    { id: "twitch", label: "Twitch" },
    { id: "kick", label: "Kick" },
    { id: "rumble", label: "Rumble" },
    { id: "x", label: "X" },
  ];

  return (
    <>
      {showOnboarding && (
        <div className="prochat-connect-onboarding" role="status">
          <div className="prochat-connect-onboarding-copy">
            <h3 className="prochat-connect-onboarding-title">Connect your platforms</h3>
            <p className="prochat-connect-onboarding-text">
              Link Twitch, Kick, YouTube, Rumble, or X here to send chat from your accounts. You can watch
              streams without connecting — add channels under <strong>Channels</strong> first, then
              connect each platform you want to post on. Rumble watching works from channel links; connect
              Rumble here with your <strong>u_s</strong> cookie to reply in chat.
            </p>
          </div>
          {onDismissOnboarding && (
            <button
              type="button"
              className="prochat-connect-onboarding-skip"
              onClick={onDismissOnboarding}
            >
              Skip for now
            </button>
          )}
        </div>
      )}
      <h2 className="prochat-modal-title">Connected Platforms</h2>
      <p className="prochat-modal-subtitle">
        Connect once per platform. Channels you add while connected are linked for sending
        automatically — manage links under <strong>Channels</strong>.
      </p>
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      <div className="prochat-platform-list">
        {PLATFORMS.map((p) => {
          const isConnected = connections?.[p.id]?.status === "connected";
          const username = connections?.[p.id]?.username;
          return (
            <div key={p.id} className="prochat-platform-row">
              <div className="prochat-platform-row-left">
                <PlatformEmblem platform={p.id} size={28} />
                <div>
                  <p className="prochat-platform-name">{p.label}</p>
                  <p className={`prochat-platform-status ${isConnected ? "prochat-platform-status--connected" : ""}`}>
                    {isConnected ? `Connected${username ? ` · @${username}` : ""}` : "Not connected"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isConnected || loading || connectingPlatform === p.id}
                onClick={() => onConnect(p.id)}
                className={`prochat-connect-platform-btn ${isConnected ? "prochat-connect-platform-btn--connected" : ""}`}
              >
                {isConnected
                  ? "Connected"
                  : connectingPlatform === p.id
                    ? "Connecting…"
                    : "Connect"}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
