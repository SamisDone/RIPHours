// ⚰ RIPHours — Background Service Worker (v1.2.10)
// Handles: tracking, alarms, badge, alerts, blocking, context menu, break reminders

let currentHost = null;
let tabStartTime = 0;
let isWindowFocused = true;
let alertedSites = new Set();
let blockedSites = new Set();
let dismissedSites = new Set(); // Reset on midnight
let continuousStart = 0; // Track continuous scrolling for break reminders
let breakNotified = false;
let lastActivityTime = Date.now();
let lastCheckedDate = new Date().toDateString(); // For midnight reset

async function saveSessionState() {
  await chrome.storage.session.set({
    currentHost, tabStartTime, isWindowFocused, continuousStart, breakNotified, lastActivityTime,
    alertedSites: Array.from(alertedSites),
    blockedSites: Array.from(blockedSites),
    dismissedSites: Array.from(dismissedSites)
  });
}

const DEFAULT_DOMAINS = [
  "reddit.com", "twitter.com", "x.com",
  "youtube.com", "instagram.com", "tiktok.com", "facebook.com"
];

const BREAK_THRESHOLD = 30 * 60 * 1000; // 30 minutes in ms
const IDLE_TIMEOUT = 60; // 60 seconds

// ── FR-10: First install ──────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      riphours: {
        sites: {},
        trackedDomains: [...DEFAULT_DOMAINS],
        installDate: Date.now(),
        limits: {},
        history: {},
        settings: { hardBlock: true, theme: "red", mode: "dark" }
      }
    });
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/welcome/welcome.html") });
  }

  // Context menu: right-click "Add to RIP"
  chrome.contextMenus.create({
    id: "rip-add-domain",
    title: "⚰ Add this site to RIPHours",
    contexts: ["page"]
  });
});

// ── Context menu handler ──────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "rip-add-domain" && tab?.url) {
    try {
      const hostname = new URL(tab.url).hostname.replace(/^www\./, "");
      const data = await chrome.storage.local.get("riphours");
      const rip = data.riphours;
      if (!rip) return;
      if (!rip.trackedDomains.includes(hostname)) {
        rip.trackedDomains.push(hostname);
        await chrome.storage.local.set({ riphours: rip });
        chrome.notifications.create("rip-added-" + hostname, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: "⚰ RIPHours",
          message: `Now tracking: ${hostname}`,
          priority: 1
        });
        // Start tracking immediately if it's the active tab
        onTabActivated(tab.id);
      } else {
        chrome.notifications.create("rip-exists-" + hostname, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: "⚰ RIPHours",
          message: `Already tracking ${hostname}`,
          priority: 0
        });
      }
    } catch {}
  }
});

// ── Alarm: ensure it always exists (survives SW restart) ──────────
chrome.alarms.get("rip-tick", (alarm) => {
  if (!alarm) {
    chrome.alarms.create("rip-tick", { periodInMinutes: 0.5 });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "rip-tick") {
    checkMidnightReset(); // Proactive reset
    flushTime();
    checkBreakReminder();
    saveDaily();
  }
});

async function checkMidnightReset() {
  const today = new Date().toDateString();
  const data = await chrome.storage.local.get("riphours");
  const rip = data.riphours;
  if (!rip) return;

  if (rip._todayDate !== today) {
    // Baseline for "Today": use yesterday's final snapshot if available
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().slice(0, 10);
    
    rip._todayStart = (rip.history && rip.history[yKey]) ? { ...rip.history[yKey] } : { ...rip.sites };
    rip._todayDate = today;
    // Reset daily alerts, blocks, and dismissals at midnight
    alertedSites.clear();
    blockedSites.clear();
    dismissedSites.clear();
    lastCheckedDate = today;
    await chrome.storage.local.set({ riphours: rip });
    updateBadge(rip);
  }
}

// Fast-path local tick: alarms are rate-limited to 30s-1m, but we want time limits
// to fire *exactly* when they are breached. This interval runs every second
// while the worker is awake and focused on a tracked domain.
setInterval(() => {
  if (currentHost && isWindowFocused) {
    flushTime();
    checkBreakReminder();
  }
}, 1000); // Check every second for real-time precision.

