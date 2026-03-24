# ⚰ RIPHours: Complete Feature Guide

**Measure your scroll history in days of your life.**

RIPHours is a powerful, privacy-first Chrome/Firefox extension designed to combat digital addiction. It doesn't just "track time" — it presents your usage in the brutal context of how many actual days of your limited life you've spent on time-sink websites.

---

## 🕒 I. Core Tracking & Precision

### 1. Accurate Activity Detection
Unlike simple timers, RIPHours uses the **Page Visibility API** combined with **Window Focus events**. It only counts time when the tab is actually visible and you are actively looking at the window. If you switch tabs, minimize Chrome, or the window loses focus, the timer stops instantly, ensuring precise tracking of active engagement.

### 2. Auto-Idle Protection
The extension features a **60-second idle timeout**. If there is no mouse movement, keyboard input, scrolling, or touch input detected for 60 seconds, tracking pauses automatically. This ensures your stats aren't inflated if you walk away from your computer with a tracked tab open. Activity is seamlessly resumed upon detecting interaction.

### 3. Smart Domain Normalization (Subdomain Rollup)
RIPHours intelligently rolls up subdomains into their base domains (e.g., `m.youtube.com` and `www.youtube.com` both count toward `youtube.com`). It ensures that time spent across different subdomains of a single service is accurately aggregated. You can manage exactly which base domains are tracked in the Settings tab.

### 4. Precise Real-Time Enforcement (1-Second Tick)
While most extensions rely on Chrome's throttled 1-minute alarms, RIPHours uses a **high-frequency background local tick loop** (running every 1 second while a tracked tab is active) to ensure that time limits and focus rules trigger the *exact second* they are breached, bypassing standard alarm limitations.

---

## 📊 II. Visual Analytics (The Dashboard)

### 1. The Hero Section
- **Total Life Wasted:** The primary counter shows your "All-Time" impact in Days, Hours, Minutes, and Seconds.
- **Active Session Label:** A live, real-time pulsing label appears when you are currently on a tracked site, displaying the exact duration of your *current, continuous session*.
- **Toggle View (All Time / Today):** Switch instantly between viewing your complete historical data ("All Time") and your usage restricted specifically to "Today."

### 2. Time-Sink Breakdown & Search
- **Dynamic Bar Chart:** A visual, proportional list of your most visited tracked sites, ordered by time spent.
- **Color-Coded Limit Feedback:** Bars dynamically reflect your daily limit status. They turn **Yellow (Warning)** when you hit 75% of your daily limit and **Red (Over)** when you've exceeded it.
- **Limit Tags:** If a limit is set, the chart displays usage against the limit (e.g., `/ 30m`).
- **Instant Search:** A persistent search bar allows you to filter your site history in real-time to quickly find specific domains.

### 3. Weekly Trends Histogram
- A dynamic **7-day histogram** visually compares your total daily usage over the last week. It calculates genuine daily usage by diffing daily historical snapshots, helping you identify patterns and days with the highest screen time. Includes today's live data.

### 4. Share Shock Card
- Generate a beautiful, high-resolution "Death Card" image of your total time. This visually striking card (featuring the tagline "Time is finite") can be copied to your clipboard with one click to share with friends or for personal accountability.

### 5. Customizable Aesthetics
- **6 Accent Colors:** Personalize the UI and alert elements with Red, Green, Purple, Blue, Orange, or Pink themes.
- **Dark/Light/System Mode:** Choose between a rich obsidian aesthetic, a clean light theme, or automatic matching with your OS preferences.

---

## 🛡 III. The "Iron Will" Enforcement System

### 1. Per-Site Daily Limits
Set a specific minute-based limit for individual tracked domains from the dedicated Limits tab. Once the limit is hit, the extension takes enforcement action based on your settings. Daily limits are evaluated strictly against today's usage.

### 2. Hard Block vs. Soft Block Modals
- **Hard Block (Enabled by default):** Instantly overlays an inescapable "Time's Up" modal, followed shortly by a strict redirect to a dedicated "Blocked" page when the limit is hit. You cannot access the site until the midnight reset.
- **Soft Block (Disabled Hard Block):** Overlays a localized "Time's Up" glass modal on the page, but includes a "Let Me Stay" button alongside an "I'll Stop" button. If dismissed ("Let Me Stay"), navigating to other pages on the same site triggers a smaller, persistent "Over Limit" warning modal that must be repeatedly dismissed.

