"use client";

import { useEffect, useId, useRef, useState } from "react";

const STORAGE_PREFIX = "omnichat-x-delay-notice-seen:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function IconBell() {
  return (
    <svg className="prochat-notify-bell-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
    </svg>
  );
}

export function ChatNotificationBell({ userId }: { userId: string | null }) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const seen = localStorage.getItem(storageKey(userId));
    if (!seen) {
      setUnread(true);
      setOpen(true);
    }
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function dismiss() {
    if (userId) localStorage.setItem(storageKey(userId), "1");
    setUnread(false);
    setOpen(false);
  }

  return (
    <div className="prochat-notify" ref={rootRef}>
      <button
        type="button"
        className={`prochat-notify-bell${unread ? " prochat-notify-bell--unread" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread ? "Notifications — X chat delay notice" : "Notifications"}
        title="Notifications"
      >
        <IconBell />
        {unread ? <span className="prochat-notify-dot" aria-hidden /> : null}
      </button>
      {open ? (
        <div id={panelId} className="prochat-notify-panel" role="dialog" aria-label="Notification">
          <p className="prochat-notify-title">X live chat</p>
          <p className="prochat-notify-body">
            Messages from X can take up to about <strong>10 seconds</strong> to show up here while
            the server polls the live chat.
          </p>
          <button type="button" className="prochat-notify-dismiss" onClick={dismiss}>
            Got it
          </button>
        </div>
      ) : null}
    </div>
  );
}
