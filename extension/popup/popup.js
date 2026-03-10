// ⚰ RIPHours — All-in-One Popup Logic (v1.1)

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
let ripData = null;
let viewMode = "total";
let searchQuery = "";
let lastRenderedDomains = "";

const DEFAULT_DOMAINS = [
  "reddit.com", "twitter.com", "x.com",
  "youtube.com", "instagram.com", "tiktok.com", "facebook.com"
];

// ── Storage Wrapper ───────────────────────────────────────────────
function saveAndSync(dataObj, callback) {
  chrome.storage.local.set(dataObj, () => {
    // Attempt best-effort cloud sync of settings/limits
    // We intentionally don't await this so the UI doesn't block on network latency
    chrome.storage.sync.set({ riphoursSync: dataObj.riphours }).catch(() => {});
    if (callback) callback();
  });
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtFull(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
function fmtShort(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}
function fmtTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return h + "h " + m + "m " + s + "s";
  if (m > 0) return m + "m " + s + "s";
  return s + "s";
}
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}
function daysSince(ts) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return days + " days ago";
}

// ── Appearance: mode (dark/light/system) + accent color ───────────
function applyAppearance(mode, accent) {
  // Build class list: mode class + accent class
  const classes = [];
  if (mode === "light") classes.push("mode-light");
  else if (mode === "system") classes.push("mode-system");
  // dark = no mode class needed (default)
  if (accent && accent !== "red") classes.push("theme-" + accent);
  document.body.className = classes.join(" ");

  $$(".theme-dot").forEach(d => d.classList.toggle("active", d.dataset.theme === accent));
  $$(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
}

// ── Tabs ──────────────────────────────────────────────────────────
$$(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach(t => t.classList.remove("active"));
    $$(".tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    $(`#tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Today/Total toggle ────────────────────────────────────────────
$$(".toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    viewMode = btn.dataset.view;
    if (ripData) render(ripData);
  });
});

// ── Search ────────────────────────────────────────────────────────
$("#search").addEventListener("input", (e) => {
  searchQuery = e.target.value.toLowerCase();
  if (ripData) renderChart(ripData);
});

// ── Get today's seconds ───────────────────────────────────────────
function getTodaySeconds(rip) {
  const today = new Date().toDateString();
  if (rip._todayDate !== today) {
    rip._todayStart = { ...rip.sites };
    rip._todayDate = today;
    chrome.storage.local.set({ riphours: rip });
  }
  const result = {};
  for (const domain of rip.trackedDomains) {
    const current = rip.sites[domain] || 0;
    const start = rip._todayStart?.[domain] || 0;
    result[domain] = Math.max(0, current - start);
  }
  return result;
}

// ── Render ────────────────────────────────────────────────────────
function render(rip) {
  ripData = rip;

  // Appearance
  const mode = rip.settings?.mode || "dark";
  const accent = rip.settings?.theme || "red";
  applyAppearance(mode, accent);

  // Hard block toggle
  const hb = rip.settings?.hardBlock !== false;
  $("#hard-block-toggle").classList.toggle("on", hb);

  // Better Alternatives
  const altInput = $("#better-alternatives");
  if (altInput && document.activeElement !== altInput) {
    altInput.value = rip.settings?.alternatives || "";
  }

  // Install date
  if (rip.installDate && !$("#since").textContent.trim()) {
    $("#since").textContent = "since " + daysSince(rip.installDate);
  }

  // Live Active Session Timer
  const sessionEl = $("#active-session-label");
  if (rip._session && rip._session.currentHost && rip._session.isWindowFocused) {
    const activeSecs = Math.max(0, Math.floor((Date.now() - rip._session.continuousStart) / 1000));
    sessionEl.textContent = `Currently on ${rip._session.currentHost} for ${fmtTimer(activeSecs)}`;
    sessionEl.style.display = "inline-block";
  } else {
    sessionEl.style.display = "none";
  }

  // Focus Surge UI State
  const surgeBtn = $("#btn-focus-surge");
  const surgeUntil = rip.settings?.focusModeUntil || 0;
  if (Date.now() < surgeUntil) {
    const remaining = Math.max(0, Math.ceil((surgeUntil - Date.now()) / 1000));
    surgeBtn.textContent = `⚡ Focus Active (${fmtTimer(remaining)})`;
    surgeBtn.disabled = true;
    surgeBtn.style.opacity = "0.7";
  } else {
    surgeBtn.textContent = "⚡ Start Focus Surge (25m)";
    surgeBtn.disabled = false;
    surgeBtn.style.opacity = "1";
  }

  // Determine view
  let viewSites = rip.sites || {};
  if (viewMode === "today") {
    viewSites = getTodaySeconds(rip);
  }
  const total = Object.values(viewSites).reduce((a, b) => a + b, 0);
  $("#hero-time").textContent = fmtFull(total);

  // Only re-render the chart and trends dynamically to avoid stealing focus from settings/limits
  renderChart(rip);
  renderTrends(rip);
  
  // Conditionally render domains/limits only if they haven't been built or domains changed
  const currentDomainsStr = JSON.stringify(rip.trackedDomains || []);
  if (lastRenderedDomains !== currentDomainsStr) {
      renderLimits(rip);
      renderDomains(rip);
      lastRenderedDomains = currentDomainsStr;
  }
}

