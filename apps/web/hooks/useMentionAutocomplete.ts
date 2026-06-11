"use client";

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";

export type MentionUser = {
  login: string;
  displayName: string;
};

export function collectMentionUsers(
  lines: { kind: string; login?: string; user?: string }[],
): MentionUser[] {
  const seen = new Set<string>();
  const out: MentionUser[] = [];
  for (const line of lines) {
    if (line.kind !== "message") continue;
    const login = (line.login || line.user || "").replace(/^@/, "").trim();
    if (!login) continue;
    const key = login.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ login, displayName: line.user || login });
  }
  return out.sort((a, b) => a.login.localeCompare(b.login));
}

export function useMentionAutocomplete(
  compose: string,
  setCompose: (v: string) => void,
  users: MentionUser[],
) {
  const [activeIndex, setActiveIndex] = useState(0);
  const mentionMatch = compose.match(/@(\w*)$/);
  const query = mentionMatch?.[1] ?? "";
  const active = mentionMatch != null;

  const filtered = useMemo(() => {
    if (!active) return [];
    const q = query.toLowerCase();
    const pool = q
      ? users.filter(
          (u) =>
            u.login.toLowerCase().startsWith(q) ||
            u.displayName.toLowerCase().startsWith(q),
        )
      : users;
    return pool
      .sort((a, b) => {
        const al = a.login.toLowerCase();
        const bl = b.login.toLowerCase();
        return (al.startsWith(q) ? 0 : 1) - (bl.startsWith(q) ? 0 : 1) || al.localeCompare(bl);
      })
      .slice(0, 8);
  }, [active, query, users]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const insert = useCallback(
    (login: string) => {
      if (!mentionMatch) return;
      setCompose(compose.slice(0, -mentionMatch[0].length) + `@${login} `);
    },
    [compose, mentionMatch, setCompose],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): boolean => {
      if (!active || filtered.length === 0) return false;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return true;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const pick = filtered[activeIndex] ?? filtered[0];
        if (pick) insert(pick.login);
        return true;
      }
      return false;
    },
    [active, filtered, activeIndex, insert],
  );

  return {
    show: active && filtered.length > 0,
    filtered,
    activeIndex,
    insert,
    onKeyDown,
    query,
  };
}
