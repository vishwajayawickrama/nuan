# Nuan

Reclaim the present.

Nuan is a Chromium Manifest V3 extension that limits active social media browsing time and tracks overall active browsing patterns locally. It only counts time while a domain is active in the focused browser window.

Version: `0.2.0.alpha.3`

## Release History

| Version | Git tag | Highlights |
| --- | --- | --- |
| `0.2.0.alpha.3` (current) | `v0.2.0-alpha.3` | Minor bump. Settings lock (once per week, twice per month), `NuanRuntime` messaging helper, runtime tracking optimization. |
| `0.1.1.alpha.2` | — | Web Store publishing docs, overall browsing analytics, warning for blocked visits, automated test framework. |
| `0.1.1.alpha.1` | — | Alpha version metadata, local social-media time tracking and blocking. |

`0.2.0.alpha.3` is the first release with a git tag. Future releases are tagged as `v<version>` per `docs/CHROME_WEB_STORE_PUBLISHING.md`.

## Features

- Default allowance of 5 minutes.
- Six-hour reset window from the first tracked social media use.
- Time counts only for active tracked tabs in the focused browser window.
- Tracked tabs close when the allowance is used.
- Future visits to tracked domains close until the reset window expires.
- Configurable time limit and tracked domains from the settings page.
- Chip-based tracked-domain editor with add, remove, and confirmation flows.
- Themed popup and settings UI based on the `vishwajayawickrama-site` paper/dot-canvas visual language.
- In-page tracking toast, one-minute warning, and final `3`, `2`, `1` countdown.
- In-page blocked toast with the next reset time before blocked tracked tabs close.
- Popup status with remaining time, blocked state, and reset countdown.
- Analytics page for daily tracked time, no-use streaks, and most-used domains.
- Overall browsing dashboard with daily trends, hourly activity, top domains, and recent domain-only sessions.
- Local-only browsing analytics with excluded private domains, idle pause, and clear-data controls.

## Default Tracked Domains

- `facebook.com`
- `instagram.com`
- `linkedin.com`
- `tiktok.com`
- `reddit.com`
- `x.com`
- `twitter.com`
- `snapchat.com`
- `pinterest.com`

`youtube.com` is available as a suggested domain in settings.

## Project Structure

```text
.
├── manifest.json
├── icons/
├── resources/
├── src/
│   ├── background/
│   │   └── background.js
│   ├── content/
│   │   └── content.js
│   ├── shared/
│   │   ├── dot-canvas.js
│   │   └── logic/
│   │       └── core.js
│   └── ui/
│       ├── styles.css
│       ├── analytics/
│       │   ├── analytics.html
│       │   └── analytics.js
│       ├── options/
│       │   ├── options.html
│       │   └── options.js
│       └── popup/
│           ├── popup.html
│           └── popup.js
├── docs/
├── tests/
└── TODOs.md
```

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for entry points and ownership notes.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for runtime architecture, diagrams, storage schema, and invariants.
See [docs/CHROME_WEB_STORE_PUBLISHING.md](docs/CHROME_WEB_STORE_PUBLISHING.md) for Chrome Web Store packaging and submission steps.
See [docs/MANUAL_QA_CHECKLIST.md](docs/MANUAL_QA_CHECKLIST.md) for lightweight manual verification steps.
See [docs/TESTING.md](docs/TESTING.md) for automated test setup and commands.

## Load in Chromium

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open the extension popup or settings page to check the timer and change domains.

After changing `manifest.json`, background code, programmatically injected content code, icons, or HTML paths, reload the unpacked extension from `chrome://extensions`.

## Development

This project has no build step. Chrome loads the source files directly from `manifest.json`.

Useful commands:

```sh
npm install
npm run check
npm run test:unit
npm run test:e2e
npm run ci
```

The underlying static checks are:

```sh
python3 -m json.tool manifest.json
node --check src/background/background.js
node --check src/content/content.js
node --check src/shared/dot-canvas.js
node --check src/shared/runtime-messaging.js
node --check src/shared/logic/core.js
node --check src/ui/analytics/analytics.js
node --check src/ui/options/options.js
node --check src/ui/popup/popup.js
```

## Notes

- Extension pages use relative paths from their HTML file location.
- `src/background/background.js` also references `src/content/content.js` for fallback programmatic injection.
- Keep extension assets that Chrome resolves from the manifest, such as icons, at paths referenced by `manifest.json`.
- Browsing analytics stores domains only. It does not store page titles, URL paths, query strings, or incognito/private tabs.

## License

WTFPL v2. You just do what the fuck you want to. See [LICENSE](LICENSE).
