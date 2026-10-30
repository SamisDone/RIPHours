// RIPHours service worker. It is the only code that writes usage or config;
// pages and content scripts ask for changes through messages.

import {
  ACCENTS, BREAK_INTERVAL_S, DATA_KEY, DEVICE_KEY, FOCUS_MS, IDLE_MS, LEGACY_SYNC_KEY,
  MAX_CREDIT_MS, MAX_LIMIT_S, RECAP_HOUR, RECAP_MIN_S, SCHEMA, SNOOZE_MS, STREAK_GAP_MS, SYNC_KEY,
  DAILY_RETENTION_DAYS, badgeText, createDefaultData, dayKey, formatDuration, formatWords, hostOf,
  isObj, matchDomain, migrate, normalizeDomain, parseAlternatives, sanitizeData, sanitizeSettings,
  shiftDay, sumTracked,
} from "../shared/core.js";

const SCRIPT_ID = "riphours-tracker";
const MENU_ID = "riphours-track-site";
const HEARTBEAT_ALARM = "heartbeat";
const FOCUS_ALARM = "focus-end";
const PERSIST_DELAY_MS = 5000;
const SYNC_DELAY_MS = 2000;
const EXTENSION_ORIGIN = chrome.runtime.getURL("");
const ICON = chrome.runtime.getURL("icons/icon128.png");

let data = null;
let deviceId = null;
let tracker = freshTracker();

function freshTracker() {
  return {
    domain: null,         // tracked domain being credited right now
    tabId: null,
    lastTick: 0,          // last time credit() ran
    lastActivityAt: 0,    // last input or playing media reported by the page
    carryMs: 0,           // sub-second remainder carried between credits
    streakSeconds: 0,
    streakLastAt: 0,
    breaksSent: 0,
    alerted: { day: "", domains: [] },
    snoozed: {},          // domain -> timestamp the snooze runs out
    overlayTab: null,     // tab currently showing the soft-limit overlay
    day: "",              // local day the per-day state above belongs to
  };
}

// ── Serialization ─────────────────────────────────────────────────
// Every mutation runs through this queue, so two events can never
// interleave a read-modify-write. Functions called from inside a queued
// task must not call serial() themselves and wait for it.

let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task);
  queue = run.catch((err) => console.error("RIPHours:", err));
  return run;
}

// ── Persistence ───────────────────────────────────────────────────

let persistTimer = null;

function markDirty() {
  persistTimer ??= setTimeout(() => {
    persistTimer = null;
    serial(persist);
  }, PERSIST_DELAY_MS);
}

// Usage and tracker state are written together. If the worker dies between
// writes, both are stale by the same amount and no time is credited twice.
async function persist() {
  clearTimeout(persistTimer);
  persistTimer = null;
  await chrome.storage.local.set({ [DATA_KEY]: data });
  await chrome.storage.session.set({ tracker });
}

let syncTimer = null;

function schedulePush() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const { focusUntil, ...settings } = data.settings;
    chrome.storage.sync.set({
      [SYNC_KEY]: {
        trackedDomains: data.trackedDomains,
        limits: data.limits,
        settings,
        updatedAt: data.configUpdatedAt,
        device: deviceId,
      },
    }).catch((err) => console.warn("RIPHours: sync push failed", err));
  }, SYNC_DELAY_MS);
}

function applyRemote(config) {
  if (!isObj(config) || config.device === deviceId) return false;
  if (!Number.isFinite(config.updatedAt) || config.updatedAt <= data.configUpdatedAt) return false;
  const next = sanitizeData({
    ...data,
    trackedDomains: Array.isArray(config.trackedDomains) ? config.trackedDomains : data.trackedDomains,
    limits: config.limits,
    settings: { ...data.settings, ...sanitizeSettings(config.settings, data.settings), focusUntil: data.settings.focusUntil },
  });
  data.trackedDomains = next.trackedDomains;
  data.limits = next.limits;
  data.settings = next.settings;
  data.configUpdatedAt = config.updatedAt;
  return true;
}

// ── Startup ───────────────────────────────────────────────────────

