"use client";

import { useLayoutEffect, useState } from "react";

const FLAG_KEY = "omnichat-landing-edit";

/** When false, layout overlays render from saved settings only. */
export const LANDING_LAYOUT_EDITORS_ENABLED = false;

/** When true, only shows baked /landing-paint.png (no live paint UI). */
export const LANDING_PAINT_LOCKED = true;

/** Omnibunny placement editor (separate from paint tools). */
export const LANDING_OMNIBUNNY_EDITOR_ENABLED = false;

/** Green panel color picker on the landing page. */
export const LANDING_PANEL_COLOR_EDITOR_ENABLED = false;
export function readLandingEditMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("edit");
    if (flag === "1") {
      localStorage.setItem(FLAG_KEY, "1");
      return true;
    }
    if (flag === "0") {
      localStorage.removeItem(FLAG_KEY);
      return false;
    }
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Returns false during SSR/first paint, then the real value after mount. */
export function useLandingEditMode(): boolean {
  const [edit, setEdit] = useState(false);
  useLayoutEffect(() => {
    setEdit(readLandingEditMode());
  }, []);
  return edit;
}
