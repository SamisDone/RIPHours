import {
  ACCENTS, FOCUS_MS, IRON_WILL_PHRASE, applyTheme, dayKey, faviconUrl, formatClock, formatDate,
  formatDuration, keyToDate, send, shiftDay, splitDuration, sumTracked,
} from "../shared/core.js";
import { canvasToBlob, drawShareCard } from "./share-card.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const TABS = ["stats", "limits", "settings"];
const VIEW_KEY = "riphours-popup";

let state = null;
const view = { tab: "stats", range: "all", filter: "", hoverDay: null };

try {
  const saved = JSON.parse(localStorage.getItem(VIEW_KEY)) || {};
  if (TABS.includes(saved.tab)) view.tab = saved.tab;
  if (saved.range === "today" || saved.range === "all") view.range = saved.range;
} catch {}

function saveView() {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ tab: view.tab, range: view.range }));
  } catch {}
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style") for (const [p, v] of Object.entries(value)) node.style.setProperty(p, v);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function favicon(domain) {
  return el("img", { class: "favicon", src: faviconUrl(domain), alt: "", width: 16, height: 16, decoding: "async" });
}

let toastTimer = null;
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}

async function act(promise, success) {
  try {
    const result = await promise;
    if (success) toast(typeof success === "function" ? success(result) : success);
    await load();
    return result;
  } catch (err) {
    toast(err.message);
    return null;
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Data loop ─────────────────────────────────────────────────────

async function load(refresh = false) {
  try {
    state = await send("get-state", { refresh });
  } catch (err) {
    console.error("RIPHours:", err);
    return;
  }
  applyTheme(state.settings);
  render();
}

function render() {
  if (!state) return;
  $("#since").textContent = `since ${formatDate(state.installDate)}`;
  if (view.tab === "stats") renderStats();
  if (view.tab === "limits") renderLimits();
  if (view.tab === "settings") renderSettings();
}

// ── Tabs ──────────────────────────────────────────────────────────

function moveIndicator(animate = true) {
  const tab = $(`#tab-${view.tab}`);
  const indicator = $(".tab-indicator");
  if (!animate) indicator.style.transition = "none";
  indicator.style.setProperty("--x", `${tab.offsetLeft}px`);
  indicator.style.setProperty("--w", `${tab.offsetWidth}px`);
  if (!animate) requestAnimationFrame(() => indicator.style.removeProperty("transition"));
}

function selectTab(name, { focus = false } = {}) {
  view.tab = name;
  for (const id of TABS) {
    const tab = $(`#tab-${id}`);
    const selected = id === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(`#view-${id}`).hidden = !selected;
    if (selected && focus) tab.focus();
  }
  $("main").scrollTop = 0;
  moveIndicator();
  saveView();
  render();
}

$(".tabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[role=tab]");
  if (tab) selectTab(tab.id.replace("tab-", ""));
});

$(".tabs").addEventListener("keydown", (event) => {
  const index = TABS.indexOf(view.tab);
  const next = {
    ArrowRight: (index + 1) % TABS.length,
    ArrowLeft: (index - 1 + TABS.length) % TABS.length,
    Home: 0,
    End: TABS.length - 1,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  selectTab(TABS[next], { focus: true });
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-goto]");
  if (target) selectTab(target.dataset.goto, { focus: true });
});

// ── Stats ─────────────────────────────────────────────────────────

function rangeTotals() {
  const map = view.range === "all" ? state.totals : state.daily[state.today] || {};
  return state.trackedDomains.map((domain) => ({ domain, secs: map[domain] || 0 }));
}

function weekDays() {
  const installKey = dayKey(state.installDate);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const key = shiftDay(state.today, -i);
    days.push({ key, secs: sumTracked(state.daily[key], state.trackedDomains), counted: key >= installKey });
  }
  return days;
}

function weekAverage(days) {
  const counted = days.filter((d) => d.counted);
  if (!counted.length) return 0;
  return counted.reduce((sum, d) => sum + d.secs, 0) / counted.length;
}

