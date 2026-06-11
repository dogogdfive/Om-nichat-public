import { useEffect, useState } from "react";
import type { ChatMessage, HubEvent } from "@omnichat/chat-types";
const room = new URLSearchParams(location.search).get("room") ?? "room:demo:public";
const apiWs = (new URLSearchParams(location.search).get("ws") ?? "ws://localhost:8787").replace(/\/$/, "");
export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [filter, setFilter] = useState({ twitch: true, kick: true, x: true });
  useEffect(() => {
    const ws = new WebSocket(apiWs + "?room=" + encodeURIComponent(room));
    ws.onmessage = (ev) => { const d = JSON.parse(ev.data) as HubEvent; if (d.type === "message") setMessages((m) => [...m.slice(-99), d.message]); };
    return () => ws.close();
  }, []);
  const visible = messages.filter((m) => filter[m.platform]);
  const badge: Record<string, string> = { twitch: "#9146FF", kick: "#53FC18", x: "#e7e7e7" };
  return (
    <div style={{ fontFamily: "system-ui", color: "#fff", textShadow: "0 1px 2px #000", padding: 8, background: "transparent" }}>
      {import.meta.env.DEV ? (
        <div style={{ marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["twitch", "kick", "x"] as const).map((p) => (
            <label key={p} style={{ fontSize: 12 }}>
              <input type="checkbox" checked={filter[p]} onChange={() => setFilter((f) => ({ ...f, [p]: !f[p] }))} />{" "}
              <span style={{ color: badge[p] }}>{p}</span>
            </label>
          ))}
        </div>
      ) : null}
      {visible.map((m) => (
        <div key={m.id} style={{ marginBottom: 4 }}>
          <span style={{ color: badge[m.platform], fontSize: 11, marginRight: 6 }}>{m.platform}</span>
          <strong>{m.author.displayName}</strong>: {m.text}
        </div>
      ))}
    </div>
  );
}