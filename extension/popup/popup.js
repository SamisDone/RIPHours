// ⚰ RIPHours — Multi-Page Popup Logic (v1.2.2)

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
let ripData = null;
let viewMode = "total";
let searchQuery = "";
let lastRenderedDataStr = "";
let lastRenderedLimitsStr = "";

const DEFAULT_DOMAINS = [
  "reddit.com", "twitter.com", "x.com",
  "youtube.com", "instagram.com", "tiktok.com", "facebook.com"
];

const currentPage = document.body.dataset.page || "dashboard";

// ── Storage Wrapper ───────────────────────────────────────────────
function saveAndSync(dataObj, callback) {
  chrome.storage.local.set(dataObj, () => {
    chrome.storage.sync.set({ riphoursSync: dataObj.riphours }).catch(() => {});
    if (callback) callback();
  });
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtFull(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
function fmtShort(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}
function fmtTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}
function daysSince(ts) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return days + " days ago";
}

// ── Appearance ────────────────────────────────────────────────────
function applyAppearance(mode, accent) {
  const classes = [];
  if (mode === "light") classes.push("mode-light");
  else if (mode === "system") classes.push("mode-system");
  if (accent) classes.push("theme-" + accent);
  document.body.className = classes.join(" ");

  if (currentPage === "settings") {
    $$(".theme-dot").forEach(d => d.classList.toggle("active", d.dataset.theme === accent));
    $$(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  }
}

// ── Today/Total toggle ────────────────────────────────────────────
if (currentPage === "dashboard") {
  $$(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      viewMode = btn.dataset.view;
      if (ripData) render(ripData, true);
    });
  });

  $("#search").addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase();
    if (ripData) renderChart(ripData);
  });
}

// ── Get today's seconds ───────────────────────────────────────────
function getTodaySeconds(rip) {
  const today = new Date().toDateString();
  if (rip._todayDate !== today) {
    rip._todayStart = { ...rip.sites };
    rip._todayDate = today;
    chrome.storage.local.set({ riphours: rip });
  }
  const result = {};
  for (const domain of rip.trackedDomains) {
    const current = rip.sites[domain] || 0;
    const start = rip._todayStart?.[domain] || 0;
    result[domain] = Math.max(0, current - start);
  }
  return result;
}

// ── Render Entry ──────────────────────────────────────────────────
function render(rip, forceRebuild = false) {
  ripData = rip;
  const dataStr = JSON.stringify({ 
    sites: rip.sites, 
    limits: rip.limits, 
    domains: rip.trackedDomains,
    settings: rip.settings 
  });

  const hasDataChanged = dataStr !== lastRenderedDataStr;
  lastRenderedDataStr = dataStr;

  // 1. Core Appearance (always apply to body)
  const mode = rip.settings?.mode || "dark";
  const accent = rip.settings?.theme || "red";
  applyAppearance(mode, accent);

  // 2. Install date (once)
  const sinceEl = $("#since");
  if (sinceEl && rip.installDate && !sinceEl.textContent.trim()) {
    sinceEl.textContent = "since " + daysSince(rip.installDate);
  }

  // 3. Page specific render
  if (currentPage === "dashboard") renderDashboard(rip, hasDataChanged || forceRebuild);
  else if (currentPage === "limits") renderLimitsPage(rip, hasDataChanged || forceRebuild);
  else if (currentPage === "settings") renderSettingsPage(rip, hasDataChanged || forceRebuild);
}

// ── Dashboard Logic ───────────────────────────────────────────────
function renderDashboard(rip, shouldRebuild) {
  // Update Hero Timer (fast)
  let viewSites = rip.sites || {};
  if (viewMode === "today") viewSites = getTodaySeconds(rip);
  const total = Object.values(viewSites).reduce((a, b) => a + b, 0);
  const timeEl = $("#hero-time");
  if (timeEl) timeEl.textContent = fmtFull(total);

  // Live Session Label
  const sessionEl = $("#active-session-label");
  if (sessionEl) {
    if (rip._session?.currentHost && rip._session.isWindowFocused) {
      const activeSecs = Math.max(0, Math.floor((Date.now() - rip._session.continuousStart) / 1000));
      sessionEl.textContent = `Currently on ${rip._session.currentHost} for ${fmtTimer(activeSecs)}`;
      sessionEl.style.display = "inline-block";
    } else {
      sessionEl.style.display = "none";
    }
  }

  // Focus Surge Button
  const surgeBtn = $("#btn-focus-surge");
  if (surgeBtn) {
    const surgeUntil = rip.settings?.focusModeUntil || 0;
    if (Date.now() < surgeUntil) {
      const remaining = Math.max(0, Math.ceil((surgeUntil - Date.now()) / 1000));
      surgeBtn.textContent = `⚡ Focus Active (${fmtTimer(remaining)})`;
      surgeBtn.disabled = true;
    } else {
      surgeBtn.textContent = "⚡ Start Focus Surge (25m)";
      surgeBtn.disabled = false;
    }
  }

  // Complex renders (only if changed)
  if (shouldRebuild || searchQuery) {
    renderChart(rip);
    renderTrends(rip);
  }
}

