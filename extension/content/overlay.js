// ⚰ RIPHours — Content Script (passive listener + idle detection + alerts)

let activityTimer = null;

const ACCENT_COLORS = {
  red:    { color: "#ef4444", hover: "#dc2626", glow: "rgba(239, 68, 68, 0.2)", glowLight: "rgba(239, 68, 68, 0.1)", glowBorder: "rgba(239, 68, 68, 0.2)", glowStrong: "rgba(239, 68, 68, 0.3)" },
  green:  { color: "#10b981", hover: "#059669", glow: "rgba(16, 185, 129, 0.2)", glowLight: "rgba(16, 185, 129, 0.1)", glowBorder: "rgba(16, 185, 129, 0.2)", glowStrong: "rgba(16, 185, 129, 0.3)" },
  purple: { color: "#8b5cf6", hover: "#7c3aed", glow: "rgba(139, 92, 246, 0.2)", glowLight: "rgba(139, 92, 246, 0.1)", glowBorder: "rgba(139, 92, 246, 0.2)", glowStrong: "rgba(139, 92, 246, 0.3)" },
  blue:   { color: "#3b82f6", hover: "#2563eb", glow: "rgba(59, 130, 246, 0.2)", glowLight: "rgba(59, 130, 246, 0.1)", glowBorder: "rgba(59, 130, 246, 0.2)", glowStrong: "rgba(59, 130, 246, 0.3)" },
  orange: { color: "#f97316", hover: "#ea580c", glow: "rgba(249, 115, 22, 0.2)", glowLight: "rgba(249, 115, 22, 0.1)", glowBorder: "rgba(249, 115, 22, 0.2)", glowStrong: "rgba(249, 115, 22, 0.3)" },
  pink:   { color: "#f43f5e", hover: "#e11d48", glow: "rgba(244, 63, 94, 0.2)", glowLight: "rgba(244, 63, 94, 0.1)", glowBorder: "rgba(244, 63, 94, 0.2)", glowStrong: "rgba(244, 63, 94, 0.3)" },
};

async function getAccent() {
  try {
    const data = await chrome.storage.local.get("riphours");
    const theme = data.riphours?.settings?.theme || "red";
    return ACCENT_COLORS[theme] || ACCENT_COLORS.red;
  } catch { return ACCENT_COLORS.red; }
}

function send(msg) {
  try {
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage(msg).catch(() => {});
    }
  } catch {}
}

// Report user activity for idle detection (throttled to once per 10s)
function reportActivity() {
  if (activityTimer) return;
  send({ type: "activity" });
  activityTimer = setTimeout(() => { activityTimer = null; }, 10000);
}

document.addEventListener("visibilitychange", () => {
  send({ type: "visibility", visible: document.visibilityState === "visible" });
});

window.addEventListener("focus", () => {
  send({ type: "visibility", visible: true });
});

window.addEventListener("blur", () => {
  send({ type: "visibility", visible: false });
});

// Passive activity listeners for idle detection
document.addEventListener("mousemove", reportActivity, { passive: true });
document.addEventListener("keydown", reportActivity, { passive: true });
document.addEventListener("scroll", reportActivity, { passive: true });
document.addEventListener("touchstart", reportActivity, { passive: true });

// Message listener for alerts
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "show-alert") {
    showGlassModal(msg.host, msg.hardBlock);
  } else if (msg.type === "show-dismissable-alert") {
    showDismissableModal(msg.host);
  } else if (msg.type === "remove-overlay") {
    removeExistingOverlays();
  }
});

function removeExistingOverlays() {
  const ids = ["riphours-glass-modal", "riphours-dismissable-modal"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.opacity = "0";
      const modal = el.querySelector("div");
      if (modal) modal.style.transform = "scale(0.95) translateY(20px)";
      setTimeout(() => el.remove(), 400);
    }
  });
}

