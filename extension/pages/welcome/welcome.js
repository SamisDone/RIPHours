import { DEFAULT_DOMAINS, SUGGESTED_DOMAINS, applyTheme, faviconUrl, send } from "../../shared/core.js";

const $ = (selector) => document.querySelector(selector);

let domains = [];
let tracked = new Set();

function chip(domain) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.dataset.domain = domain;
  button.setAttribute("aria-pressed", String(tracked.has(domain)));
  const icon = Object.assign(document.createElement("img"), { src: faviconUrl(domain), alt: "", width: 16, height: 16 });
  button.append(icon, domain);
  button.addEventListener("click", () => toggle(domain));
  return button;
}

function render() {
  const chips = $("#chips");
  // Rebuild only when the list grows, so keyboard focus stays on the chip.
  if (chips.children.length !== domains.length) chips.replaceChildren(...domains.map(chip));
  for (const button of chips.children) {
    button.setAttribute("aria-pressed", String(tracked.has(button.dataset.domain)));
  }
  const n = tracked.size;
  $("#status").textContent = n
    ? `${n} ${n === 1 ? "site" : "sites"} tracked. Changes save as you go.`
    : "Nothing tracked yet. Pick at least one site.";
}

async function save() {
  const list = domains.filter((d) => tracked.has(d));
  try {
    const result = await send("set-domains", { domains: list });
    tracked = new Set(result.trackedDomains);
  } catch (err) {
    console.error("RIPHours:", err);
  }
  render();
}

function toggle(domain) {
  if (tracked.has(domain)) tracked.delete(domain);
  else tracked.add(domain);
  render();
  save();
}

$("#add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#add-input");
  const error = $("#add-error");
  try {
    const { domain } = await send("add-domain", { domain: input.value });
    input.value = "";
    error.hidden = true;
    if (!domains.includes(domain)) domains.push(domain);
    tracked.add(domain);
    render();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
});

$("#add-input").addEventListener("input", () => {
  $("#add-error").hidden = true;
});

$("#done").addEventListener("click", async () => {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id) chrome.tabs.remove(tab.id);
  else window.close();
});

const state = await send("get-state");
applyTheme(state.settings);
tracked = new Set(state.trackedDomains);
domains = [...new Set([...DEFAULT_DOMAINS, ...state.trackedDomains, ...SUGGESTED_DOMAINS])];
render();
