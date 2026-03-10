# ⚰ RIPHours: Complete Feature Guide

**Measure your scroll history in days of your life.**

RIPHours is a powerful, privacy-first Chrome extension designed to combat digital addiction. It doesn't just "track time" — it presents your usage in the brutal context of how many actual days of your limited life you've spent on time-sink websites.

---

## 🕒 I. Core Tracking & precision

### 1. Accurate Activity Detection

Unlike simple timers, RIPHours uses the **Page Visibility API** combined with **Window Focus events**. It only counts time when the tab is actually visible and you are actively looking at the window. If you switch tabs or minimize Chrome, the timer stops instantly.

### 2. Auto-Idle Protection

The extension features a **60-second idle timeout**. If there is no mouse movement, keyboard input, or scrolling detected for 60 seconds, the tracking pauses automatically. This ensures your stats aren't inflated if you walk away from your computer with a tab open.

### 3. Smart Domain Normalization

RIPHours intelligently rolls up subdomains into their base domains (e.g., `m.facebook.com` and `web.facebook.com` both count toward `facebook.com`). You can manage exactly which domains are tracked in the Settings tab.

### 4. Precise Real-Time Enforcement

While most extensions rely on Chrome's throttled 1-minute alarms, RIPHours uses a **high-frequency background loop** (every 5 seconds) to ensure that time limits trigger the _exact second_ they are breached.

---

## 📊 II. Visual Analytics (The Popup)

### 1. The Hero Section

- **Total Life Wasted:** The primary counter shows your "All-Time" impact in Days, Hours, and Minutes.
- **Active Session Label:** A live, pulsing label appears when you are currently on a tracked site, showing exactly how long you've been on your _current_ session.
- **Toggle View:** Switch instantly between "Today" and "All Time" stats.

### 2. Time-Sink Breakdown

- **Dynamic Bar Chart:** A visual list of your most visited sites.
- **Color-Coded Feedback:** Bars turn **Yellow** when you hit 75% of your daily limit and **Red** (pulsing) when you've exceeded it.
- **Instant Search:** A persistent search bar allows you to filter your site history in real-time.

### 3. Weekly Trends

- A **7-day histogram** at the bottom of the Stats tab compares your total usage over the last week, helping you identify which days are your biggest "sinks."

### 4. Customizable Aesthetics

- **6 Accent Colors:** Personalize the UI with Red, Green, Purple, Blue, Orange, or Pink themes.
- **Dark/Light/System Mode:** Choose between a rich obsidian aesthetic, a clean light theme, or automatic matching with your OS.

---

## 🛡 III. The "Iron Will" Enforcement System

### 1. Per-Site Daily Limits

Set a specific minute-based limit for every site you track. Once the limit is hit, the extension takes action.

### 2. Hard Mode vs. Soft Mode

- **Hard Mode (Enabled):** Instantly redirects you to a "Blocked" page when the limit is hit. You cannot access the site until midnight.
- **Soft Mode (Disabled):** Triggers a browser-wide alert and a sound, but closes the tab automatically if you click "I'll Stop." If you re-open the site, you'll see a persistent warning modal.

### 3. Iron Will Friction (The Barrier)

To prevent impulsive limit-shifting, RIPHours introduces **Iron Will**. If you try to **increase** a limit or **disable** Hard Mode, you are forced to type the phrase:

> _"I am choosing to waste my limited time on earth doing nothing."_
> This friction gives your prefrontal cortex a chance to catch up and stop the impulse.

### 4. ⚡ Focus Surge (Pomodoro Mode)

A one-click button to start a **25-minute deep work session**. During a Focus Surge, **all tracked sites are blocked immediately**, regardless of your daily limits. It’s perfect for clearing out distractions during critical tasks.

### 5. ⚰ "Tombstone" Daily Recap

At **9:00 PM every night**, RIPHours sends a system notification summarizing exactly how much time you "buried" into tracked sites that day. It's a nightly accountability check.

---

## 🎯 IV. The Block Experience

### 1. The "Tombstone" Redirect

When a site is blocked, you aren't just stopped; you are redirected to a minimalist, high-impact screen reminding you that the block only resets at midnight.

### 2. Dynamic Better Alternatives

In the Settings, you can define your own **Better Alternatives** (e.g., "Read 10 pages", "Do pushups"). When a site is blocked, RIPHours randomly picks one of your goals and displays it as the primary suggestion on the block screen.

---

## ☁️ V. Data & Synchronization

### 1. Multi-Device Cloud Sync

RIPHours uses a custom **Cloud Sync Engine**. It synchronizes your settings, domains, and limits across all your Chrome browsers instantly via `chrome.storage.sync`.

- **Smart Merge:** Your time tracking data is merged mathematically across devices, ensuring that if you spend 10 minutes on YouTube on your laptop and 20 on your desktop, your daily total accurately reflects 30 minutes.

### 2. Privacy First

- **Zero External Calls:** RIPHours never speaks to any servers except Google's local `storage.sync` API.
- **No Tracking:** No telemetry, no accounts, no ads. Your data is your own.

### 3. Data Portability

- **CSV Export:** Download your 14-day history as a spreadsheet for your own analysis.
- **JSON Export:** Backup your entire extension state (settings + history) at any time.

---

## 🛠 VI. Extra Features

- **"Take a Break" Reminders:** A system notification pops up automatically if you spend more than 30 consecutive minutes on a tracked site.
- **Right-Click Shortcut:** Simply right-click any webpage and select _"Add this site to RIPHours"_ to instantly start tracking it.
- **Welcome Walkthrough:** New users are greeted with a beautiful onboarding flow to set up their first domains and limits.
- **Share Shock Card:** Generate a beautiful, high-resolution "Death Card" image of your total time to share with friends (or shame yourself on social media).

---

_Life is short. RIPHours makes sure you know exactly where it's going._