// ── Recover state on SW wake-up ───────────────────────────────────
async function recoverState() {
  try {
    const session = await chrome.storage.session.get(null);
    if (session.currentHost !== undefined) {
      currentHost = session.currentHost;
      tabStartTime = session.tabStartTime || Date.now();
      isWindowFocused = session.isWindowFocused ?? true;
      continuousStart = session.continuousStart || Date.now();
      breakNotified = session.breakNotified || false;
      lastActivityTime = session.lastActivityTime || Date.now();
      alertedSites = new Set(session.alertedSites || []);
      blockedSites = new Set(session.blockedSites || []);
      dismissedSites = new Set(session.dismissedSites || []);
    } else {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.url) {
        const hostname = new URL(tab.url).hostname.replace(/^www\./, "");
        const data = await chrome.storage.local.get("riphours");
        const domains = data.riphours?.trackedDomains || [];
        if (matchesDomain(hostname, domains)) {
          currentHost = hostname;
          tabStartTime = Date.now();
          continuousStart = Date.now();
          isWindowFocused = true;
          saveSessionState();
        }
      }
    }
  } catch {}
}
recoverState();

// ── Core: flush elapsed time to storage ───────────────────────────
// Resolve a hostname to its base tracked domain (e.g. m.youtube.com -> youtube.com)
function resolveTrackedDomain(hostname, domains) {
  return domains.find(d => hostname === d || hostname.endsWith("." + d)) || hostname;
}

async function flushTime() {
  if (!currentHost) return;

  const now = Date.now();
  const diffMs = now - tabStartTime;
  const elapsed = Math.floor(diffMs / 1000);

  if (elapsed <= 0) return;
  if (elapsed > 120) { // Safety: jump in time (e.g. sleep/wake)
    tabStartTime = now;
    saveSessionState();
    return;
  }

  // Preserve fractional milliseconds for the next tick
  tabStartTime += (elapsed * 1000);
  saveSessionState();

  // Auto-idle: check if content script reported activity
  const idleGap = Math.floor((now - lastActivityTime) / 1000);
  if (idleGap > IDLE_TIMEOUT) return; // User is idle, don't count

  // Run midnight reset BEFORE reading storage so we get fresh data
  await checkMidnightReset();

  const data = await chrome.storage.local.get("riphours");
  const rip = data.riphours;
  if (!rip) return;
  
  // Store time under the base tracked domain, not the subdomain
  const domains = rip.trackedDomains || [];
  const targetKey = resolveTrackedDomain(currentHost, domains);

  // If the site was JUST added, we might not have been tracking it yet
  // This check ensures we don't accidentally attribute time if it's not in the list
  if (!matchesDomain(currentHost, domains)) return;

  rip.sites[targetKey] = (rip.sites[targetKey] || 0) + elapsed;

  await chrome.storage.local.set({ riphours: rip });

  // Focus Surge Check
  const surgeUntil = rip.settings?.focusModeUntil || 0;
  if (Date.now() < surgeUntil) {
    if (!alertedSites.has(targetKey)) triggerAlert(targetKey, rip);
    updateBadge(rip);
    return;
  }

  // Check daily time limits (using today's usage, not all-time)
  const limit = rip.limits?.[targetKey];
  if (limit) {
    const todayUsage = (rip.sites[targetKey] || 0) - (rip._todayStart?.[targetKey] || 0);
    if (todayUsage >= limit && !alertedSites.has(targetKey)) {
      triggerAlert(targetKey, rip);
    }
  }

  updateBadge(rip);
}

// ── Alert + optional site blocking ────────────────────────────────
async function playAudioOffscreen() {
  try {
    const offscreenUrl = chrome.runtime.getURL("background/offscreen.html");
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"]
    });
    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: offscreenUrl,
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play time limit alert sound"
      });
    }
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "play-audio",
      src: "background/alert.mp3",
      volume: 1.0
    });
  } catch (err) {
    console.error("Failed to play offscreen audio:", err);
  }
}

async function triggerAlert(host, rip) {
  alertedSites.add(host);
  // Focus Surge is ALWAYS a hard block, even if global settings say soft block
  const isFocusSurge = Date.now() < (rip.settings?.focusModeUntil || 0);
  const hardBlock = isFocusSurge || (rip.settings?.hardBlock !== false);
  
  saveSessionState(); // Persist immediately after state change

  chrome.notifications.create("rip-limit-" + host, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "⚰ RIPHours — Time Limit Hit",
    message: `You've blown past your limit on ${host}. Time to close the tab.`,
    priority: 2
  });

  playAudioOffscreen();

  if (hardBlock) {
    blockedSites.add(host);
  }

  // Inject in-page alert via content script or close tab
  const allTabs = await chrome.tabs.query({});
  for (const t of allTabs) {
    if (t.url && t.url.startsWith("http")) { // Only inject to http/https
      const h = new URL(t.url).hostname.replace(/^www\./, "");
      if (h === host || h.endsWith("." + host)) {
        chrome.tabs.sendMessage(t.id, { type: "show-alert", host, hardBlock }).catch(() => {});
      }
    }
  }
}

