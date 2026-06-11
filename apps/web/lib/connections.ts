import { apiFetch } from "./api";

export type PlatformConnections = Record<string, { status: string; username?: string }>;

export const CONNECTION_PLATFORMS = ["twitch", "kick", "x", "youtube", "rumble"] as const;
export type ConnectionPlatform = (typeof CONNECTION_PLATFORMS)[number];

export function isConnectionPlatform(value: string | null): value is ConnectionPlatform {
  return value !== null && (CONNECTION_PLATFORMS as readonly string[]).includes(value);
}

export function connectionsToFlags(conn: PlatformConnections): Record<string, boolean> {
  return {
    twitch: conn.twitch?.status === "connected",
    kick: conn.kick?.status === "connected",
    x: conn.x?.status === "connected",
    youtube: conn.youtube?.status === "connected",
    rumble: conn.rumble?.status === "connected",
  };
}

/** Retry while the API may be restarting after OAuth redirect. */
export async function fetchConnectionsWithRetry(
  workspaceId: string,
  opts?: { attempts?: number; baseDelayMs?: number; waitFor?: ConnectionPlatform },
): Promise<PlatformConnections | null> {
  const attempts = opts?.attempts ?? 6;
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  let last: PlatformConnections | null = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/connections`);
      if (res.ok) {
        const data = (await res.json()) as { connections?: PlatformConnections };
        last = data.connections ?? null;
        if (last && (!opts?.waitFor || last[opts.waitFor]?.status === "connected")) {
          return last;
        }
      }
    } catch {
      /* API may be restarting — retry */
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }

  return last;
}
