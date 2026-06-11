"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { API_URL, apiFetch } from "@/lib/api";
import {
  CHAT_SETTINGS_CHANGED,
  DEFAULT_SETTINGS,
  loadChatSettings,
  saveChatSettings,
  type ChatSettings,
} from "@/lib/chat-settings-storage";
import {
  AccountSection,
  AppearanceSection,
  ChannelsSection,
  ConnectionsSection,
  OmnibunnySection,
  OverlaySection,
  PreferencesSection,
  type SettingsPatch,
} from "./chat-settings/sections";

type ConnectPlatformId = "twitch" | "kick" | "x" | "youtube" | "rumble";
type Connections = Record<string, { status: string; username?: string }>;

export type SettingsSection =
  | "appearance"
  | "preferences"
  | "channels"
  | "connections"
  | "overlay"
  | "omnibunny"
  | "account";

const NAV: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M7 14c1.66 0 3-1.34 3-3S8.66 8 7 8s-3 1.34-3 3 1.34 3 3 3zm0-4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm12.71 7.58l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83a1 1 0 0 0 0-1.41zM20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 3 4-3h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
      </svg>
    ),
  },
  {
    id: "preferences",
    label: "Preferences",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
      </svg>
    ),
  },
  {
    id: "channels",
    label: "Channels",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
      </svg>
    ),
  },
  {
    id: "connections",
    label: "Connections",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
      </svg>
    ),
  },
  {
    id: "overlay",
    label: "Overlay",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
      </svg>
    ),
  },
  {
    id: "omnibunny",
    label: "Omnibunny",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1v2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2v-2h1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2M7.5 14A2.5 2.5 0 0 0 5 16.5 2.5 2.5 0 0 0 7.5 19 2.5 2.5 0 0 0 10 16.5 2.5 2.5 0 0 0 7.5 14m9 0a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 5 16.5 2.5 2.5 0 0 0 12.5 14Z" />
      </svg>
    ),
  },
  {
    id: "account",
    label: "Account",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    ),
  },
];

const CONNECT_ONBOARDING_KEY = "omnichat-connect-onboarding-done";

function hasAnyConnection(connections: Connections | null): boolean {
  if (!connections) return false;
  return Object.values(connections).some((c) => c.status === "connected");
}

type Props = {
  open: boolean;
  workspaceId: string | null;
  initialSection?: SettingsSection;
  /** Bump after OAuth return to force-refresh connection rows. */
  connectionsRefreshKey?: number;
  onClose: () => void;
  onConnectionsChange?: (
    connected: Record<string, boolean>,
    usernames?: Record<string, string | undefined>,
  ) => void;
};

