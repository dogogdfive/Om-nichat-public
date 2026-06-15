"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chatThemeClass, type ChatTheme } from "@/lib/chat-theme";

type PipWindow = Window & { document: Document };

function copyStylesToPipWindow(pipWindow: PipWindow) {
  const head = pipWindow.document.head;
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    head.appendChild(node.cloneNode(true));
  }
}

function applyPipDocumentBase(pipWindow: PipWindow, theme: ChatTheme, fontFamily?: string) {
  const doc = pipWindow.document;
  doc.title = "OMnichat — pop-out";
  const body = doc.body;
  body.style.margin = "0";
  body.style.padding = "0";
  body.style.height = "100vh";
  body.style.overflow = "hidden";
  body.style.background = "var(--prochat-bg, #18181b)";
  if (fontFamily) body.style.fontFamily = fontFamily;

  const root = doc.createElement("div");
  root.id = "prochat-popout-root";
  root.className = `prochat-popout-root prochat-app ${chatThemeClass(theme)}`.trim();
  if (fontFamily) root.style.fontFamily = fontFamily;
  body.appendChild(root);
  return root;
}

export function useChatPopout(theme: ChatTheme, fontFamily?: string) {
  const supported =
    typeof window !== "undefined" && "documentPictureInPicture" in window;

  const [container, setContainer] = useState<HTMLElement | null>(null);
  const pipWindowRef = useRef<PipWindow | null>(null);
  const themeRef = useRef(theme);
  const fontRef = useRef(fontFamily);
  themeRef.current = theme;
  fontRef.current = fontFamily;

  const close = useCallback(() => {
    pipWindowRef.current?.close();
  }, []);

  const open = useCallback(async () => {
    if (!supported || pipWindowRef.current) return;
    const pipApi = window.documentPictureInPicture;
    if (!pipApi) return;

    const pipWindow = (await pipApi.requestWindow({
      width: 380,
      height: 600,
    })) as PipWindow;

    pipWindowRef.current = pipWindow;
    copyStylesToPipWindow(pipWindow);
    const root = applyPipDocumentBase(pipWindow, themeRef.current, fontRef.current);
    setContainer(root);

    const onPageHide = () => {
      pipWindowRef.current = null;
      setContainer(null);
    };
    pipWindow.addEventListener("pagehide", onPageHide);
  }, [supported]);

  const toggle = useCallback(async () => {
    if (pipWindowRef.current) {
      close();
      return;
    }
    await open();
  }, [close, open]);

  useEffect(() => {
    const root = pipWindowRef.current?.document.getElementById("prochat-popout-root");
    if (!root) return;
    root.className = `prochat-popout-root prochat-app ${chatThemeClass(theme)}`.trim();
    if (fontFamily) {
      root.style.fontFamily = fontFamily;
      pipWindowRef.current!.document.body.style.fontFamily = fontFamily;
    }
  }, [theme, fontFamily]);

  useEffect(() => {
    return () => {
      pipWindowRef.current?.close();
      pipWindowRef.current = null;
    };
  }, []);

  return {
    supported,
    isOpen: container != null,
    container,
    open,
    close,
    toggle,
  };
}
