"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ResolvedEmote } from "@/lib/emotes/seventv";
import { emoteUrlsInText, preloadEmoteImages } from "@/lib/emotes/preload";

export type IncomingChatMessage = {
  id: string;
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  channelId: string;
  user: string;
  userId: string;
  login: string;
  color?: string;
  badges?: { url: string; title?: string }[];
  text: string;
  time: string;
  ts?: number;
  inlineEmotes?: { id: string; name: string; url: string }[];
};

type Options = {
  /** Target max lag vs live chat (ms). */
  maxDelayMs?: number;
  /** Min time between chunk flushes (ms). */
  minIntervalMs?: number;
  /** Max messages per chunk. */
  maxBatch?: number;
  /** Max wait to preload emote images per chunk (ms). */
  emotePreloadMs?: number;
};

const DEFAULTS: Required<Options> = {
  maxDelayMs: 2650,
  minIntervalMs: 120,
  maxBatch: 40,
  emotePreloadMs: 350,
};

export function useChatChunkBuffer(
  onFlush: (batch: IncomingChatMessage[]) => void,
  emotesRef: React.RefObject<Map<string, ResolvedEmote>>,
  opts?: Options,
) {
  const config = { ...DEFAULTS, ...opts };
  const queueRef = useRef<IncomingChatMessage[]>([]);
  const oldestAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const flushingRef = useRef(false);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    const queue = queueRef.current;
    if (queue.length === 0) return;

    flushingRef.current = true;
    const take = Math.min(queue.length, config.maxBatch);
    const batch = queue.splice(0, take);
    if (queue.length === 0) oldestAtRef.current = null;

    const urls = new Set<string>();
    for (const msg of batch) {
      for (const u of emoteUrlsInText(msg.text, emotesRef.current ?? new Map(), msg.inlineEmotes)) {
        urls.add(u);
      }
    }

    onFlushRef.current(batch);
    void preloadEmoteImages([...urls], config.emotePreloadMs);
    flushingRef.current = false;

    if (queueRef.current.length > 0) {
      scheduleRef.current();
    }
  }, [config.maxBatch, config.emotePreloadMs, emotesRef]);

  const scheduleRef = useRef<() => void>(() => {});

  scheduleRef.current = () => {
    if (timerRef.current != null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const queue = queueRef.current;
      if (queue.length === 0) return;

      const now = Date.now();
      const oldest = oldestAtRef.current ?? now;
      const age = now - oldest;
      const backlog = queue.length;

      const interval =
        backlog > 60 ? 80 : backlog > 25 ? config.minIntervalMs : config.minIntervalMs + 80;

      const shouldFlush =
        age >= config.maxDelayMs ||
        backlog >= config.maxBatch ||
        (age >= interval && backlog >= 2) ||
        (age >= interval * 2 && backlog >= 1);

      if (shouldFlush) {
        void flush();
      } else {
        scheduleRef.current();
      }
    }, 50);
  };

  const pushMessage = useCallback((msg: IncomingChatMessage) => {
    if (oldestAtRef.current == null) oldestAtRef.current = Date.now();
    queueRef.current.push(msg);
    scheduleRef.current();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      queueRef.current = [];
    };
  }, []);

  return { pushMessage };
}