// ── Break reminder ────────────────────────────────────────────────
function checkBreakReminder() {
  if (!currentHost || breakNotified) return;
  const elapsed = Date.now() - continuousStart;
  if (elapsed >= BREAK_THRESHOLD) {
    breakNotified = true;
    saveSessionState();
    chrome.notifications.create("rip-break", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "⚰ Take a Break",
      message: "You've been scrolling for 30+ minutes. Stretch, hydrate, look away.",
      priority: 2
    });
  }
}

// ── Daily history (for weekly trends) ─────────────────────────────
async function saveDaily() {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const data = await chrome.storage.local.get("riphours");
  const rip = data.riphours;
  if (!rip) return;

  rip.history = rip.history || {};
  rip.history[today] = { ...rip.sites };

  // Keep only last 14 days
  const keys = Object.keys(rip.history).sort();
  while (keys.length > 14) {
    delete rip.history[keys.shift()];
  }

  // Tombstone Notification (Daily at 9 PM) — uses today's usage
  // Only fire when _todayDate has been properly initialized for today,
  // otherwise _todayStart is stale/missing and we'd compute garbage totals.
  const now = new Date();
  if (now.getHours() >= 21 && rip.settings?.tombstoneLastFired !== today && rip._todayDate === today) {
    // Calculate today's total by diffing from daily start snapshot
    let todayTotal = 0;
    for (const domain of (rip.trackedDomains || [])) {
      todayTotal += Math.max(0, (rip.sites[domain] || 0) - (rip._todayStart?.[domain] || 0));
    }
    if (todayTotal > 0) {
      const hours = Math.floor(todayTotal / 3600);
      const mins = Math.floor((todayTotal % 3600) / 60);
      let timeText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: "⚰ Daily Tombstone",
        message: `RIP: You buried ${timeText} into tracked sites today.`,
        priority: 2
      });
      rip.settings = rip.settings || {};
      rip.settings.tombstoneLastFired = today;
    }
  }

  await chrome.storage.local.set({ riphours: rip });
  await syncCloudData(rip);
}

// ── Cloud Sync Engine ─────────────────────────────────────────────
async function syncCloudData(localRip) {
  try {
    const cloudData = await chrome.storage.sync.get("riphoursSync");
    const cloudRip = cloudData.riphoursSync || { history: {}, settings: {}, trackedDomains: [], limits: {} };

    // 1. Merge Settings & Domains (Local wins for simplicity, since it's the active device)
    cloudRip.settings = { ...cloudRip.settings, ...localRip.settings };
    cloudRip.trackedDomains = Array.from(new Set([...(cloudRip.trackedDomains || []), ...(localRip.trackedDomains || [])]));
    cloudRip.limits = { ...cloudRip.limits, ...localRip.limits };

    // 2. Merge History (Take the MAX value for each domain on a given day across devices)
    const allDates = new Set([...Object.keys(localRip.history || {}), ...Object.keys(cloudRip.history || {})]);
    
    allDates.forEach(date => {
      cloudRip.history[date] = cloudRip.history[date] || {};
      localRip.history[date] = localRip.history[date] || {};
      
      const allDomains = new Set([
        ...Object.keys(localRip.history[date]),
        ...Object.keys(cloudRip.history[date])
      ]);

      allDomains.forEach(domain => {
        const localVal = localRip.history[date][domain] || 0;
        const cloudVal = cloudRip.history[date][domain] || 0;
        // The true time spent is at least the highest recorded value on any device
        const mergedVal = Math.max(localVal, cloudVal);
        
        cloudRip.history[date][domain] = mergedVal;
        localRip.history[date][domain] = mergedVal;
      });
    });

    // Cleanup old cloud history
    const keys = Object.keys(cloudRip.history).sort();
    while (keys.length > 14) delete cloudRip.history[keys.shift()];

    // Save back to both
    await chrome.storage.sync.set({ riphoursSync: cloudRip });
    await chrome.storage.local.set({ riphours: localRip });
  } catch (err) {
    console.error("Cloud Sync Failed:", err);
  }
}