async function init() {
  const stored = await chrome.storage.local.get([DATA_KEY, DEVICE_KEY]);
  deviceId = stored[DEVICE_KEY];
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ [DEVICE_KEY]: deviceId });
  }

  const raw = stored[DATA_KEY];
  data = migrate(raw);
  if (raw?.schema !== SCHEMA) {
    await chrome.storage.local.set({ [DATA_KEY]: data });
    // Schema 1 synced cumulative history, which no longer means anything.
    chrome.storage.sync.remove(LEGACY_SYNC_KEY).catch(() => {});
  }

  const session = await chrome.storage.session.get("tracker");
  if (isObj(session.tracker)) tracker = { ...freshTracker(), ...session.tracker };
  // Without this, the first heartbeat would mistake startup for midnight and
  // drop today's snoozes and sent alerts.
  tracker.day ||= dayKey();

  const remote = await chrome.storage.sync.get(SYNC_KEY).catch(() => ({}));
  if (applyRemote(remote[SYNC_KEY])) await persist();

  const now = Date.now();
  if (data.settings.focusUntil && data.settings.focusUntil <= now) await endFocus();
  else if (data.settings.focusUntil) chrome.alarms.create(FOCUS_ALARM, { when: data.settings.focusUntil });

  if (!(await chrome.alarms.get(HEARTBEAT_ALARM))) {
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
  }

  await syncContentScripts();
  await refresh(now);
  updateBadge(now);
}

serial(init);

chrome.runtime.onInstalled.addListener(({ reason }) => serial(async () => {
  setupMenu();
  // Pages that were open before install or update have no tracker yet.
  await syncContentScripts({ inject: data.trackedDomains });
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("pages/welcome/welcome.html") });
}));

chrome.runtime.onStartup.addListener(() => serial(() => refresh()));

// ── Tracking ──────────────────────────────────────────────────────

function usedToday(domain, now = Date.now()) {
  return data.daily[dayKey(now)]?.[domain] || 0;
}

// Credits time since the last call, but never past a minute after the last
// reported activity. Call it before changing lastActivityAt or the tracked
// tab, so time the worker spent asleep is not credited later.
function credit(now = Date.now()) {
  if (!tracker.domain) {
    tracker.lastTick = now;
    return 0;
  }
  const until = Math.min(now, tracker.lastActivityAt + IDLE_MS);
  let ms = until - tracker.lastTick;
  tracker.lastTick = Math.max(tracker.lastTick, now);
  if (ms <= 0) return 0;

  ms = Math.min(ms, MAX_CREDIT_MS) + tracker.carryMs;
  const secs = Math.floor(ms / 1000);
  tracker.carryMs = ms - secs * 1000;
  if (!secs) return 0;

  const domain = tracker.domain;
  const key = dayKey(now);
  data.totals[domain] = (data.totals[domain] || 0) + secs;
  data.daily[key] ??= {};
  data.daily[key][domain] = (data.daily[key][domain] || 0) + secs;
  addToStreak(secs, now);
  markDirty();
  return secs;
}

function addToStreak(secs, now) {
  if (now - tracker.streakLastAt > STREAK_GAP_MS + secs * 1000) {
    tracker.streakSeconds = 0;
    tracker.breaksSent = 0;
  }
  tracker.streakSeconds += secs;
  tracker.streakLastAt = now;

  const breaks = Math.floor(tracker.streakSeconds / BREAK_INTERVAL_S);
  if (breaks > tracker.breaksSent) {
    tracker.breaksSent = breaks;
    if (data.settings.breakReminders) {
      notify(`break-${now}`, `${breaks * 30} minutes straight on tracked sites`,
        "Stand up, look at something far away, drink water.");
    }
  }
}

function isCounting(now = Date.now()) {
  return Boolean(tracker.domain) && now - tracker.lastActivityAt < IDLE_MS;
}

// Works out which tracked domain, if any, the user is looking at right now.
async function refresh(now = Date.now()) {
  credit(now);

  let tab = null;
  try {
    const win = await chrome.windows.getLastFocused({ populate: true });
    if (win?.focused) tab = win.tabs?.find((t) => t.active) ?? null;
  } catch {}

  let domain = tab ? matchDomain(hostOf(tab.url), data.trackedDomains) : null;
  if (domain && enforceTab(tab, now)) domain = null;
  if (tab?.incognito) domain = null;
  const tabId = domain ? tab.id : null;

  if (domain !== tracker.domain || tabId !== tracker.tabId) {
    Object.assign(tracker, { domain, tabId, lastTick: now, carryMs: 0, overlayTab: null });
    // Switching to a tab is an action, so it counts as activity.
    if (domain) tracker.lastActivityAt = now;
    markDirty();
  }

  ensureTicking();
  if (domain) await enforceLimit(domain, now);
}

