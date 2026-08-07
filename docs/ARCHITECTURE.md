# Architecture

Nuan is a no-build Chromium Manifest V3 extension. Chrome loads the files in this repository directly from `manifest.json`, so runtime architecture, source layout, and deployed architecture are the same thing.

This document is the source-level architecture reference for maintainers. It describes the durable boundaries, runtime flows, storage model, permissions, invariants, and test strategy that should remain true as the extension evolves.

## System Summary

Nuan has one authoritative runtime: the Manifest V3 background service worker in `src/background/background.js`. Extension pages and injected content scripts are clients of that worker.

The worker is responsible for:

- settings normalization and persistence
- active focused-tab tracking
- social limit enforcement
- overall domain-only browsing analytics
- alarm scheduling
- idle-state handling
- content-script injection and tab closing
- read APIs used by popup, settings, and analytics pages

The project deliberately avoids a build step, remote services, external analytics, and static all-URLs content scripts. Data remains local in `chrome.storage.local`.

## Runtime Topology

```mermaid
flowchart LR
  subgraph Chromium["Chromium extension platform"]
    Events["runtime/tabs/windows/idle events"]
    Tabs["chrome.tabs and chrome.windows"]
    Alarms["chrome.alarms"]
    Storage[(chrome.storage.local)]
    Scripting["chrome.scripting"]
  end

  subgraph Extension["Nuan extension"]
    BG["Background service worker\nsrc/background/background.js"]
    Logic["Pure logic helpers\nsrc/shared/logic/core.js"]
    Popup["Popup page\nsrc/ui/popup"]
    Options["Options page\nsrc/ui/options"]
    Analytics["Analytics page\nsrc/ui/analytics"]
    Content["Injected content script\nsrc/content/content.js"]
  end

  subgraph Web["User browsing context"]
    Page["Active web page DOM"]
  end

  Events --> BG
  BG <--> Storage
  BG <--> Alarms
  BG --> Tabs
  BG --> Scripting
  BG -. importScripts .-> Logic

  Popup -- runtime.sendMessage --> BG
  Options -- runtime.sendMessage --> BG
  Analytics -- runtime.sendMessage --> BG

  BG -- tabs.sendMessage --> Content
  Scripting -- executeScript on demand --> Content
  Content -- DOM toast/countdown --> Page
  Content -- countdownFinished --> BG
```

## Source Ownership

| Area | File(s) | Ownership |
| --- | --- | --- |
| Manifest | `manifest.json` | Declares MV3 worker, extension pages, permissions, host permissions, icons, and action popup. |
| Background runtime | `src/background/background.js` | Owns durable state, event listeners, storage cache, active tracking, analytics, alarms, content injection, and enforcement. |
| Pure logic | `src/shared/logic/core.js` | Domain normalization, domain matching, local date bucketing, social analytics, browsing analytics, and settings normalization. |
| Content UI | `src/content/content.js` | Injected only when needed. Renders in-page toast, blocked notice, and final countdown. |
| Popup UI | `src/ui/popup/*` | Polls `getStatus` once per second and renders current remaining or blocked time. |
| Settings UI | `src/ui/options/*` | Edits social limit domains, browsing analytics settings, excluded domains, and clear-data flow. |
| Analytics UI | `src/ui/analytics/*` | Reads social and browsing analytics from the worker and renders summaries. |
| Shared UI utility | `src/shared/dot-canvas.js` | Decorative canvas used by extension pages only. |
| Tests | `tests/unit`, `tests/e2e` | Unit coverage for pure logic and manifest assumptions; Playwright smoke coverage for unpacked extension behavior. |

## Design Principles

1. The background worker is the only authority for persisted extension state.
2. Extension pages do not read or write `chrome.storage.local` directly during normal operation.
3. Content scripts do not own business rules. They render notices and report countdown completion.
4. Time only accrues for the active tab in the focused browser window.
5. Social tracking and browsing analytics are separate state machines sharing the same active-tab context.
6. The runtime writes to storage only when normalized data actually changes.
7. Alarms exist only while there is active work to synchronize or enforce.
8. Browsing analytics store domains and timing only, not full URLs, page titles, query strings, or incognito tabs.

