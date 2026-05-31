# Chrome Web Store Publishing Guide

This guide covers publishing Nuan to the Chrome Web Store.

Official references:

- Publish flow: https://developer.chrome.com/docs/webstore/publish
- Developer Program Policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- Store listing images: https://developer.chrome.com/webstore/images

## 1. Pre-Release Checklist

Before packaging:

- Reload the unpacked extension in `chrome://extensions`.
- Test the popup.
- Test the options page.
- Test adding and removing tracked domains.
- Test the custom time stepper.
- Test saving settings and the toast.
- Test a tracked domain countdown and close flow.
- Test a non-tracked domain is not counted.
- Confirm no console errors in:
  - service worker console
  - popup DevTools
  - options page DevTools
  - a page where the content script runs

Run local checks:

```sh
python3 -m json.tool manifest.json
node --check src/background/background.js
node --check src/content/content.js
node --check src/shared/dot-canvas.js
node --check src/ui/options/options.js
node --check src/ui/popup/popup.js
```

## 2. Versioning

Update `manifest.json` before every upload:

```json
{
  "version": "0.1.1",
  "version_name": "0.1.1.alpha.2"
}
```

Rules:

- `version` must be numeric dot-separated Chrome extension version format.
- `version_name` can be user-facing and descriptive.
- Every Web Store update must increase `version`.

Example next alpha:

```json
{
  "version": "0.1.1",
  "version_name": "0.1.1.alpha.1"
}
```

## 3. Package the Extension

The ZIP file must contain `manifest.json` at the ZIP root.

Do not include:

- `.git/`
- local screenshots not used by the store listing
- temporary files
- OS metadata files
- unpacked test artifacts

From the project root:

```sh
zip -r nuan-chrome-web-store.zip \
  manifest.json \
  README.md \
  icons \
  src
```

Optional: include docs in the package only if they are needed by the extension. They are not needed for runtime, so normally leave `docs/` out of the upload package.

Verify package contents:

```sh
unzip -l nuan-chrome-web-store.zip
```

Confirm `manifest.json` appears as:

```text
manifest.json
```

Not:

```text
social-media-restriction-browser-extension/manifest.json
```

## 4. Developer Dashboard

1. Go to the Chrome Web Store Developer Dashboard.
2. Register or sign in with the publishing Google account.
3. Create a new item.
4. Upload `nuan-chrome-web-store.zip`.
5. Fix any manifest or package validation errors.
6. Complete the store listing.
7. Complete privacy practices.
8. Submit for review.

Chrome currently expects extension packages as ZIP files and validates the manifest/package during upload.

## 5. Store Listing Content

Suggested listing name:

```text
Nuan
```

Short description:

```text
Reclaim the present by limiting active social media browsing time.
```

Detailed description draft:

```text
Nuan helps you limit active social media browsing time.

It counts time only while a tracked social media domain is active in the focused browser window. When your allowance is used, tracked tabs are closed until the reset window expires.

Features:
- Configurable daily time limit
- Editable tracked-domain list
- Active-tab-only tracking
- Popup status with remaining time
- In-page warning and final countdown
- Local settings stored in Chrome storage
```

Category:

```text
Productivity
```

Language:

```text
English
```

## 6. Listing Assets

Prepare:

- Extension icon: already provided under `icons/`.
- Screenshots of:
  - popup timer
  - settings page
  - domain chip editor
  - countdown/warning flow if practical
- Promotional image if you want a stronger listing.

Follow Chrome Web Store image requirements from the official image guide. The official guide notes a small promotional image is required and larger promotional images are optional for broader feature placement.

Suggested screenshot set:

1. Popup showing remaining time.
2. Settings page with tracked domains.
3. Settings page showing available domains and custom time controls.
4. In-page warning/countdown state.

## 7. Privacy And Permissions

Current permissions in `manifest.json`:

```json
"permissions": ["alarms", "idle", "scripting", "storage", "tabs"],
"host_permissions": ["<all_urls>"]
```

Why they exist:

- `alarms`: periodic usage ticking.
- `idle`: pause overall browsing analytics while Chrome reports the user idle or locked.
- `scripting`: fallback content-script injection when a tracked tab has no receiving content script yet.
- `storage`: local settings, timer state, and local analytics.
- `tabs`: active tab/window tracking and closing tracked tabs when time is used.
- `<all_urls>`: checking active tab domains locally for configured social tracking and domain-only browsing analytics.

Privacy statement draft:

```text
Nuan stores settings, timer state, and domain-only analytics locally using Chrome storage. It does not sell, transmit, or share browsing data with external services. Overall browsing analytics stores hostnames only and does not store page titles, URL paths, query strings, or incognito/private tabs. Users can exclude private domains and clear browsing analytics data from settings.
```

Before submitting, create or link a privacy policy page if the dashboard requires one for the declared permissions or data usage.

## 8. Policy Review Notes

Review the Chrome Web Store Developer Program Policies before submission.

Pay special attention to:

- Permission minimization.
- Clear disclosure of what the extension does.
- Accurate privacy practices.
- No remote code execution.
- No obfuscated code.
- No misleading store listing claims.
- No unnecessary data collection.

For Nuan, the highest review-risk item is broad host access:

```json
"host_permissions": ["<all_urls>"]
```

This is used because users can configure arbitrary tracked domains. In the store listing and privacy practices, clearly explain that URL checks happen locally for active-tab domain matching.

## 9. Release Flow

Recommended release process:

1. Update code.
2. Update docs if behavior changed.
3. Increment `manifest.json` version.
4. Run checks.
5. Load unpacked and manually test.
6. Create ZIP package.
7. Upload to Developer Dashboard.
8. Complete listing/privacy fields.
9. Submit for review.
10. After approval, tag the release in Git.

Suggested tag format:

```sh
git tag v0.1.1-alpha.1
```

## 10. Update Flow

For future updates:

- Increase `manifest.json` `version`.
- Keep listing screenshots current if UI changed.
- Update privacy practices if permissions or data behavior changed.
- Upload a new ZIP to the same item in the Developer Dashboard.
- Submit the update for review.

## 11. Rejection Checklist

If the submission is rejected:

- Read the rejection reason carefully.
- Check whether the issue is:
  - permissions
  - privacy disclosure
  - broken functionality
  - misleading description
  - missing assets
  - package structure
- Fix the smallest relevant issue.
- Re-run local checks.
- Repackage and resubmit.

Common package issue:

```text
manifest.json is not at the root of the ZIP.
```

Fix by zipping the project contents from the project root, not the parent folder.
