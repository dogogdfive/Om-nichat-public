export const FREE_TIER_STAR_COUNT = 10;
/** Days 1–9 are free; day 10 triggers the paywall. */
export const FREE_TIER_MAX_FREE_DAYS = 9;

export type FreeTierState = {
  userId: string;
  visitDates: string[];
};

const STORAGE_PREFIX = "omnichat-free-tier:";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function loadFreeTierState(userId: string): FreeTierState {
  if (typeof window === "undefined") {
    return { userId, visitDates: [] };
  }
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { userId, visitDates: [] };
    const parsed = JSON.parse(raw) as Partial<FreeTierState>;
    const dates = Array.isArray(parsed.visitDates)
      ? parsed.visitDates.filter((d): d is string => typeof d === "string")
      : [];
    return { userId, visitDates: [...new Set(dates)].sort() };
  } catch {
    return { userId, visitDates: [] };
  }
}

export function saveFreeTierState(state: FreeTierState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(state.userId), JSON.stringify(state));
}

/** Record today's visit once per calendar day. Returns updated state. */
export function recordDailyVisit(userId: string): FreeTierState {
  const state = loadFreeTierState(userId);
  const today = todayKey();
  if (state.visitDates.includes(today)) return state;
  const next = { userId, visitDates: [...state.visitDates, today].sort() };
  saveFreeTierState(next);
  return next;
}

export function freeUsesLeft(state: FreeTierState): number {
  return Math.max(0, FREE_TIER_STAR_COUNT - state.visitDates.length);
}

export function filledStarCount(state: FreeTierState): number {
  return Math.min(state.visitDates.length, FREE_TIER_STAR_COUNT);
}

export function isFreeTierWarning(state: FreeTierState): boolean {
  return state.visitDates.length === FREE_TIER_MAX_FREE_DAYS;
}

export function isFreeTierPaywall(state: FreeTierState): boolean {
  return state.visitDates.length >= FREE_TIER_STAR_COUNT;
}

export function requiresPaidForPlatform(
  platform: string,
  state: FreeTierState,
  isPremium = false,
): boolean {
  if (isPremium) return false;
  if (!isFreeTierPaywall(state)) return false;
  return platform === "x" || platform === "rumble";
}
