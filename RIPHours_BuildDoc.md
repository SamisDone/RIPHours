# ⚰ RIPHours — Agent Build Document

> Your scroll history, measured in days of your life.

---

## Overview

RIPHours is a Chromium/Firefox browser extension that silently tracks cumulative time spent on configurable social media and entertainment sites. It converts raw minutes into human-scale units — hours, days, weeks — and surfaces the total through a persistent badge and a shareable shock-card. No account required. All data stays local.

---

## Project File Structure

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest — permissions, background, content scripts |
| `background/worker.js` | Service worker — time tracking logic, storage writes |
| `content/overlay.js` | Injected script — detects active tab focus/blur events |
| `popup/popup.html` | Extension popup UI shell |
| `popup/popup.js` | Popup logic — reads storage, renders stats |
| `popup/popup.css` | Popup styles — dark theme |
| `options/options.html` | Settings page — configure tracked sites |
| `options/options.js` | Settings logic — read/write site list |
| `share/card.html` | Shareable shock-card template rendered in new tab |
| `share/card.js` | Populates card with live stats, triggers screenshot |
| `icons/icon16.png` | Toolbar icon 16x16 |
| `icons/icon48.png` | Toolbar icon 48x48 |
| `icons/icon128.png` | Store listing icon 128x128 |

---

## manifest.json — Required Permissions

Use **Manifest V3**. Required fields:

| Permission | Reason |
|------------|--------|
| `tabs` | Detect active tab URL to match against tracked sites |
| `storage` | Persist time data locally via chrome.storage.local |
| `alarms` | Fire periodic save events every 30 seconds |
| `scripting` | Inject content script into matched pages |
| `host_permissions` | Set to `<all_urls>` to support any user-configured site |
| `background.service_worker` | `background/worker.js` — MV3 service worker |

---

## Functional Requirements

| ID | Requirement | Notes |
|----|-------------|-------|
| FR-01 | Track time on user-configured domains. Default list: `reddit.com`, `twitter.com`, `x.com`, `youtube.com`, `instagram.com`, `tiktok.com`, `facebook.com` | Configurable in options page |
| FR-02 | Only count time when the tab is the active focused tab AND the browser window is focused. Pause on blur. | Use Page Visibility API + window focus events |
| FR-03 | Persist cumulative seconds per domain to `chrome.storage.local` every 30 seconds via `chrome.alarms` | Never lose more than 30s of data on crash |
| FR-04 | Show total lifetime time as a badge on the toolbar icon. Format: `<N>d` if over 24h, else `<N>h` | Use `chrome.action.setBadgeText` |
| FR-05 | Popup must show: total lifetime time in days+hours+minutes, per-site breakdown bar chart, and a Share button | Bar chart can be CSS-only, no canvas required |
| FR-06 | Convert and display time in human terms: seconds → minutes → hours → days. Example: `11 days, 4 hours, 22 minutes of your life` | Always show all three units |
| FR-07 | Share button opens `share/card.html` in a new tab showing a styled shock-card with total time and a Copy image button | Use html2canvas to screenshot the card |
| FR-08 | Options page allows user to add/remove tracked domains. Changes apply immediately without restart. | Validate domain format on input |
| FR-09 | Options page shows a reset button that clears all stored time data after a confirmation dialog. | Irreversible — confirm with typed `RESET` |
| FR-10 | On first install, show a welcome tab explaining what RIPHours does and list the default tracked sites. | One-time only via `chrome.runtime.onInstalled` |

---

## Non-Functional Requirements

| ID | Requirement | Notes |
|----|-------------|-------|
| NF-01 | Zero external network requests. All data stays in `chrome.storage.local` only. | Privacy-first — no analytics, no telemetry |
| NF-02 | Service worker must not keep itself alive artificially. Use alarms, not setInterval. | MV3 compliance |
| NF-03 | Popup must load and render in under 200ms. | No heavy frameworks — vanilla JS only |
| NF-04 | Extension must not inject any UI onto the host page. Content script is passive listener only. | No DOM mutation on tracked sites |
| NF-05 | Total storage footprint must stay under 100KB for 1 year of tracking data. | Store only per-domain seconds, not per-session |
| NF-06 | Must pass Chrome Web Store review. No `eval()`, no remote code execution. | MV3 CSP compliance |
| NF-07 | Must work in Chrome 110+, Edge 110+, and Firefox 115+ (with minor manifest adjustments). | Test on all three |

---

## UI / UX Requirements

| ID | Requirement | Notes |
|----|-------------|-------|
| UI-01 | Color scheme: background `#0D0D0D`, accent `#E63946` (red), text `#F1FAEE` (off-white). | Match brand identity |
| UI-02 | Popup width: 320px. Show big bold total time at top, site list below, share button at bottom. | No scrolling inside popup |
| UI-03 | Badge background color: `#E63946`. Badge text color: white. | `chrome.action.setBadgeBackgroundColor` |
| UI-04 | Share card: full-bleed dark background, large centered time display, tagline `"RIPHours tracked this. Are you okay?"`, RIPHours logo top-left. | Designed to be screenshotted and posted |
| UI-05 | Options page uses same dark theme. Simple list of domains with delete (×) buttons and an Add site input at the bottom. | Clean, minimal |

---

## Data Storage Schema

All data stored in `chrome.storage.local` under a single key:

```json
{
  "riphours": {
    "sites": {
      "reddit.com": 84600,
      "youtube.com": 321000
    },
    "trackedDomains": ["reddit.com", "youtube.com", "twitter.com", "x.com", "instagram.com", "tiktok.com", "facebook.com"],
    "installDate": 1700000000000
  }
}
```

Values are cumulative seconds (integer). `installDate` is a Unix millisecond timestamp.

---

*RIPHours · Agent Build Doc v1.0 · Give this entire document to the coding agent to build the extension.*
