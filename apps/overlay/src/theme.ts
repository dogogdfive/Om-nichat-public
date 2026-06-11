/** Same zinc-900 panel background as live chat on omnichat.wtf */
export const CHAT_PANEL_BG = { r: 24, g: 24, b: 27 } as const;
export const OVERLAY_PAGE_BG = "#18181b";

export function overlayBackground(transparency: number): string {
  if (transparency >= 100) return "transparent";
  const alpha = Math.max(0, Math.min(1, 1 - transparency / 100));
  const { r, g, b } = CHAT_PANEL_BG;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
