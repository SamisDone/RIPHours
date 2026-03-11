// ⚰ RIPHours — Content Script (passive listener + idle detection + alerts)

let activityTimer = null;

function send(msg) {
  try { chrome.runtime.sendMessage(msg); } catch {}
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
  }
});

function showGlassModal(host, hardBlock) {
  if (document.getElementById("riphours-glass-modal")) return;

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

  modal.innerHTML = `
    <h1 style="font-size: 36px; font-weight: 700; color: #fafafa; margin: 0 0 16px; letter-spacing: -0.02em;">Time's Up</h1>
    <p style="font-size: 16px; color: #a1a1aa; margin: 0 0 40px; line-height: 1.6;">You've hit your limit on <span style="color: #6366f1; font-weight: 600;">${host}</span>.<br>Focus on what matters. We've limited access for now.</p>
    <button id="rh-stop-btn" style="
      background: #6366f1; color: #fff; border: none;
      padding: 14px 40px; border-radius: 12px; font-size: 15px; font-weight: 600;
      cursor: pointer; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); transition: all 0.2s;
    ">I Understand</button>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #rh-stop-btn:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3); }
  `;

  overlay.appendChild(style);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    modal.style.transform = "scale(1) translateY(0)";
  });

  document.getElementById("rh-stop-btn").addEventListener("click", () => {
    overlay.style.opacity = "0";
    modal.style.transform = "scale(0.95) translateY(20px)";
    setTimeout(() => {
      overlay.remove();
      if (hardBlock) {
        window.location.href = chrome.runtime.getURL("pages/blocked/blocked.html?site=" + host);
      } else {
        chrome.runtime.sendMessage({ type: "close-active-tab" });
      }
    }, 400);
  });
}

function showDismissableModal(host) {
  if (document.getElementById("riphours-dismissable-modal")) return;

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
    <p style="font-size: 15px; color: #a1a1aa; margin: 0 0 32px; line-height: 1.6;">You've already exceeded your daily limit for <span style="color: #6366f1; font-weight: 600;">${host}</span>.<br>Are you sure you want to be here?</p>
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
    overlay.style.opacity = "0";
    modal.style.transform = "scale(0.95) translateY(20px)";
    setTimeout(() => overlay.remove(), 400);
  });
}