## Permission Model

| Permission | Used by | Purpose |
| --- | --- | --- |
| `alarms` | background worker | One-shot social enforcement alarm and active-only one-minute sync alarm. |
| `idle` | background worker | Pause overall browsing analytics while Chrome reports idle or locked. |
| `scripting` | background worker | Programmatically inject `src/content/content.js` when a tracked page needs UI. |
| `storage` | background worker | Persist settings, state, and analytics locally. |
| `tabs` | background worker and popup | Inspect active tab URL, close blocked tracked tabs, and open analytics page. |
| `<all_urls>` host permission | background worker | Match active tab domains locally and inject content UI into tracked pages when required. |

`manifest.json` does not register `content_scripts`. This is intentional: normal pages should not receive Nuan DOM elements unless the background worker has decided the page is relevant to social tracking or blocked enforcement.

## Extension Boundaries

```mermaid
flowchart TB
  subgraph Trusted["Trusted extension origin"]
    Pages["Popup / Options / Analytics"]
    Worker["Background worker"]
    Store[(chrome.storage.local)]
  end

  subgraph Injected["Injected page context"]
    Content["content.js\nidempotent loader"]
    DOM["Toast, warning, countdown DOM"]
  end

  subgraph Untrusted["Web page origin"]
    Page["Page scripts and markup"]
  end

  Pages -- typed runtime messages --> Worker
  Worker -- normalized writes --> Store
  Worker -- on-demand executeScript --> Content
  Worker -- typed tab messages --> Content
  Content -- appends isolated IDs/styles --> DOM
  Page -. same DOM tree, no direct extension API .- DOM
```

The content script runs in Chrome's isolated extension world. It can manipulate the page DOM, but page JavaScript cannot call `chrome.runtime` through it directly.

## Message Catalog

### Extension Page to Background

| Message type | Sender | Handler | Response |
| --- | --- | --- | --- |
| `getStatus` | popup | `getStatus()` | Current limit, remaining time, blocked state, reset time, active state, and current host. |
| `getSettings` | options, tests | `getSettings()` | Normalized social limit settings. |
| `getSettingsLock` | options, tests | `getSettingsLock()` | Whether a social settings change is allowed, the next unlock time, and monthly change usage. |
| `getBrowsingSettings` | options, tests | `getBrowsingSettings()` | Normalized browsing analytics settings. |
| `getAnalytics` | analytics page | `getAnalytics()` | Social daily totals, no-use streak, and most-used domains. |
| `getBrowsingAnalytics` | analytics page | `getBrowsingAnalytics()` | Browsing today/week/average, top domains, recent days, hourly activity, and recent sessions. |
| `saveSettings` | options | `saveSettings(settings)` | Validates and persists social limit and domains, enforcing the weekly/monthly change lock. |
| `saveBrowsingAnalyticsSettings` | options | `saveBrowsingAnalyticsSettings(settings)` | Syncs current browsing usage, persists analytics settings, and refreshes context. |
| `clearBrowsingAnalytics` | options | `clearBrowsingAnalytics()` | Resets browsing state and browsing analytics. |

### Background to Content

| Message type | Sender | Receiver | Purpose |
| --- | --- | --- | --- |
| `trackingStarted` | background | content | Show tracking-started toast and schedule warning/final countdown in the page. |
| `trackingPaused` | background | content | Clear scheduled warning/countdown UI for the previous tracked tab. |
| `showBlockedCloseToast` | background | content | Tell a blocked tracked page when it can be used again before the tab closes. |

### Content to Background

| Message type | Sender | Handler | Purpose |
| --- | --- | --- | --- |
| `countdownFinished` | content | `handleCountdownFinished(sender)` | Cap social usage at the configured limit, close tracked tabs, and update alarms. |

`content.js` also supports `showOneMinuteWarning` and `startClosingCountdown` as direct message types, but the current background path primarily uses `trackingStarted` and lets the content script schedule those UI transitions locally.

## Startup and Hydration

The service worker can be started by install, browser startup, extension-page messages, alarms, tab events, or storage events. Durable state is always recovered from `chrome.storage.local`.