let ticker = null;

function ensureTicking() {
  if (tracker.domain && !ticker) {
    ticker = setInterval(() => serial(tick), 1000);
  } else if (!tracker.domain && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

async function tick() {
  const now = Date.now();
  if (credit(now) && tracker.domain) await enforceLimit(tracker.domain, now);
  updateBadge(now);
}

async function heartbeat() {
  const now = Date.now();
  credit(now);
  if (data.settings.focusUntil && data.settings.focusUntil <= now) await endFocus();

  const today = dayKey(now);
  if (tracker.day !== today) {
    tracker.day = today;
    tracker.alerted = { day: today, domains: [] };
    tracker.snoozed = {};
    pruneDaily(today);
    markDirty();
  }

  maybeRecap(now);
  await refresh(now);
  updateBadge(now);
}

function pruneDaily(today) {
  const oldest = shiftDay(today, -(DAILY_RETENTION_DAYS - 1));
  for (const key of Object.keys(data.daily)) if (key < oldest) delete data.daily[key];
}

function maybeRecap(now) {
  const today = dayKey(now);
  if (!data.settings.nightlyRecap || data.recapSentOn === today) return;
  if (new Date(now).getHours() < RECAP_HOUR) return;
  const day = data.daily[today] || {};
  const total = sumTracked(day, data.trackedDomains);
  if (total < RECAP_MIN_S) return;
  const [top, topSecs] = data.trackedDomains
    .map((d) => [d, day[d] || 0])
    .sort((a, b) => b[1] - a[1])[0];
  notify(`recap-${today}`, `Today on tracked sites: ${formatDuration(total)}`,
    `Most of it went to ${top} (${formatDuration(topSecs)}).`);
  data.recapSentOn = today;
  markDirty();
}

// ── Limits and blocking ───────────────────────────────────────────

function blockReason(domain, now = Date.now()) {
  if (data.settings.focusUntil > now) return "focus";
  const limit = data.limits[domain];
  if (data.settings.hardBlock && limit && usedToday(domain, now) >= limit) return "limit";
  return null;
}

function blockedUrl(domain, reason, from) {
  const params = new URLSearchParams({ site: domain, reason });
  if (from) params.set("from", from);
  return chrome.runtime.getURL(`pages/blocked/blocked.html?${params}`);
}

// Redirects the tab if its domain is blocked. Returns true if it did.
function enforceTab(tab, now = Date.now()) {
  const domain = matchDomain(hostOf(tab?.url), data.trackedDomains);
  const reason = domain && blockReason(domain, now);
  if (!reason) return false;
  chrome.tabs.update(tab.id, { url: blockedUrl(domain, reason, tab.url) }).catch(() => {});
  return true;
}

async function enforceAll(now = Date.now()) {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) enforceTab(tab, now);
}

async function enforceLimit(domain, now) {
  const limit = data.limits[domain];
  if (!limit) return;
  const used = usedToday(domain, now);
  if (used < limit) return;
  if (data.settings.focusUntil > now) return;

  const today = dayKey(now);
  if (tracker.alerted.day !== today) tracker.alerted = { day: today, domains: [] };
  const first = !tracker.alerted.domains.includes(domain);
  if (first) {
    tracker.alerted.domains.push(domain);
    markDirty();
    playSound();
  }

  if (data.settings.hardBlock) {
    if (first) {
      notify(`limit-${domain}`, `${domain} is blocked`,
        `You hit your ${formatDuration(limit)} daily limit. It unlocks at midnight.`);
    }
    await enforceAll(now);
    return;
  }

  if (first) {
    notify(`limit-${domain}`, `Limit reached on ${domain}`,
      `Your ${formatDuration(limit)} daily limit is used up. Snoozing buys 10 minutes at a time.`);
  }
  if ((tracker.snoozed[domain] || 0) > now) return;
  if (tracker.domain !== domain || tracker.tabId === null || tracker.overlayTab === tracker.tabId) return;

  const tabId = tracker.tabId;
  tracker.overlayTab = tabId;
  chrome.tabs.sendMessage(tabId, {
    type: "show-overlay",
    domain,
    spent: formatWords(used),
    limit: formatWords(limit),
    accent: ACCENTS[data.settings.theme],
  }).catch(() => {
    // No tracker in the page yet; try again on the next tick.
    if (tracker.overlayTab === tabId) tracker.overlayTab = null;
  });
}

function hideOverlayIfLifted(now = Date.now()) {
  const tabId = tracker.overlayTab;
  if (tabId === null) return;
  const domain = tracker.domain;
  const limit = domain && data.limits[domain];
  if (domain && limit && !data.settings.hardBlock && usedToday(domain, now) >= limit) return;
  tracker.overlayTab = null;
  chrome.tabs.sendMessage(tabId, { type: "hide-overlay" }).catch(() => {});
}

async function startFocus() {
  const now = Date.now();
  if (data.settings.focusUntil > now) return;
  credit(now);
  data.settings.focusUntil = now + FOCUS_MS;
  await persist();
  chrome.alarms.create(FOCUS_ALARM, { when: data.settings.focusUntil });
  hideOverlayIfLifted(now);
  await enforceAll(now);
  await refresh(now);
}

async function endFocus() {
  const wasRunning = data.settings.focusUntil > 0;
  data.settings.focusUntil = 0;
  await chrome.alarms.clear(FOCUS_ALARM);
  await persist();
  if (wasRunning) {
    notify("focus-end", "Focus Surge complete", "25 minutes, reclaimed. Your sites are unblocked.");
  }
}

// ── Config changes ────────────────────────────────────────────────

async function configChanged({ added = [], push = true } = {}) {
  const now = Date.now();
  if (push) {
    data.configUpdatedAt = now;
    schedulePush();
  }
  await persist();
  await syncContentScripts({ inject: added });
  hideOverlayIfLifted(now);
  await enforceAll(now);
  await refresh(now);
  updateBadge(now);
}

function resetAlert(domain) {
  tracker.alerted.domains = tracker.alerted.domains.filter((d) => d !== domain);
  delete tracker.snoozed[domain];
}

async function syncContentScripts({ inject = [] } = {}) {
  const matches = data.trackedDomains.map((d) => `*://*.${d}/*`).sort();
  try {
    const [current] = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (!matches.length) {
      if (current) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    } else if (!current) {
      await chrome.scripting.registerContentScripts([{
        id: SCRIPT_ID,
        js: ["content/tracker.js"],
        matches,
        runAt: "document_idle",
        persistAcrossSessions: true,
      }]);
    } else if ([...current.matches].sort().join() !== matches.join()) {
      await chrome.scripting.updateContentScripts([{ id: SCRIPT_ID, matches }]);
    }
  } catch (err) {
    console.warn("RIPHours: content script registration failed", err);
  }

  if (!inject.length) return;
  const tabs = await chrome.tabs.query({ url: inject.map((d) => `*://*.${d}/*`) }).catch(() => []);
  await Promise.all(tabs.map((tab) => chrome.scripting
    .executeScript({ target: { tabId: tab.id }, files: ["content/tracker.js"] })
    .catch(() => {})));
}

// ── Badge, notifications, sound ───────────────────────────────────

const badge = { text: null, color: null, title: null };

function updateBadge(now = Date.now()) {
  if (!data) return;
  const secs = sumTracked(data.daily[dayKey(now)], data.trackedDomains);
  const text = badgeText(secs);
  const color = ACCENTS[data.settings.theme];
  const title = secs >= 60 ? `RIPHours — ${formatDuration(secs)} today` : "RIPHours";
  if (text !== badge.text) chrome.action.setBadgeText({ text });
  if (color !== badge.color) {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeTextColor({ color: "#ffffff" });
  }
  if (title !== badge.title) chrome.action.setTitle({ title });
  Object.assign(badge, { text, color, title });
}

function notify(id, title, message) {
  chrome.notifications
    .create(`riphours-${id}`, { type: "basic", iconUrl: ICON, title, message, priority: 1 })
    .catch(() => {});
}

let creatingOffscreen = null;

async function playSound() {
  if (!data.settings.sound) return;
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    if (!contexts.length) {
      creatingOffscreen ??= chrome.offscreen.createDocument({
        url: "background/offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Plays the alert when a daily limit runs out.",
      }).finally(() => { creatingOffscreen = null; });
      await creatingOffscreen;
    }
    await chrome.runtime.sendMessage({ target: "offscreen", type: "play", src: "background/alert.mp3" });
  } catch (err) {
    console.warn("RIPHours: alert sound failed", err);
  }
}

