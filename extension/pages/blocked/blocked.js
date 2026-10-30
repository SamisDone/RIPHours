import { FOCUS_MS, applyTheme, formatClock, formatDuration, formatWords, nextMidnight, send } from "../../shared/core.js";

const $ = (selector) => document.querySelector(selector);

const params = new URLSearchParams(location.search);
const site = params.get("site") || "";
const from = params.get("from") || "";
// Only ever send people back to a normal web page.
const backUrl = /^https?:\/\//i.test(from) ? from : site ? `https://${site}/` : "";

let alternative = null;

function setTitle(before, domain, after) {
  const title = $("#title");
  title.replaceChildren(before, Object.assign(document.createElement("em"), { textContent: domain }), after);
}

function render(state) {
  const now = Date.now();
  const countdown = $("#countdown");
  const back = $("#back");

  if (state.reason === "focus") {
    const left = state.focusUntil - now;
    setTitle("", site, " can wait.");
    $("#lede").textContent = `Focus Surge: ${formatClock(left)} left.`;
    countdown.hidden = false;
    $("#countdown-bar").style.setProperty("--p", `${Math.min(100, (1 - left / FOCUS_MS) * 100)}%`);
    document.title = `${site} blocked · RIPHours`;
  } else if (state.reason === "limit") {
    const untilMidnight = nextMidnight(now) - now;
    const when = untilMidnight < 60_000 ? "in under a minute" : `in ${formatDuration(untilMidnight / 1000)}`;
    setTitle("Time's up for ", site, ".");
    $("#lede").textContent = `You've used your ${formatWords(state.limit)} for today. It unlocks at midnight, ${when}.`;
    countdown.hidden = true;
    document.title = `${site} blocked · RIPHours`;
  } else {
    setTitle("", site || "This site", " is open again.");
    $("#lede").textContent = "The block has lifted. Go back if you still want to.";
    countdown.hidden = true;
    document.title = `${site} is open · RIPHours`;
  }

  back.hidden = Boolean(state.reason) || !backUrl;
  if (!back.hidden) {
    back.href = backUrl;
    back.textContent = `Back to ${site}`;
  }

  alternative ??= state.alternatives[Math.floor(Math.random() * state.alternatives.length)] ?? "";
  $("#instead").hidden = !alternative || !state.reason;
  $("#instead-text").textContent = alternative;
}

let pending = false;

async function update() {
  if (pending) return;
  pending = true;
  try {
    const state = await send("block-state", { site });
    applyTheme(state.settings);
    render(state);
  } catch (err) {
    console.error("RIPHours:", err);
  } finally {
    pending = false;
  }
}

update();
setInterval(update, 1000);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") update();
});
