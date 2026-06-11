// Background: pair with OMnichat, poll X profiles for live, open chat tabs, relay to webhook(s).
"use strict";

const POLL_ALARM = "omni-x-poll";
const ALARM_PERIOD = 1;

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        "webhookUrl",
        "xCaptureEnabled",
        "apiUrl",
        "workspaceId",
        "ingestToken",
        "operatorToken",
        "captureMode",
        "xHandles",
        "captureQueue",
        "liveTabs",
        "status",
      ],
      resolve,
    );
  });
}

async function setStatus(patch) {
  const cur = await new Promise((resolve) =>
    chrome.storage.local.get(["status"], (c) => resolve(c.status || {})),
  );
  await chrome.storage.local.set({ status: { ...cur, ...patch } });
}

function normalizeHandle(raw) {
  return (raw || "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").split("/")[0].toLowerCase();
}

function parseHandlesInput(text) {
  return [...new Set(text.split(/[\s,]+/).map(normalizeHandle).filter(Boolean))];
}

function isSuperAdminMode(cfg) {
  return cfg.captureMode === "super_admin" && Boolean(cfg.operatorToken);
}

async function postToWebhook(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`webhook ${res.status}: ${t.slice(0, 160)}`);
  }
  return res.json().catch(() => ({}));
}

function targetsForHandle(cfg, handle) {
  const normalized = normalizeHandle(handle);
  if (isSuperAdminMode(cfg)) {
    const queue = cfg.captureQueue || { handles: [] };
    const row = (queue.handles || []).find((h) => h.handle === normalized);
    return (row?.targets || []).map((t) => t.webhookUrl).filter(Boolean);
  }
  return cfg.webhookUrl ? [cfg.webhookUrl] : [];
}

async function handleMessage(payload) {
  const cfg = await getConfig();
  if (!cfg.xCaptureEnabled) return { ok: false, reason: "disabled" };

  const handle = normalizeHandle(payload.sourceName || payload.chatname || "");
  const webhooks = targetsForHandle(cfg, handle || "x");
  if (webhooks.length === 0) {
    if (isSuperAdminMode(cfg)) return { ok: false, reason: "handle-not-watched" };
    return { ok: false, reason: "not-paired" };
  }

  const uniqueWebhooks = [...new Set(webhooks)];
  let sent = 0;
  let lastError = "";

  for (const url of uniqueWebhooks) {
    try {
      await postToWebhook(url, payload);
      sent += 1;
    } catch (e) {
      lastError = String(e && e.message ? e.message : e);
    }
  }

  const status = cfg.status || {};
  if (sent > 0) {
    await setStatus({
      lastSentAt: Date.now(),
      sentCount: (status.sentCount || 0) + sent,
      lastError: lastError || "",
    });
    return { ok: true, sent, partialError: lastError || undefined };
  }

  await setStatus({
    lastError: lastError || "post failed",
    lastErrorAt: Date.now(),
  });
  return { ok: false, reason: "post-failed", error: lastError };
}

async function syncCaptureQueue(cfg) {
  if (!isSuperAdminMode(cfg) || !cfg.apiUrl || !cfg.operatorToken) {
    return { handles: [], uniqueHandles: [], subscriberCount: 0 };
  }
  try {
    const url = `${cfg.apiUrl.replace(/\/$/, "")}/api/extension/super-admin/capture-queue?token=${encodeURIComponent(cfg.operatorToken)}`;
    const res = await fetch(url);
    if (!res.ok) return cfg.captureQueue || { handles: [], uniqueHandles: [] };
    const data = await res.json();
    const queue = {
      handles: data.handles || [],
      uniqueHandles: (data.uniqueHandles || []).map(normalizeHandle).filter(Boolean),
      workspaceCount: data.workspaceCount || 0,
      subscriberCount: data.subscriberCount || 0,
    };
    await chrome.storage.local.set({
      captureQueue: queue,
      xHandles: queue.uniqueHandles,
    });
    return queue;
  } catch {
    return cfg.captureQueue || { handles: [], uniqueHandles: [] };
  }
}

async function syncHandlesFromOmni(cfg) {
  if (isSuperAdminMode(cfg)) {
    const queue = await syncCaptureQueue(cfg);
    return queue.uniqueHandles || [];
  }
  if (!cfg.apiUrl || !cfg.workspaceId || !cfg.ingestToken) return cfg.xHandles || [];
  try {
    const url = `${cfg.apiUrl.replace(/\/$/, "")}/api/workspaces/${cfg.workspaceId}/extension/x-state?token=${encodeURIComponent(cfg.ingestToken)}`;
    const res = await fetch(url);
    if (!res.ok) return cfg.xHandles || [];
    const data = await res.json();
    const handles = (data.xHandles || []).map(normalizeHandle).filter(Boolean);
    if (data.webhookUrl) {
      await chrome.storage.local.set({ webhookUrl: data.webhookUrl, xHandles: handles });
    } else {
      await chrome.storage.local.set({ xHandles: handles });
    }
    return handles;
  } catch {
    return cfg.xHandles || [];
  }
}

