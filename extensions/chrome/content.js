// Content script: observe X live chat, dedupe, relay to the background worker
// which forwards messages to the OMnichat SSN webhook.
(function () {
  "use strict";

  const HOST_OK = /(^|\.)x\.com$|(^|\.)twitter\.com$/.test(location.hostname);
  if (!HOST_OK) return;

  const capture = globalThis.OmniXCapture;
  if (!capture) {
    console.warn("[omnichat] capture.js not loaded");
    return;
  }

  let enabled = false;
  let webhookUrl = "";
  const seen = new Set();

  function rememberKey(key) {
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > 1000) {
      // Drop the oldest ~half to bound memory.
      const keep = [...seen].slice(-500);
      seen.clear();
      keep.forEach((k) => seen.add(k));
    }
    return true;
  }

  function flush() {
    if (!enabled || !webhookUrl) return;
    const handle = capture.handleFromPath(location.pathname);
    const messages = capture.extract(document);
    for (const msg of messages) {
      if (!rememberKey(msg.key)) continue;
      chrome.runtime.sendMessage({
        type: "omni-x-message",
        payload: {
          chatname: msg.author,
          chatmessage: msg.text,
          type: "x",
          sourceName: handle || "x",
          id: msg.key,
        },
      });
    }
  }

  let scheduled = false;
  function scheduleFlush() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try {
        flush();
      } catch (e) {
        console.warn("[omnichat] flush failed", e);
      }
    }, 400);
  }

  function loadConfig(cb) {
    chrome.storage.local.get(["xCaptureEnabled", "webhookUrl", "captureMode", "operatorToken"], (cfg) => {
      enabled = Boolean(cfg.xCaptureEnabled);
      const operator = cfg.captureMode === "super_admin" && Boolean(cfg.operatorToken);
      webhookUrl = cfg.webhookUrl || (operator ? "super_admin" : "");
      if (cb) cb();
    });
  }

  const observer = new MutationObserver(scheduleFlush);

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleFlush();
    console.log("[omnichat] X live capture active", { enabled, hasWebhook: !!webhookUrl });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.xCaptureEnabled) enabled = Boolean(changes.xCaptureEnabled.newValue);
    if (changes.webhookUrl) {
      const operator =
        changes.captureMode?.newValue === "super_admin" ||
        (changes.operatorToken && changes.operatorToken.newValue);
      webhookUrl = changes.webhookUrl.newValue || (operator ? "super_admin" : "");
    }
    if (changes.captureMode || changes.operatorToken) {
      const mode = changes.captureMode?.newValue;
      const token = changes.operatorToken?.newValue;
      if (mode === "super_admin" && token) webhookUrl = "super_admin";
    }
  });

  loadConfig(start);
})();
