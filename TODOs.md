# TODOs

Living roadmap for Nuan. Keep items small enough to verify, and move completed work into release notes instead of leaving stale TODOs.

## P0 - Correctness And Safety

- [ ] Verify blocked-site UX manually after reload:
  - blocked tracked visits show an in-page reset-time toast before closing
  - tabs still close if the content script cannot receive the message
  - popup blocked countdown agrees with the in-page reset time
- [ ] Audit social timer edge cases:
  - switching between tracked domains does not double count
  - closing the active tracked tab accrues final active time
  - service worker restart preserves accurate state
  - reset window clears blocked state exactly after six hours
- [ ] Audit overall browsing tracker edge cases:
  - idle/locked state stops accrual
  - excluded domains never enter aggregate or recent-session analytics
  - `chrome://`, extension pages, `file://`, and incognito tabs are ignored
  - active tab changes split sessions correctly
- [ ] Add a user-facing recovery path for corrupted storage:
  - detect invalid settings/analytics shapes
  - normalize where possible
  - expose a clear/reset option if recovery fails

## P1 - Product Improvements

- [ ] Add first-run onboarding:
  - explain local-only analytics
  - explain tracked social limits vs overall browsing analytics
  - link directly to settings
- [ ] Add pause controls:
  - pause social enforcement for a short fixed duration
  - pause overall browsing analytics separately
  - show clear active pause state in popup
- [ ] Add optional soft-block mode:
  - warn and redirect instead of closing tabs
  - keep hard-close mode as the strict option
- [ ] Add per-domain social limits:
  - global fallback limit remains available
  - specific domains can override the global limit
- [ ] Add reset-window customization:
  - default remains six hours
  - settings support common presets
  - popup and warnings use the configured reset time

## P1 - Analytics And Insights

- [ ] Add category support for browsing analytics:
  - user-managed categories first
  - domain-to-category mappings in settings
  - category totals on analytics dashboard
- [ ] Add export/import:
  - export settings and analytics as JSON
  - import settings only by default
  - require explicit confirmation before importing analytics
- [ ] Add analytics retention controls:
  - keep forever by default
  - optional 30/90/365 day retention
  - one-click clear social analytics and browsing analytics separately
- [ ] Improve dashboard comparisons:
  - today vs yesterday
  - this week vs last week
  - most changed domains
- [ ] Add privacy indicators:
  - show how many excluded/private domains were ignored
  - never display ignored domain names unless the user has listed them in settings

## P2 - UX And Accessibility

- [ ] Improve popup layout for dense states:
  - social status
  - browsing tracking status
  - shortcuts to settings and analytics
- [ ] Add accessible labels and focus states audit:
  - popup
  - settings
  - analytics dashboard
  - in-page toast/countdown
- [ ] Add keyboard support for chip lists:
  - remove selected domain with keyboard
  - add suggested domain with keyboard
  - keep focus predictable after modal close
- [ ] Add empty/error/loading states for every analytics panel.
- [ ] Validate responsive layout with Playwright screenshots for popup/options/analytics.

## Engineering

- [ ] Continue extracting pure logic from `src/background/background.js`:
  - storage normalization
  - status response shaping
  - analytics summaries
  - tab-domain classification
- [ ] Add focused unit tests for background orchestration with mocked Chrome APIs.
- [ ] Expand Playwright e2e coverage:
  - social countdown and blocked toast
  - settings persistence after extension reload
  - browsing analytics accrual from real tabs
  - excluded-domain behavior
- [ ] Add screenshot regression coverage for extension pages.
- [ ] Add linting once the codebase has enough shared style pressure:
  - prefer ESLint flat config
  - keep rules practical for browser extension globals
- [ ] Split large UI files only when tests or feature work make ownership unclear.

## Release Readiness

- [ ] Create release notes for `0.1.1.alpha.2`.
- [ ] Verify Chrome Web Store permission justifications:
  - `alarms`
  - `idle`
  - `scripting`
  - `storage`
  - `tabs`
  - `<all_urls>`
- [ ] Write a privacy policy matching actual behavior:
  - local-only storage
  - domain-only browsing analytics
  - no full URLs/page titles
  - no external transmission
  - clear-data controls
- [ ] Package a clean release artifact:
  - exclude `node_modules`
  - exclude tests and reports unless intentionally shipped
  - include icons, manifest, source, and docs needed for review
- [ ] Run final QA:
  - `npm run ci`
  - manual checklist in `docs/MANUAL_QA_CHECKLIST.md`
  - load unpacked from a clean profile

## Done

- [x] In-page tracking toast, one-minute warning, and final countdown.
- [x] Blocked tracked-site toast with next reset time before closing.
- [x] Social usage analytics: daily total, no-use streak, most-used domains.
- [x] Dedicated analytics page.
- [x] Overall browsing analytics with domain-only dashboard.
- [x] Excluded private-domain list and clear browsing data control.
- [x] Manual QA checklist.
- [x] Node unit test framework.
- [x] Playwright extension smoke test framework.
- [x] GitHub Actions test workflow.
- [x] Runtime performance pass: active-only alarms, cached storage reads, unchanged-write skipping, and on-demand content injection.