function renderStats() {
  const rows = rangeTotals();
  const total = rows.reduce((sum, r) => sum + r.secs, 0);

  for (const button of $$(".segmented [data-range]")) {
    button.setAttribute("aria-pressed", String(button.dataset.range === view.range));
  }

  renderClock(total);
  $("#caption").textContent = view.range === "all"
    ? "of your life, spent on tracked sites"
    : "today, spent on tracked sites";

  const live = $("#live");
  live.hidden = !state.live;
  if (state.live) {
    $("#live-text").textContent =
      `${state.live.domain} · ${formatDuration(state.live.streak, { seconds: true })} this stretch`;
  }

  const days = weekDays();
  $("#insight").textContent = view.range === "all" ? lifeInsight(total) : `Daily average this week: ${formatDuration(weekAverage(days))}`;

  renderSites(rows);
  renderChart(days);
  renderFocus();
}

function renderClock(total) {
  const parts = splitDuration(total);
  const clock = $("#clock");
  const showDays = view.range === "all" && parts.days > 0;
  const units = [
    ["days", parts.days, parts.days === 1 ? "day" : "days"],
    ["hours", parts.hours, parts.hours === 1 ? "hr" : "hrs"],
    ["minutes", parts.minutes, "min"],
    ["seconds", parts.seconds, "sec"],
  ];
  let first = true;
  for (const [name, value, label] of units) {
    const unit = $(`[data-unit=${name}]`, clock);
    const visible = name !== "days" || showDays;
    unit.hidden = !visible;
    if (!visible) continue;
    const text = first ? String(value) : String(value).padStart(2, "0");
    first = false;
    const num = $(".num", unit);
    if (num.textContent !== text) num.textContent = text;
    $(".label", unit).textContent = label;
  }
  clock.classList.toggle("long", parts.days >= 100);
  clock.setAttribute("aria-label", formatDuration(total));
}

function lifeInsight(total) {
  const elapsed = state.now - state.installDate;
  if (elapsed < 86_400_000) {
    return dayKey(state.installDate) === state.today ? "Tracking started today." : "Tracking started yesterday.";
  }
  const waking = (elapsed / 1000) * (16 / 24);
  const pct = (total / waking) * 100;
  const share = pct < 1 ? "Under 1%" : `≈ ${Math.round(pct)}%`;
  return `${share} of your waking hours since ${formatDate(state.installDate)}`;
}

const siteRows = new Map();

function renderSites(rows) {
  const search = $("#site-search");
  search.hidden = state.trackedDomains.length <= 8;
  const filter = search.hidden ? "" : view.filter.trim().toLowerCase();

  const list = rows
    .filter((r) => !filter || r.domain.includes(filter))
    .sort((a, b) => b.secs - a.secs || a.domain.localeCompare(b.domain));
  const max = Math.max(1, ...list.map((r) => r.secs));
  const ul = $("#sites");

  for (const { domain, secs } of list) {
    let row = siteRows.get(domain);
    if (!row) {
      const fill = el("span", { class: "fill" });
      const marker = el("span", { class: "marker", hidden: true });
      row = {
        li: el("li"),
        time: el("span", { class: "time tnum" }),
        bar: el("span", { class: "bar", "aria-hidden": "true" }, [fill, marker]),
        fill,
        marker,
      };
      row.li.append(favicon(domain), el("span", { class: "domain", text: domain }), row.time, row.bar);
      siteRows.set(domain, row);
    }
    updateSiteRow(row, domain, secs, max);
  }

  const visible = new Set(list.map((r) => r.domain));
  for (const [domain, row] of siteRows) {
    if (!visible.has(domain)) {
      row.li.remove();
      siteRows.delete(domain);
    }
  }
  list.forEach(({ domain }, i) => {
    const li = siteRows.get(domain).li;
    if (ul.children[i] !== li) ul.insertBefore(li, ul.children[i] ?? null);
  });

  $("#sites-empty").hidden = state.trackedDomains.length > 0;
}

