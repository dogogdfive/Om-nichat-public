"use client";

import { useEffect, useState } from "react";
import { ChatMockup } from "@/components/ChatMockup";
import { readLandingStorage } from "@/lib/landing-baked";

const STORAGE_KEY = "omnichat-landing-chat";

export const LANDING_CHAT_DEFAULTS = {
  x: "560",
  y: "160",
  height: "480",
  width: "448",
  locked: false,
} as const;

export type LandingChatSettings = {
  x: string;
  y: string;
  height: string;
  width: string;
  locked: boolean;
};

export function applyLandingChat(settings: LandingChatSettings) {
  const root = document.documentElement;
  root.style.setProperty("--landing-chat-x", `${settings.x}px`);
  root.style.setProperty("--landing-chat-y", `${settings.y}px`);
  root.style.setProperty("--landing-chat-height", `${settings.height}px`);
  root.style.setProperty("--landing-chat-width", `${settings.width}px`);
}

function loadStored(): LandingChatSettings {
  try {
    const raw = readLandingStorage(STORAGE_KEY);
    if (!raw) return { ...LANDING_CHAT_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<LandingChatSettings>;
    return {
      x: parsed.x ?? LANDING_CHAT_DEFAULTS.x,
      y: parsed.y ?? LANDING_CHAT_DEFAULTS.y,
      height: parsed.height ?? LANDING_CHAT_DEFAULTS.height,
      width: parsed.width ?? LANDING_CHAT_DEFAULTS.width,
      locked: parsed.locked ?? LANDING_CHAT_DEFAULTS.locked,
    };
  } catch {
    return { ...LANDING_CHAT_DEFAULTS };
  }
}

/** Chat mockup overlay — display only (position from saved browser settings). */
export function LandingChatMockupOverlay() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyLandingChat(loadStored());
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="landing-chat-mockup-embed landing-chat-mockup-embed--locked landing-chat-mockup-embed--live">
      <ChatMockup variant="landing" />
    </div>
  );
}
