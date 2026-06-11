const fs = require("fs");
const path = require("path");
const root = __dirname;
function w(rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

w("apps/api/package.json", JSON.stringify({
  name: "@omnichat/api", version: "0.0.1", private: true, type: "module",
  scripts: { dev: "tsx watch src/index.ts", build: "tsc", typecheck: "tsc --noEmit" },
  dependencies: { "@hono/node-server": "^1.13.7", "@omnichat/chat-types": "workspace:*", dotenv: "^16.4.7", hono: "^4.6.14", ws: "^8.18.0" },
  devDependencies: { "@types/node": "^22.10.2", "@types/ws": "^8.5.13", tsx: "^4.19.2", typescript: "^5.7.2" }
}, null, 2));

w("apps/api/tsconfig.json", JSON.stringify({
  extends: "../../tsconfig.json",
  compilerOptions: { outDir: "dist", rootDir: "src", module: "NodeNext", moduleResolution: "NodeNext" },
  include: ["src"]
}, null, 2));

w("apps/api/src/hub.ts", `import type { ChatMessage, HubEvent } from "@omnichat/chat-types";
import type { WebSocket } from "ws";
const MAX = 500;
export class ChatHub {
  private buffers = new Map<string, ChatMessage[]>();
  private rooms = new Map<string, Set<WebSocket>>();
  publish(roomId: string, event: HubEvent) {
    if (event.type === "message") {
      const buf = this.buffers.get(roomId) ?? [];
      buf.push(event.message);
      if (buf.length > MAX) buf.splice(0, buf.length - MAX);
      this.buffers.set(roomId, buf);
    }
    const payload = JSON.stringify(event);
    for (const client of this.rooms.get(roomId) ?? []) {
      if (client.readyState === 1) client.send(payload);
    }
  }
  subscribe(roomId: string, ws: WebSocket) {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId).add(ws);
    for (const message of this.buffers.get(roomId) ?? []) {
      ws.send(JSON.stringify({ type: "message", message }));
    }
  }
  unsubscribe(roomId: string, ws: WebSocket) { this.rooms.get(roomId)?.delete(ws); }
  ingest(roomId: string, message: ChatMessage) { this.publish(roomId, { type: "message", message }); }
}
`);

w("apps/api/src/index.ts", `import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { ChatMessageSchema } from "@omnichat/chat-types";
import { ChatHub } from "./hub.js";

const port = Number(process.env.PORT ?? 8787);
const hub = new ChatHub();
const app = new Hono();
app.use("*", cors({ origin: "*" }));
app.get("/health", (c) => c.json({ ok: true }));
app.get("/api/public/channels/lookup", (c) => {
  const slug = c.req.query("slug") ?? "";
  return c.json({ enabled: false, roomId: null, displayName: slug, platformsActive: [], live: false });
});
app.post("/api/ingest/:platform", async (c) => {
  const workspaceId = c.req.header("x-workspace-id") ?? "demo";
  const body = await c.req.json().catch(() => null);
  const parsed = ChatMessageSchema.safeParse(body?.message ?? body);
  if (!parsed.success) return c.json({ error: "invalid message" }, 400);
  hub.ingest("room:" + workspaceId, parsed.data);
  hub.ingest("room:" + workspaceId + ":public", parsed.data);
  return c.json({ ok: true });
});

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const roomId = url.searchParams.get("room") ?? "room:demo:public";
  hub.subscribe(roomId, ws);
  ws.on("close", () => hub.unsubscribe(roomId, ws));
});
serve({ fetch: app.fetch, port, createServer: () => httpServer });
httpServer.listen(port, () => console.log("API http://localhost:" + port));
`);

w("apps/overlay/package.json", JSON.stringify({
  name: "@omnichat/overlay", version: "0.0.1", private: true, type: "module",
  scripts: { dev: "vite", build: "vite build", typecheck: "tsc --noEmit" },
  dependencies: { "@omnichat/chat-types": "workspace:*", react: "^19.0.0", react-dom: "^19.0.0" },
  devDependencies: { "@types/react": "^19.0.2", "@types/react-dom": "^19.0.2", "@vitejs/plugin-react": "^4.3.4", typescript: "^5.7.2", vite: "^6.0.3" }
}, null, 2));

w("apps/overlay/vite.config.ts", `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], server: { port: 5173 } });
`);

w("apps/overlay/index.html", `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>Om-nichat Overlay</title></head>
<body style="margin:0;background:transparent"><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`);

w("apps/overlay/src/main.tsx", `import { createRoot } from "react-dom/client";
import { App } from "./App";
createRoot(document.getElementById("root")!).render(<App />);
`);

w("apps/overlay/src/App.tsx", `import { useEffect, useState } from "react";
import type { ChatMessage, HubEvent } from "@omnichat/chat-types";

const params = new URLSearchParams(location.search);
const room = params.get("room") ?? "room:demo:public";
const apiWs = (params.get("ws") ?? "ws://localhost:8787").replace(/\\/$/, "");

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [filter, setFilter] = useState({ twitch: true, kick: true, x: true });

  useEffect(() => {
    const ws = new WebSocket(apiWs + "?room=" + encodeURIComponent(room));
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as HubEvent;
      if (data.type === "message") setMessages((m) => [...m.slice(-99), data.message]);
    };
    return () => ws.close();
  }, []);

  const visible = messages.filter((m) => filter[m.platform]);

  return (
    <div style={{ fontFamily: "system-ui", color: "#fff", textShadow: "0 1px 2px #000", background: "transparent", padding: 8 }}>
      <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
        {(["twitch", "kick", "x"] as const).map((p) => (
          <label key={p} style={{ fontSize: 12 }}>
            <input type="checkbox" checked={filter[p]} onChange={() => setFilter((f) => ({ ...f, [p]: !f[p] }))} /> {p}
          </label>
        ))}
      </div>
      {visible.map((m) => (
        <div key={m.id} style={{ marginBottom: 4, fontSize: 14 }}>
          <span style={{ opacity: 0.7, marginRight: 6 }}>[{m.platform}]</span>
          <strong style={{ color: m.author.color ?? "#fff" }}>{m.author.displayName}</strong>: {m.text}
        </div>
      ))}
    </div>
  );
}
`);

w("apps/overlay/tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022","DOM"], jsx: "react-jsx", module: "ESNext", moduleResolution: "bundler", strict: true, skipLibCheck: true }, include: ["src"] }, null, 2));