// ── Bar chart ─────────────────────────────────────────────────────
function renderChart(rip) {
  const sites = rip.sites || {};
  const limits = rip.limits || {};
  const domains = rip.trackedDomains || [];

  let viewSites = sites;
  if (viewMode === "today") viewSites = getTodaySeconds(rip);

  // Filter by search
  let filtered = [...domains];
  if (searchQuery) {
    filtered = filtered.filter(d => d.includes(searchQuery));
  }

  const sorted = filtered.sort((a, b) => (viewSites[b] || 0) - (viewSites[a] || 0));
  const maxVal = Math.max(...sorted.map(d => viewSites[d] || 0), 1);
  const chart = $("#chart");
  chart.innerHTML = "";

  if (sorted.length === 0) {
    chart.innerHTML = '<div class="empty-msg">' + (searchQuery ? "No matches." : "No sites tracked yet.") + '</div>';
    return;
  }

  sorted.forEach(domain => {
    const secs = viewSites[domain] || 0;
    const pct = Math.max((secs / maxVal) * 100, secs > 0 ? 2 : 1);
    const limit = limits[domain];

    let barClass = "normal";
    let limitClass = "";
    if (limit) {
      const ratio = secs / limit;
      if (ratio >= 1) { barClass = "over"; limitClass = "over"; }
      else if (ratio >= 0.75) { barClass = "warn"; limitClass = "warn"; }
    }

    const row = document.createElement("div");
    row.className = "bar-row";
    let limitHtml = limit ? `<span class="limit-tag ${limitClass}">/ ${Math.floor(limit / 60)}m</span>` : "";

    // Limit marker: show a thin vertical line on the bar track at the limit position
    let limitMarkerHtml = "";
    if (limit && maxVal > 0) {
      const limitPct = Math.min((limit / maxVal) * 100, 100);
      limitMarkerHtml = `<div class="limit-marker" style="left:${limitPct}%"></div>`;
    }

    row.innerHTML = `
      <div class="bar-label">
        <a class="domain" href="https://${domain}" target="_blank" title="Open ${domain}">${domain}</a>
        <span class="time-info"><span class="time">${fmtShort(secs)}</span>${limitHtml}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${barClass}" data-target="${pct}" style="width:0%"></div>
        ${limitMarkerHtml}
      </div>
    `;
    chart.appendChild(row);
  });

  // Animate bars from 0% to target width
  requestAnimationFrame(() => {
    chart.querySelectorAll(".bar-fill").forEach(bar => {
      bar.style.width = bar.dataset.target + "%";
    });
  });
}

// ── Weekly trends ─────────────────────────────────────────────────
function renderTrends(rip) {
  const history = rip.history || {};
  const container = $("#trend-chart");
  container.innerHTML = "";

  const days = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const snapshot = history[key];
    let total = 0;
    if (snapshot) {
      total = Object.values(snapshot).reduce((a, b) => a + b, 0);
    }
    days.push({ label: dayNames[d.getDay()], total, isToday: i === 0 });
  }

  // If today has no history yet, use current sites
  if (days[6].total === 0) {
    days[6].total = Object.values(rip.sites || {}).reduce((a, b) => a + b, 0);
  }

  const maxDay = Math.max(...days.map(d => d.total), 1);

  days.forEach(day => {
    const wrap = document.createElement("div");
    wrap.className = "trend-bar-wrap" + (day.isToday ? " today" : "");
    const pct = Math.max((day.total / maxDay) * 100, 3);
    wrap.innerHTML = `
      <div class="trend-bar" style="height:${pct}%" title="${fmtShort(day.total)}"></div>
      <span class="trend-day">${day.label}</span>
    `;
    container.appendChild(wrap);
  });
}