function renderChart(rip) {
  const chart = $("#chart");
  if (!chart) return;

  const sites = rip.sites || {};
  const limits = rip.limits || {};
  const domains = rip.trackedDomains || [];
  let viewSites = (viewMode === "today") ? getTodaySeconds(rip) : sites;

  let filtered = [...domains];
  if (searchQuery) filtered = filtered.filter(d => d.includes(searchQuery));
  
  const sorted = filtered.sort((a, b) => (viewSites[b] || 0) - (viewSites[a] || 0));
  const maxVal = Math.max(...sorted.map(d => viewSites[d] || 0), 1);
  
  chart.innerHTML = "";
  if (sorted.length === 0) {
    chart.innerHTML = `<div class="empty-msg">${searchQuery ? "No matches." : "No sites tracked yet."}</div>`;
    return;
  }

  sorted.forEach(domain => {
    const secs = viewSites[domain] || 0;
    const pct = Math.max((secs / maxVal) * 100, secs > 0 ? 2 : 1);
    const limit = limits[domain];

    let barClass = "normal";
    let limitClass = "";
    if (limit) {
      const ratio = secs / limit;
      if (ratio >= 1) { barClass = "over"; limitClass = "over"; }
      else if (ratio >= 0.75) { barClass = "warn"; limitClass = "warn"; }
    }

    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label">
        <a class="domain" href="https://${domain}" target="_blank">${domain}</a>
        <span class="time-info"><span class="time">${fmtShort(secs)}</span>${limit ? `<span class="limit-tag ${limitClass}">/ ${Math.floor(limit / 60)}m</span>` : ""}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${barClass}" style="width:${pct}%"></div>
        ${limit ? `<div class="limit-marker" style="left:${Math.min((limit / maxVal) * 100, 100)}%"></div>` : ""}
      </div>
    `;
    chart.appendChild(row);
  });
}

function renderTrends(rip) {
  const container = $("#trend-chart");
  if (!container) return;
  const history = rip.history || {};
  container.innerHTML = "";

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const total = history[key] ? Object.values(history[key]).reduce((a, b) => a + b, 0) : 0;
    days.push({ label: dayNames[d.getDay()], total, isToday: i === 0 });
  }

  if (days[6].total === 0) days[6].total = Object.values(rip.sites || {}).reduce((a, b) => a + b, 0);

  const maxDay = Math.max(...days.map(d => d.total), 1);
  days.forEach(day => {
    const wrap = document.createElement("div");
    wrap.className = "trend-bar-wrap" + (day.isToday ? " today" : "");
    const pct = Math.max((day.total / maxDay) * 100, 3);
    wrap.innerHTML = `
      <div class="trend-bar" style="height:${pct}%" title="${fmtShort(day.total)}"></div>
      <span class="trend-day">${day.label}</span>
    `;
    container.appendChild(wrap);
  });
}

// ── Limits Page ───────────────────────────────────────────────────
function renderLimitsPage(rip, shouldRebuild) {
  const limitsStr = JSON.stringify({ limits: rip.limits, domains: rip.trackedDomains });
  const limitsChanged = limitsStr !== lastRenderedLimitsStr;
  if (!limitsChanged && !shouldRebuild) return;
  // Only rebuild DOM when limits or domains actually changed
  if (!limitsChanged) return;
  lastRenderedLimitsStr = limitsStr;
  const list = $("#limits-list");
  if (!list) return;
  
  const domains = rip.trackedDomains || [];
  const limits = rip.limits || {};
  list.innerHTML = "";

  if (domains.length === 0) {
    list.innerHTML = '<div class="empty-msg">Add domains in Settings first.</div>';
    return;
  }

  [...domains].sort().forEach(domain => {
    const current = limits[domain] ? Math.floor(limits[domain] / 60) : "";
    const row = document.createElement("div");
    row.className = "limit-row";
    row.innerHTML = `
      <span class="domain-name">${domain}</span>
      <div class="limit-input-wrap">
        <input type="number" min="1" placeholder="—" value="${current}" data-domain="${domain}">
        <span class="unit">min</span>
        <button class="save-btn" data-domain="${domain}">Set</button>
      </div>
    `;
    list.appendChild(row);
  });

  function saveLimit(domain) {
    const mins = parseInt(list.querySelector(`input[data-domain="${domain}"]`).value);
    chrome.storage.local.get("riphours", (data) => {
      const activeRip = data.riphours || ripData;
      activeRip.limits = activeRip.limits || {};
      const currentLimit = activeRip.limits[domain];
      const newLimit = (!mins || mins <= 0) ? null : mins * 60;
      const isRelaxing = (currentLimit && !newLimit) || (currentLimit && newLimit && newLimit > currentLimit);

      const applyLimit = () => {
        if (!newLimit) delete activeRip.limits[domain];
        else activeRip.limits[domain] = newLimit;
        saveAndSync({ riphours: activeRip }, () => {
          ripData = activeRip;
          toast(newLimit ? `Limit set: ${mins}m for ${domain}` : `Limit removed for ${domain}`);
        });
      };

      if (isRelaxing) requireIronWill(applyLimit); else applyLimit();
    });
  }

  list.querySelectorAll(".save-btn").forEach(btn => {
    btn.addEventListener("click", () => saveLimit(btn.dataset.domain));
  });

  list.querySelectorAll("input[data-domain]").forEach(input => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveLimit(input.dataset.domain);
    });
  });
}

// ── Settings Page ─────────────────────────────────────────────────
function renderSettingsPage(rip, shouldRebuild) {
  const altInput = $("#better-alternatives");
  if (altInput && document.activeElement !== altInput) {
    altInput.value = rip.settings?.alternatives || "";
  }

  const hb = rip.settings?.hardBlock !== false;
  const toggle = $("#hard-block-toggle");
  if (toggle) toggle.classList.toggle("on", hb);

  if (shouldRebuild) {
    const domainList = $("#domain-list");
    if (domainList) {
      domainList.innerHTML = "";
      [...(rip.trackedDomains || [])].sort().forEach(d => {
        const item = document.createElement("div");
        item.className = "domain-item";
        item.innerHTML = `<a href="https://${d}" target="_blank">${d}</a><button class="del-btn" data-domain="${d}">×</button>`;
        domainList.appendChild(item);
      });
    }
  }
}

// ── Event Handlers ────────────────────────────────────────────────
if (currentPage === "dashboard") {
  $("#btn-share")?.addEventListener("click", () => {
    const total = Object.values(ripData.sites || {}).reduce((a, b) => a + b, 0);
    $("#card-time").textContent = fmtFull(total);
    $("#share-card-container").classList.add("open");
  });
  $("#btn-close-share")?.addEventListener("click", () => {
    $("#share-card-container").classList.remove("open");
  });
  $("#btn-copy-share")?.addEventListener("click", async () => {
    const btn = $("#btn-copy-share");
    const card = $("#card");
    btn.textContent = "Generating...";
    btn.disabled = true;
    try {
      const canvas = await html2canvas(card, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || "#0D0D0D",
        scale: 2,
      });
      canvas.toBlob(async (blob) => {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast("Image copied to clipboard!");
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy Image"; btn.disabled = false; }, 2000);
      }, "image/png");
    } catch (err) {
      btn.textContent = "Error";
      setTimeout(() => { btn.textContent = "Copy Image"; btn.disabled = false; }, 2000);
    }
  });
  $("#btn-focus-surge")?.addEventListener("click", () => {
    ripData.settings = ripData.settings || {};
    ripData.settings.focusModeUntil = Date.now() + 25 * 60 * 1000;
    saveAndSync({ riphours: ripData }, () => {
      toast("Focus Surge active!");
      render(ripData, true);
    });
  });
}

if (currentPage === "settings") {
  $("#add-btn")?.addEventListener("click", addDomain);
  $("#new-domain")?.addEventListener("keydown", (e) => { if (e.key === "Enter") addDomain(); });
  $("#domain-list")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("del-btn")) {
      const domain = e.target.dataset.domain;
      ripData.trackedDomains = ripData.trackedDomains.filter(d => d !== domain);
      delete ripData.sites[domain];
      if (ripData.limits) delete ripData.limits[domain];
      saveAndSync({ riphours: ripData }, () => toast("Removed " + domain));
    }
  });
  $("#hard-block-toggle")?.addEventListener("click", () => {
    const on = !$("#hard-block-toggle").classList.contains("on");
    const apply = () => {
      ripData.settings.hardBlock = on;
      saveAndSync({ riphours: ripData }, () => toast(on ? "Hard block enabled" : "Hard block disabled"));
    };
    if (!on) requireIronWill(apply); else apply();
  });
  $("#better-alternatives")?.addEventListener("input", (e) => {
    ripData.settings.alternatives = e.target.value;
    saveAndSync({ riphours: ripData });
  });
  $$(".mode-btn").forEach(btn => btn.addEventListener("click", () => {
    ripData.settings.mode = btn.dataset.mode;
    saveAndSync({ riphours: ripData }, () => applyAppearance(btn.dataset.mode, ripData.settings.theme));
  }));
  $$(".theme-dot").forEach(dot => dot.addEventListener("click", () => {
    ripData.settings.theme = dot.dataset.theme;
    saveAndSync({ riphours: ripData }, () => applyAppearance(ripData.settings.mode, dot.dataset.theme));
  }));
  $("#btn-export-csv")?.addEventListener("click", () => {
    const history = ripData.history || {};
    const dates = Object.keys(history).sort();
    if (dates.length === 0) return toast("No history.");
    const allDomains = Array.from(new Set(dates.flatMap(d => Object.keys(history[d])))).sort();
    let csv = "Date," + allDomains.join(",") + "\n";
    dates.forEach(d => csv += d + "," + allDomains.map(dom => history[d][dom] || 0).join(",") + "\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    chrome.downloads.download({ url, filename: "riphours-history.csv", saveAs: true });
  });
  $("#export-btn")?.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(ripData, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "riphours-backup.json"; a.click();
    toast("Backup exported.");
  });
  $("#reset-btn")?.addEventListener("click", () => $("#reset-overlay").classList.add("open"));
  $("#reset-cancel")?.addEventListener("click", () => $("#reset-overlay").classList.remove("open"));
  $("#reset-input")?.addEventListener("input", () => $("#reset-confirm").disabled = $("#reset-input").value !== "RESET");
  $("#reset-confirm")?.addEventListener("click", () => {
    saveAndSync({ riphours: { sites: {}, trackedDomains: [...DEFAULT_DOMAINS], installDate: Date.now(), limits: {}, history: {}, settings: { hardBlock: true, theme: "red", mode: "dark" } } }, 
    () => { $("#reset-overlay").classList.remove("open"); toast("Cleared."); });
  });
}

function addDomain() {
  let raw = $("#new-domain").value.trim().toLowerCase();
  if (!raw) return;
  raw = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!/^[a-z0-9]([a-z0-9\-]*\.)+[a-z]{2,}$/.test(raw) || ripData.trackedDomains.includes(raw)) return toast("Invalid or duplicate.");
  ripData.trackedDomains.push(raw);
  saveAndSync({ riphours: ripData }, () => { $("#new-domain").value = ""; toast("Added " + raw); });
}

// ── Iron Will Helper ──────────────────────────────────────────────
function requireIronWill(callback) {
  const phrase = "I am choosing to waste my limited time on earth doing nothing.";
  const input = $("#iron-will-input");
  const confirmBtn = $("#iron-will-confirm");
  const overlay = $("#iron-will-overlay");
  input.value = ""; confirmBtn.disabled = true; overlay.classList.add("open"); input.focus();

  const onConfirm = () => { if (input.value === phrase) { overlay.classList.remove("open"); callback(); cleanup(); } };
  const onCancel = () => { overlay.classList.remove("open"); cleanup(); };
  const onInput = () => confirmBtn.disabled = input.value !== phrase;
  const cleanup = () => { confirmBtn.removeEventListener("click", onConfirm); $("#iron-will-cancel").removeEventListener("click", onCancel); input.removeEventListener("input", onInput); };
  
  confirmBtn.addEventListener("click", onConfirm);
  $("#iron-will-cancel").addEventListener("click", onCancel);
  input.addEventListener("input", onInput);
}

// ── Init ──────────────────────────────────────────────────────────
chrome.storage.local.get("riphours", async (data) => {
  if (data.riphours) {
    data.riphours.settings = data.riphours.settings || { hardBlock: true, theme: "red", mode: "dark" };
    const session = await chrome.storage.session.get(null);
    data.riphours._session = session;
    render(data.riphours, true);
  }
});

setInterval(async () => {
  chrome.runtime.sendMessage({ type: "force-flush" });
  const data = await chrome.storage.local.get("riphours");
  if (data.riphours) {
    const session = await chrome.storage.session.get(null);
    data.riphours._session = session;
    render(data.riphours);
  }
}, 1000);
