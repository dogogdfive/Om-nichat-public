import { apiFetch } from "@/lib/api";

export type ConnectPlatformId = "twitch" | "kick" | "x" | "youtube" | "rumble";

export async function startPlatformConnect(
  platform: ConnectPlatformId,
  returnTo = "/chat",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch(
    `/api/auth/${platform}/start?returnTo=${encodeURIComponent(returnTo)}`,
  );
  if (!res.ok) {
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
    return { ok: false, error: message };
  }
  const { url } = (await res.json()) as { url: string };
  window.location.href = url;
  return { ok: true };
}
