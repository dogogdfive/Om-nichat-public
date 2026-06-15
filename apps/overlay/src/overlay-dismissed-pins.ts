const DISMISSED_PINS_KEY = "omnichat-overlay-dismissed-pins";

export function loadDismissedPins(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_PINS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveDismissedPins(keys: Set<string>): void {
  try {
    sessionStorage.setItem(DISMISSED_PINS_KEY, JSON.stringify([...keys]));
  } catch {
    /* ignore */
  }
}
