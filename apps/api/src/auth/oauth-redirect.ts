import { readEnv } from "../env.js";

/** Use redirect URIs exactly as configured — Google rejects localhost vs 127.0.0.1 mismatches. */
export function normalizeOAuthRedirectUri(uri: string): string {
  return uri.trim();
}

/** Explicit env var, or derive from API_PUBLIC_URL. */
export function resolveOAuthRedirectUri(
  platform: string,
  envKey: string,
): string | undefined {
  const explicit = readEnv(envKey);
  if (explicit) return normalizeOAuthRedirectUri(explicit);
  const base = readEnv("API_PUBLIC_URL");
  if (!base) return undefined;
  return normalizeOAuthRedirectUri(`${base.replace(/\/$/, "")}/auth/${platform}/callback`);
}
