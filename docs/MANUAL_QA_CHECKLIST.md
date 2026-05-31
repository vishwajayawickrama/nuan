# Manual QA Checklist

Use this checklist after loading the unpacked extension in Chromium.

Run `npm run check`, `npm run test:unit`, and `npm run test:e2e` first. Keep this checklist for browser behaviors that still benefit from human verification.

## Loading

- Open `chrome://extensions`, enable Developer mode, and load this project folder.
- Confirm the Nuan toolbar action appears with the extension icon.
- Open the popup and confirm it renders without an error state.

## Popup

- Confirm the remaining-time metric updates once per second.
- Open a non-tracked site and confirm the popup says the tab is not tracked.
- Open a tracked domain and confirm the popup shows a counting state.
- Click Settings and confirm the settings page opens.
- Click Analytics and confirm the analytics page opens.

## Settings

- Change the daily limit, save, and confirm a success toast appears.
- Add a custom tracked domain and confirm it appears in the active chip list.
- Remove a tracked domain, confirm the modal, save, and confirm it no longer counts.
- Disable overall browsing analytics, save, browse an unexcluded web domain, and confirm browsing analytics does not increase.
- Add an excluded private domain, save, visit that domain, and confirm it does not appear in browsing analytics.
- Clear browsing data and confirm the analytics page returns to empty browsing states.
- Reload the extension and confirm saved settings persist.

## Analytics

- Spend time on a tracked domain, then open Analytics.
- Confirm today's total tracked time is greater than zero.
- Confirm the tracked domain appears in Most-used domains.
- Confirm Recent days includes today's local date.
- Spend time on a regular non-excluded web domain and confirm the browsing dashboard shows today's browsing time.
- Confirm the browsing dashboard shows recent days, hourly activity, top browsing domains, and recent domain-only sessions.
- Leave the browser idle long enough for Chrome idle detection and confirm browsing time stops increasing.
- On a fresh install or cleared storage, confirm empty analytics states render cleanly.

## Blocked State

- Set a short limit such as 1 minute.
- Visit a tracked domain and wait for the one-minute warning and final countdown.
- Confirm the tab closes after the countdown.
- Revisit a tracked domain while blocked and confirm an in-page blocked toast shows the reset time before the tab closes.
- Open the popup while blocked and confirm it shows the reset countdown.
