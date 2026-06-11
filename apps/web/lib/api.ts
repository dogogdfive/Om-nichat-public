function trimEnv(value: string | undefined): string {
  return (value ?? "").replace(/\r/g, "").trim();
}

export const API_URL = trimEnv(process.env.NEXT_PUBLIC_API_URL) || "http://localhost:8787";

function apiBase(): string {
  if (typeof window !== "undefined") return "/api-backend";
  return API_URL;
}

/** OAuth login links must use the same proxy as apiFetch in the browser. */
export function oauthLoginUrl(path: string): string {
  return `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

import { getToken } from "./auth";

export async function apiFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok && process.env.NODE_ENV === "development") {
    const clone = res.clone();
    const body = await clone.text().catch(() => "");
    console.warn(`[apiFetch] ${init?.method ?? "GET"} ${path} → ${res.status}`, body.slice(0, 500));
  }
  return res;
}
