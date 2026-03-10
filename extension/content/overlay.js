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
    background: rgba(13, 13, 13, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    z-index: 2147483647; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
    opacity: 0; transition: opacity 0.3s ease;
  `;

  const audioURL = chrome.runtime.getURL("background/alert.mp3");

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: rgba(24, 24, 27, 0.6); padding: 48px; border-radius: 24px;
    border: 1px solid rgba(230, 57, 70, 0.4); text-align: center; max-width: 500px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.1);
    transform: scale(0.95) translateY(20px); transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  modal.innerHTML = `
    <h1 style="font-size: 42px; font-weight: 900; color: #E63946; margin: 0 0 12px; letter-spacing: -0.02em; animation: rh-shake 0.5s ease-in-out;">⚰ TIME'S UP</h1>
    <p style="font-size: 16px; color: rgba(241, 250, 238, 0.8); margin: 0 0 40px; line-height: 1.5;">You've exceeded your limit on <b>${host}</b>.<br>Close the tab. Go outside. Touch grass.</p>
    <button id="rh-stop-btn" style="
      background: linear-gradient(135deg, #E63946, #d32f3c); color: #fff; border: none;
      padding: 16px 40px; border-radius: 12px; font-size: 14px; font-weight: 900;
      text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer;
      box-shadow: 0 8px 24px rgba(230, 57, 70, 0.3); transition: transform 0.15s, box-shadow 0.15s;
    ">I'll Stop</button>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes rh-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-8px); }
      75% { transform: translateX(8px); }
    }
    #rh-stop-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(230, 57, 70, 0.4); }
    #rh-stop-btn:active { transform: translateY(0); box-shadow: 0 4px 12px rgba(230, 57, 70, 0.3); }
  `;

  overlay.appendChild(style);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Trigger animations
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
    background: rgba(13, 13, 13, 0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    z-index: 2147483647; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
    opacity: 0; transition: opacity 0.3s ease;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: rgba(24, 24, 27, 0.85); padding: 32px; border-radius: 20px;
    border: 1px solid rgba(255, 183, 3, 0.4); text-align: center; max-width: 420px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    transform: scale(0.95) translateY(20px); transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  modal.innerHTML = `
    <h1 style="font-size: 28px; font-weight: 800; color: #FFB703; margin: 0 0 12px; letter-spacing: -0.02em;">⚠️ OVER LIMIT</h1>
    <p style="font-size: 15px; color: rgba(241, 250, 238, 0.8); margin: 0 0 32px; line-height: 1.5;">You've already exceeded your daily limit for <b>${host}</b>.<br>Are you sure you want to be here?</p>
    <button id="rh-dismiss-btn" style="
      background: transparent; color: #fff; border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 12px 32px; border-radius: 8px; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: background 0.2s;
    ">I know, let me stay</button>
  `;

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
