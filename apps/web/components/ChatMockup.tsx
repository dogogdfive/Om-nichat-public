"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmoteText } from "@/components/EmoteText";
import { PlatformEmblem } from "./platform-icons";
import { fetchGlobal7tvEmotes, type ResolvedEmote } from "@/lib/emotes/seventv";

type Badge = "mod" | "vip" | "sub";

type MockMsg = {
  platform: "twitch" | "kick" | "x" | "youtube" | "tiktok";
  user: string;
  color: string;
  text: string;
  badges?: Badge[];
  system?: boolean;
  gift?: boolean;
};

const POOL: MockMsg[] = [
  { platform: "kick", user: "Banks", color: "#F97316", text: "lets goooo omegalul W stream" },
  { platform: "twitch", user: "xQc", color: "#9146FF", text: "omegalul that was insane catJAM" },
  { platform: "kick", user: "KaiCenat", color: "#A855F7", text: "is gifting 5 Tier 1 Subs!", gift: true },
  { platform: "twitch", user: "Ninja", color: "#00BFFF", text: "gg chat EZ Clap" },
  { platform: "kick", user: "adinross", color: "#EF4444", text: "W W W PepeLaugh stream is fire" },
  { platform: "twitch", user: "pokimane", color: "#FF69B4", text: "hi chat peepoHappy missed you" },
  { platform: "x", user: "IShowSpeed", color: "#E7E9EA", text: "SUIIIII monkaS live on all platforms" },
  { platform: "twitch", user: "HasanAbi", color: "#FF4500", text: "Aware omnichat overlay looks clean", badges: ["sub"] },
  { platform: "kick", user: "trainwreckstv", color: "#FBBF24", text: "slots time PauseChamp lets go" },
  { platform: "twitch", user: "ludwig", color: "#FFD700", text: "subbed with prime ty peepoClap", badges: ["sub"] },
  { platform: "twitch", user: "shroud", color: "#87CEEB", text: "clean flick holy WidePeepoHappy" },
  { platform: "kick", user: "NICKMERCS", color: "#3B82F6", text: "lets get it chat Sadge", badges: ["mod"] },
  { platform: "twitch", user: "summit1g", color: "#DA70D6", text: "cheer100 great content KEKW" },
  { platform: "twitch", user: "Valkyrae", color: "#FF7F50", text: "omggg no way monkaW" },
  { platform: "kick", user: "Amouranth", color: "#EC4899", text: "KEKW" },
  { platform: "twitch", user: "asmongold", color: "#C0C0C0", text: "thats actually true though Okayge" },
  { platform: "x", user: "TimTheTatman", color: "#1DA1F2", text: "someone clip that play Pepega" },
  { platform: "twitch", user: "CaseOh", color: "#F472B6", text: "W catJAM" },
  { platform: "kick", user: "Jynxzi", color: "#06B6D4", text: "first time here hello peepoHey" },
  { platform: "twitch", user: "ExtraEmily", color: "#FFFFFF", text: "raided from #JustChatting", system: true },
];

type LiveLine = MockMsg & { id: string; time: string };