// ── Context menu ──────────────────────────────────────────────────

function setupMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Track this site in RIPHours",
      contexts: ["page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
}

async function trackFromMenu(url) {
  const domain = normalizeDomain(hostOf(url) ?? "");
  if (!domain) {
    notify("menu", "Can't track this page", "RIPHours only tracks regular websites, not IP addresses or local hosts.");
    return;
  }
  const covered = matchDomain(domain, data.trackedDomains);
  if (covered) {
    notify("menu", `Already tracking ${covered}`,
      covered === domain ? "Time here is already being counted." : `Time on ${domain} counts toward ${covered}.`);
    return;
  }
  data.trackedDomains.push(domain);
  await configChanged({ added: [domain] });
  notify("menu", `Now tracking ${domain}`, "Time on this site counts from now on.");
}

// ── Messages ──────────────────────────────────────────────────────

function snapshot(now = Date.now()) {
  const today = dayKey(now);
  const daily = {};
  for (let i = 0; i < 7; i++) {
    const key = shiftDay(today, -i);
    if (data.daily[key]) daily[key] = data.daily[key];
  }
  return {
    now,
    today,
    installDate: data.installDate,
    trackedDomains: data.trackedDomains,
    limits: data.limits,
    settings: data.settings,
    totals: data.totals,
    daily,
    live: isCounting(now) ? { domain: tracker.domain, streak: tracker.streakSeconds } : null,
  };
}

