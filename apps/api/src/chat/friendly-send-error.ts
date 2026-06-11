function looksLikeBan(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("banned") ||
    lower.includes("msg_banned") ||
    lower.includes("you are banned") ||
    (lower.includes("cannot send") && lower.includes("ban"))
  );
}

/** Map Kick chat API failures to readable messages (500 often means banned). */
export function friendlyKickSendError(
  status: number,
  body: string,
  channel: string,
): string {
  const slug = channel.replace(/^@/, "");
  if (
    status === 403 ||
    looksLikeBan(body) ||
    (status === 500 && body.toLowerCase().includes("internal server error"))
  ) {
    return `You're banned in @${slug} on Kick`;
  }
  if (status >= 500) {
    return `Kick couldn't send to @${slug} — try again in a moment`;
  }
  return `kick @${slug}: ${body.slice(0, 120) || `HTTP ${status}`}`;
}

/** Map Twitch send failures to readable messages. */
export function friendlyTwitchSendError(
  channel: string,
  detail: string,
  extra?: string,
): string | null {
  const login = channel.replace(/^#/, "").replace(/^@/, "");
  const combined = `${detail} ${extra ?? ""}`;
  if (looksLikeBan(combined)) {
    return `You're banned in #${login} on Twitch`;
  }
  return null;
}