function updateSiteRow(row, domain, secs, max) {
  const limit = view.range === "today" ? state.limits[domain] || 0 : 0;
  let pct;
  let text = formatDuration(secs);
  row.bar.className = "bar";
  row.marker.hidden = true;

  if (limit) {
    const scale = Math.max(limit, secs);
    const ratio = secs / limit;
    pct = (secs / scale) * 100;
    text = `${formatDuration(secs)} / ${formatDuration(limit)}`;
    row.bar.classList.add("limited");
    if (ratio >= 1) row.bar.classList.add("over");
    else if (ratio >= 0.75) row.bar.classList.add("warn");
    if (secs > limit) {
      row.marker.hidden = false;
      row.marker.style.setProperty("--m", `${(limit / scale) * 100}%`);
    }
  } else {
    pct = (secs / max) * 100;
    // Today without a limit: no color, since nothing is at stake.
    if (view.range === "today") row.bar.classList.add("limited");
  }

  if (row.time.textContent !== text) row.time.textContent = text;
  row.time.classList.toggle("over", Boolean(limit) && secs >= limit);
  row.fill.style.setProperty("--p", `${pct}%`);
  row.li.classList.toggle("zero", secs === 0);
}

$("#site-search").addEventListener("input", (event) => {
  view.filter = event.target.value;
  renderStats();
});

for (const button of $$(".segmented [data-range]")) {
  button.addEventListener("click", () => {
    view.range = button.dataset.range;
    saveView();
    renderStats();
  });
}

let chartDays = [];

function renderChart(days) {
  chartDays = days;
  const chart = $("#chart");
  if (chart.children.length !== 7) {
    chart.replaceChildren(...days.map((_, i) => el("button", {
      type: "button",
      class: "day",
      "data-index": i,
    }, [el("span", { class: "track" }, [el("span", { class: "col" })]), el("span", { class: "dow" })])));
  }

  const max = Math.max(60, ...days.map((d) => d.secs));
  days.forEach((day, i) => {
    const button = chart.children[i];
    const date = keyToDate(day.key);
    button.classList.toggle("today", day.key === state.today);
    $(".col", button).style.setProperty("--h", `${(day.secs / max) * 100}%`);
    $(".dow", button).textContent = date.toLocaleDateString(undefined, { weekday: "short" });
    button.setAttribute("aria-label",
      `${date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${formatDuration(day.secs)}`);
  });
  renderWeekMeta();
}

function renderWeekMeta() {
  const day = view.hoverDay !== null ? chartDays[view.hoverDay] : null;
  $("#week-meta").textContent = day
    ? `${keyToDate(day.key).toLocaleDateString(undefined, { weekday: "short" })} · ${formatDuration(day.secs)}`
    : `avg ${formatDuration(weekAverage(chartDays))}`;
}

for (const type of ["pointerover", "focusin"]) {
  $("#chart").addEventListener(type, (event) => {
    const button = event.target.closest(".day");
    if (!button) return;
    view.hoverDay = Number(button.dataset.index);
    renderWeekMeta();
  });
}
for (const type of ["pointerleave", "focusout"]) {
  $("#chart").addEventListener(type, () => {
    view.hoverDay = null;
    renderWeekMeta();
  });
}

function renderFocus() {
  const button = $("#focus-btn");
  const left = state.settings.focusUntil - Date.now();
  const running = left > 0;
  button.classList.toggle("running", running);
  button.disabled = running || state.trackedDomains.length === 0;
  $("#focus-label").textContent = running ? `Focus ends in ${formatClock(left)}` : "Focus · 25 min";
  $("#focus-progress").style.setProperty("--p", running ? `${(1 - left / FOCUS_MS) * 100}%` : "0%");
  button.title = running ? "" : "Block every tracked site for 25 minutes";
}

$("#focus-btn").addEventListener("click", () => {
  act(send("start-focus"), "Focus Surge on. Tracked sites are blocked for 25 minutes.");
});

// ── Share card ────────────────────────────────────────────────────

$("#share-btn").addEventListener("click", async () => {
  const rows = rangeTotals();
  const top = rows.filter((r) => r.secs > 0).sort((a, b) => b.secs - a.secs).slice(0, 3);
  const canvas = $("#share-canvas");
  await drawShareCard(canvas, {
    seconds: rows.reduce((sum, r) => sum + r.secs, 0),
    sites: top.map((r) => r.domain),
    range: view.range,
    accent: ACCENTS[state.settings.theme],
    date: formatDate(state.now, { year: true }),
  });
  $("#share-dialog").showModal();
});

