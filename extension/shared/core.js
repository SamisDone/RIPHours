// Shared by the service worker and every extension page.
// Nothing here touches the DOM or chrome.* at import time.

export const DATA_KEY = "riphours";
export const DEVICE_KEY = "deviceId";
export const SYNC_KEY = "config";
export const LEGACY_SYNC_KEY = "riphoursSync";
export const THEME_CACHE_KEY = "riphours-theme";
export const SCHEMA = 2;

export const DEFAULT_DOMAINS = Object.freeze([
  "reddit.com", "x.com", "youtube.com", "instagram.com", "tiktok.com", "facebook.com",
]);
export const SUGGESTED_DOMAINS = Object.freeze([
  "linkedin.com", "twitch.tv", "netflix.com", "pinterest.com", "news.ycombinator.com",
]);

export const ACCENTS = Object.freeze({
  red: "#e5383b",
  green: "#16a34a",
  purple: "#8b5cf6",
  blue: "#3b82f6",
  orange: "#f97316",
  pink: "#ec4899",
});
export const MODES = Object.freeze(["dark", "light", "system"]);

export const IDLE_MS = 60_000;
export const MAX_CREDIT_MS = 120_000;
export const FOCUS_MS = 25 * 60_000;
export const SNOOZE_MS = 10 * 60_000;
export const BREAK_INTERVAL_S = 30 * 60;
export const STREAK_GAP_MS = 5 * 60_000;
export const RECAP_HOUR = 21;
export const RECAP_MIN_S = 60;
export const DAILY_RETENTION_DAYS = 120;
export const MAX_DAY_S = 86_400;
export const MAX_LIMIT_S = 86_400;
export const MAX_ALTERNATIVES_CHARS = 2000;

export const IRON_WILL_PHRASE = "I am choosing to waste my limited time on earth doing nothing.";

export const DEFAULT_SETTINGS = Object.freeze({
  hardBlock: true,
  theme: "red",
  mode: "dark",
  alternatives: "",
  breakReminders: true,
  nightlyRecap: true,
  sound: true,
  focusUntil: 0,
});

// Sites that moved. Old keys are folded into the new one wherever a domain is read.
const ALIASES = { "twitter.com": "x.com" };

export const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const pad = (n) => String(n).padStart(2, "0");

// ── Dates (always local time) ─────────────────────────────────────

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDay(key, days) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

export function nextMidnight(t = Date.now()) {
  const d = new Date(t);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// ── Domains ───────────────────────────────────────────────────────

const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

// Accepts "reddit.com", "https://www.reddit.com/r/x", "Reddit.com." and returns
// "reddit.com". Rejects IPs, localhost, single labels and non-web schemes.
export function normalizeDomain(input) {
  if (typeof input !== "string") return null;
  let text = input.trim().toLowerCase();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(text)) text = "http://" + text;
  let host;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    host = url.hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "").replace(/^www\./, "");
  if (host.length > 253) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((l) => LABEL_RE.test(l)) || !TLD_RE.test(labels.at(-1))) return null;
  return ALIASES[host] ?? host;
}

