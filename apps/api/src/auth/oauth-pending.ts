import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Platform } from "@omnichat/chat-types";

export type OAuthProvider = Platform | "google";

export type OAuthPending = {
  platform: OAuthProvider;
  mode: "login" | "link";
  workspaceId?: string;
  userId?: string;
  codeVerifier: string;
  createdAt: number;
  returnTo?: string;
};

const pending = new Map<string, OAuthPending>();
const PENDING_TTL_MS = 10 * 60 * 1000;

const pendingFile =
  process.env.OAUTH_PENDING_FILE ??
  join(dirname(fileURLToPath(import.meta.url)), "../../.oauth-pending.json");

function pruneExpired(rows: Map<string, OAuthPending>): Map<string, OAuthPending> {
  const now = Date.now();
  const next = new Map<string, OAuthPending>();
  for (const [state, row] of rows) {
    if (now - row.createdAt <= PENDING_TTL_MS) next.set(state, row);
  }
  return next;
}

function loadPendingFromDisk(): void {
  if (!existsSync(pendingFile)) return;
  try {
    const raw = readFileSync(pendingFile, "utf8");
    const parsed = JSON.parse(raw) as Record<string, OAuthPending>;
    for (const [state, row] of Object.entries(parsed)) {
      pending.set(state, row);
    }
    pruneExpired(pending);
  } catch {
    /* ignore corrupt cache */
  }
}

function persistPendingToDisk(): void {
  try {
    mkdirSync(dirname(pendingFile), { recursive: true });
    const obj = Object.fromEntries(pending.entries());
    writeFileSync(pendingFile, JSON.stringify(obj), "utf8");
  } catch {
    /* best-effort — in-memory still works */
  }
}

function removePendingFromDisk(): void {
  try {
    if (existsSync(pendingFile)) unlinkSync(pendingFile);
  } catch {
    /* ignore */
  }
}

loadPendingFromDisk();

export function savePending(state: string, data: OAuthPending): void {
  pending.set(state, data);
  persistPendingToDisk();
}

export function consumePending(state: string): OAuthPending | null {
  const row = pending.get(state);
  if (!row) return null;
  pending.delete(state);
  if (pending.size === 0) removePendingFromDisk();
  else persistPendingToDisk();
  if (Date.now() - row.createdAt > PENDING_TTL_MS) return null;
  return row;
}

/** Read a pending entry without removing it (used to route shared OAuth callbacks). */
export function peekPending(state: string): OAuthPending | null {
  const row = pending.get(state);
  if (!row) return null;
  if (Date.now() - row.createdAt > PENDING_TTL_MS) return null;
  return row;
}