// ── FR-04: Badge ──────────────────────────────────────────────────
function updateBadge(rip) {
  // Show today's usage on the badge, not all-time cumulative
  const today = new Date().toDateString();
  let total = 0;
  if (rip._todayDate === today && rip._todayStart) {
    for (const domain of (rip.trackedDomains || [])) {
      total += Math.max(0, (rip.sites[domain] || 0) - (rip._todayStart[domain] || 0));
    }
  }
  const mins = Math.floor(total / 60);
  const hours = Math.floor(total / 3600);
  let text = "";
  if (total > 0) {
    if (hours >= 24) text = Math.floor(hours / 24) + "d";
    else if (hours > 0) text = hours + "h";
    else text = mins + "m";
  }
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#E63946" });
}

// ── Tab / Window tracking ─────────────────────────────────────────
function matchesDomain(hostname, domains) {
  return domains.some(d => hostname === d || hostname.endsWith("." + d));
}

async function onTabActivated(tabId) {
  await flushTime();
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url || !tab.active) {
      currentHost = null;
      return;
    }
    const hostname = new URL(tab.url).hostname.replace(/^www\./, "");

    const data = await chrome.storage.local.get("riphours");
    const domains = data.riphours?.trackedDomains || [];

    // Block check: if site is blocked, redirect (check subdomain match)
    const baseDomain = resolveTrackedDomain(hostname, domains);
    if (blockedSites.has(hostname) || blockedSites.has(baseDomain)) {
      chrome.tabs.update(tabId, { url: chrome.runtime.getURL("pages/blocked/blocked.html?site=" + (baseDomain || hostname)) });
      currentHost = null;
      return;
    }

    if (matchesDomain(hostname, domains)) {
      currentHost = hostname;
      tabStartTime = Date.now();
      
      // Focus Surge instant intercept
      const surgeUntil = data.riphours?.settings?.focusModeUntil || 0;
      if (Date.now() < surgeUntil) {
        chrome.tabs.update(tabId, { url: chrome.runtime.getURL("pages/blocked/blocked.html?site=" + hostname) });
        currentHost = null;
        return;
      }
      
      if (Date.now() - lastActivityTime > 30 * 60 * 1000) {
        continuousStart = Date.now();
        breakNotified = false;
      }
      
      saveSessionState();
      
      // If we are over the limit, alerted, and hard mode is disabled, show warning
      // baseDomain already declared above at the block-check
      
      // If hardBlock is enabled, treat as blocked. 
      // This handles cases where settings changed from hard->soft or vice versa while tab was open.
      const hardBlock = (data.riphours?.settings?.hardBlock !== false) || (Date.now() < (data.riphours?.settings?.focusModeUntil || 0));
      if (!hardBlock && blockedSites.has(baseDomain)) {
        blockedSites.delete(baseDomain);
        saveSessionState();
      }

      if (alertedSites.has(baseDomain) && !dismissedSites.has(baseDomain) && !hardBlock) {
        chrome.tabs.sendMessage(tabId, { type: "show-alert", host: baseDomain, hardBlock: false }).catch(() => {});
      }
    } else {
      currentHost = null;
      saveSessionState();
    }
  } catch {
    currentHost = null;
    saveSessionState();
  }
}

chrome.tabs.onActivated.addListener(info => onTabActivated(info.tabId));

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url && tab.active) onTabActivated(tabId);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushTime();
    isWindowFocused = false;
    currentHost = null;
  } else {
    isWindowFocused = true;
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab?.id) onTabActivated(tab.id);
  }
});