```mermaid
sequenceDiagram
  autonumber
  participant Chrome
  participant BG as Background worker
  participant Store as chrome.storage.local
  participant Idle as chrome.idle
  participant Alarms as chrome.alarms
  participant Tabs as Active tab lookup

  Chrome->>BG: onInstalled or onStartup
  BG->>Store: get(settings, settingsLock, state, analytics, browsingSettings, browsingState, browsingAnalytics)
  BG->>BG: normalize all storage objects
  alt normalized data differs from stored data
    BG->>Store: set(changed defaults/normalized values)
  end
  BG->>Idle: setDetectionInterval(60)
  BG->>Alarms: clear("social-media-time-guard-tick")
  BG->>BG: processActiveContext(reason)
  BG->>Tabs: query focused active tab
  BG->>BG: refresh social tracking and browsing tracking
  BG->>Alarms: create or clear active sync/enforcement alarms
```

### Hydration Rules

- `runtimeCache` mirrors the seven storage keys after first hydration.
- `hydratePromise` prevents duplicate parallel storage reads during cold start.
- `chrome.storage.onChanged` updates the cache when local storage changes.
- `setStorageIfChanged()` deep-compares normalized values and skips unchanged writes.
- Storage remains the source of durability across service worker shutdowns.

## Event Coalescing

Tab activation, tab updates, tab removal, window focus changes, idle changes, settings saves, and active alarms all converge through `scheduleProcessActiveContext()`.

```mermaid
flowchart LR
  Event["Chrome event or settings mutation"] --> Merge["mergeProcessOptions"]
  Merge --> Scheduled{"process already scheduled?"}
  Scheduled -- yes --> Queue["reuse processQueue"]
  Scheduled -- no --> Microtask["schedule microtask"]
  Microtask --> Process["processActiveContext"]
  Process --> Social["refreshActiveTracking"]
  Process --> Browsing["refreshBrowsingTracking"]
  Process --> AlarmUpdate["updateDynamicAlarms"]
```

This keeps bursts of browser events from causing repeated full storage/tab/alarm work while preserving important options such as `removedTabId` and `idleState`.

## Active Social Tracking

Social tracking answers one question: "How much time has the user spent on configured social domains within the current six-hour reset window?"

```mermaid
sequenceDiagram
  autonumber
  participant Chrome
  participant BG as Background worker
  participant Store as Runtime cache/storage
  participant Tabs as chrome.tabs/windows
  participant Content as content.js
  participant Alarms as chrome.alarms

  Chrome->>BG: tabs/windows/alarm event
  BG->>BG: scheduleProcessActiveContext()
  BG->>BG: updateUsageAndEnforce(skipRefresh=true)
  BG->>Store: read state + analytics from cache
  BG->>BG: resetIfExpired()
  BG->>BG: accrueActiveTime()
  alt usedMs >= limitMs
    BG->>Store: persist capped state + analytics
    BG->>Tabs: closeTrackedTabs()
  else still under limit
    BG->>Store: persist state + analytics if changed
  end
  BG->>Tabs: getFocusedActiveTab()
  BG->>BG: getTrackedDomain(activeTab.url, settings.domains)
  alt active tab is tracked
    BG->>Store: persist activeTabId, activeWindowId, activeDomain, activeSessionStart
    BG->>Content: trackingStarted(remainingMs, limitMs, resetAt)
  else not tracked
    BG->>Content: trackingPaused(previousTabId)
    BG->>Store: clear active social session fields
  end
  BG->>Alarms: updateDynamicAlarms()
```

### Social State Machine

```mermaid
stateDiagram-v2
  [*] --> NoWindow: no windowStart
  NoWindow --> Counting: focused active tab matches tracked domain
  Counting --> Paused: focus leaves tracked domain or tab closes
  Paused --> Counting: tracked tab becomes active again before reset
  Counting --> Blocked: usedMs reaches limitMs
  Counting --> Blocked: content sends countdownFinished
  Blocked --> Blocked: tracked tab visit before reset closes
  Blocked --> NoWindow: now >= windowStart + 6h
  Paused --> NoWindow: now >= windowStart + 6h
  Counting --> NoWindow: now >= windowStart + 6h
```