const pageOps = {
  async "get-state"(msg) {
    const now = Date.now();
    if (msg.refresh) await refresh(now);
    else credit(now);
    return snapshot(now);
  },

  async "export"() {
    credit();
    return { data };
  },

  async "block-state"(msg) {
    const now = Date.now();
    const domain = normalizeDomain(String(msg.site || ""));
    const tracked = Boolean(domain && data.trackedDomains.includes(domain));
    return {
      now,
      reason: tracked ? blockReason(domain, now) : null,
      focusUntil: data.settings.focusUntil,
      limit: tracked ? data.limits[domain] || 0 : 0,
      used: tracked ? usedToday(domain, now) : 0,
      alternatives: parseAlternatives(data.settings.alternatives),
      settings: { mode: data.settings.mode, theme: data.settings.theme },
    };
  },

  async "add-domain"(msg) {
    const domain = normalizeDomain(String(msg.domain || ""));
    if (!domain) return { error: "That doesn't look like a website address." };
    const covered = matchDomain(domain, data.trackedDomains);
    if (covered) return { error: covered === domain ? `${domain} is already tracked.` : `Already covered by ${covered}.` };
    data.trackedDomains.push(domain);
    await configChanged({ added: [domain] });
    return { ok: true, domain };
  },

  async "remove-domain"(msg) {
    const domain = String(msg.domain || "");
    if (!data.trackedDomains.includes(domain)) return { ok: true };
    credit();
    data.trackedDomains = data.trackedDomains.filter((d) => d !== domain);
    delete data.limits[domain];
    resetAlert(domain);
    await configChanged();
    return { ok: true };
  },

  async "set-domains"(msg) {
    const domains = Array.isArray(msg.domains) ? msg.domains : [];
    const next = sanitizeData({ trackedDomains: domains }).trackedDomains;
    const added = next.filter((d) => !data.trackedDomains.includes(d));
    credit();
    data.trackedDomains = next;
    for (const d of Object.keys(data.limits)) if (!next.includes(d)) delete data.limits[d];
    await configChanged({ added });
    return { ok: true, trackedDomains: next };
  },

  async "set-limit"(msg) {
    const domain = String(msg.domain || "");
    if (!data.trackedDomains.includes(domain)) return { error: "That site isn't tracked." };
    const secs = Math.floor(Number(msg.seconds) || 0);
    if (secs > 0) data.limits[domain] = Math.min(secs, MAX_LIMIT_S);
    else delete data.limits[domain];
    resetAlert(domain);
    await configChanged();
    return { ok: true };
  },

  async "update-settings"(msg) {
    const patch = isObj(msg.settings) ? { ...msg.settings } : {};
    delete patch.focusUntil;
    const before = data.settings;
    data.settings = sanitizeSettings(patch, before);
    if (before.hardBlock !== data.settings.hardBlock) {
      for (const d of Object.keys(data.limits)) resetAlert(d);
    }
    await configChanged();
    return { ok: true, settings: data.settings };
  },

  async "start-focus"() {
    if (!data.trackedDomains.length) return { error: "Track a site first." };
    await startFocus();
    return { ok: true, focusUntil: data.settings.focusUntil };
  },

  async "import"(msg) {
    const payload = isObj(msg.payload) && isObj(msg.payload.data) ? msg.payload.data : msg.payload;
    if (!isObj(payload) || (!("schema" in payload) && !isObj(payload.sites) && !Array.isArray(payload.trackedDomains))) {
      return { error: "That file isn't a RIPHours backup." };
    }
    const focusUntil = data.settings.focusUntil;
    data = migrate(payload);
    data.settings.focusUntil = focusUntil;
    tracker.alerted = { day: "", domains: [] };
    tracker.snoozed = {};
    await configChanged({ added: data.trackedDomains });
    return { ok: true };
  },

  async "reset"() {
    credit();
    const fresh = createDefaultData();
    data.totals = fresh.totals;
    data.daily = fresh.daily;
    data.installDate = fresh.installDate;
    data.recapSentOn = null;
    Object.assign(tracker, { streakSeconds: 0, breaksSent: 0, alerted: { day: "", domains: [] }, snoozed: {} });
    await persist();
    hideOverlayIfLifted();
    await refresh();
    updateBadge();
    return { ok: true };
  },
};