$("#share-copy").addEventListener("click", async () => {
  try {
    const blob = await canvasToBlob($("#share-canvas"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("Image copied.");
  } catch {
    toast("Couldn't copy. Save the PNG instead.");
  }
});

$("#share-save").addEventListener("click", async () => {
  download(await canvasToBlob($("#share-canvas")), `riphours-${state.today}.png`);
});

// ── Dialogs ───────────────────────────────────────────────────────

function openDialog(dialog) {
  return new Promise((resolve) => {
    dialog.returnValue = "";
    dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
    dialog.showModal();
  });
}

const normalizePhrase = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();
const IRON_TARGET = normalizePhrase(IRON_WILL_PHRASE);

$("#iron-phrase").textContent = IRON_WILL_PHRASE;

function updateIronWill() {
  const typed = normalizePhrase($("#iron-input").value);
  let matched = 0;
  while (matched < typed.length && typed[matched] === IRON_TARGET[matched]) matched++;
  $("#iron-bar").style.setProperty("--p", `${(matched / IRON_TARGET.length) * 100}%`);
  $("#iron-confirm").disabled = typed !== IRON_TARGET;
}

{
  const input = $("#iron-input");
  // The phrase has to be typed. Pasting it defeats the point.
  for (const type of ["paste", "drop"]) input.addEventListener(type, (event) => event.preventDefault());
  input.addEventListener("beforeinput", (event) => {
    if (/^insertFrom(Paste|Drop|Yank)/.test(event.inputType)) event.preventDefault();
  });
  input.addEventListener("input", updateIronWill);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!$("#iron-confirm").disabled) $("#iron-will").close("confirm");
  });
}

async function ironWill(reason) {
  $("#iron-reason").textContent = reason;
  $("#iron-input").value = "";
  updateIronWill();
  const result = await openDialog($("#iron-will"));
  return result === "confirm" && normalizePhrase($("#iron-input").value) === IRON_TARGET;
}

// ── Limits ────────────────────────────────────────────────────────

const limitRows = new Map();

function renderLimits() {
  const ul = $("#limits");
  const today = state.daily[state.today] || {};

  for (const domain of state.trackedDomains) {
    let row = limitRows.get(domain);
    if (!row) row = createLimitRow(domain);
    const used = today[domain] || 0;
    const limit = state.limits[domain] || 0;
    const sub = `${formatDuration(used)} today${limit && used >= limit ? " · over" : ""}`;
    if (row.sub.textContent !== sub) row.sub.textContent = sub;
    row.sub.classList.toggle("over", Boolean(limit) && used >= limit);
    if (!row.dirty && document.activeElement !== row.input) row.input.value = limit ? String(Math.round(limit / 60)) : "";
  }

  for (const [domain, row] of limitRows) {
    if (!state.trackedDomains.includes(domain)) {
      row.li.remove();
      limitRows.delete(domain);
    }
  }
  state.trackedDomains.forEach((domain, i) => {
    const li = limitRows.get(domain).li;
    if (ul.children[i] !== li) ul.insertBefore(li, ul.children[i] ?? null);
  });

  $("#limits-empty").hidden = state.trackedDomains.length > 0;

  const note = $("#limits-note");
  note.replaceChildren();
  if (state.settings.hardBlock) {
    note.append(el("strong", { text: "Hard block is on." }),
      " When a limit runs out, that site's tabs go to a block page until midnight. Loosening a limit takes Iron Will.");
  } else {
    note.append(el("strong", { text: "Hard block is off." }),
      " A spent limit only shows a reminder, snoozable 10 minutes at a time. ",
      el("button", { type: "button", class: "link", "data-goto": "settings", text: "Change in Settings" }), ".");
  }
}

