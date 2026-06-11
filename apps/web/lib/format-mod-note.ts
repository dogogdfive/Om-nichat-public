export type ModActionKind = "timeout" | "ban" | "unban" | "warn";

export function formatModNote(action: ModActionKind, durationSeconds?: number): string {
  if (action === "timeout") {
    return `Timed out (${durationSeconds ?? 0}s)`;
  }
  if (action === "ban") return "Banned";
  if (action === "warn") return "Warned";
  return "Unbanned";
}

export type ModTarget = {
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  userId: string;
  login: string;
  note: string;
};

type MessageLine = {
  kind: "message";
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  userId: string;
  login: string;
  modNote?: string;
};

type ChatLine = MessageLine | { kind: "system" };

export function applyModNoteToLines<T extends ChatLine>(lines: T[], mod: ModTarget): T[] {
  let targetIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.kind !== "message") continue;
    if (line.platform !== mod.platform) continue;
    if (
      line.userId === mod.userId ||
      line.login.toLowerCase() === mod.login.toLowerCase()
    ) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx === -1) return lines;
  const next = [...lines];
  const msg = next[targetIdx] as MessageLine;
  next[targetIdx] = { ...msg, modNote: mod.note } as T;
  return next;
}
