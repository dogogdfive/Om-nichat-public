"use client";

import { GoogleAuthIcon } from "@/components/GoogleAuthIcon";
import { PlatformAuthIcon } from "@/components/platform-icons";
import { oauthLoginUrl } from "@/lib/api";

export type OAuthAvailability = {
  google?: boolean;
  twitch?: boolean;
  kick?: boolean;
  x?: boolean;
};

export type OAuthProviderId = "google" | "twitch" | "kick" | "x";

const PLATFORM_BUTTONS: Record<
  "twitch" | "kick" | "x",
  { loginLabel: string; signupLabel: string; border: string }
> = {
  twitch: {
    loginLabel: "Log in with Twitch",
    signupLabel: "Sign up with Twitch",
    border: "border-[#9146FF]/70 hover:border-[#9146FF]",
  },
  kick: {
    loginLabel: "Log in with Kick",
    signupLabel: "Sign up with Kick",
    border: "border-[#53FC18]/60 hover:border-[#53FC18]",
  },
  x: {
    loginLabel: "Log in with X",
    signupLabel: "Sign up with X",
    border: "border-zinc-300/50 hover:border-white",
  },
};

const LOGIN_PROVIDERS: OAuthProviderId[] = ["twitch", "kick", "x"];
const SIGNUP_PROVIDERS: OAuthProviderId[] = ["google", "twitch", "kick", "x"];

type Props = {
  mode: "login" | "signup";
  oauth: OAuthAvailability | null;
  providers?: OAuthProviderId[];
};

export function AuthOAuthButtons({ mode, oauth, providers }: Props) {
  const verb = mode === "login" ? "Log in" : "Sign up";
  const list = providers ?? (mode === "login" ? LOGIN_PROVIDERS : SIGNUP_PROVIDERS);
  const configured = oauth ?? {};

  const visible = list.filter((id) => {
    if (!oauth) return false;
    if (mode === "login" && id === "x") return true;
    if (id === "google") return configured.google;
    return configured[id as keyof OAuthAvailability];
  });

  if (oauth && visible.length === 0) return null;

  function go(path: string) {
    window.location.href = oauthLoginUrl(path);
  }

  return (
    <div className="space-y-3">
      {visible.map((id) => {
        if (id === "google") {
          return (
            <button
              key={id}
              type="button"
              onClick={() => go("/auth/google/login")}
              className="prochat-auth-oauth border-white/30 hover:border-white"
            >
              <GoogleAuthIcon size={20} />
              {verb} with Google
            </button>
          );
        }

        const p = PLATFORM_BUTTONS[id as keyof typeof PLATFORM_BUTTONS];
        if (!p) return null;

        return (
          <button
            key={id}
            type="button"
            onClick={() => go(`/auth/${id}/login`)}
            className={`prochat-auth-oauth ${p.border}`}
          >
            <PlatformAuthIcon id={id as "twitch" | "kick" | "x"} size={id === "x" ? 22 : 20} />
            {mode === "login" ? p.loginLabel : p.signupLabel}
          </button>
        );
      })}
    </div>
  );
}
