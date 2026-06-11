// Injected on x.com profile pages to detect whether the user is live.
function omniDetectXLive() {
  if (document.querySelector('[data-testid="liveBadge"]')) return true;
  if (document.querySelector('[aria-label="Live"]')) return true;
  if (document.querySelector('a[href*="/i/broadcasts/"]')) return true;
  if (document.querySelector('a[href$="/chat"]')) return true;
  if (document.querySelector('a[href$="/livechat"]')) return true;
  for (const el of document.querySelectorAll("span, div")) {
    const t = (el.textContent || "").trim();
    if (t === "Live" || t === "LIVE") return true;
  }
  return false;
}
