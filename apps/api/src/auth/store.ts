import type { Platform } from "@omnichat/chat-types";
import type { OAuthPending } from "./oauth-pending.js";

export type PlatformTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  platformUserId?: string;
  platformUsername?: string;
};

export type { OAuthPending };
