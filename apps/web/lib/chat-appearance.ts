/**
 * Format a chat timestamp per the appearance setting.
 * Returns "" when timestamps are hidden ("hide"/"none"/"off").
 */
export function formatChatTimestamp(format: string | undefined, date: Date): string {
  switch (format) {
    case "hide":
    case "none":
    case "off":
      return "";
    case "24h-short":
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    case "12h-full":
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    case "12h-short":
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    case "24h-full":
    default:
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
  }
}

/** Whether timestamps should render at all for the given setting. */
export function timestampsHidden(format: string | undefined): boolean {
  return format === "hide" || format === "none" || format === "off";
}

/** CSS font-family stack for chat appearance setting. */
export function chatFontFamily(font: string): string {
  switch (font) {
    case "Roboto":
      return '"Roboto", system-ui, sans-serif';
    case "Open Sans":
      return '"Open Sans", system-ui, sans-serif';
    case "Segoe UI":
      return '"Segoe UI", "Segoe UI Variable", system-ui, sans-serif';
    case "Inter":
    default:
      return '"Inter", system-ui, sans-serif';
  }
}