w("extensions/chrome/manifest.json", JSON.stringify({
  manifest_version: 3,
  name: "Om-nichat",
  version: "0.0.1",
  description: "Collective Twitch, Kick, and X chat overlay",
  permissions: ["storage"],
  host_permissions: ["https://www.twitch.tv/*", "https://kick.com/*", "https://x.com/*", "http://localhost:8787/*", "ws://localhost:8787/*"],
  background: { service_worker: "background.js", type: "module" },
  content_scripts: [{ matches: ["https://www.twitch.tv/*", "https://kick.com/*", "https://x.com/*"], js: ["content.js"], run_at: "document_idle" }],
  action: { default_popup: "popup.html" }
}, null, 2));

w("extensions/chrome/popup.html", `<!DOCTYPE html><html><body style="font:13px system-ui;min-width:200px"><h3>Om-nichat</h3><p id="status">Extension active</p></body></html>`);
w("extensions/chrome/background.js", `console.log("Om-nichat background ready");`);
w("extensions/chrome/content.js", `(function(){const ID="omnichat-panel-root";if(document.getElementById(ID))return;const root=document.createElement("div");root.id=ID;root.style.cssText="position:fixed;top:80px;right:12px;width:320px;max-height:60vh;z-index:99999;background:rgba(0,0,0,0.75);color:#fff;border-radius:8px;padding:8px;font:13px system-ui;overflow:auto";root.innerHTML="<strong>Om-nichat</strong><div id=omnichat-log>Connecting…</div>";document.body.appendChild(root);const log=document.getElementById("omnichat-log");const room="room:demo:public";const ws=new WebSocket("ws://localhost:8787?room="+encodeURIComponent(room));ws.onmessage=(ev)=>{try{const d=JSON.parse(ev.data);if(d.type==="message"){const m=d.message;const line=document.createElement("div");line.textContent="["+m.platform+"] "+m.author.displayName+": "+m.text;log.appendChild(line);log.scrollTop=log.scrollHeight;}}catch(e){}};ws.onerror=()=>{log.textContent="API offline — run pnpm dev in apps/api";};})();`);

w("README.md", "# Om-nichat\n\nMulti-platform chat hub.\n\n```bash\npnpm install\npnpm --filter @omnichat/chat-types build\npnpm --filter @omnichat/api dev\npnpm --filter @omnichat/overlay dev\n```\n\nAPI: http://localhost:8787 | Overlay: http://localhost:5173?room=room:demo:public\n");

console.log("scaffold2 done");
