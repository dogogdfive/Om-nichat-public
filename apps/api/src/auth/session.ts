import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionPayload = {
  userId: string;
  workspaceId: string;
  email: string;
  role: string;
  exp: number;
};

const COOKIE = "omnichat_session";

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
  if (!s || s === "change-me-in-production") {
    throw new Error("Set SESSION_SECRET in .env");
  }
  return s;
}

function b64url(data: string): string {
  return Buffer.from(data, "utf8").toString("base64url");
}

function fromB64url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

export function signSession(payload: Omit<SessionPayload, "exp">, days = 7): string {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const body: SessionPayload = { ...payload, exp };
  const json = JSON.stringify(body);
  const sig = createHmac("sha256", secret()).update(json).digest("base64url");
  return `${b64url(json)}.${sig}`;
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const [bodyB, sig] = token.split(".");
    if (!bodyB || !sig) return null;
    const json = fromB64url(bodyB);
    const expected = createHmac("sha256", secret()).update(json).digest("base64url");
    try {
      if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    } catch {
      return null;
    }
    const payload = JSON.parse(json) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.API_PUBLIC_URL?.startsWith("https") ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseSessionCookie(cookieHeader: string | undefined): SessionPayload | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!match) return null;
  return verifySession(decodeURIComponent(match[1]));
}

export function parseBearer(authHeader: string | undefined): SessionPayload | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return verifySession(authHeader.slice(7).trim());
}

export function parseSessionFromRequest(headers: {
  cookie?: string;
  authorization?: string;
}): SessionPayload | null {
  return parseBearer(headers.authorization) ?? parseSessionCookie(headers.cookie);
}

export { COOKIE };
