# Nuan

Reclaim the present.

Nuan is a Chromium Manifest V3 extension that limits active social media browsing time and tracks overall active browsing patterns locally. It only counts time while a domain is active in the focused browser window.

Version: `0.2.0.alpha.3`

## Features

### Daily time allowance

Default 5 minutes per day on tracked social media sites, with a six-hour reset window from first use.

### Active-tab tracking

Time counts only while a tracked domain is active in the focused browser window.

### Automatic blocking

Tracked tabs close when the allowance runs out, and future visits stay blocked until the reset window expires.

### Local-first analytics

Daily tracked time, no-use streaks, and a browsing dashboard — stored entirely on-device.

## Default Tracked Domains

`facebook.com` · `instagram.com` · `linkedin.com` · `tiktok.com` · `reddit.com` · `x.com` · `twitter.com` · `snapchat.com` · `pinterest.com`

`youtube.com` is available as a suggested domain in settings.

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
