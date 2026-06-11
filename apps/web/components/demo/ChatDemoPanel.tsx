"use client";

import { PlatformEmblem } from "../platform-icons";

type Line =
  | { type: "msg"; platform: "twitch" | "kick" | "x" | "youtube"; user: string; color: string; text: string; mod?: boolean; sub?: boolean }
  | { type: "gift"; platform: "twitch" | "kick" | "youtube"; user: string; color: string; text: string; variant: "purple" | "green" };

const LINES: Line[] = [
  { type: "gift", platform: "kick", user: "Banks", color: "#F97316", text: "Gifted 5 subscriptions to the community! They've been gifted for 1 month!", variant: "green" },
  { type: "gift", platform: "twitch", user: "KaiCenat", color: "#9146FF", text: "is gifting 5 Tier 1 Subs to the community!", variant: "purple" },
  { type: "gift", platform: "youtube", user: "MrBeast", color: "#22c55e", text: "Welcome to YouTube Member — thanks for joining!", variant: "green" },
  { type: "msg", platform: "twitch", user: "xQc", color: "#a78bfa", text: "PogChamp LETSGO", sub: true },
  { type: "msg", platform: "kick", user: "adinross", color: "#EF4444", text: "W stream chat" },
  { type: "msg", platform: "x", user: "IShowSpeed", color: "#7dd3fc", text: "multistream gang 🔥" },
  { type: "msg", platform: "twitch", user: "NICKMERCS", color: "#f472b6", text: "overlay looks clean", mod: true },
  { type: "msg", platform: "kick", user: "trainwreckstv", color: "#FBBF24", text: "lets get it" },
];

function BadgeMod() {
  return (
    <svg className="w-4 h-4 shrink-0 text-green-500" viewBox="0 0 24 24" fill="currentColor" aria-label="Moderator">
      <path d="M20 2H4v2h16V2zm0 4H4v12h16V6zM6 8h12v2H6V8zm0 4h8v2H6v-2z" />
    </svg>
  );
}

function BadgeSub() {
  return (
    <span className="text-[10px] font-bold text-violet-400 shrink-0">★</span>
  );
}

export function ChatDemoPanel() {
  return (
    <div className="demo-chat-panel w-full max-w-md shadow-2xl shadow-black/50">
      <div className="demo-chat-scroll max-h-[480px] overflow-y-auto py-1">
        {LINES.map((line, i) =>
          line.type === "gift" ? (
            <div
              key={i}
              className={`demo-chat-gift ${line.variant === "purple" ? "demo-chat-gift--purple" : "demo-chat-gift--green"}`}
            >
              <PlatformEmblem platform={line.platform} />
              <span>
                <strong style={{ color: line.color }}>{line.user}</strong> {line.text}
              </span>
            </div>
          ) : (
            <div key={i} className="demo-chat-row group">
              <PlatformEmblem platform={line.platform} />
              {line.mod && <BadgeMod />}
              {line.sub && <BadgeSub />}
              <p className="min-w-0 flex-1">
                <span className="font-semibold" style={{ color: line.color }}>
                  {line.user}:
                </span>{" "}
                <span className="text-zinc-200">{line.text}</span>
              </p>
              <button type="button" className="text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100 text-lg leading-none shrink-0" aria-label="Menu">
                ⋮
              </button>
            </div>
          ),
        )}
      </div>
      <div className="demo-chat-footer-pill">
        ▼ 90 New Messages Below ▼
      </div>
    </div>
  );
}
