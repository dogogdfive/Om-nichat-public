// Pure, testable DOM extraction for X (Twitter) live chat.
// Exposed on globalThis.OmniXCapture so both the content script and the
// local test fixture (test-fixture.html) can use the exact same logic.
(function () {
  "use strict";

  // X frequently restructures its DOM. These selectors are ordered by
  // preference; update them here when capture stops working.
  const MESSAGE_CONTAINER_SELECTORS = [
    '[data-testid="messageEntry"]',
    '[data-testid="cellInnerDiv"]',
    '[data-testid="tweet"]',
    '[role="listitem"]',
  ];

  const TEXT_SELECTORS = [
    '[data-testid="messageText"]',
    '[data-testid="tweetText"]',
  ];

  const AUTHOR_SELECTORS = [
    '[data-testid="User-Name"]',
    '[data-testid="messageAuthor"]',
    "a[role='link']",
  ];

  function firstMatch(root, selectors) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function extractAuthor(container) {
    const el = firstMatch(container, AUTHOR_SELECTORS);
    if (!el) return "x_user";
    // User-Name renders "Display Name\n@handle"; take the first line.
    const name = cleanText((el.textContent || "").split("\n")[0]);
    return name || "x_user";
  }

  function stableKey(container, author, text) {
    // Prefer a DOM-provided identifier so edits/re-renders don't duplicate.
    const link = container.querySelector("a[href*='/status/']");
    const href = link && link.getAttribute("href");
    if (href) return `href:${href}`;
    const id = container.getAttribute("data-message-id") || container.id;
    if (id) return `id:${id}`;
    return `pair:${author}:${text}`;
  }

  // X live chat (x.com/HANDLE/livechat) uses [data-testid="chatContainer"] with
  // per-message [data-testid="UserAvatar-Container-{username}"] rows.
  function extractLiveChat(doc) {
    const root = doc.querySelector('[data-testid="chatContainer"]');
    if (!root) return null;
    const broadcast =
      typeof location !== "undefined" && doc === document
        ? handleFromPath(location.pathname) || "x"
        : "x";
    const out = [];
    const seen = new Set();
    for (const av of root.querySelectorAll('[data-testid^="UserAvatar-Container-"]')) {
      const username = (av.getAttribute("data-testid") || "")
        .replace("UserAvatar-Container-", "")
        .trim();
      if (!username) continue;
      let row = av;
      for (let i = 0; i < 6 && row.parentElement; i++) {
        row = row.parentElement;
        if (row.childElementCount >= 2) break;
      }
      const full = cleanText(row.innerText || "");
      const marker = "@" + username;
      const idx = full.toLowerCase().indexOf(marker.toLowerCase());
      let text = idx >= 0 ? full.slice(idx + marker.length).trim() : full;
      text = text.replace(/^[·•\-\s]+/, "").trim();
      if (!text) continue;
      const key = "live:" + broadcast + ":" + username + ":" + text;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ author: username, text, key });
    }
    return out;
  }

  /**
   * Extract chat messages from a DOM root.
   * @returns {{author: string, text: string, key: string, handle?: string}[]}
   */
  function extract(root) {
    const doc = root || document;

    const live = extractLiveChat(doc);
    if (live && live.length) return live;

    const containers = new Set();
    for (const sel of MESSAGE_CONTAINER_SELECTORS) {
      doc.querySelectorAll(sel).forEach((el) => containers.add(el));
    }

    const out = [];
    for (const container of containers) {
      const textEl = firstMatch(container, TEXT_SELECTORS);
      const text = cleanText(textEl ? textEl.textContent : "");
      if (!text || text.length < 1) continue;
      const author = extractAuthor(container);
      out.push({ author, text, key: stableKey(container, author, text) });
    }
    return out;
  }

  /** Derive the X handle being watched from a location/path. */
  function handleFromPath(pathname) {
    const parts = (pathname || "").split("/").filter(Boolean);
    if (parts.length === 0) return undefined;
    const reserved = new Set([
      "i",
      "home",
      "explore",
      "notifications",
      "messages",
      "search",
      "settings",
    ]);
    if (reserved.has(parts[0].toLowerCase())) return undefined;
    return parts[0].replace(/^@/, "").toLowerCase();
  }

  globalThis.OmniXCapture = { extract, handleFromPath };
})();
