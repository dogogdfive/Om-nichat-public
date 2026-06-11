import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

export function useOverlayAutoScroll(scrollKey: string, activeTabId: string, emoteCount: number) {
  const feedRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    scrollToBottom();
    const id = requestAnimationFrame(() => {
      scrollToBottom();
      requestAnimationFrame(scrollToBottom);
    });
    return () => cancelAnimationFrame(id);
  }, [scrollKey, activeTabId, emoteCount, scrollToBottom]);

  useEffect(() => {
    const el = feedRef.current;
    const inner = el?.firstElementChild;
    if (!el || !inner) return;

    const ro = new ResizeObserver(() => scrollToBottom());
    ro.observe(inner);

    const onLoad = (ev: Event) => {
      const target = ev.target;
      if (target instanceof HTMLImageElement && el.contains(target)) {
        scrollToBottom();
      }
    };
    el.addEventListener("load", onLoad, true);

    return () => {
      ro.disconnect();
      el.removeEventListener("load", onLoad, true);
    };
  }, [scrollToBottom]);

  return { feedRef, scrollToBottom };
}