The content countdown improves user experience, but enforcement does not rely only on page timers. `SOCIAL_ENFORCE_ALARM` is scheduled to fire when the current active social session should reach the limit.

## On-Demand Content Injection and Enforcement

The manifest avoids static `content_scripts`. Instead, the background worker first tries to message an existing content script and injects `src/content/content.js` only if the tracked tab has no receiver.

```mermaid
sequenceDiagram
  autonumber
  participant BG as Background worker
  participant Tabs as chrome.tabs
  participant Scripting as chrome.scripting
  participant Content as content.js
  participant Page as Web page DOM

  BG->>Tabs: sendMessage(tabId, trackingStarted)
  alt content script exists
    Tabs->>Content: trackingStarted
  else Receiving end does not exist
    BG->>Scripting: executeScript(tabId, "src/content/content.js")
    Scripting->>Content: load once via window.__timeGuardContentLoaded
    BG->>Tabs: sendMessage(tabId, trackingStarted)
    Tabs->>Content: trackingStarted
  end
  Content->>Page: render tracking toast
  Content->>Content: schedule one-minute warning and final 3-second countdown
  Content->>Page: render countdown overlay
  Content->>BG: countdownFinished
  BG->>BG: accrueActiveTime() and cap usedMs
  BG->>Tabs: closeTrackedTabs(settings, resetAt)
  BG->>Tabs: sendMessage(tabId, showBlockedCloseToast)
  BG->>Tabs: remove(tabId)
```

If content injection or messaging fails, `safeCloseTabWithBlockedNotice()` still closes the tab. The blocked toast is opportunistic, not required for enforcement.

## Overall Browsing Analytics

Browsing analytics track active focused web browsing by domain. This is separate from social limit enforcement.

```mermaid
flowchart TB
  Start["processActiveContext"] --> Sync["updateBrowsingUsage(skipRefresh=true)"]
  Sync --> Enabled{"browsing analytics enabled?"}
  Enabled -- no --> Clear["clear browsing session fields"]
  Enabled -- yes --> Idle{"idleState == active?"}
  Idle -- no --> Clear
  Idle -- yes --> Tab["get focused active tab"]
  Tab --> Incognito{"tab is incognito?"}
  Incognito -- yes --> Clear
  Incognito -- no --> WebUrl{"URL is http/https?"}
  WebUrl -- no --> Clear
  WebUrl -- yes --> Excluded{"domain is excluded?"}
  Excluded -- yes --> Clear
  Excluded -- no --> Track["persist active browsing session"]
  Track --> Alarm["keep active sync alarm running"]
  Clear --> AlarmUpdate["updateDynamicAlarms clears sync if no active work"]
```

Analytics are accrued into local-day and local-hour buckets. Recent sessions are capped at `500`.

## Settings Save Flow

The settings page sends two independent save requests from one form submit: social limit settings and browsing analytics settings.

```mermaid
sequenceDiagram
  autonumber
  participant Options as Options page
  participant BG as Background worker
  participant Store as Runtime cache/storage
  participant Tabs as Active tab context
  participant Alarms as chrome.alarms

  Options->>BG: saveSettings({ limitMinutes, domains })
  BG->>BG: normalizeSettings()
  alt invalid limit or empty domain list
    BG-->>Options: { ok:false, error }
  else valid
    BG->>Store: setStorageIfChanged({ settings })
    BG->>BG: processActiveContext("settings-saved")
    BG->>Tabs: refresh social and browsing active context
    BG->>Alarms: updateDynamicAlarms()
    BG-->>Options: { ok:true, settings }
  end

  Options->>BG: saveBrowsingAnalyticsSettings({ enabled, excludedDomains })
  BG->>BG: updateBrowsingUsage(skipRefresh=true)
  BG->>BG: normalizeBrowsingSettings()
  BG->>Store: setStorageIfChanged({ browsingSettings })
  BG->>BG: processActiveContext("browsing-settings-saved")
  BG-->>Options: { ok:true, settings }
```

The browsing settings save syncs any currently active browsing session before changing enabled/excluded-domain policy.

