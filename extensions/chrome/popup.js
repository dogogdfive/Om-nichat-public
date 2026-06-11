"use strict";

const $ = (id) => document.getElementById(id);

function fmtTime(ts) {
  if (!ts) return "never";
  return new Date(ts).toLocaleTimeString();
}

function selectedPairMode() {
  const el = document.querySelector('input[name="pairMode"]:checked');
  return el ? el.value : "super_admin";
}

function renderStatus(cfg) {
  const status = cfg.status || {};
  const el = $("status");
  const operator = cfg.captureMode === "super_admin" && cfg.operatorToken;
  const paired = operator || Boolean(cfg.webhookUrl && cfg.workspaceId);

  $("pair-section").hidden = paired;
  $("watch-section").hidden = !paired;
  $("operator-note").hidden = !operator;
  $("workspace-handles").hidden = Boolean(operator);
  $("save").hidden = Boolean(operator);

  if (!paired) {
    el.textContent = "Pair with a code from OMnichat (Operator code on /admin or Settings for super admin).";
    return;
  }

  const handles = cfg.xHandles || [];
  const live = status.liveHandles || [];
  const lines = [];

  if (operator) {
    lines.push('<span class="pill operator">Operator mode</span> · all workspaces');
    const subs = cfg.captureQueue?.subscriberCount ?? status.subscriberCount ?? 0;
    if (subs) lines.push(`Routing to <strong>${subs}</strong> workspace subscription(s)`);
  } else {
    lines.push(`<span class="ok">Paired</span> · workspace ${cfg.workspaceId.slice(0, 8)}…`);
  }

  lines.push(`Watching: ${handles.length ? handles.map((h) => `@${h}`).join(", ") : "(none yet)"}`);
  if (live.length) {
    lines.push(`Live now: ${live.map((h) => `<span class="pill live">@${h}</span>`).join("")}`);
  } else {
    lines.push("Live now: none (checks every ~1 min)");
  }
  lines.push(`Sent: <strong>${status.sentCount || 0}</strong> · last ${fmtTime(status.lastSentAt)}`);
  lines.push(`Last check: ${fmtTime(status.lastPollAt)}`);
  if (status.lastError) {
    lines.push(`<span class="err">${status.lastError}</span>`);
  }
  el.innerHTML = lines.join("<br />");

  if (!operator && handles.length && !$("handles").value.trim()) {
    $("handles").value = handles.map((h) => `@${h}`).join("\n");
  }
}

function loadAll() {
  chrome.storage.local.get(
    [
      "apiUrl",
      "workspaceId",
      "webhookUrl",
      "xHandles",
      "xCaptureEnabled",
      "status",
      "captureMode",
      "operatorToken",
      "captureQueue",
    ],
    (cfg) => {
      if (cfg.apiUrl) $("apiUrl").value = cfg.apiUrl;
      $("enabled").checked = cfg.xCaptureEnabled !== false;
      if (cfg.captureMode === "workspace") {
        const ws = document.querySelector('input[name="pairMode"][value="workspace"]');
        if (ws) ws.checked = true;
      }
      renderStatus(cfg);
    },
  );
}

$("pair").addEventListener("click", () => {
  const apiUrl = $("apiUrl").value.trim();
  const code = $("pairCode").value.trim();
  if (!apiUrl || !code) {
    $("status").innerHTML = '<span class="err">Enter API URL and pairing code.</span>';
    return;
  }
  $("pair").disabled = true;
  chrome.runtime.sendMessage(
    { type: "omni-x-pair", apiUrl, code, mode: selectedPairMode() },
    (res) => {
      $("pair").disabled = false;
      if (res && res.ok) {
        $("status").innerHTML =
          selectedPairMode() === "super_admin"
            ? '<span class="ok">Operator paired! Leave Chrome running — users add handles in OMnichat.</span>'
            : '<span class="ok">Paired! Add X profiles below.</span>';
        loadAll();
      } else {
        $("status").innerHTML = `<span class="err">${res?.error || "Pair failed"}</span>`;
      }
    },
  );
});

$("save").addEventListener("click", () => {
  const text = $("handles").value;
  const xCaptureEnabled = $("enabled").checked;
  chrome.storage.local.set({ xCaptureEnabled }, () => {
    chrome.runtime.sendMessage({ type: "omni-x-save-handles", text }, (res) => {
      if (res && res.error) {
        $("status").innerHTML = `<span class="err">${res.error}</span>`;
        return;
      }
      if (res && res.ok) loadAll();
    });
  });
});

$("enabled").addEventListener("change", () => {
  chrome.storage.local.set({ xCaptureEnabled: $("enabled").checked }, loadAll);
});

$("poll").addEventListener("click", () => {
  $("poll").disabled = true;
  chrome.runtime.sendMessage({ type: "omni-x-poll-now" }, () => {
    $("poll").disabled = false;
    setTimeout(loadAll, 800);
  });
});

$("test").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "omni-x-test" }, (res) => {
    if (res && res.ok) {
      $("status").innerHTML = '<span class="ok">Test message sent — check OMnichat /chat.</span>';
      setTimeout(loadAll, 1200);
    } else {
      $("status").innerHTML = `<span class="err">Test failed: ${res?.error || res?.reason || "?"}</span>`;
    }
  });
});

loadAll();
