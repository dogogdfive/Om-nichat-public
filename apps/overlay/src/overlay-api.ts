import { sanitizeWsUrl } from "./params";

export function apiBaseFromWs(ws: string): string {
  return sanitizeWsUrl(ws)
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://");
}

export function overlayApiPath(ws: string, path: string): string {
  if (typeof location !== "undefined" && location.hostname.endsWith("omnichat.wtf")) {
    return `/api-backend${path.startsWith("/") ? path : `/${path}`}`;
  }
  return `${apiBaseFromWs(ws)}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function overlayFetch(
  ws: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(overlayApiPath(ws, path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}