## Analytics Read Flow

Analytics pages request derived read models from the background worker. The worker synchronizes active time before returning analytics so the UI does not depend on a recent alarm tick.

```mermaid
sequenceDiagram
  autonumber
  participant Analytics as Analytics page
  participant BG as Background worker
  participant Store as Runtime cache/storage
  participant Logic as Analytics helpers

  Analytics->>BG: getAnalytics
  BG->>BG: updateUsageAndEnforce(skipRefresh=true)
  BG->>Store: read social analytics
  BG->>Logic: aggregate recent days and domain totals
  BG-->>Analytics: social analytics read model

  Analytics->>BG: getBrowsingAnalytics
  BG->>BG: updateBrowsingUsage(skipRefresh=true)
  BG->>Store: read browsing settings + analytics
  BG->>Logic: aggregate today, week, top domains, sessions
  BG-->>Analytics: browsing analytics read model
```

The popup uses a smaller read path: it calls `getStatus` every second, which synchronizes social usage and returns only timer/status information.

## Dynamic Alarm Model

```mermaid
flowchart TB
  Process["processActiveContext"] --> Compute["compute socialActive and browsingActive"]

  Compute --> SocialActive{"socialActive?"}
  SocialActive -- yes --> Enforce["ensure one-shot\nnuan-social-enforce\nwhen limit should be reached"]
  SocialActive -- no --> ClearEnforce["clear nuan-social-enforce"]

  Compute --> AnyActive{"socialActive or browsingActive?"}
  AnyActive -- yes --> Sync["ensure repeating\nnuan-active-sync\nperiodInMinutes = 1"]
  AnyActive -- no --> ClearSync["clear nuan-active-sync"]

  Install["onInstalled/onStartup"] --> Legacy["clear legacy\nsocial-media-time-guard-tick"]
```

Alarm names:

- `nuan-active-sync`: repeating one-minute synchronization while social tracking or browsing analytics are active.
- `nuan-social-enforce`: one-shot enforcement alarm scheduled for the moment the active social session should exhaust remaining time.
- `social-media-time-guard-tick`: legacy repeating alarm cleared on install/startup.

## Storage Schema

All durable state lives in `chrome.storage.local` under seven top-level keys.

```mermaid
flowchart LR
  Store[(chrome.storage.local)]

  Store --> Settings["settings\nlimitMinutes: number\ndomains: string[]"]
  Store --> SettingsLock["settingsLock\nlastChangeAt\nmonthlyChanges\nmonthKey"]
  Store --> State["state\nwindowStart\nusedMs\nactiveTabId\nactiveWindowId\nactiveSessionStart\nactiveDomain\noneMinuteWarningWindowStart\ncountdownWindowStart"]
  Store --> SocialAnalytics["analytics\ncreatedAt\ndays[YYYY-MM-DD].totalMs\ndays[YYYY-MM-DD].domains[domain]"]
  Store --> BrowsingSettings["browsingSettings\nenabled: boolean\nexcludedDomains: string[]"]
  Store --> BrowsingState["browsingState\nactiveTabId\nactiveWindowId\nactiveDomain\nactiveSessionStart\nlastSyncAt\nidleState"]
  Store --> BrowsingAnalytics["browsingAnalytics\ncreatedAt\ndays[YYYY-MM-DD]\ndomains[domain]\nrecentSessions[]"]
```

`oneMinuteWarningWindowStart` and `countdownWindowStart` are present in `DEFAULT_STATE` for compatibility with earlier state shape. Current warning/countdown scheduling is handled inside `content.js` after `trackingStarted`.

### Storage Normalization

| Key | Normalizer | Notes |
| --- | --- | --- |
| `settings` | `normalizeSettings()` | Enforces positive limit and normalized unique domains. |
| `settingsLock` | `normalizeSettingsLock()` | Clamps monthly count, stamps month key, and timestamps last change. |
| `state` | spread over `DEFAULT_STATE` | Preserves known fields and fills missing fields. |
| `analytics` | `normalizeAnalytics()` | Keeps valid local-date keys and positive domain totals. |
| `browsingSettings` | `normalizeBrowsingSettings()` | Defaults enabled to true and normalizes excluded domains. |
| `browsingState` | spread over `createDefaultBrowsingState()` | Defaults idle state to `active`. |
| `browsingAnalytics` | `normalizeBrowsingAnalytics()` | Validates days, domain stats, and recent sessions; caps recent sessions. |