async function isProfileLive(handle) {
  const url = `https://x.com/${encodeURIComponent(handle)}`;
  const tab = await chrome.tabs.create({ url, active: false, pinned: true });
  try {
    await waitForTabLoad(tab.id, 20000);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (document.querySelector('[data-testid="liveBadge"]')) return true;
        if (document.querySelector('[aria-label="Live"]')) return true;
        if (document.querySelector('a[href*="/i/broadcasts/"]')) return true;
        for (const el of document.querySelectorAll("span, div")) {
          const t = (el.textContent || "").trim();
          if (t === "Live" || t === "LIVE") return true;
        }
        return false;
      },
    });
    return Boolean(result);
  } finally {
    if (tab.id) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitForTabLoad(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("tab load timeout"));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1500);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function ensureChatTab(handle, liveTabs) {
  const chatUrl = `https://x.com/${encodeURIComponent(handle)}/livechat`;
  const existingId = liveTabs[handle];
  if (existingId) {
    try {
      const tab = await chrome.tabs.get(existingId);
      if (tab.url && (tab.url.includes("/livechat") || tab.url.includes("/chat"))) return liveTabs;
    } catch {
      delete liveTabs[handle];
    }
  }
  const tab = await chrome.tabs.create({ url: chatUrl, active: false, pinned: true });
  liveTabs[handle] = tab.id;
  return liveTabs;
}

async function pollLiveProfiles() {
  const cfg = await getConfig();
  const paired = isSuperAdminMode(cfg) || Boolean(cfg.webhookUrl);
  if (!cfg.xCaptureEnabled || !paired) return;

  let handles = await syncHandlesFromOmni(cfg);
  if (handles.length === 0) handles = (cfg.xHandles || []).map(normalizeHandle).filter(Boolean);
  if (handles.length === 0) {
    await setStatus({ lastPollAt: Date.now(), liveHandles: [], watchedHandles: [] });
    return;
  }

  const liveTabs = { ...(cfg.liveTabs || {}) };
  const liveNow = [];

  for (const handle of handles) {
    try {
      const live = await isProfileLive(handle);
      if (live) {
        liveNow.push(handle);
        Object.assign(liveTabs, await ensureChatTab(handle, liveTabs));
      } else if (liveTabs[handle]) {
        chrome.tabs.remove(liveTabs[handle]).catch(() => {});
        delete liveTabs[handle];
      }
    } catch (e) {
      console.warn("[omnichat] live check failed", handle, e);
    }
  }

  await chrome.storage.local.set({ liveTabs });
  await setStatus({
    lastPollAt: Date.now(),
    liveHandles: liveNow,
    watchedHandles: handles,
    subscriberCount: isSuperAdminMode(cfg) ? (cfg.captureQueue?.subscriberCount ?? 0) : undefined,
  });
}

async function pairWithOmni(apiUrl, code, mode) {
  const base = apiUrl.replace(/\/$/, "");
  const isOperator = mode === "super_admin";
  const endpoint = isOperator ? "/api/extension/super-admin/pair" : "/api/extension/pair";
  const res = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.trim().toUpperCase(), apiUrl: base }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `pair failed (${res.status})`);

  if (isOperator) {
    await chrome.storage.local.set({
      apiUrl: base,
      captureMode: "super_admin",
      operatorToken: data.operatorToken,
      captureQueue: {
        handles: data.handles || [],
        uniqueHandles: (data.uniqueHandles || []).map(normalizeHandle),
        workspaceCount: data.workspaceCount || 0,
        subscriberCount: data.subscriberCount || 0,
      },
      xHandles: (data.uniqueHandles || []).map(normalizeHandle),
      xCaptureEnabled: true,
      webhookUrl: "",
      workspaceId: "",
      ingestToken: "",
    });
  } else {
    await chrome.storage.local.set({
      apiUrl: base,
      captureMode: "workspace",
      workspaceId: data.workspaceId,
      ingestToken: data.ingestToken,
      webhookUrl: data.webhookUrl,
      xHandles: (data.xHandles || []).map(normalizeHandle),
      xCaptureEnabled: true,
      operatorToken: "",
      captureQueue: null,
    });
  }

  chrome.alarms.create(POLL_ALARM, { periodInMinutes: ALARM_PERIOD });
  await pollLiveProfiles();
  return data;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["xCaptureEnabled"], (cfg) => {
    if (cfg.xCaptureEnabled) {
      chrome.alarms.create(POLL_ALARM, { periodInMinutes: ALARM_PERIOD });
    }
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void pollLiveProfiles();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "omni-x-message" && msg.payload) {
    handleMessage(msg.payload).then(sendResponse);
    return true;
  }

  if (msg.type === "omni-x-test") {
    handleMessage({
      chatname: "OMnichat Test",
      chatmessage: msg.text || "Test message from the OMnichat X capture extension",
      type: "x",
      sourceName: msg.handle || "x",
      id: `test:${Date.now()}`,
    }).then(sendResponse);
    return true;
  }

  if (msg.type === "omni-x-pair") {
    pairWithOmni(msg.apiUrl, msg.code, msg.mode || "workspace")
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }

  if (msg.type === "omni-x-save-handles") {
    const handles = parseHandlesInput(msg.text || "");
    chrome.storage.local.get(["apiUrl", "workspaceId", "ingestToken", "captureMode"], async (cfg) => {
      if (cfg.captureMode === "super_admin") {
        sendResponse({ ok: false, error: "Operator mode uses handles from all workspaces — add them in OMnichat Channels." });
        return;
      }
      if (cfg.apiUrl && cfg.workspaceId && cfg.ingestToken && handles.length) {
        try {
          const url = `${cfg.apiUrl.replace(/\/$/, "")}/api/workspaces/${cfg.workspaceId}/extension/x-handles?token=${encodeURIComponent(cfg.ingestToken)}`;
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handles }),
          });
        } catch {
          /* local list still works for polling */
        }
      }
      chrome.storage.local.set({ xHandles: handles }, () => {
        void pollLiveProfiles();
        sendResponse({ ok: true, handles });
      });
    });
    return true;
  }

  if (msg.type === "omni-x-poll-now") {
    pollLiveProfiles()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});