### 3. Iron Will Friction (The Barrier)
To prevent impulsive limit-shifting, RIPHours introduces **Iron Will**. If you attempt to **increase/remove** a limit or **disable** Hard Block mode, you are confronted with a strict text-matching barrier. You are forced to type the exact phrase:
> *"I am choosing to waste my limited time on earth doing nothing."*
This intentional friction engages your prefrontal cortex, providing a momentary pause to reconsider the impulsive action.

### 4. ⚡ Focus Surge (Pomodoro Mode)
A powerful one-click button to initiate a strict **25-minute deep work session**. During an active Focus Surge, **all tracked sites are blocked immediately and completely**, regardless of your individual daily limits or Soft Block settings. The hero section displays a live countdown timer until the surge ends.

### 5. ⚰ "Tombstone" Daily Recap
At **9:00 PM every night**, RIPHours sends a system notification explicitly summarizing exactly how much time you "buried" into tracked sites that specific day (e.g., "You buried 2h 15m into tracked sites today"). It acts as a nightly reality check.

### 6. "Take a Break" Reminders
If you engage in continuous scrolling on a tracked site, a system notification automatically pops up every **30 consecutive minutes** (at 30m, 60m, 90m, etc.) reminding you to "Stretch, hydrate, look away"—and updates you on exactly how long you've been scrolling.

---

## 🎯 IV. The Block Experience & Resolution

### 1. The "Tombstone" Redirect Page
When a site is strictly blocked (via Hard Block or Focus Surge), you are redirected to a minimalist, high-impact screen. It clearly states "Time's Up," displays the blocked domain, and reminds you that access is restricted to protect your time and resets at midnight.

### 2. Dynamic "Better Alternatives"
In the Settings, you can formulate your own comma-separated list of **Better Alternatives** (e.g., "Read 10 pages, Do pushups, Call mom"). When redirected to the full blocked page, RIPHours randomly selects one of your predefined goals and prominently displays it as a concluding directive: *"Go do this instead: [Your Alternative]"*.

### 3. Graceful Modal Handling & Multi-Tab Sync
When a soft-block limit is dismissed via "Let Me Stay," the extension automatically broadcasts a signal that removes the restrictive warning overlay across **all currently open tabs** of that specific domain instantly, preventing redundant dismissals.

---

## ☁️ V. Data Management, Export & Synchronization

### 1. Intelligent Multi-Device Cloud Sync
RIPHours utilizes a custom **Cloud Sync Engine** leveraging `chrome.storage.sync`.
- Synchronizes your appearance settings, tracked domains, and minute limits almost instantly across all logged-in Chrome instances.
- **Smart History Merge:** Historical daily tracking data is smartly merged across devices. If usage occurs simultaneously or separately on different devices, the sync engine takes the *maximum* known value for a given domain on that day, ensuring your stats reflect your true total usage holistically.

### 2. Privacy First & Local Default
- **Zero External Calls:** RIPHours never speaks to external analytics or tracking servers. Data is communicated exclusively with Google's local and synced storage APIs.
- **Complete Immutability:** No telemetry, no accounts to create, no ads.

### 3. Data Portability & Safety
- **History CSV Export:** Download your daily usage history across all sites as a structured spreadsheet for personal analysis.
- **Bulk JSON Export:** Backup your entire extension state (settings, limits, complete history, domains) instantly.
- **Nuclear Reset:** A "Danger Zone" option allows you to thoroughly obliterate all tracked data, history, and settings, returning the extension to a fresh-install state. Requires typing `RESET` to confirm.

---

## 🛠 VI. Extra Utilities & Quality of Life

- **Midnight Data Flush:** A robust, proactive routine runs at daily rollovers (midnight) to cleanly finalize the previous day's metrics, reset daily limits, reset dismissed warning states, and clear blocks for a fresh start.
- **Right-Click Context Menu Shortcut:** A fast workflow allowing you to right-click anywhere on a webpage and select *"⚰ Add this site to RIPHours"* to instantly begin tracking that domain.
- **Audible Alerts:** Time limit breaches utilize an offscreen document to reliably play an audible alert chime (`alert.mp3`), ensuring you are notified even if the tab is visually obscured.
- **First-Run Welcome Walkthrough:** New installations trigger a clean, visually consistent onboarding page (`welcome.html`) confirming default tracked domains (Reddit, YouTube, Twitter/X, Instagram, TikTok, Facebook) and core privacy promises.