// ── Limits tab ────────────────────────────────────────────────────
function renderLimits(rip) {
  const domains = rip.trackedDomains || [];
  const limits = rip.limits || {};
  const list = $("#limits-list");
  list.innerHTML = "";

  if (domains.length === 0) {
    list.innerHTML = '<div class="empty-msg">Add domains in Settings first.</div>';
    return;
  }

  [...domains].sort().forEach(domain => {
    const current = limits[domain] ? Math.floor(limits[domain] / 60) : "";
    const row = document.createElement("div");
    row.className = "limit-row";
    row.innerHTML = `
      <span class="domain-name">${domain}</span>
      <div class="limit-input-wrap">
        <input type="number" min="1" placeholder="—" value="${current}" data-domain="${domain}">
        <span class="unit">min</span>
        <button class="save-btn" data-domain="${domain}">Set</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll(".save-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const domain = btn.dataset.domain;
      const input = list.querySelector(`input[data-domain="${domain}"]`);
      const mins = parseInt(input.value);
      
      chrome.storage.local.get("riphours", (data) => {
        const activeRip = data.riphours || ripData;
        activeRip.limits = activeRip.limits || {};
        
        const currentLimit = activeRip.limits[domain];
        const newLimit = (!mins || mins <= 0) ? null : mins * 60;
        
        // If we are removing a limit or increasing it (giving ourselves more time), 
        // require Iron Will. Reducing the limit (making it stricter) is allowed freely.
        const isRelaxing = (currentLimit && !newLimit) || (currentLimit && newLimit && newLimit > currentLimit);
        
        const applyLimit = () => {
          if (!newLimit) {
            delete activeRip.limits[domain];
            toast("Limit removed for " + domain);
          } else {
            activeRip.limits[domain] = newLimit;
            toast("Limit set: " + (newLimit / 60) + "m for " + domain);
          }
          
          saveAndSync({ riphours: activeRip }, () => {
            ripData = activeRip; // sync local memory
            btn.textContent = "✓";
            btn.classList.add("saved");
            setTimeout(() => { btn.textContent = "Set"; btn.classList.remove("saved"); }, 1200);
          });
        };

        if (isRelaxing) {
          requireIronWill(applyLimit);
        } else {
          applyLimit();
        }
      });
    });
  });

  list.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        list.querySelector(`.save-btn[data-domain="${inp.dataset.domain}"]`).click();
      }
    });
  });
}

// ── Settings: domains (clickable links) ───────────────────────────
function renderDomains(rip) {
  const list = $("#domain-list");
  list.innerHTML = "";
  [...(rip.trackedDomains || [])].sort().forEach(d => {
    const item = document.createElement("div");
    item.className = "domain-item";
    item.innerHTML = `<a href="https://${d}" target="_blank">${d}</a><button class="del-btn" data-domain="${d}">×</button>`;
    list.appendChild(item);
  });
}

// ── Init ──────────────────────────────────────────────────────────
chrome.storage.local.get("riphours", async (data) => {
  if (data.riphours) {
    // Ensure settings exist
    data.riphours.settings = data.riphours.settings || { hardBlock: true, theme: "red", mode: "dark" };
    data.riphours.history = data.riphours.history || {};
    const session = await chrome.storage.session.get(null);
    data.riphours._session = session;
    render(data.riphours);
  }
});

// We only want to trigger a full re-render on storage change if it's NOT coming from the popup itself saving settings.
chrome.storage.onChanged.addListener((changes, area) => {
  // If the riphours obj changed, and we aren't the ones who just saved it (we use the 1 sec interval to sync time anyway)
  // we do not need to call the extremely destructive render() here. 
  // It is handled gracefully by the 1s interval picking up the new data without stealing focus.
});

// ── Auto-refresh: update bars every 1 second while popup is open ──
setInterval(async () => {
  chrome.runtime.sendMessage({ type: "force-flush" });
  const data = await chrome.storage.local.get("riphours");
  if (data.riphours) {
    const session = await chrome.storage.session.get(null);
    data.riphours._session = session;
    render(data.riphours);
  }
}, 1000);

// ── Share ─────────────────────────────────────────────────────────
$("#btn-share").addEventListener("click", () => {
  const total = Object.values(ripData.sites || {}).reduce((a, b) => a + b, 0);
  $("#card-time").textContent = fmtFull(total);
  $("#share-trigger-row").style.display = "none";
  $("#share-card-container").style.display = "block";
});

$("#btn-close-share").addEventListener("click", () => {
  $("#share-card-container").style.display = "none";
  $("#share-trigger-row").style.display = "block";
});

$("#btn-copy-share").addEventListener("click", async () => {
  const btn = $("#btn-copy-share");
  const card = $("#card");
  btn.textContent = "Generating...";
  btn.disabled = true;

  try {
    const canvas = await html2canvas(card, {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || "#0D0D0D",
      scale: 2,
    });
    
    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]);
        btn.textContent = "Copied!";
        toast("Image copied to clipboard!");
      } catch (err) {
        console.error("Clipboard write failed:", err);
        btn.textContent = "Failed";
        toast("Failed to copy image");
      }
      setTimeout(() => {
        btn.textContent = "Copy Image";
        btn.disabled = false;
      }, 2000);
    }, "image/png");
  } catch (err) {
    console.error("html2canvas failed:", err);
    btn.textContent = "Error";
    setTimeout(() => {
      btn.textContent = "Copy Image";
      btn.disabled = false;
    }, 2000);
  }
});

// ── Focus Surge ───────────────────────────────────────────────────
$("#btn-focus-surge").addEventListener("click", () => {
  ripData.settings = ripData.settings || {};
  ripData.settings.focusModeUntil = Date.now() + 25 * 60 * 1000; // 25 minutes
  saveAndSync({ riphours: ripData }, () => {
    toast("Focus Surge active! Tracked sites blocked.");
    render(ripData);
  });
});

// ── Domain delete ─────────────────────────────────────────────────
$("#domain-list").addEventListener("click", (e) => {
  if (e.target.classList.contains("del-btn")) {
    const domain = e.target.dataset.domain;
    ripData.trackedDomains = ripData.trackedDomains.filter(d => d !== domain);
    delete ripData.sites[domain];
    if (ripData.limits) delete ripData.limits[domain];
    saveAndSync({ riphours: ripData });
    toast("Removed " + domain);
  }
});

// ── Domain add ────────────────────────────────────────────────────
function addDomain() {
  let raw = $("#new-domain").value.trim().toLowerCase();
  if (!raw) return;
  raw = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!/^[a-z0-9]([a-z0-9\-]*\.)+[a-z]{2,}$/.test(raw)) {
    $("#new-domain").style.borderColor = "var(--accent)";
    toast("Invalid domain format");
    setTimeout(() => { $("#new-domain").style.borderColor = ""; }, 1200);
    return;
  }
  if (ripData.trackedDomains.includes(raw)) {
    toast("Already tracking " + raw);
    return;
  }
  ripData.trackedDomains.push(raw);
  saveAndSync({ riphours: ripData }, () => {
    $("#new-domain").value = "";
    toast("Now tracking " + raw);
  });
}
$("#add-btn").addEventListener("click", addDomain);
$("#new-domain").addEventListener("keydown", (e) => { if (e.key === "Enter") addDomain(); });

// ── Hard block toggle ─────────────────────────────────────────────
$("#hard-block-toggle").addEventListener("click", () => {
  const el = $("#hard-block-toggle");
  const on = !el.classList.contains("on");
  
  const applyToggle = () => {
    el.classList.toggle("on", on);
    ripData.settings = ripData.settings || {};
    ripData.settings.hardBlock = on;
    saveAndSync({ riphours: ripData });
    toast(on ? "Hard block enabled" : "Hard block disabled");
  };

  // If we are turning OFF the hard block, require iron will
  if (!on) {
    requireIronWill(applyToggle);
  } else {
    applyToggle();
  }
});

// ── Better Alternatives ───────────────────────────────────────────
$("#better-alternatives").addEventListener("input", (e) => {
  ripData.settings = ripData.settings || {};
  ripData.settings.alternatives = e.target.value;
  saveAndSync({ riphours: ripData });
});

// ── Mode picker (dark/light/system) ───────────────────────────────
$$(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    ripData.settings = ripData.settings || {};
    ripData.settings.mode = mode;
    saveAndSync({ riphours: ripData });
    applyAppearance(mode, ripData.settings.theme || "red");
    toast("Mode: " + mode);
  });
});

// ── Accent color picker ───────────────────────────────────────────
$$(".theme-dot").forEach(dot => {
  dot.addEventListener("click", () => {
    const accent = dot.dataset.theme;
    ripData.settings = ripData.settings || {};
    ripData.settings.theme = accent;
    saveAndSync({ riphours: ripData });
    applyAppearance(ripData.settings.mode || "dark", accent);
    toast("Accent: " + accent);
  });
});

// ── Export ─────────────────────────────────────────────────────────
$("#export-btn").addEventListener("click", () => {
  if (!ripData) return;
  const blob = new Blob([JSON.stringify(ripData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "riphours-data.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Data exported!");
});

$("#btn-export-csv").addEventListener("click", () => {
  if (!ripData || !ripData.history) return;
  const history = ripData.history;
  const dates = Object.keys(history).sort();
  if (dates.length === 0) {
    toast("No history to export.");
    return;
  }
  
  // Collect all domains ever tracked in history
  const allDomains = new Set();
  dates.forEach(d => {
    Object.keys(history[d]).forEach(domain => allDomains.add(domain));
  });
  const domainList = Array.from(allDomains).sort();

  // Build CSV header
  let csv = "Date," + domainList.join(",") + "\n";

  // Build rows
  dates.forEach(d => {
    const row = [d];
    domainList.forEach(domain => {
      row.push(history[d][domain] || 0);
    });
    csv += row.join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  
  // Use Chrome downloads API since we added the permission
  chrome.downloads.download({
    url: url,
    filename: "riphours-history.csv",
    saveAs: true
  }, () => {
    URL.revokeObjectURL(url);
    toast("CSV exported!");
  });
});

// ── Reset ─────────────────────────────────────────────────────────
$("#reset-btn").addEventListener("click", () => {
  $("#reset-overlay").classList.add("open");
  $("#reset-input").value = "";
  $("#reset-confirm").classList.remove("active");
  $("#reset-input").focus();
});
$("#reset-cancel").addEventListener("click", () => {
  $("#reset-overlay").classList.remove("open");
});
$("#reset-input").addEventListener("input", () => {
  $("#reset-confirm").classList.toggle("active", $("#reset-input").value === "RESET");
});
$("#reset-confirm").addEventListener("click", () => {
  if ($("#reset-input").value !== "RESET") return;
  const theme = ripData?.settings?.theme || "red";
  saveAndSync({
    riphours: {
      sites: {},
      trackedDomains: [...DEFAULT_DOMAINS],
      installDate: Date.now(),
      limits: {},
      history: {},
      settings: { hardBlock: true, theme, mode: ripData?.settings?.mode || "dark" }
    }
  }, () => {
    $("#reset-overlay").classList.remove("open");
    toast("All data cleared");
  });
});

// ── Iron Will Helper ──────────────────────────────────────────────
function requireIronWill(callback) {
  const phrase = "I am choosing to waste my limited time on earth doing nothing.";
  const input = $("#iron-will-input");
  const confirmBtn = $("#iron-will-confirm");
  const overlay = $("#iron-will-overlay");
  
  input.value = "";
  confirmBtn.disabled = true;
  confirmBtn.classList.remove("active");
  overlay.classList.add("open");
  input.focus();

  const handleInput = () => {
    if (input.value === phrase) {
      confirmBtn.disabled = false;
      confirmBtn.classList.add("active");
    } else {
      confirmBtn.disabled = true;
      confirmBtn.classList.remove("active");
    }
  };

  const clearListeners = () => {
    input.removeEventListener("input", handleInput);
    confirmBtn.removeEventListener("click", onConfirm);
    $("#iron-will-cancel").removeEventListener("click", onCancel);
  };

  const onConfirm = () => {
    if (input.value === phrase) {
      clearListeners();
      overlay.classList.remove("open");
      callback();
    }
  };

  const onCancel = () => {
    clearListeners();
    overlay.classList.remove("open");
  };

  input.addEventListener("input", handleInput);
  confirmBtn.addEventListener("click", onConfirm);
  $("#iron-will-cancel").addEventListener("click", onCancel);
}
