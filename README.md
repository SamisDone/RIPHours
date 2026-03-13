# ⚰ RIPHours

**Measure your scroll history in days of your life.**

RIPHours is a minimalist, privacy-first Chrome extension that tracks the time you spend on time-sink websites and presents it in a shocking format — cumulative days, hours, and minutes of your life you'll never get back.

## 🚀 Features

### Core Tracking

- **Accurate time tracking** using Page Visibility API + window focus events.
- **Auto-idle detection** — pauses tracking if no mouse/keyboard activity is detected for 60 seconds.
- **Precise Real-Time Enforcement** — background checks run every 5 seconds to ensure limits are hit exactly.

### Limits & Blocking

- **Per-site daily time limits** — set specific limits for any tracked site.
- **Hard Mode** — toggle absolute blocking to redirect you away once your limit is reached.
- **Focus Surge (NEW)** — hit a button for 25 minutes of deep work where all tracked sites are instantly blocked.
- **Iron Will (NEW)** — a friction system requiring you to type a phrase to loosen your restrictions.
- **Dynamic Alternatives (NEW)** — get random suggestions for better things to do on the block screen.

### Personalization & Utility

- **Custom Themes** — 6 accent colors and support for Dark, Light, and System modes.
- **Weekly Trends** — see a 7-day breakdown of your scrolling habits.
- **Cloud Sync** — synchronize your settings and daily history across all your Chrome devices.
- **Data Export** — download your 14-day history as a CSV for manual analysis.

## 🛡 Privacy

- **Zero network requests.** Your data stays on your machine and/or your encrypted Chrome Sync account.
- **No accounts, no analytics, no tracking pixels.**
- **Local-first.** All tracking is done locally.

## 📂 Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the `extension/` folder in this project.

---

_Life is short. RIPHours makes sure you know exactly where it's going._