function createLimitRow(domain) {
  const input = el("input", {
    class: "field",
    type: "number",
    min: 0,
    max: 1440,
    step: 1,
    inputmode: "numeric",
    placeholder: "—",
    "aria-label": `Daily limit for ${domain}, in minutes`,
  });
  const save = el("button", { type: "button", class: "btn primary limit-save", text: "Save", hidden: true });
  const sub = el("span", { class: "sub tnum" });
  const li = el("li", {}, [
    favicon(domain),
    el("div", { class: "limit-meta" }, [el("span", { class: "domain", text: domain }), sub]),
    el("div", { class: "limit-edit" }, [
      el("label", { class: "minutes" }, [input, el("span", { class: "suffix", text: "min" })]),
      save,
    ]),
  ]);
  const row = { li, input, save, sub, dirty: false };

  const current = () => Math.round((state.limits[domain] || 0) / 60);
  const parse = () => {
    const n = Math.floor(Number(input.value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1440) : 0;
  };
  const revert = () => {
    row.dirty = false;
    save.hidden = true;
    input.value = current() ? String(current()) : "";
  };

  input.addEventListener("input", () => {
    row.dirty = parse() !== current();
    save.hidden = !row.dirty;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && row.dirty) {
      // Otherwise the same keystroke lands in the Iron Will box as a newline.
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape" && row.dirty) {
      event.preventDefault();
      revert();
    }
  });
  save.addEventListener("click", () => commit());

  async function commit() {
    const minutes = parse();
    const before = current();
    const loosening = before > 0 && (minutes === 0 || minutes > before);
    if (loosening && !(await ironWill("Loosening a limit takes Iron Will. Type this exactly:"))) {
      revert();
      return;
    }
    const result = await act(send("set-limit", { domain, seconds: minutes * 60 }),
      minutes ? `${domain}: ${formatDuration(minutes * 60)} a day.` : `Limit removed from ${domain}.`);
    if (result) {
      row.dirty = false;
      save.hidden = true;
      renderLimits();
    }
  }

  limitRows.set(domain, row);
  return row;
}

// ── Settings ──────────────────────────────────────────────────────

let trackedSignature = "";

function renderSettings() {
  const signature = JSON.stringify([state.trackedDomains, state.limits]);
  if (signature !== trackedSignature) {
    trackedSignature = signature;
    $("#tracked").replaceChildren(...state.trackedDomains.map((domain) => {
      const limit = state.limits[domain];
      return el("li", {}, [
        favicon(domain),
        el("span", { class: "domain", text: domain }),
        limit ? el("span", { class: "tag tnum", text: `${formatDuration(limit)} limit` }) : "",
        el("button", {
          type: "button",
          class: "icon-btn",
          "aria-label": `Stop tracking ${domain}`,
          title: "Stop tracking",
          onclick: () => removeDomain(domain),
        }, [crossIcon()]),
      ]);
    }));
  }

  const { settings } = state;
  $("#hardblock").setAttribute("aria-checked", String(settings.hardBlock));
  $("#breaks").setAttribute("aria-checked", String(settings.breakReminders));
  $("#recap").setAttribute("aria-checked", String(settings.nightlyRecap));
  $("#sound").setAttribute("aria-checked", String(settings.sound));

  const alternatives = $("#alternatives");
  if (document.activeElement !== alternatives && !alternativesTimer) alternatives.value = settings.alternatives;

  for (const button of $$("#modes [data-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === settings.mode));
  }
  for (const button of $$("#swatches .swatch")) {
    button.setAttribute("aria-pressed", String(button.dataset.accent === settings.theme));
  }
}

function crossIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 3l6 6M9 3l-6 6");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);
  return svg;
}

async function removeDomain(domain) {
  if (state.limits[domain]
    && !(await ironWill(`${domain} has a limit, and removing the site removes it too. Type this exactly:`))) {
    return;
  }
  act(send("remove-domain", { domain }), `Stopped tracking ${domain}. Its history is kept.`);
}

$("#add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#add-input");
  const error = $("#add-error");
  try {
    const { domain } = await send("add-domain", { domain: input.value });
    input.value = "";
    error.hidden = true;
    toast(`Tracking ${domain}.`);
    await load();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
});

$("#add-input").addEventListener("input", () => {
  $("#add-error").hidden = true;
});

function updateSettings(patch, message) {
  state.settings = { ...state.settings, ...patch };
  applyTheme(state.settings);
  renderSettings();
  return act(send("update-settings", { settings: patch }), message);
}