async function showGlassModal(host, hardBlock) {
  if (document.getElementById("riphours-glass-modal")) return;

  const accent = await getAccent();

  const overlay = document.createElement("div");
  overlay.id = "riphours-glass-modal";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(9, 9, 11, 0.8); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    z-index: 2147483647; display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', -apple-system, system-ui, sans-serif;
    opacity: 0; transition: opacity 0.4s ease;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: #09090b; padding: 48px; border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.05); text-align: center; max-width: 480px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
    transform: scale(0.95) translateY(20px); transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  if (hardBlock) {
    modal.innerHTML = `
      <h1 style="font-size: 36px; font-weight: 700; color: #fafafa; margin: 0 0 16px; letter-spacing: -0.02em;">Time's Up</h1>
      <p style="font-size: 16px; color: #a1a1aa; margin: 0 0 40px; line-height: 1.6;">You've hit your limit on <span style="color: ${accent.color}; font-weight: 600;">${host}</span>.<br>Focus on what matters. We've limited access for now.</p>
      <button id="rh-stop-btn" style="
        background: ${accent.color}; color: #fff; border: none;
        padding: 14px 40px; border-radius: 12px; font-size: 15px; font-weight: 600;
        cursor: pointer; box-shadow: 0 4px 12px ${accent.glow}; transition: all 0.2s;
      ">I Understand</button>
    `;
  } else {
    modal.innerHTML = `
      <h1 style="font-size: 36px; font-weight: 700; color: #fafafa; margin: 0 0 16px; letter-spacing: -0.02em;">Time's Up</h1>
      <p style="font-size: 16px; color: #a1a1aa; margin: 0 0 40px; line-height: 1.6;">You've hit your limit on <span style="color: ${accent.color}; font-weight: 600;">${host}</span>.<br>Are you sure you want to stay?</p>
      <div style="display: flex; gap: 16px; justify-content: center;">
        <button id="rh-stop-btn" style="
          background: transparent; color: #fafafa; border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 14px 24px; border-radius: 12px; font-size: 15px; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
        ">I'll Stop</button>
        <button id="rh-stay-btn" style="
          background: ${accent.color}; color: #fff; border: none;
          padding: 14px 32px; border-radius: 12px; font-size: 15px; font-weight: 600;
          cursor: pointer; box-shadow: 0 4px 12px ${accent.glow}; transition: all 0.2s;
        ">Let Me Stay</button>
      </div>
    `;
  }

  const style = document.createElement("style");
  style.textContent = `
    #rh-stop-btn:hover { background: ${hardBlock ? accent.hover : 'rgba(255, 255, 255, 0.05)'}; transform: translateY(-1px); ${hardBlock ? `box-shadow: 0 8px 24px ${accent.glowStrong};` : ''} }
    #rh-stay-btn:hover { background: ${accent.hover}; transform: translateY(-1px); box-shadow: 0 8px 24px ${accent.glowStrong}; }
  `;

  overlay.appendChild(style);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    modal.style.transform = "scale(1) translateY(0)";
  });

  const stopBtn = document.getElementById("rh-stop-btn");
  const stayBtn = document.getElementById("rh-stay-btn");

  stopBtn.addEventListener("click", () => {
    removeExistingOverlays();
    setTimeout(() => {
      if (hardBlock) {
        window.location.href = chrome.runtime.getURL("pages/blocked/blocked.html?site=" + host);
      } else {
        chrome.runtime.sendMessage({ type: "close-active-tab" });
      }
    }, 400);
  });

  if (stayBtn) {
    stayBtn.addEventListener("click", () => {
      removeExistingOverlays();
      send({ type: "dismiss-alert", host }); // Inform background to stay dismissed
    });
  }
}

async function showDismissableModal(host) {
  if (document.getElementById("riphours-dismissable-modal")) return;

  const accent = await getAccent();

  const overlay = document.createElement("div");
  overlay.id = "riphours-dismissable-modal";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(9, 9, 11, 0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    z-index: 2147483647; display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', -apple-system, system-ui, sans-serif;
    opacity: 0; transition: opacity 0.4s ease;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: #09090b; padding: 32px; border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.05); text-align: center; max-width: 420px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
    transform: scale(0.95) translateY(20px); transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  modal.innerHTML = `
    <h1 style="font-size: 24px; font-weight: 700; color: #fafafa; margin: 0 0 12px; letter-spacing: -0.02em;">Over Limit</h1>
    <p style="font-size: 15px; color: #a1a1aa; margin: 0 0 32px; line-height: 1.6;">You've already exceeded your daily limit for <span style="color: ${accent.color}; font-weight: 600;">${host}</span>.<br>Are you sure you want to be here?</p>
    <button id="rh-dismiss-btn" style="
      background: transparent; color: #fafafa; border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 12px 32px; border-radius: 10px; font-size: 14px; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
    ">Let Me Stay</button>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #rh-dismiss-btn:hover { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.2); }
  `;

  overlay.appendChild(style);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    modal.style.transform = "scale(1) translateY(0)";
  });

  document.getElementById("rh-dismiss-btn").addEventListener("click", () => {
    removeExistingOverlays();
    send({ type: "dismiss-alert", host }); // Inform background to stay dismissed
  });
}