// ── Messages ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  // Content script: visibility
  if (msg.type === "visibility" && sender.tab?.id) {
    if (msg.visible) {
      onTabActivated(sender.tab.id);
    } else {
      flushTime();
      currentHost = null;
      saveSessionState();
    }
  }
  // Content script: user activity (for idle detection)
  if (msg.type === "activity") {
    const now = Date.now();
    if (now - lastActivityTime > 30 * 60 * 1000) { // 30 minutes
      continuousStart = now;
      breakNotified = false;
    }
    lastActivityTime = now;
    saveSessionState();
  }
  // Content script: close tab (soft block)
  if (msg.type === "close-active-tab" && sender.tab?.id) {
    chrome.tabs.remove(sender.tab.id).catch(() => {});
  }
  // Content script: force flush (so UI gets real-time data)
  if (msg.type === "force-flush") {
    flushTime();
    // If we aren't tracking anything, maybe it's because a new site was just added
    if (!currentHost) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
        if (tab?.id) onTabActivated(tab.id);
      });
    }
  }
  // Content script: dismiss alert (Let Me Stay)
  if (msg.type === "dismiss-alert" && msg.host) {
    dismissedSites.add(msg.host);
    saveSessionState();
    
    // Broadcast to all other tabs of this host to remove their overlays synchronously
    chrome.storage.local.get("riphours", (data) => {
      const rip = data.riphours;
      chrome.tabs.query({}, (tabs) => {
        for (const t of tabs) {
          if (t.url) {
            try {
              const h = new URL(t.url).hostname.replace(/^www\./, "");
              const base = resolveTrackedDomain(h, rip?.trackedDomains || []);
              if (base === msg.host) {
                chrome.tabs.sendMessage(t.id, { type: "remove-overlay" }).catch(() => {});
              }
            } catch {}
          }
        }
      });
    });
  }
});

// ── Storage Listener ──────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.riphours) {
    const oldLimits = changes.riphours.oldValue?.limits || {};
    const newLimits = changes.riphours.newValue?.limits || {};
    const newValue = changes.riphours.newValue;
    let limitsChanged = false;

    if (newValue) {
      for (const domain in newLimits) {
        if (newLimits[domain] !== oldLimits[domain]) {
          limitsChanged = true;
          const todayUsage = (newValue.sites[domain] || 0) - (newValue._todayStart?.[domain] || 0);
          if (todayUsage >= newLimits[domain]) {
            if (!alertedSites.has(domain)) {
              triggerAlert(domain, newValue);
            }
          } else {
            alertedSites.delete(domain);
            blockedSites.delete(domain);
            dismissedSites.delete(domain);
            chrome.tabs.query({}, (tabs) => {
              for (const t of tabs) {
                if (t.url) {
                  try {
                    const h = new URL(t.url).hostname.replace(/^www\./, "");
                    const base = resolveTrackedDomain(h, newValue.trackedDomains || []);
                    if (base === domain) {
                      chrome.tabs.sendMessage(t.id, { type: "remove-overlay" }).catch(() => {});
                    }
                  } catch {}
                }
              }
            });
          }
        }
      }
      for (const domain in oldLimits) {
        if (!(domain in newLimits)) {
          limitsChanged = true;
          alertedSites.delete(domain);
          blockedSites.delete(domain);
          dismissedSites.delete(domain);
          chrome.tabs.query({}, (tabs) => {
            for (const t of tabs) {
              if (t.url) {
                try {
                  const h = new URL(t.url).hostname.replace(/^www\./, "");
                  const base = resolveTrackedDomain(h, newValue.trackedDomains || []);
                  if (base === domain) {
                    chrome.tabs.sendMessage(t.id, { type: "remove-overlay" }).catch(() => {});
                  }
                } catch {}
              }
            }
          });
        }
      }
      if (limitsChanged) saveSessionState();
    }

    // If tracked domains changed, re-check current tab
    const oldDomains = changes.riphours.oldValue?.trackedDomains || [];
    const newDomains = changes.riphours.newValue?.trackedDomains || [];
    if (newDomains.length !== oldDomains.length) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
        if (tab?.id) onTabActivated(tab.id);
      });
    }

    // Focus Surge: if just activated, immediately block ALL open tracked tabs
    const oldSurge = changes.riphours.oldValue?.settings?.focusModeUntil || 0;
    const newSurge = changes.riphours.newValue?.settings?.focusModeUntil || 0;
    if (newSurge > Date.now() && newSurge !== oldSurge) {
      const domains = newDomains.length ? newDomains : oldDomains;
      chrome.tabs.query({}, (tabs) => {
        for (const t of tabs) {
          if (t.url && t.url.startsWith("http")) {
            try {
              const h = new URL(t.url).hostname.replace(/^www\./, "");
              if (matchesDomain(h, domains)) {
                const base = resolveTrackedDomain(h, domains);
                chrome.tabs.update(t.id, {
                  url: chrome.runtime.getURL("pages/blocked/blocked.html?site=" + base)
                });
              }
            } catch {}
          }
        }
      });
      // Stop tracking current host since it's now blocked
      currentHost = null;
      saveSessionState();
    }
  }
});

// ── Init badge on startup ─────────────────────────────────────────
chrome.storage.local.get("riphours").then(data => {
  if (data.riphours) updateBadge(data.riphours);
});