export function hostOf(url) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
  try {
    return new URL(url).hostname.replace(/\.$/, "").replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

// The most specific tracked domain that covers `host`, or null.
export function matchDomain(host, domains) {
  if (!host) return null;
  let best = null;
  for (const d of domains) {
    if ((host === d || host.endsWith("." + d)) && (!best || d.length > best.length)) best = d;
  }
  return best;
}

// ── Formatting ────────────────────────────────────────────────────

export function splitDuration(secs) {
  const s = Math.max(0, Math.floor(secs));
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

// "4d 07h", "1h 05m", "12m", or with seconds: "12m 03s", "45s".
export function formatDuration(secs, { seconds = false } = {}) {
  const { days, hours, minutes, seconds: s } = splitDuration(secs);
  if (days) return `${days}d ${pad(hours)}h`;
  if (hours) return `${hours}h ${pad(minutes)}m`;
  if (seconds) return minutes ? `${minutes}m ${pad(s)}s` : `${s}s`;
  return `${minutes}m`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "1 hour 5 minutes", "34 minutes", "45 seconds".
export function formatWords(secs) {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return m ? `${plural(h, "hour")} ${plural(m, "minute")}` : plural(h, "hour");
  if (m) return plural(m, "minute");
  return plural(s, "second");
}

// The two largest units, for the share card: "4 days, 7 hours", "12 minutes".
export function formatHeadline(secs) {
  const { days, hours, minutes, seconds } = splitDuration(secs);
  const units = [[days, "day"], [hours, "hour"], [minutes, "minute"]];
  const first = units.findIndex(([n]) => n > 0);
  if (first === -1) return plural(seconds, "second");
  const parts = [plural(...units[first])];
  const next = units[first + 1];
  if (next && next[0] > 0) parts.push(plural(...next));
  return parts.join(", ");
}

export function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function badgeText(secs) {
  const m = Math.floor(secs / 60);
  if (m < 1) return "";
  if (m < 60) return `${m}m`;
  if (m < 600) return `${Math.floor(m / 60)}:${pad(m % 60)}`;
  return `${Math.floor(m / 60)}h`;
}

export function formatDate(t, { year } = {}) {
  const d = new Date(t);
  const showYear = year ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(showYear && { year: "numeric" }) });
}

// ── Data helpers ──────────────────────────────────────────────────

export function sumTracked(map, domains) {
  if (!map) return 0;
  let total = 0;
  for (const d of domains) total += map[d] || 0;
  return total;
}

export function parseAlternatives(text) {
  return String(text || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Schema ────────────────────────────────────────────────────────

export function createDefaultData(now = Date.now()) {
  return sanitizeData({ installDate: now }, now);
}

export function sanitizeSettings(raw, base = DEFAULT_SETTINGS) {
  const src = isObj(raw) ? raw : {};
  const out = { ...DEFAULT_SETTINGS, ...base };
  for (const key of ["hardBlock", "breakReminders", "nightlyRecap", "sound"]) {
    if (typeof src[key] === "boolean") out[key] = src[key];
  }
  if (typeof src.theme === "string" && Object.hasOwn(ACCENTS, src.theme)) out.theme = src.theme;
  if (MODES.includes(src.mode)) out.mode = src.mode;
  if (typeof src.alternatives === "string") out.alternatives = src.alternatives.slice(0, MAX_ALTERNATIVES_CHARS);
  if (Number.isFinite(src.focusUntil) && src.focusUntil >= 0) out.focusUntil = src.focusUntil;
  return out;
}

function sanitizeDomains(list) {
  const out = [];
  for (const item of list) {
    const d = normalizeDomain(item);
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

// Normalizes keys and drops anything that isn't a positive number of seconds.
// `combine` decides what happens when two keys fold into one (twitter.com + x.com).
function sanitizeSeconds(map, max, combine) {
  const out = {};
  if (!isObj(map)) return out;
  for (const [key, value] of Object.entries(map)) {
    const d = normalizeDomain(key);
    const n = Number(value);
    if (!d || !Number.isFinite(n) || n <= 0) continue;
    const secs = Math.floor(n);
    if (!secs) continue;
    out[d] = Math.min(max, d in out ? combine(out[d], secs) : secs);
  }
  return out;
}

const add = (a, b) => a + b;

export function sanitizeData(raw, now = Date.now()) {
  const src = isObj(raw) ? raw : {};
  const trackedDomains = Array.isArray(src.trackedDomains)
    ? sanitizeDomains(src.trackedDomains)
    : [...DEFAULT_DOMAINS];

  const limits = {};
  for (const [d, secs] of Object.entries(sanitizeSeconds(src.limits, MAX_LIMIT_S, Math.min))) {
    if (trackedDomains.includes(d)) limits[d] = secs;
  }

  const today = dayKey(now);
  const oldest = shiftDay(today, -(DAILY_RETENTION_DAYS - 1));
  const daily = {};
  if (isObj(src.daily)) {
    for (const [key, day] of Object.entries(src.daily)) {
      if (!DAY_KEY_RE.test(key) || key < oldest || key > today) continue;
      const clean = sanitizeSeconds(day, MAX_DAY_S, add);
      if (Object.keys(clean).length) daily[key] = clean;
    }
  }

  const installDate = Number.isFinite(src.installDate) && src.installDate > 0 && src.installDate <= now
    ? src.installDate
    : now;

  return {
    schema: SCHEMA,
    installDate,
    trackedDomains,
    limits,
    settings: sanitizeSettings(src.settings),
    totals: sanitizeSeconds(src.totals, Number.MAX_SAFE_INTEGER, add),
    daily,
    recapSentOn: typeof src.recapSentOn === "string" && DAY_KEY_RE.test(src.recapSentOn) ? src.recapSentOn : null,
    configUpdatedAt: Number.isFinite(src.configUpdatedAt) && src.configUpdatedAt > 0 ? src.configUpdatedAt : 0,
  };
}

// Schema 1 stored cumulative snapshots: `sites` held all-time seconds and
// `history[UTC date]` a copy of `sites` taken during that day. Daily usage is
// the difference between consecutive snapshots.
function fromSchema1(raw, now) {
  const diff = (after, before) => {
    const day = {};
    for (const [d, v] of Object.entries(after)) {
      const secs = (Number(v) || 0) - (Number(before?.[d]) || 0);
      if (secs > 0) day[d] = Math.min(secs, MAX_DAY_S);
    }
    return day;
  };

  const history = isObj(raw.history) ? raw.history : {};
  const keys = Object.keys(history).filter((k) => DAY_KEY_RE.test(k) && isObj(history[k])).sort();
  const installKey = Number.isFinite(raw.installDate) ? new Date(raw.installDate).toISOString().slice(0, 10) : null;

  const daily = {};
  let previous = null;
  for (const key of keys) {
    // Without an earlier snapshot the first day's diff would include every
    // second before it, unless that day is the install day.
    if (previous || key === installKey) daily[key] = diff(history[key], previous);
    previous = history[key];
  }

  if (raw._todayDate === new Date(now).toDateString() && isObj(raw._todayStart) && isObj(raw.sites)) {
    daily[dayKey(now)] = diff(raw.sites, raw._todayStart);
  }

  const settings = isObj(raw.settings) ? raw.settings : {};
  return {
    installDate: raw.installDate,
    trackedDomains: raw.trackedDomains,
    limits: raw.limits,
    settings: { ...settings, focusUntil: settings.focusModeUntil },
    totals: raw.sites,
    daily,
    recapSentOn: settings.tombstoneLastFired,
  };
}

export function migrate(raw, now = Date.now()) {
  if (!isObj(raw)) return createDefaultData(now);
  if (raw.schema === undefined) {
    if (!isObj(raw.sites) && !Array.isArray(raw.trackedDomains)) return createDefaultData(now);
    return sanitizeData(fromSchema1(raw, now), now);
  }
  return sanitizeData(raw, now);
}

// ── Pages ─────────────────────────────────────────────────────────

export function applyTheme(settings, root = globalThis.document?.documentElement) {
  if (!root) return;
  const mode = MODES.includes(settings?.mode) ? settings.mode : DEFAULT_SETTINGS.mode;
  const accent = Object.hasOwn(ACCENTS, settings?.theme ?? "") ? settings.theme : DEFAULT_SETTINGS.theme;
  for (const cls of [...root.classList]) {
    if (cls.startsWith("mode-") || cls.startsWith("accent-")) root.classList.remove(cls);
  }
  root.classList.add(`mode-${mode}`, `accent-${accent}`);
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ mode, accent }));
  } catch {}
}

export function faviconUrl(domain, size = 32) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", `https://${domain}/`);
  url.searchParams.set("size", String(size));
  return url.href;
}

export async function send(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (res?.error) throw new Error(res.error);
  return res;
}
