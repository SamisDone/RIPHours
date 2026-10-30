// Runs only on tracked sites. It tells the worker when the page is in use and
// draws the soft-limit overlay; the worker decides what that time is worth.

(() => {
  globalThis.__riphoursTeardown?.();
  for (const stale of document.querySelectorAll("[data-riphours]")) stale.remove();

  const HEARTBEAT_MS = 15_000;
  const IDLE_MS = 60_000;
  const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"];
  const BLOCKED_EVENTS = ["wheel", "touchmove", "keydown", "keyup", "keypress"];

  let lastInput = 0;
  let lastSent = 0;
  const media = new Set();
  let overlay = null;

  const alive = () => {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  };

  function send(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      teardown();
    }
  }

  function mediaPlaying() {
    for (const el of new Set([...media, ...document.querySelectorAll("video, audio")])) {
      if (!el.isConnected) {
        media.delete(el);
        continue;
      }
      if (!el.paused && !el.ended && !el.muted && el.volume > 0 && el.readyState > 2) return true;
    }
    return false;
  }

  function beat(now = Date.now()) {
    if (!alive()) return teardown();
    if (overlay || document.visibilityState !== "visible") return;
    const playing = mediaPlaying();
    const sinceInput = now - lastInput;
    if (!playing && sinceInput >= IDLE_MS) return;
    lastSent = now;
    send({ type: "activity", ago: playing ? 0 : sinceInput });
  }

  function onInput() {
    const now = Date.now();
    lastInput = now;
    // The first input after a quiet spell is reported right away, so the
    // worker starts counting without waiting for the next heartbeat.
    if (now - lastSent > HEARTBEAT_MS) beat(now);
  }

  function onPlay(event) {
    if (!(event.target instanceof HTMLMediaElement)) return;
    media.add(event.target);
    if (overlay) event.target.pause();
    else beat();
  }

  // ── Overlay ───────────────────────────────────────────────────────

  const CSS = `
    :host { all: initial; }
    .backdrop {
      position: fixed; inset: 0; display: grid; place-items: center; padding: 24px;
      background: rgba(8, 8, 10, 0.74); backdrop-filter: blur(6px);
      font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #ecebe8; -webkit-font-smoothing: antialiased;
      opacity: 0; transition: opacity 200ms ease-out;
    }
    .card {
      box-sizing: border-box; width: min(420px, 100%); padding: 28px;
      background: #16161a; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
      transform: translateY(8px); transition: transform 200ms ease-out;
    }
    .in { opacity: 1; }
    .in .card { transform: none; }
    .eyebrow {
      margin: 0 0 14px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--accent);
    }
    h1 { margin: 0 0 8px; font-size: 22px; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; }
    .body { margin: 0 0 24px; color: #a1a1a8; }
    .actions { display: flex; gap: 8px; }
    button {
      all: unset; box-sizing: border-box; flex: 1; padding: 10px 14px; border-radius: 8px;
      font-family: inherit; font-size: 14px; font-weight: 500; line-height: 1.2; text-align: center;
      cursor: pointer; color: #ecebe8; background: #1d1d22; border: 1px solid rgba(255, 255, 255, 0.08);
      transition: background-color 120ms ease-out;
    }
    button:hover { background: #26262c; }
    .primary { color: #fff; background: var(--accent); border-color: transparent; }
    .primary:hover { background: var(--accent); filter: brightness(1.08); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) {
      .backdrop, .card { transition: none; }
      .card { transform: none; }
    }
  `;

  function showOverlay({ domain, spent, limit, accent }) {
    if (overlay || !document.body) return;

    const host = document.createElement("div");
    host.setAttribute("data-riphours", "");
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="backdrop">
        <div class="card" role="alertdialog" aria-modal="true" aria-labelledby="title" aria-describedby="body">
          <p class="eyebrow">RIPHours</p>
          <h1 id="title">Limit reached</h1>
          <p class="body" id="body"></p>
          <div class="actions">
            <button class="primary" data-action="close">Close tab</button>
            <button data-action="snooze">10 more minutes</button>
          </div>
        </div>
      </div>`;
    const backdrop = root.querySelector(".backdrop");
    backdrop.style.setProperty("--accent", /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#e5383b");
    root.getElementById("body").textContent =
      `You've spent ${spent} on ${domain} today. Your daily limit is ${limit}.`;

    const buttons = [...root.querySelectorAll("button")];
    root.addEventListener("click", (event) => {
      const action = event.target.closest?.("button")?.dataset.action;
      if (action === "close") send({ type: "close-tab" });
      if (action === "snooze") {
        send({ type: "snooze" });
        hideOverlay();
      }
    });
    const card = root.querySelector(".card");
    // Keys pressed on the overlay stop here, away from the page's own shortcuts.
    for (const type of ["keyup", "keypress"]) card.addEventListener(type, (event) => event.stopPropagation());
    card.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Tab") return;
      event.preventDefault();
      const index = buttons.indexOf(root.activeElement);
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    });

    // Anything aimed at the page while the overlay is up goes nowhere.
    const swallow = (event) => {
      if (event.target === host && event.type.startsWith("key")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, swallow, { capture: true, passive: false });

    for (const el of document.querySelectorAll("video, audio")) el.pause();
    for (const el of media) el.pause();

    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const previousFocus = document.activeElement;

    document.body.append(host);
    requestAnimationFrame(() => backdrop.classList.add("in"));
    buttons[0].focus();

    overlay = {
      remove() {
        for (const type of BLOCKED_EVENTS) window.removeEventListener(type, swallow, { capture: true });
        html.style.overflow = previousOverflow;
        host.remove();
        if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
      },
    };
  }

  function hideOverlay() {
    overlay?.remove();
    overlay = null;
  }

  // ── Wiring ────────────────────────────────────────────────────────

  function onMessage(msg, _sender, respond) {
    if (msg?.type === "show-overlay") showOverlay(msg);
    else if (msg?.type === "hide-overlay") hideOverlay();
    else return;
    respond({ ok: true });
  }

  const timer = setInterval(() => beat(), HEARTBEAT_MS);
  for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { capture: true, passive: true });
  document.addEventListener("play", onPlay, { capture: true, passive: true });
  chrome.runtime.onMessage.addListener(onMessage);

  function teardown() {
    clearInterval(timer);
    for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
    document.removeEventListener("play", onPlay, { capture: true });
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {}
    hideOverlay();
    if (globalThis.__riphoursTeardown === teardown) delete globalThis.__riphoursTeardown;
  }

  globalThis.__riphoursTeardown = teardown;
  if (mediaPlaying()) beat();
})();
