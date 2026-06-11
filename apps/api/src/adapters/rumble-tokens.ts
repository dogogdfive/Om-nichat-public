import { getPlatformTokens } from "../db/repos.js";
import { isChatSessionScope, isLivestreamApiScope, normalizeSessionToken } from "./rumble-session.js";

function normalizeApiUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("livestream-api")) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return null;
    }
  }
  const key = trimmed.replace(/^key[=:/]+/i, "");
  if (!key) return null;
  return `https://rumble.com/-livestream-api/get-data?key=${encodeURIComponent(key)}`;
}

export async function getRumbleSessionToken(workspaceId: string): Promise<string | undefined> {
  const tokens = await getPlatformTokens(workspaceId, "rumble");
  if (!tokens) return undefined;
  if (isChatSessionScope(tokens.scope)) {
    return normalizeSessionToken(tokens.accessToken);
  }
  if (tokens.refreshToken && (isLivestreamApiScope(tokens.scope) || tokens.scope === "livestream-api+session")) {
    return normalizeSessionToken(tokens.refreshToken);
  }
  return undefined;
}

export async function getRumbleApiUrl(workspaceId: string): Promise<string | undefined> {
  const tokens = await getPlatformTokens(workspaceId, "rumble");
  if (!tokens?.accessToken) return undefined;
  if (
    isLivestreamApiScope(tokens.scope) ||
    tokens.scope === "livestream-api+session" ||
    tokens.accessToken.includes("livestream-api")
  ) {
    return normalizeApiUrl(tokens.accessToken) ?? undefined;
  }
  return undefined;
}

export function rumbleConnectionScope(opts: {
  hasSession: boolean;
  hasApi: boolean;
}): string {
  if (opts.hasSession && opts.hasApi) return "livestream-api+session";
  if (opts.hasApi) return "livestream-api";
  return "chat-session";
}
