"use client";

import type { ChatTheme } from "@/lib/chat-theme";

type Props = {
  theme: ChatTheme;
  onChange: (theme: ChatTheme) => void;
};

export function ChatThemeToggle({ theme, onChange }: Props) {
  const isLanding = theme === "landing";

  return (
    <button
      type="button"
      className={`prochat-theme-switch${isLanding ? " prochat-theme-switch--landing" : ""}`}
      onClick={() => onChange(isLanding ? "classic" : "landing")}
      aria-label={isLanding ? "Switch to fun mode (red theme)" : "Switch to landing theme (purple & green)"}
      aria-pressed={isLanding}
      title={isLanding ? "Landing theme — click for fun mode" : "Fun mode — click for landing theme"}
    >
      <span className="prochat-theme-switch-track" aria-hidden>
        <span className="prochat-theme-switch-half prochat-theme-switch-half--classic" />
        <span className="prochat-theme-switch-half prochat-theme-switch-half--landing" />
      </span>
      <span className="prochat-theme-switch-thumb" aria-hidden />
    </button>
  );
}
