# Testing

Nuan uses two automated test layers:

- Node unit tests for pure extension logic.
- Playwright smoke tests for the unpacked Chromium extension.

The extension still has no build step. Chromium loads the source files directly from `manifest.json`.

## Setup

```sh
npm install
npx playwright install chromium
```

On Linux CI, use `npx playwright install --with-deps chromium`.

## Commands

```sh
npm run check
npm run test:unit
npm run test:e2e
npm run ci
```

`npm run check` validates `manifest.json` and runs `node --check` against every extension script.

`npm run test:unit` runs Node's built-in test runner against `tests/unit`.

`npm run test:e2e` launches Chromium with this project loaded as an unpacked extension and runs the tests in `tests/e2e`.

## Unit Tests

Unit tests target `src/shared/logic/core.js`, which exports pure helpers for:

- domain normalization and matching
- date and hour bucketing
- social usage aggregation
- browsing usage aggregation
- browsing settings normalization

Keep edge-case coverage here. These tests are fast, deterministic, and do not need Chrome.

## E2E Tests

Playwright tests use a persistent Chromium context with:

- `--disable-extensions-except=<repo>`
- `--load-extension=<repo>`

The fixture discovers the extension id from the service worker URL, then opens extension pages with `chrome-extension://<id>/...`.

Current smoke coverage verifies:

- popup, settings, and analytics pages load
- background messaging works
- settings save successfully
- browsing analytics can be cleared
- clean analytics storage renders empty states
- regular webpages do not receive Nuan content script elements

Browser profiles are isolated per test under the OS temp directory returned by `os.tmpdir()`.

## Sandbox Note

On macOS sandboxed environments, Chromium may fail to start because its crash reporter tries to access files under the user's Library folder. Run Playwright e2e tests outside that sandbox, or use CI where the workflow runs under `xvfb-run`.

## CI

GitHub Actions runs:

```sh
npm ci
npx playwright install --with-deps chromium
xvfb-run --auto-servernum npm run ci
```

Playwright reports are uploaded only when CI fails.
