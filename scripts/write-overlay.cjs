const fs=require("fs"),path=require("path"),r=path.join(__dirname,"..");
const w=(rel,c)=>{const p=path.join(r,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c)};
const pkg={name:"@omnichat/overlay",version:"0.0.1",private:true,type:"module",scripts:{dev:"vite",build:"vite build"},dependencies:{"@omnichat/chat-types":"workspace:*","react":"^19.0.0","react-dom":"^19.0.0"},devDependencies:{"@types/react":"^19.0.2","@types/react-dom":"^19.0.2","@vitejs/plugin-react":"^4.3.4","typescript":"^5.7.2","vite":"^6.0.3"}};
w("apps/overlay/package.json",JSON.stringify(pkg,null,2));
w("apps/overlay/vite.config.ts",'import { defineConfig } from "vite"; import react from "@vitejs/plugin-react"; export default defineConfig({ plugins: [react()], server: { port: 5173 } });');
w("apps/overlay/index.html",'<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Om-nichat Overlay</title></head><body style="margin:0;background:transparent"><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
w("apps/overlay/tsconfig.json",JSON.stringify({compilerOptions:{target:"ES2022",lib:["ES2022","DOM"],jsx:"react-jsx",module:"ESNext",moduleResolution:"bundler",strict:true,skipLibCheck:true},include:["src"]},null,2));
w("apps/overlay/src/main.tsx",'import { createRoot } from "react-dom/client"; import { App } from "./App"; createRoot(document.getElementById("root")!).render(<App />);');
w("apps/overlay/src/App.tsx",`import { useEffect, useState } from "react";
import type { ChatMessage, HubEvent } from "@omnichat/chat-types";
const room = new URLSearchParams(location.search).get("room") ?? "room:demo:public";
const apiWs = (new URLSearchParams(location.search).get("ws") ?? "ws://localhost:8787").replace(/\\/$/, "");
export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [filter, setFilter] = useState({ twitch: true, kick: true, x: true });
  useEffect(() => {
    const ws = new WebSocket(apiWs + "?room=" + encodeURIComponent(room));
    ws.onmessage = (ev) => { const d = JSON.parse(ev.data) as HubEvent; if (d.type === "message") setMessages((m) => [...m.slice(-99), d.message]); };
    return () => ws.close();
  }, []);
  const visible = messages.filter((m) => filter[m.platform]);
  return (
    <div style={{ fontFamily: "system-ui", color: "#fff", textShadow: "0 1px 2px #000", padding: 8 }}>
      <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
        {(["twitch","kick","x"] as const).map((p) => (
          <label key={p}><input type="checkbox" checked={filter[p]} onChange={() => setFilter((f) => ({ ...f, [p]: !f[p] }))} /> {p}</label>
        ))}
      </div>
      {visible.map((m) => (
        <div key={m.id} style={{ marginBottom: 4 }}><span style={{ opacity: 0.7 }}>[{m.platform}] </span><strong>{m.author.displayName}</strong>: {m.text}</div>
      ))}
    </div>
  );
}`);
console.log("overlay ok");
