import { randomBytes } from "node:crypto";
import { getPlatformTokens } from "../db/repos.js";
import { recordError } from "../debug.js";
import { resolveRumbleLiveStream, rumbleChatMessageUrl } from "./rumble-resolve.js";
import { getActiveRumbleStreamIdForSlug } from "./rumble-sse.js";
import { getRumbleSessionToken } from "./rumble-tokens.js";
import {
  normalizeRumbleSlug,
  rumbleFetchHeaders,
  rumbleSessionCookieHeader,
} from "./rumble-session.js";

function generateRequestId(): string {
  const random = randomBytes(32);
  return random.toString("base64").replace(/=+$/, "").slice(0, 43);
}

export async function sendRumbleChat(
  workspaceId: string,
  text: string,
  channelHandle?: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Empty message" };
  if (trimmed.length > 200) return { ok: false, error: "Message too long (max 200)" };

  const tokens = await getPlatformTokens(workspaceId, "rumble");
  const sessionToken = await getRumbleSessionToken(workspaceId);
  if (!sessionToken) {
    return { ok: false, error: "Connect your Rumble account in Settings to send messages" };
  }

  const slug = normalizeRumbleSlug(channelHandle ?? tokens?.platformUsername ?? "");
  if (!slug) return { ok: false, error: "Rumble channel required" };

  let streamIdB10 = getActiveRumbleStreamIdForSlug(slug);
  if (!streamIdB10) {
    const resolved = await resolveRumbleLiveStream(slug);
    if (!resolved) return { ok: false, error: `@${slug} is not live on Rumble` };
    streamIdB10 = resolved.streamIdB10;
  }

  const url = rumbleChatMessageUrl(streamIdB10);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...rumbleFetchHeaders({ "Content-Type": "application/json" }),
        Cookie: rumbleSessionCookieHeader(sessionToken),
      },
      body: JSON.stringify({
        data: {
          request_id: generateRequestId(),
          message: { text: trimmed },
          rant: null,
          channel_id: null,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Rumble send failed (${res.status})${body ? `: ${body.slice(0, 120)}` : ""}` };
    }

    return { ok: true };
  } catch (err) {
    recordError("rumble:send", err, { workspaceId, slug });
    return { ok: false, error: err instanceof Error ? err.message : "Rumble send failed" };
  }
}