export function ChatSettingsPanel({
  open,
  workspaceId,
  initialSection = "connections",
  connectionsRefreshKey = 0,
  onClose,
  onConnectionsChange,
}: Props) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [connections, setConnections] = useState<Connections | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<ConnectPlatformId | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [overlayToken, setOverlayToken] = useState("");
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(CONNECT_ONBOARDING_KEY) === "1";
  });

  const showConnectOnboarding = useMemo(() => {
    if (onboardingDismissed) return false;
    if (!connections) return false;
    return !hasAnyConnection(connections);
  }, [connections, onboardingDismissed]);

  const dismissConnectOnboarding = useCallback(() => {
    localStorage.setItem(CONNECT_ONBOARDING_KEY, "1");
    setOnboardingDismissed(true);
  }, []);

  useEffect(() => {
    if (open) {
      setSettings(loadChatSettings());
      setSection(initialSection);
    }
  }, [open, initialSection]);

  const patchSettings = useCallback((patch: SettingsPatch) => {
    setSettings((prev) => {
      const next: ChatSettings = {
        appearance: patch.appearance
          ? { ...prev.appearance, ...patch.appearance }
          : prev.appearance,
        preferences: patch.preferences
          ? { ...prev.preferences, ...patch.preferences }
          : prev.preferences,
        overlay: patch.overlay ? { ...prev.overlay, ...patch.overlay } : prev.overlay,
        profiles: patch.profiles ?? prev.profiles,
        channels: patch.channels ?? prev.channels,
      };
      queueMicrotask(() => saveChatSettings(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onExternalChange = () => setSettings(loadChatSettings());
    window.addEventListener(CHAT_SETTINGS_CHANGED, onExternalChange);
    return () => window.removeEventListener(CHAT_SETTINGS_CHANGED, onExternalChange);
  }, [open]);

  const loadConnections = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/connections`);
      if (res.status === 401) {
        setError("Session expired — log in again");
        return;
      }
      if (res.status === 403) {
        setError("You do not have access to this workspace");
        return;
      }
      if (!res.ok) {
        const raw = await res.text();
        let message = `Could not load connections (${res.status})`;
        try {
          const body = JSON.parse(raw) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          if (raw && !raw.startsWith("<") && raw.length < 200) message = raw;
        }
        throw new Error(message);
      }
      const conn = (await res.json()).connections as Connections;
      setConnections(conn);
      if (hasAnyConnection(conn)) {
        localStorage.setItem(CONNECT_ONBOARDING_KEY, "1");
        setOnboardingDismissed(true);
      }
      onConnectionsChange?.(
        {
          twitch: conn.twitch?.status === "connected",
          kick: conn.kick?.status === "connected",
          x: conn.x?.status === "connected",
          youtube: conn.youtube?.status === "connected",
          rumble: conn.rumble?.status === "connected",
        },
        {
          twitch: conn.twitch?.username,
          kick: conn.kick?.username,
          x: conn.x?.username,
          youtube: conn.youtube?.username,
          rumble: conn.rumble?.username,
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load connections";
      setError(msg.includes("fetch") ? "API unreachable — is the server running?" : msg);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onConnectionsChange]);

  useEffect(() => {
    if (open && workspaceId) loadConnections();
  }, [open, workspaceId, loadConnections, connectionsRefreshKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function connectPlatform(platform: ConnectPlatformId) {
    if (connections?.[platform]?.status === "connected") return;
    setError("");
    setConnectingPlatform(platform);

    if (platform === "rumble") {
      if (!workspaceId) {
        setConnectingPlatform(null);
        return;
      }
      const sessionToken = window.prompt(
        "Paste your Rumble u_s cookie to send chat from OMnichat.\n\nChrome: DevTools → Application → Cookies → rumble.com → copy u_s value.\n\nWatching live chat works without this — add channels under Channels first.",
      );
      const apiUrl = window.prompt(
        "Optional — Live Stream API URL for your own stream overlays only (rumble.com/account/livestream-api). Leave blank to skip.",
      );
      if (!sessionToken?.trim() && !apiUrl?.trim()) {
        setConnectingPlatform(null);
        return;
      }
      setLoading(true);
      try {
        if (sessionToken?.trim()) {
          const res = await apiFetch(`/api/workspaces/${workspaceId}/connections/rumble/session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionToken: sessionToken.trim() }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? "Rumble session connect failed");
          }
        }
        if (apiUrl?.trim()) {
          const res = await apiFetch(`/api/workspaces/${workspaceId}/connections/rumble`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiUrl: apiUrl.trim() }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? "Rumble API connect failed");
          }
        }
        await loadConnections();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Rumble connect failed");
      } finally {
        setLoading(false);
        setConnectingPlatform(null);
      }
      return;
    }

    const returnTo = encodeURIComponent(`/chat?linked=${platform}`);
    let res: Response;
    try {
      res = await apiFetch(`/api/auth/${platform}/start?returnTo=${returnTo}`);
    } catch {
      setConnectingPlatform(null);
      setError("API unreachable — is the server running?");
      return;
    }
    if (!res.ok) {
      setConnectingPlatform(null);
      const raw = await res.text();
      let message = "Connect failed — try logging in again";
      try {
        const body = JSON.parse(raw) as { error?: string; redirectUri?: string };
        if (body.error) {
          message = body.error;
          if (platform === "youtube" && body.redirectUri) {
            message += ` Add this redirect URI in Google Cloud Console: ${body.redirectUri}`;
          }
        }
      } catch {
        /* keep default */
      }
      setError(message);
      return;
    }
    const { url } = (await res.json()) as { url: string };
    if (!url) {
      setConnectingPlatform(null);
      setError("Connect failed — no OAuth URL returned");
      return;
    }
    sessionStorage.setItem("omnichat-oauth-pending", platform);
    window.location.assign(url);
  }

  function overlayUrl() {
    if (!workspaceId) return "";
    const base =
      process.env.NEXT_PUBLIC_OVERLAY_URL ??
      (process.env.NODE_ENV === "production"
        ? "https://omnichat.wtf/overlay"
        : "http://localhost:5173");
    const ws = API_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
    const o = settings.overlay;
    const a = settings.appearance;
    const qs = new URLSearchParams({
      room: `room:${workspaceId}`,
      ws,
      fontSize: String(o.fontSize),
      emoteSize: String(a.emoteSize),
      platformIcons: o.platformIcons ? "1" : "0",
      bgTransparency: String(o.bgTransparency),
    });
    if (overlayToken) qs.set("t", overlayToken);
    return `${base.replace(/\/$/, "")}?${qs.toString()}`;
  }

  async function copyOverlay() {
    const url = overlayUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetOverlayUrl() {
    setOverlayToken(crypto.randomUUID().slice(0, 8));
  }

  if (!open) return null;

  return (
    <div
      className="prochat-modal-overlay"
      role="presentation"
      onClick={onClose}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div className="prochat-modal-wrap" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="prochat-modal-close" onClick={onClose} aria-label="Close settings">
          ×
        </button>

        <div
          className="prochat-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prochat-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <aside className="prochat-modal-sidebar">
            <nav className="prochat-modal-nav">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`prochat-modal-nav-item ${section === item.id ? "prochat-modal-nav-item--active" : ""}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="prochat-modal-content">
            {section === "appearance" && (
              <AppearanceSection settings={settings} patch={patchSettings} />
            )}
            {section === "preferences" && (
              <PreferencesSection settings={settings} patch={patchSettings} />
            )}
            {section === "channels" && (
              <ChannelsSection
                settings={settings}
                patch={patchSettings}
                workspaceId={workspaceId}
                connections={connections}
                onConnectPlatform={connectPlatform}
              />
            )}
            {section === "connections" && (
              <ConnectionsSection
                connections={connections}
                loading={loading}
                connectingPlatform={connectingPlatform}
                error={error}
                onConnect={connectPlatform}
                showOnboarding={showConnectOnboarding}
                onDismissOnboarding={dismissConnectOnboarding}
              />
            )}
            {section === "overlay" && (
              <OverlaySection
                settings={settings}
                patch={patchSettings}
                overlayUrl={overlayUrl()}
                copied={copied}
                onCopy={copyOverlay}
                onReset={resetOverlayUrl}
              />
            )}
            {section === "omnibunny" && <OmnibunnySection workspaceId={workspaceId} />}
            {section === "account" && <AccountSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
