# RIPHours privacy policy

Last updated: October 30, 2026

RIPHours has no server. It makes no network requests of its own, has no analytics, and has no account system.

## What is stored, and where

**On your device** (`chrome.storage.local`):

- The sites you chose to track, their daily limits, and your settings.
- Seconds spent per tracked site, per day, for the last 120 days, plus an all-time total per site.
- The date you installed the extension and a random device identifier used only to tell your own devices apart in Chrome Sync.

Only the domain is recorded, never the page, path, title or content. Sites you don't track are not recorded at all.

**In Chrome Sync** (`chrome.storage.sync`), if you are signed in to Chrome with sync turned on: your tracked sites, limits and settings, so they follow you to other computers. Google stores this as part of your Chrome account. Usage time is not synced; each device keeps its own.

## What the extension reads

- **Tab addresses**, to tell whether the active tab belongs to a tracked site.
- **On tracked sites only**, a small script watches for input (mouse, keyboard, scroll, touch) and for playing audio or video, so idle time isn't counted. It reports only "the page is in use"; it reads no page content and records no keystrokes.

## Incognito

Time in incognito windows is never counted. If you allow RIPHours in incognito, blocks still apply there.

## Exports

CSV and JSON exports are files saved to your computer by you. Nothing is uploaded.

## Deleting your data

Settings → "Erase usage history" deletes recorded time on that device. Removing the extension deletes everything it stored locally. Synced settings can be cleared from your Google account's Chrome Sync data.

## Contact

Questions: open an issue at https://github.com/SamisDone/RIPHours/issues.
