# Project Structure

Nuan is intentionally a no-build browser extension. Files are organized by browser-extension responsibility while staying directly loadable by Chromium.

## Entry Points

- `manifest.json`
  - Declares permissions, icons, the background service worker, content scripts, popup, and options page.
- `src/background/background.js`
  - Owns extension state, alarms, idle-aware active tab tracking, domain matching, enforcement, analytics, and settings persistence.
- `src/content/content.js`
  - Runs on webpages and renders in-page tracking notices, warnings, and the final countdown overlay.
- `src/ui/popup/popup.html`
  - Popup markup shown from the toolbar action.
- `src/ui/popup/popup.js`
  - Reads status from the background worker and renders the popup timer/status.
- `src/ui/analytics/analytics.html`
  - Analytics page markup opened from the popup.
- `src/ui/analytics/analytics.js`
  - Reads local usage analytics from the background worker and renders social analytics plus the overall browsing dashboard.
- `src/ui/options/options.html`
  - Settings page markup.
- `src/ui/options/options.js`
  - Settings interactions, custom time stepper, domain chips, browsing analytics controls, confirmation modal, and save toast.
- `src/ui/styles.css`
  - Shared styles for popup, options, and analytics pages.
- `src/shared/dot-canvas.js`
  - Shared animated dot-canvas background used by extension UI pages.
- `src/shared/logic/core.js`
  - Pure domain, date, social analytics, and browsing analytics helpers used by tests and loaded by the background worker.
- `tests/unit/`
  - Node unit tests for pure logic.
- `tests/e2e/`
  - Playwright tests that load the unpacked extension in Chromium.

## Asset Paths

Manifest paths are resolved from the project root:

- `icons/icon16.png`
- `icons/icon32.png`
- `icons/icon48.png`
- `icons/icon128.png`
- `src/background/background.js`
- `src/content/content.js`
- `src/ui/popup/popup.html`
- `src/ui/analytics/analytics.html`
- `src/ui/options/options.html`

HTML paths are resolved from each HTML file location. For example, `src/ui/options/options.html` references:

- `../styles.css`
- `../../../icons/logo.png`
- `../../shared/dot-canvas.js`
- `options.js`

`src/ui/analytics/analytics.html` uses the same relative path pattern as the settings page and references:

- `../styles.css`
- `../../../icons/logo.png`
- `../../shared/dot-canvas.js`
- `analytics.js`

## Development Rules

- Keep `manifest.json` at the root.
- Keep manifest-referenced icons under `icons/`.
- Put background-only logic in `src/background/`.
- Put webpage-injected logic in `src/content/`.
- Put extension page UI under `src/ui/`.
- Put UI utilities shared by popup/options under `src/shared/`.
- Reload the unpacked extension after changing manifest paths, service worker code, content script code, icons, or HTML.
