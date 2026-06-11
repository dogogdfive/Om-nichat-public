import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomString } from "./pkce.js";

const PAIRING_TTL_MS = 15 * 60 * 1000;

type OperatorFile = {
  operatorToken: string;
  createdAt: string;
  createdBy?: string;
};

type PairingFile = Record<
  string,
  {
    expiresAt: string;
    createdBy: string;
  }
>;

const operatorFile =
  process.env.X_OPERATOR_FILE ??
  join(dirname(fileURLToPath(import.meta.url)), "../../.x-operator.json");

const pairingFile =
  process.env.X_OPERATOR_PAIRING_FILE ??
  join(dirname(fileURLToPath(import.meta.url)), "../../.x-operator-pairings.json");

function readOperator(): OperatorFile | null {
  if (!existsSync(operatorFile)) return null;
  try {
    return JSON.parse(readFileSync(operatorFile, "utf8")) as OperatorFile;
  } catch {
    return null;
  }
}

function writeOperator(data: OperatorFile): void {
  mkdirSync(dirname(operatorFile), { recursive: true });
  writeFileSync(operatorFile, JSON.stringify(data, null, 2), "utf8");
}

function readPairings(): PairingFile {
  if (!existsSync(pairingFile)) return {};
  try {
    return JSON.parse(readFileSync(pairingFile, "utf8")) as PairingFile;
  } catch {
    return {};
  }
}

function writePairings(data: PairingFile): void {
  mkdirSync(dirname(pairingFile), { recursive: true });
  writeFileSync(pairingFile, JSON.stringify(data, null, 2), "utf8");
}

function prunePairings(raw: PairingFile): PairingFile {
  const now = Date.now();
  const next: PairingFile = {};
  for (const [code, row] of Object.entries(raw)) {
    if (new Date(row.expiresAt).getTime() > now) next[code] = row;
  }
  return next;
}

export function createSuperAdminPairingCode(createdBy: string): { code: string; expiresAt: Date } {
  const pairings = prunePairings(readPairings());
  const code = randomString(8).toUpperCase();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  pairings[code] = { expiresAt: expiresAt.toISOString(), createdBy };
  writePairings(pairings);
  return { code, expiresAt };
}

export function consumeSuperAdminPairingCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  const pairings = prunePairings(readPairings());
  const row = pairings[normalized];
  if (!row) return false;
  delete pairings[normalized];
  writePairings(pairings);
  if (new Date(row.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

export function ensureOperatorToken(createdBy?: string): string {
  const existing = readOperator();
  if (existing?.operatorToken) return existing.operatorToken;
  const token = randomString(32);
  writeOperator({
    operatorToken: token,
    createdAt: new Date().toISOString(),
    createdBy,
  });
  return token;
}

export function validateOperatorToken(token: string): boolean {
  if (!token) return false;
  const existing = readOperator();
  return Boolean(existing?.operatorToken && existing.operatorToken === token);
}

export function rotateOperatorToken(createdBy?: string): string {
  const token = randomString(32);
  writeOperator({
    operatorToken: token,
    createdAt: new Date().toISOString(),
    createdBy,
  });
  return token;
}
