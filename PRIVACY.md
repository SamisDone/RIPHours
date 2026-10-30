# RIPHours privacy policy

Effective October 30, 2026. Applies to RIPHours 1.3.0 and later.

RIPHours is a browser extension that measures how long you spend on websites you choose and can block them when a daily limit runs out. It has no server, no account system and no analytics. The developer receives no data from it, ever.

## What RIPHours handles

**Website addresses.** To know which site you're looking at, RIPHours reads the address of the active tab. It compares the domain against your list of tracked sites and then discards the address. It never stores full URLs, page titles or page content, and it records nothing about sites you haven't chosen to track.

**Activity on tracked sites.** On tracked sites only, a small script notices whether you've used the page in the last minute (mouse, keyboard, scroll, touch) and whether unmuted audio or video is playing. It tells the extension "this page is in use" and nothing more. It does not read what you type, what you click, or anything on the page.

**What gets saved.** For each tracked domain: seconds spent per day for the last 120 days, and an all-time total. Also your tracked sites, daily limits, settings, the date you installed the extension, and a random identifier that only tells your own devices apart in Chrome Sync.

## Where it is stored

**On your computer**, in the browser's extension storage (`chrome.storage.local`). Usage data never leaves your device.

**In Chrome Sync**, only if you are signed in to Chrome with sync turned on: your tracked sites, limits and settings, so they appear on your other computers. This goes through Google's Chrome Sync service under your Google account, not to the developer. Usage time is not synced.

## What RIPHours does not do

- It does not send any data to the developer or to any third party.
- It does not sell, rent or share data.
- It does not use data for advertising, profiling, or creditworthiness or lending decisions.
- It does not load remote code.
- It does not count time in incognito windows.

The use of information by RIPHours complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including its Limited Use requirements.

## Exports

You can export your data as CSV or JSON from Settings. The file is saved to your computer by your browser. Nothing is uploaded.

## Your control over the data

- **Settings → Erase usage history** deletes all recorded time on that device.
- Removing a site from your list stops tracking it immediately.
- Uninstalling RIPHours deletes everything it stored on that computer.
- Synced settings can be cleared through your Google account's Chrome Sync controls.

## Changes

If this policy changes, the new version will be published at this address with a new effective date. Material changes will be noted in the release notes.

## Contact

Open an issue at https://github.com/SamisDone/RIPHours/issues.