$("#hardblock").addEventListener("click", async () => {
  if (state.settings.hardBlock) {
    if (!(await ironWill("Turning off hard block loosens every limit. Type this exactly:"))) return;
    updateSettings({ hardBlock: false }, "Hard block off. Limits now only remind you.");
  } else {
    updateSettings({ hardBlock: true }, "Hard block on.");
  }
});

for (const [id, key] of [["breaks", "breakReminders"], ["recap", "nightlyRecap"], ["sound", "sound"]]) {
  $(`#${id}`).addEventListener("click", () => updateSettings({ [key]: !state.settings[key] }));
}

let alternativesTimer = null;

function flushAlternatives() {
  clearTimeout(alternativesTimer);
  alternativesTimer = null;
  const value = $("#alternatives").value;
  if (value !== state.settings.alternatives) updateSettings({ alternatives: value });
}

$("#alternatives").addEventListener("input", () => {
  clearTimeout(alternativesTimer);
  alternativesTimer = setTimeout(flushAlternatives, 700);
});
$("#alternatives").addEventListener("blur", flushAlternatives);

for (const button of $$("#modes [data-mode]")) {
  button.addEventListener("click", () => updateSettings({ mode: button.dataset.mode }));
}

$("#swatches").append(...Object.keys(ACCENTS).map((name) => el("button", {
  type: "button",
  class: "swatch",
  "data-accent": name,
  "aria-label": `${name[0].toUpperCase()}${name.slice(1)} accent`,
  "aria-pressed": "false",
  style: { "--c": ACCENTS[name] },
  onclick: () => updateSettings({ theme: name }),
})));

// ── Data ──────────────────────────────────────────────────────────

$("#export-csv").addEventListener("click", async () => {
  const { data } = await send("export");
  const dates = Object.keys(data.daily).sort();
  const seen = new Set(dates.flatMap((d) => Object.keys(data.daily[d])));
  const domains = [
    ...data.trackedDomains.filter((d) => seen.has(d)),
    ...[...seen].filter((d) => !data.trackedDomains.includes(d)).sort(),
  ];
  const lines = [["date", ...domains].join(",")];
  for (const date of dates) {
    lines.push([date, ...domains.map((d) => Math.round(((data.daily[date][d] || 0) / 60) * 10) / 10)].join(","));
  }
  download(new Blob([lines.join("\n") + "\n"], { type: "text/csv" }), `riphours-daily-minutes-${state.today}.csv`);
  toast(dates.length ? "CSV saved: minutes per site, per day." : "Nothing recorded yet. Saved an empty CSV.");
});

$("#export-json").addEventListener("click", async () => {
  const { data } = await send("export");
  const backup = {
    app: "RIPHours",
    version: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    data,
  };
  download(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), `riphours-backup-${state.today}.json`);
  toast("Backup saved.");
});

$("#import-json").addEventListener("click", () => $("#import-file").click());

$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    toast("That file isn't valid JSON.");
    return;
  }
  const exportedAt = Date.parse(payload?.exportedAt);
  $("#import-text").textContent =
    `Everything on this device (usage history, tracked sites, limits and settings) will be replaced with ${
      Number.isFinite(exportedAt) ? `the backup from ${formatDate(exportedAt, { year: true })}` : `the contents of ${file.name}`}.`;
  if ((await openDialog($("#import-dialog"))) !== "confirm") return;
  act(send("import", { payload }), "Backup restored.");
});

{
  const input = $("#reset-input");
  const confirm = $("#reset-confirm");
  input.addEventListener("input", () => {
    confirm.disabled = input.value.trim() !== "RESET";
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!confirm.disabled) $("#reset-dialog").close("confirm");
  });
  $("#reset-btn").addEventListener("click", async () => {
    input.value = "";
    confirm.disabled = true;
    if ((await openDialog($("#reset-dialog"))) !== "confirm") return;
    act(send("reset"), "Usage history erased.");
  });
}

// ── Start ─────────────────────────────────────────────────────────

$("#version").textContent = `RIPHours ${chrome.runtime.getManifest().version}`;
selectTab(view.tab);
moveIndicator(false);
document.fonts.ready.then(() => moveIndicator(false));

load(true).then(() => setInterval(load, 1000));