const contentOps = {
  async activity(msg, sender) {
    const now = Date.now();
    const tabId = sender.tab.id;
    if (tabId !== tracker.tabId) await refresh(now);
    if (tabId !== tracker.tabId) return { ok: true };
    credit(now);
    const ago = Math.min(Math.max(Number(msg.ago) || 0, 0), IDLE_MS);
    tracker.lastActivityAt = Math.max(tracker.lastActivityAt, now - ago);
    tracker.lastTick = Math.max(tracker.lastTick, now);
    markDirty();
    ensureTicking();
    return { ok: true };
  },

  async snooze(msg, sender) {
    const domain = matchDomain(hostOf(sender.tab.url), data.trackedDomains);
    if (domain) tracker.snoozed[domain] = Date.now() + SNOOZE_MS;
    if (tracker.overlayTab === sender.tab.id) tracker.overlayTab = null;
    markDirty();
    return { ok: true };
  },

  async "close-tab"(msg, sender) {
    await chrome.tabs.remove(sender.tab.id).catch(() => {});
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!isObj(msg) || typeof msg.type !== "string" || msg.target === "offscreen") return;
  if (sender.id !== chrome.runtime.id) return;
  const fromPage = typeof sender.url === "string" && sender.url.startsWith(EXTENSION_ORIGIN);
  const op = fromPage
    ? Object.hasOwn(pageOps, msg.type) && pageOps[msg.type]
    : sender.tab && Object.hasOwn(contentOps, msg.type) && contentOps[msg.type];
  if (!op) return;
  serial(() => op(msg, sender)).then(
    (result) => respond(result ?? { ok: true }),
    (err) => respond({ error: String(err?.message || err) }),
  );
  return true;
});

// ── Browser events ────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(() => serial(() => refresh()));

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === "loading" && tracker.overlayTab === tabId) tracker.overlayTab = null;
  if (!change.url) return;
  serial(async () => {
    // Background tabs too: a blocked site can't load anywhere.
    if (enforceTab(tab)) {
      if (tabId === tracker.tabId) {
        credit();
        Object.assign(tracker, { domain: null, tabId: null, overlayTab: null });
        ensureTicking();
      }
      return;
    }
    if (tab.active || tabId === tracker.tabId) await refresh();
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === tracker.tabId) serial(() => refresh());
});

chrome.tabs.onReplaced.addListener(() => serial(() => refresh()));

chrome.windows.onFocusChanged.addListener(() => serial(() => refresh()));

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) serial(heartbeat);
  if (alarm.name === FOCUS_ALARM) serial(async () => {
    if (data.settings.focusUntil && data.settings.focusUntil <= Date.now() + 1000) await endFocus();
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) serial(() => trackFromMenu(info.pageUrl || tab?.url));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes[SYNC_KEY]) return;
  serial(async () => {
    if (applyRemote(changes[SYNC_KEY].newValue)) await configChanged({ push: false });
  });
});
