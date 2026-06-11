import {
  LANDING_LAYOUT_EDITORS_ENABLED,
  LANDING_OMNIBUNNY_EDITOR_ENABLED,
  LANDING_PANEL_COLOR_EDITOR_ENABLED,
} from "@/lib/landing-edit-mode";

/**
 * Committed layout snapshot — auto-extracted from Brave 2026-06-09.
 */
export const LANDING_BAKED_RAW: Record<string, string> = {
  "omnichat-landing-brand-text": "{\"size\":\"96\",\"x\":\"79\",\"y\":\"-57\",\"rotate\":\"9\",\"curve\":\"12\",\"wave\":\"24\",\"color\":\"#010104\",\"shadow\":\"63\",\"locked\":true}",
  "omnichat-landing-chat": "{\"x\":\"1216\",\"y\":\"42\",\"height\":\"720\",\"width\":\"640\",\"locked\":true}",
  "omnichat-landing-hero-backing": "{\"x\":\"136\",\"y\":\"148\",\"width\":\"576\",\"locked\":true,\"color\":\"#ffffff\",\"opacity\":\"35\",\"radius\":\"16\",\"sevenTvHue\":\"0\",\"sevenTvSize\":\"28\",\"loginColor\":\"#0000ff\",\"loginOpacity\":\"100\",\"loginTextColor\":\"#ffffff\"}",
  "omnichat-landing-logo": "{\"size\":\"320\",\"x\":\"-120\",\"y\":\"-179\",\"rotate\":\"0\",\"locked\":true}",
  "omnichat-landing-omnibunny": "{\"size\":\"160\",\"x\":\"842\",\"y\":\"605\",\"rotate\":\"0\",\"locked\":true}",
  "omnichat-landing-platform-logos": "{\"coordSpace\":\"page\",\"locked\":true,\"logos\":{\"youtube\":{\"x\":\"41\",\"y\":\"503\",\"size\":\"93\",\"rotate\":\"-28\"},\"twitch\":{\"x\":\"91\",\"y\":\"788\",\"size\":\"84\",\"rotate\":\"4\"},\"kick\":{\"x\":\"24\",\"y\":\"721\",\"size\":\"62\",\"rotate\":\"-17\"},\"tiktok\":{\"x\":\"649\",\"y\":\"484\",\"size\":\"83\",\"rotate\":\"8\"},\"rumble\":{\"x\":\"632\",\"y\":\"193\",\"size\":\"94\",\"rotate\":\"-5\"},\"x\":{\"x\":\"661\",\"y\":\"716\",\"size\":\"93\",\"rotate\":\"6\"}}}",
  "omnichat-landing-star": "{\"size\":\"279\",\"x\":\"-58\",\"y\":\"620\",\"rotate\":\"-6\",\"color\":\"#000000\",\"layer\":\"38\",\"variant\":\"0\",\"locked\":true}",
  "omnichat-landing-colors": "{\"purple\":\"#dc51ff\",\"green\":\"#279627\",\"blue\":\"#0000ff\",\"accent\":\"#e91916\",\"framePadding\":\"16\",\"panelRadius\":\"16\"}",
};

function prefersLocalStorage(key: string): boolean {
  if (LANDING_LAYOUT_EDITORS_ENABLED) return true;
  if (key === "omnichat-landing-omnibunny" && LANDING_OMNIBUNNY_EDITOR_ENABLED) return true;
  if (key === "omnichat-landing-colors" && LANDING_PANEL_COLOR_EDITOR_ENABLED) return true;
  return false;
}

export function readLandingStorage(key: string): string | null {
  const pick = (raw: string | null) => {
    if (!raw) return null;
    const cleaned = raw.replace(/^\u0001+/, "").trim();
    return cleaned || null;
  };
  const baked = pick(LANDING_BAKED_RAW[key] ?? null);
  if (prefersLocalStorage(key)) {
    try {
      return pick(localStorage.getItem(key)) ?? baked;
    } catch {
      return baked;
    }
  }
  if (!LANDING_LAYOUT_EDITORS_ENABLED && baked) return baked;
  try {
    return pick(localStorage.getItem(key)) ?? baked;
  } catch {
    return baked;
  }
}

export function loadBakedJson<T>(storageKey: string, parse: (raw: string) => T): T | null {
  const raw = readLandingStorage(storageKey);
  if (!raw) return null;
  try {
    return parse(raw);
  } catch {
    return null;
  }
}