## Analytics Data Shapes

```mermaid
erDiagram
  SOCIAL_ANALYTICS ||--o{ SOCIAL_DAY : contains
  SOCIAL_DAY ||--o{ SOCIAL_DOMAIN_TOTAL : records
  BROWSING_ANALYTICS ||--o{ BROWSING_DAY : contains
  BROWSING_ANALYTICS ||--o{ BROWSING_DOMAIN_TOTAL : aggregates
  BROWSING_ANALYTICS ||--o{ RECENT_SESSION : keeps
  BROWSING_DAY ||--o{ BROWSING_DAY_DOMAIN : records
  BROWSING_DAY ||--o{ HOUR_BUCKET : records

  SOCIAL_ANALYTICS {
    number createdAt
  }
  SOCIAL_DAY {
    string date
    number totalMs
  }
  SOCIAL_DOMAIN_TOTAL {
    string domain
    number usedMs
  }
  BROWSING_ANALYTICS {
    number createdAt
  }
  BROWSING_DAY {
    string date
    number totalMs
    number sessions
  }
  BROWSING_DOMAIN_TOTAL {
    string domain
    number totalMs
    number sessions
    number firstSeen
    number lastSeen
    string categoryId
  }
  BROWSING_DAY_DOMAIN {
    string domain
    number totalMs
    number sessions
    number firstSeen
    number lastSeen
  }
  HOUR_BUCKET {
    number hour
    number usedMs
  }
  RECENT_SESSION {
    string domain
    number start
    number end
    number durationMs
  }
```

Social analytics are sliced at local day boundaries. Browsing analytics are sliced at local day and local hour boundaries.

## Domain Matching Rules

```mermaid
flowchart TB
  Input["Raw value or URL"] --> Normalize["normalizeDomain / getHostname"]
  Normalize --> Protocol{"http or https URL?"}
  Protocol -- no --> Empty["not trackable for active URLs"]
  Protocol -- yes --> Strip["lowercase hostname\nstrip leading www."]
  Strip --> Match{"hostname == domain\nor hostname endsWith .domain?"}
  Match -- yes --> Tracked["matched domain"]
  Match -- no --> NotTracked["not matched"]
```

Important consequences:

- `reddit.com` matches `reddit.com` and `old.reddit.com`.
- `notreddit.com` does not match `reddit.com`.
- `chrome://`, `file://`, and other non-web schemes do not count.
- Browsing analytics reject incognito tabs before domain matching.

## Failure Handling

| Failure | Handling |
| --- | --- |
| Background API handler throws | `respondAsync()` returns `{ ok:false, error }` to sender. |
| Content receiver missing | `safeSendTabMessage()` injects `src/content/content.js` and retries once. |
| Content injection fails | Message returns `null`; enforcement can still remove the tab. |
| Tab already gone | `safeCloseTab()` ignores the error. |
| Focused active tab lookup fails | Worker falls back from `tabs.query` to `windows.getLastFocused({ populate:true })`; otherwise tracking pauses. |
| Storage unchanged | `setStorageIfChanged()` skips the write. |
| Cold service worker | First access hydrates `runtimeCache` from storage. |
| Burst of tab/window events | `scheduleProcessActiveContext()` coalesces them through `processQueue`. |

## Privacy and Security Properties

Nuan is local-first:

- No network permissions beyond host access required by Chrome for active tab inspection and script injection.
- No remote services.
- No external telemetry.
- Browsing analytics store domains only.
- Full URLs, URL paths, query strings, titles, and page content are not persisted.
- Incognito tabs are not included in browsing analytics.
- Private account, banking, payments, and health domains are excluded from browsing analytics by default.
- Content UI is injected on demand instead of running on every page.

Security-sensitive maintenance rules:

- Keep all persistence writes centralized in the background worker.
- Keep `content.js` presentation-only; do not move policy decisions into the page context.
- Treat all messages from content scripts as untrusted and validate sender context, as `handleCountdownFinished()` does by checking the sender URL against tracked domains.
- Keep manifest permission changes covered by `tests/unit/manifest.test.js`.

## Test Architecture

```mermaid
flowchart LR
  Unit["Node unit tests\ntests/unit/*.test.js"] --> Logic["src/shared/logic/core.js"]
  Unit --> Manifest["manifest.json assumptions"]

  E2E["Playwright smoke tests\ntests/e2e/*.spec.js"] --> Chromium["Chromium persistent context"]
  Chromium --> Extension["Unpacked extension\n--load-extension=<repo>"]
  Extension --> Pages["Popup / Options / Analytics"]
  Extension --> Worker["Background worker messaging"]
  Extension --> RegularPage["Regular web page\nno injected Nuan DOM"]

  Check["npm run check"] --> JSON["manifest JSON validation"]
  Check --> Syntax["node --check extension scripts"]
```

Current automated coverage verifies:

- manifest has no static content scripts
- manifest permissions stay aligned with optimized runtime behavior
- domain normalization and matching
- social analytics day bucketing and zero-duration no-op behavior
- browsing analytics day/hour/session bucketing and zero-duration no-op behavior
- popup, settings, and analytics pages load
- background messaging works from extension pages
- settings save and clear browsing data flows work
- clean analytics storage renders empty states
- regular webpages do not receive Nuan content script elements

## Operational Invariants

These are the main architecture-level rules tests and reviews should protect:

- `manifest.content_scripts` remains absent unless there is a deliberate privacy/performance reason to change it.
- `src/background/background.js` remains the only normal writer to `chrome.storage.local`.
- `runtimeCache` is always normalized before callers read from it.
- Social `usedMs` never exceeds `limitMinutes * 60 * 1000` after enforcement.
- Active social time accrues only between `activeSessionStart` and the synchronization time.
- Active browsing time accrues only when browsing analytics are enabled and `idleState` is `active`.
- A social reset window begins at first tracked social activity and lasts `6 * 60 * 60 * 1000` ms.
- Domain matching uses exact host or subdomain matching, not substring matching.
- Analytics ignore zero-duration intervals.
- Recent browsing sessions stay capped at `MAX_RECENT_BROWSING_SESSIONS`.
- `nuan-active-sync` is cleared when neither social tracking nor browsing tracking is active.
- `nuan-social-enforce` is cleared when no active social session requires enforcement.

## Architecture Tradeoffs

| Decision | Benefit | Cost |
| --- | --- | --- |
| No build step | Simple extension loading and transparent source paths. | No bundling, type checking, module splitting, or compile-time dead-code elimination. |
| Background worker as single authority | Clear state ownership and fewer race-prone storage writes. | All extension pages depend on runtime messaging. |
| On-demand content injection | Regular pages stay untouched and startup overhead is lower. | First message may need an inject-and-retry path. |
| Local `chrome.storage.local` cache | Fewer storage reads and easier normalized access. | Cache must be updated from `storage.onChanged` and rehydrated after worker restart. |
| Active-only alarms | Less idle work and lower background churn. | Correctness depends on scheduling alarms after every context refresh. |
| Content-owned countdown UI | Smooth page-local warning/countdown timing. | Background still needs alarm enforcement as the authoritative fallback. |
| `<all_urls>` host permission | Enables local domain matching and injection for user-configured domains. | Requires careful documentation and Chrome Web Store justification. |

## Change Guide

Use this checklist when changing core behavior:

1. If a storage shape changes, update the schema section and add normalization coverage.
2. If a message type changes, update the message catalog and relevant sequence diagrams.
3. If a permission changes, update the permission model, publishing documentation, and manifest tests.
4. If active tracking changes, review both social tracking and browsing analytics because they share active-tab context.
5. If content injection changes, keep the regular-page e2e test meaningful.
6. If alarm behavior changes, verify both no-active-work clearing and active-work scheduling paths.
7. If analytics aggregation changes, add unit coverage in `tests/unit/logic.test.js`.