const MAX_BUFFER = 100;
const MOCK_EMOTE_SIZE = 22;
const BADGE_LABEL: Record<Badge, { label: string; className: string }> = {
  mod: { label: "MOD", className: "chat-badge--mod" },
  vip: { label: "VIP", className: "chat-badge--vip" },
  sub: { label: "SUB", className: "chat-badge--sub" },
};

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function seedDisplayTime(index: number): string {
  const sec = 20 + index;
  return `12:00:${String(sec).padStart(2, "0")}`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function emotesToMap(list: ResolvedEmote[]): Map<string, ResolvedEmote> {
  const map = new Map<string, ResolvedEmote>();
  for (const e of list) {
    map.set(e.name, e);
    map.set(e.name.toLowerCase(), e);
  }
  return map;
}

function ChatLine({
  line,
  alt,
  emotes,
}: {
  line: LiveLine;
  alt: boolean;
  emotes: Map<string, ResolvedEmote>;
}) {
  if (line.gift || line.system) {
    return (
      <div className={`chat-line chat-line--announcement ${line.gift ? "chat-line--gift" : ""}`}>
        <PlatformEmblem platform={line.platform} />
        <span className="chat-announcement-text">
          <strong style={{ color: line.color }}>{line.user}</strong> {line.text}
        </span>
      </div>
    );
  }

  return (
    <div className={`chat-line ${alt ? "chat-line--alt" : ""}`}>
      <span className="chat-timestamp">{line.time}</span>
      <PlatformEmblem platform={line.platform} />
      {line.badges?.map((b) => (
        <span key={b} className={`chat-badge ${BADGE_LABEL[b].className}`}>
          {BADGE_LABEL[b].label}
        </span>
      ))}
      <span className="chat-line-body">
        <button type="button" className="chat-username" style={{ color: line.color }}>
          {line.user}
        </button>
        <span className="chat-colon">: </span>
        <span className="chat-text">
          <EmoteText text={line.text} emotes={emotes} size={MOCK_EMOTE_SIZE} />
        </span>
      </span>
    </div>
  );
}

export function ChatMockup({ variant = "default" }: { variant?: "default" | "landing" }) {
  const [lines, setLines] = useState<LiveLine[]>(() =>
    POOL.slice(0, 10).map((m, i) => ({
      ...m,
      id: `seed-${i}`,
      time: seedDisplayTime(i),
    })),
  );
  const [paused, setPaused] = useState(false);
  const [emotes, setEmotes] = useState<Map<string, ResolvedEmote>>(() => new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    if (variant !== "landing") return;
    let cancelled = false;
    void fetchGlobal7tvEmotes()
      .then((list) => {
        if (!cancelled) setEmotes(emotesToMap(list));
      })
      .catch(() => {
        /* mock still works without emotes */
      });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  const emoteMap = useMemo(() => emotes, [emotes]);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const el = scrollRef.current;
      if (!el || paused) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    },
    [paused],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = dist < 48;
  }, []);

  useEffect(() => {
    const tick = () => {
      const template = pickRandom(POOL);
      setLines((prev) => {
        const next: LiveLine = {
          ...template,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          time: nowTime(),
        };
        const merged = [...prev, next];
        return merged.length > MAX_BUFFER ? merged.slice(-MAX_BUFFER) : merged;
      });
    };

    const id = window.setInterval(tick, 700 + Math.random() * 900);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!atBottomRef.current && !paused) return;
    scrollToBottom(true);
  }, [lines, paused, scrollToBottom]);

  const panelClass =
    variant === "landing"
      ? "twitch-chat-panel w-full min-w-0 landing-chat-panel"
      : "twitch-chat-panel shadow-2xl shadow-black/60 max-w-md w-full";

  const panel = (
    <div className={panelClass}>
      <div className="twitch-chat-header">
        <div className="flex items-center gap-2 min-w-0">
          <span className="twitch-chat-header-dot" />
          <Image
            src="/omnibunny-logo.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 object-contain"
            aria-hidden
          />
          <span className="twitch-chat-header-title truncate">
            <span className="text-white font-semibold">OM</span>
            <span className="text-[#ef4444] font-semibold">nichat</span>
            <span className="text-[#adadb8] font-normal ml-1.5 text-xs">Stream Chat</span>
          </span>
        </div>
        <span className="twitch-chat-header-meta">LIVE</span>
      </div>

      <div
        ref={scrollRef}
        className={`twitch-chat-scroll${variant === "landing" ? " landing-chat-scroll" : ""}`}
        onScroll={onScroll}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => {
          setPaused(false);
          atBottomRef.current = true;
          scrollToBottom(false);
        }}
      >
        {lines.map((line, i) => (
          <ChatLine key={line.id} line={line} alt={i % 2 === 1} emotes={variant === "landing" ? emoteMap : new Map()} />
        ))}
      </div>

      {paused && (
        <div className="twitch-chat-paused">Chat paused — move mouse away to resume</div>
      )}

      <div className="twitch-chat-input-mock">
        <span className="text-[#adadb8] text-xs">Send a message</span>
      </div>
    </div>
  );

  if (variant === "landing") {
    return <div className="landing-mockup-wrap">{panel}</div>;
  }

  return panel;
}
