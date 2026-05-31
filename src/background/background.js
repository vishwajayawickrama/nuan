try {
  importScripts("../shared/logic/core.js");
} catch (_error) {
  // Unit-testable helpers are optional at runtime; local fallbacks remain below.
}

const Logic = globalThis.NuanLogic || {};

const DEFAULT_SETTINGS = {
  limitMinutes: 5,
  domains: [
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "tiktok.com",
    "reddit.com",
    "x.com",
    "twitter.com",
    "snapchat.com",
    "pinterest.com"
  ]
};

const REMOVED_DOMAINS = new Set();

const DEFAULT_PRIVATE_DOMAINS = [
  "1password.com",
  "bitwarden.com",
  "lastpass.com",
  "dashlane.com",
  "keepersecurity.com",
  "accounts.google.com",
  "login.microsoftonline.com",
  "appleid.apple.com",
  "paypal.com",
  "stripe.com",
  "chase.com",
  "bankofamerica.com",
  "wellsfargo.com",
  "capitalone.com",
  "citi.com",
  "americanexpress.com",
  "healthcare.gov",
  "mychart.org"
];

const DEFAULT_BROWSING_SETTINGS = {
  enabled: true,
  excludedDomains: DEFAULT_PRIVATE_DOMAINS
};

const DEFAULT_STATE = {
  windowStart: null,
  usedMs: 0,
  activeTabId: null,
  activeWindowId: null,
  activeSessionStart: null,
  activeDomain: null,
  oneMinuteWarningWindowStart: null,
  countdownWindowStart: null
};

const RESET_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TICK_ALARM = "social-media-time-guard-tick";
const BLOCKED_NOTICE_CLOSE_DELAY_MS = 1600;
const MAX_RECENT_BROWSING_SESSIONS = 500;

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  configureIdleDetection();
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await refreshActiveTracking();
  await refreshBrowsingTracking();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  configureIdleDetection();
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await refreshActiveTracking();
  await refreshBrowsingTracking();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) {
    updateUsageAndEnforce();
    updateBrowsingUsage();
  }
});

chrome.tabs.onActivated.addListener(() => {
  refreshActiveTracking();
  refreshBrowsingTracking();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  refreshActiveTracking({ removedTabId: tabId });
  refreshBrowsingTracking({ removedTabId: tabId });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    handleTabUrlChange(tabId, changeInfo, tab);
    refreshBrowsingTracking();
  }
});

chrome.windows.onFocusChanged.addListener(() => {
  refreshActiveTracking();
  refreshBrowsingTracking();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    updateUsageAndEnforce();
  }

  if (area === "local" && changes.browsingSettings) {
    refreshBrowsingTracking();
  }
});

if (chrome.idle?.onStateChanged) {
  chrome.idle.onStateChanged.addListener((idleState) => {
    updateBrowsingUsage({ idleState });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "getStatus") {
    respondAsync(getStatus(), sendResponse);
    return true;
  }

  if (message?.type === "getSettings") {
    respondAsync(getSettings(), sendResponse);
    return true;
  }

  if (message?.type === "getBrowsingSettings") {
    respondAsync(getBrowsingSettings(), sendResponse);
    return true;
  }

  if (message?.type === "getAnalytics") {
    respondAsync(getAnalytics(), sendResponse);
    return true;
  }

  if (message?.type === "getBrowsingAnalytics") {
    respondAsync(getBrowsingAnalytics(), sendResponse);
    return true;
  }

  if (message?.type === "saveSettings") {
    respondAsync(saveSettings(message.settings), sendResponse);
    return true;
  }

  if (message?.type === "saveBrowsingAnalyticsSettings") {
    respondAsync(saveBrowsingAnalyticsSettings(message.settings), sendResponse);
    return true;
  }

  if (message?.type === "clearBrowsingAnalytics") {
    respondAsync(clearBrowsingAnalytics(), sendResponse);
    return true;
  }

  if (message?.type === "countdownFinished") {
    respondAsync(handleCountdownFinished(sender), sendResponse);
    return true;
  }

  return false;
});

function respondAsync(promise, sendResponse) {
  promise
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "The extension background worker failed."
      });
    });
}

function configureIdleDetection() {
  if (chrome.idle?.setDetectionInterval) {
    chrome.idle.setDetectionInterval(60);
  }
}

async function ensureDefaults() {
  const data = await chrome.storage.local.get([
    "settings",
    "state",
    "analytics",
    "browsingSettings",
    "browsingState",
    "browsingAnalytics"
  ]);
  const updates = {};

  if (!data.settings) {
    updates.settings = DEFAULT_SETTINGS;
  } else {
    updates.settings = normalizeSettings(data.settings);
  }

  if (!data.state) {
    updates.state = DEFAULT_STATE;
  }

  if (!data.analytics) {
    updates.analytics = createDefaultAnalytics();
  }

  if (!data.browsingSettings) {
    updates.browsingSettings = DEFAULT_BROWSING_SETTINGS;
  } else {
    updates.browsingSettings = normalizeBrowsingSettings(data.browsingSettings);
  }

  if (!data.browsingState) {
    updates.browsingState = createDefaultBrowsingState();
  }

  if (!data.browsingAnalytics) {
    updates.browsingAnalytics = createDefaultBrowsingAnalytics();
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

async function getSettings() {
  await ensureDefaults();
  const { settings } = await chrome.storage.local.get("settings");
  return normalizeSettings(settings);
}

async function getState() {
  await ensureDefaults();
  const { state } = await chrome.storage.local.get("state");
  return { ...DEFAULT_STATE, ...state };
}

async function getStoredAnalytics() {
  await ensureDefaults();
  const { analytics } = await chrome.storage.local.get("analytics");
  return normalizeAnalytics(analytics);
}

async function getBrowsingSettings() {
  await ensureDefaults();
  const { browsingSettings } = await chrome.storage.local.get("browsingSettings");
  return normalizeBrowsingSettings(browsingSettings);
}

async function getBrowsingState() {
  await ensureDefaults();
  const { browsingState } = await chrome.storage.local.get("browsingState");
  return { ...createDefaultBrowsingState(), ...browsingState };
}

async function getStoredBrowsingAnalytics() {
  await ensureDefaults();
  const { browsingAnalytics } = await chrome.storage.local.get("browsingAnalytics");
  return normalizeBrowsingAnalytics(browsingAnalytics);
}

async function setState(state) {
  await chrome.storage.local.set({ state: { ...DEFAULT_STATE, ...state } });
}

async function setStateAndAnalytics(state, analytics) {
  await chrome.storage.local.set({
    state: { ...DEFAULT_STATE, ...state },
    analytics: normalizeAnalytics(analytics)
  });
}

async function setBrowsingState(state) {
  await chrome.storage.local.set({ browsingState: { ...createDefaultBrowsingState(), ...state } });
}

async function setBrowsingStateAndAnalytics(state, analytics) {
  await chrome.storage.local.set({
    browsingState: { ...createDefaultBrowsingState(), ...state },
    browsingAnalytics: normalizeBrowsingAnalytics(analytics)
  });
}

async function saveSettings(rawSettings) {
  const settings = normalizeSettings(rawSettings);
  if (settings.limitMinutes < 1 || settings.domains.length === 0) {
    return {
      ok: false,
      error: "Use a limit of at least 1 minute and add at least one domain."
    };
  }

  await chrome.storage.local.set({ settings });
  await refreshActiveTracking();
  return { ok: true, settings };
}

async function saveBrowsingAnalyticsSettings(rawSettings = {}) {
  const settings = normalizeBrowsingSettings(rawSettings);
  await updateBrowsingUsage({ skipRefresh: true });
  await chrome.storage.local.set({ browsingSettings: settings });
  await refreshBrowsingTracking();
  return { ok: true, settings };
}

async function clearBrowsingAnalytics() {
  const clearedState = createDefaultBrowsingState();
  const clearedAnalytics = createDefaultBrowsingAnalytics();
  await chrome.storage.local.set({
    browsingState: clearedState,
    browsingAnalytics: clearedAnalytics
  });
  await refreshBrowsingTracking();
  return { ok: true };
}

async function updateUsageAndEnforce(options = {}) {
  const settings = await getSettings();
  let state = await getState();
  let analytics = await getStoredAnalytics();
  const now = Date.now();

  state = resetIfExpired(state, now);
  ({ state, analytics } = accrueActiveTime(state, analytics, now));

  const limitMs = settings.limitMinutes * 60 * 1000;
  if (state.windowStart && state.usedMs >= limitMs) {
    state.usedMs = limitMs;
    state.activeTabId = null;
    state.activeWindowId = null;
    state.activeSessionStart = null;
    state.activeDomain = null;
    await setStateAndAnalytics(state, analytics);
    await closeTrackedTabs(settings, state.windowStart + RESET_INTERVAL_MS);
    return state;
  }

  await setStateAndAnalytics(state, analytics);

  if (!options.skipRefresh) {
    await refreshActiveTracking({ alreadySynced: true });
  }

  return state;
}

async function refreshActiveTracking(options = {}) {
  const settings = await getSettings();
  let state = options.alreadySynced ? await getState() : await updateUsageAndEnforce({ skipRefresh: true });
  const now = Date.now();
  const previousTabId = state.activeTabId;

  state = resetIfExpired(state, now);

  if (state.windowStart && state.usedMs >= settings.limitMinutes * 60 * 1000) {
    await setState({
      ...state,
      activeTabId: null,
      activeWindowId: null,
      activeSessionStart: null,
      activeDomain: null
    });
    await closeTrackedTabs(settings, state.windowStart + RESET_INTERVAL_MS);
    return;
  }

  const activeTab = await getFocusedActiveTab();
  const activeTabUrl = activeTab?.url || activeTab?.pendingUrl;
  const activeDomain = getTrackedDomain(activeTabUrl, settings.domains);
  const shouldTrack =
    activeTab &&
    activeTab.id !== options.removedTabId &&
    Boolean(activeDomain);

  if (!shouldTrack) {
    await sendTrackingPaused(previousTabId);
    await setState({
      ...state,
      activeTabId: null,
      activeWindowId: null,
      activeSessionStart: null,
      activeDomain: null
    });
    return;
  }

  if (!state.windowStart) {
    state.windowStart = now;
  }

  const limitMs = settings.limitMinutes * 60 * 1000;
  const remainingMs = Math.max(0, limitMs - state.usedMs);
  const startedNewSession = state.activeTabId !== activeTab.id || !state.activeSessionStart;
  const nextState = {
    ...state,
    activeTabId: activeTab.id,
    activeWindowId: activeTab.windowId,
    activeSessionStart: now,
    activeDomain
  };

  await setState(nextState);

  if (startedNewSession) {
    await sendTrackingPaused(previousTabId, activeTab.id);
    await safeSendTabMessage(activeTab.id, {
      type: "trackingStarted",
      remainingMs,
      limitMs,
      resetAt: state.windowStart + RESET_INTERVAL_MS
    });
  }
}

async function updateBrowsingUsage(options = {}) {
  const settings = await getBrowsingSettings();
  let state = await getBrowsingState();
  let analytics = await getStoredBrowsingAnalytics();
  const now = Date.now();

  if (options.idleState) {
    state.idleState = options.idleState;
  }

  ({ state, analytics } = accrueBrowsingTime(state, analytics, now));

  if (!settings.enabled || state.idleState !== "active") {
    state = clearBrowsingSession(state);
    await setBrowsingStateAndAnalytics(state, analytics);
    return state;
  }

  await setBrowsingStateAndAnalytics(state, analytics);

  if (!options.skipRefresh) {
    await refreshBrowsingTracking({ alreadySynced: true });
  }

  return state;
}

async function refreshBrowsingTracking(options = {}) {
  const settings = await getBrowsingSettings();
  let state = options.alreadySynced ? await getBrowsingState() : await updateBrowsingUsage({ skipRefresh: true });
  const now = Date.now();

  if (!settings.enabled || state.idleState !== "active") {
    await setBrowsingState(clearBrowsingSession(state));
    return;
  }

  const activeTab = await getFocusedActiveTab();
  const activeDomain = getBrowsingDomain(activeTab, settings);

  if (!activeDomain || activeTab.id === options.removedTabId) {
    await setBrowsingState(clearBrowsingSession(state));
    return;
  }

  const startedNewSession =
    state.activeTabId !== activeTab.id ||
    state.activeWindowId !== activeTab.windowId ||
    state.activeDomain !== activeDomain ||
    !state.activeSessionStart;

  await setBrowsingState({
    ...state,
    activeTabId: activeTab.id,
    activeWindowId: activeTab.windowId,
    activeDomain,
    activeSessionStart: startedNewSession ? now : state.activeSessionStart,
    lastSyncAt: now
  });
}

async function handleTabUrlChange(tabId, changeInfo, tab) {
  const settings = await getSettings();
  const url = tab?.url || tab?.pendingUrl;

  if (!isTrackedUrl(url, settings.domains)) {
    await refreshActiveTracking();
    return;
  }

  const status = await getStatus({ enforce: false });
  if (status.blocked) {
    if (changeInfo.status !== "complete") {
      return;
    }

    await safeCloseTabWithBlockedNotice(tab, status.resetAt);
    return;
  }

  await refreshActiveTracking();
}

async function getStatus(options = {}) {
  const settings = await getSettings();
  let state = options.enforce === false ? await getState() : await updateUsageAndEnforce({ skipRefresh: true });
  const now = Date.now();
  state = resetIfExpired(state, now);

  const activeTab = await getFocusedActiveTab();
  const activeTabUrl = activeTab?.url || activeTab?.pendingUrl || "";
  const currentTabTracked = isTrackedUrl(activeTabUrl, settings.domains);
  const limitMs = settings.limitMinutes * 60 * 1000;
  const blocked = Boolean(state.windowStart && state.usedMs >= limitMs);
  const resetAt = state.windowStart ? state.windowStart + RESET_INTERVAL_MS : null;

  return {
    settings,
    usedMs: state.usedMs,
    remainingMs: Math.max(0, limitMs - state.usedMs),
    limitMs,
    blocked,
    resetAt,
    currentTabTracked,
    currentHost: getHostname(activeTabUrl),
    active: Boolean(state.activeTabId && state.activeSessionStart),
    windowStart: state.windowStart
  };
}

async function getAnalytics() {
  await updateUsageAndEnforce({ skipRefresh: true });
  const analytics = await getStoredAnalytics();
  const todayKey = formatLocalDate(Date.now());
  const days = Object.entries(analytics.days)
    .map(([date, data]) => ({
      date,
      totalMs: data.totalMs,
      domains: data.domains
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const domainTotals = new Map();

  for (const day of days) {
    for (const [domain, usedMs] of Object.entries(day.domains)) {
      domainTotals.set(domain, (domainTotals.get(domain) || 0) + usedMs);
    }
  }

  const mostUsedDomains = [...domainTotals.entries()]
    .map(([domain, usedMs]) => ({ domain, usedMs }))
    .sort((a, b) => b.usedMs - a.usedMs || a.domain.localeCompare(b.domain));

  return {
    ok: true,
    today: {
      date: todayKey,
      totalMs: analytics.days[todayKey]?.totalMs || 0,
      domains: analytics.days[todayKey]?.domains || {}
    },
    noUseStreakDays: getNoUseStreakDays(analytics),
    days: days.slice(0, 14),
    mostUsedDomains
  };
}

async function getBrowsingAnalytics() {
  await updateBrowsingUsage({ skipRefresh: true });
  const settings = await getBrowsingSettings();
  const analytics = await getStoredBrowsingAnalytics();
  const todayKey = formatLocalDate(Date.now());
  const today = analytics.days[todayKey] || createBrowsingDay();
  const recentDays = Object.entries(analytics.days)
    .map(([date, day]) => ({
      date,
      totalMs: day.totalMs,
      sessions: day.sessions,
      domains: day.domains,
      hours: day.hours
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);
  const topDomains = Object.entries(analytics.domains)
    .map(([domain, data]) => ({ domain, ...data }))
    .sort((a, b) => b.totalMs - a.totalMs || a.domain.localeCompare(b.domain))
    .slice(0, 20);
  const weeklyTotalMs = recentDays.slice(0, 7).reduce((sum, day) => sum + day.totalMs, 0);

  return {
    ok: true,
    settings,
    today: {
      date: todayKey,
      totalMs: today.totalMs,
      sessions: today.sessions,
      domains: today.domains,
      hours: today.hours
    },
    weeklyTotalMs,
    dailyAverageMs: recentDays.length > 0 ? Math.round(weeklyTotalMs / Math.min(7, recentDays.length)) : 0,
    topDomain: topDomains[0] || null,
    recentDays,
    topDomains,
    recentSessions: analytics.recentSessions.slice().reverse()
  };
}

async function handleCountdownFinished(sender) {
  const settings = await getSettings();
  let state = await getState();
  let analytics = await getStoredAnalytics();
  const senderUrl = sender?.tab?.url || sender?.tab?.pendingUrl || "";

  if (senderUrl && !isTrackedUrl(senderUrl, settings.domains)) {
    return { ok: false, error: "Countdown finished from an untracked tab." };
  }

  ({ state, analytics } = accrueActiveTime(state, analytics, Date.now()));

  await setStateAndAnalytics(
    {
      ...state,
      usedMs: settings.limitMinutes * 60 * 1000,
      activeTabId: null,
      activeWindowId: null,
      activeSessionStart: null,
      activeDomain: null
    },
    analytics
  );
  await closeTrackedTabs(settings, state.windowStart ? state.windowStart + RESET_INTERVAL_MS : null);
  return { ok: true };
}

function accrueActiveTime(state, analytics, now) {
  if (!state.activeSessionStart) {
    return { state, analytics };
  }

  if (!state.windowStart) {
    state.windowStart = state.activeSessionStart;
  }

  const elapsed = Math.max(0, now - state.activeSessionStart);
  const nextAnalytics = state.activeDomain
    ? recordUsage(analytics, state.activeSessionStart, now, state.activeDomain)
    : analytics;

  return {
    analytics: nextAnalytics,
    state: {
      ...state,
      usedMs: state.usedMs + elapsed,
      activeSessionStart: now
    }
  };
}

function accrueBrowsingTime(state, analytics, now) {
  if (!state.activeSessionStart || !state.activeDomain) {
    return {
      state: { ...state, lastSyncAt: now },
      analytics
    };
  }

  const start = state.lastSyncAt || state.activeSessionStart;
  const end = Math.max(start, now);
  const nextAnalytics = recordBrowsingUsage(analytics, start, end, state.activeDomain, state.activeSessionStart);

  return {
    analytics: nextAnalytics,
    state: {
      ...state,
      lastSyncAt: now
    }
  };
}

function resetIfExpired(state, now) {
  if (!state.windowStart || now - state.windowStart < RESET_INTERVAL_MS) {
    return state;
  }

  return { ...DEFAULT_STATE };
}

async function closeTrackedTabs(settings, resetAt = null) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => isTrackedUrl(tab.url || tab.pendingUrl, settings.domains))
      .map((tab) => safeCloseTabWithBlockedNotice(tab, resetAt))
  );
}

async function sendTrackingPaused(tabId, exceptTabId = null) {
  if (typeof tabId !== "number" || tabId === exceptTabId) {
    return;
  }

  await safeSendTabMessage(tabId, { type: "trackingPaused" });
}

async function safeSendTabMessage(tabId, message) {
  if (typeof tabId !== "number") {
    return null;
  }

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!String(error?.message || "").includes("Receiving end does not exist")) {
      return null;
    }
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/content.js"]
    });
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_error) {
    return null;
  }
}

async function safeCloseTab(tabId) {
  if (typeof tabId !== "number") {
    return;
  }

  try {
    await chrome.tabs.remove(tabId);
  } catch (_error) {
    // The tab may already be gone.
  }
}

async function safeCloseTabWithBlockedNotice(tab, resetAt) {
  const tabId = typeof tab === "number" ? tab : tab?.id;
  if (typeof tabId !== "number") {
    return;
  }

  const response = await safeSendTabMessage(tabId, {
    type: "showBlockedCloseToast",
    resetAt,
    closeDelayMs: BLOCKED_NOTICE_CLOSE_DELAY_MS
  });

  if (response?.ok) {
    await sleep(BLOCKED_NOTICE_CLOSE_DELAY_MS);
  }

  await safeCloseTab(tabId);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getFocusedActiveTab() {
  const queryAttempts = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true }
  ];

  for (const queryInfo of queryAttempts) {
    try {
      const [tab] = await chrome.tabs.query(queryInfo);
      if (tab?.url || tab?.pendingUrl) {
        return tab;
      }
    } catch (_error) {
      // Fall through to the next lookup strategy.
    }
  }

  try {
    const browserWindow = await chrome.windows.getLastFocused({ populate: true });
    return browserWindow?.tabs?.find((tab) => tab.active) || null;
  } catch (_error) {
    return null;
  }
}

function isTrackedUrl(url, domains) {
  return Boolean(getTrackedDomain(url, domains));
}

function getTrackedDomain(url, domains) {
  if (Logic.getMatchedDomain) {
    return Logic.getMatchedDomain(url, domains);
  }

  const hostname = getHostname(url);
  if (!hostname) {
    return "";
  }

  return domains.find((domain) => hostname === domain || hostname.endsWith(`.${domain}`)) || "";
}

function getBrowsingDomain(tab, settings) {
  if (!tab || tab.incognito) {
    return "";
  }

  const url = tab.url || tab.pendingUrl || "";
  const hostname = getHostname(url);
  if (!hostname || isExcludedBrowsingDomain(hostname, settings.excludedDomains)) {
    return "";
  }

  return hostname;
}

function isExcludedBrowsingDomain(hostname, excludedDomains) {
  if (Logic.isExcludedDomain) {
    return Logic.isExcludedDomain(hostname, excludedDomains);
  }

  return excludedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function getHostname(url) {
  if (Logic.getHostname) {
    return Logic.getHostname(url);
  }

  if (typeof url !== "string" || !url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch (_error) {
    return "";
  }
}

function normalizeSettings(settings = {}) {
  return {
    limitMinutes: normalizeLimit(settings.limitMinutes),
    domains: normalizeDomains(settings.domains)
  };
}

function normalizeLimit(value) {
  if (Logic.normalizeLimit) {
    return Logic.normalizeLimit(value, DEFAULT_SETTINGS.limitMinutes);
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.limitMinutes;
}

function normalizeDomains(domains) {
  const source = Array.isArray(domains) ? domains : DEFAULT_SETTINGS.domains;
  const normalized = source.map(normalizeDomain).filter((domain) => domain && !REMOVED_DOMAINS.has(domain));
  return [...new Set(normalized)];
}

function normalizeDomain(value) {
  if (Logic.normalizeDomain) {
    return Logic.normalizeDomain(value);
  }

  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./, "");
  } catch (_error) {
    return trimmed
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split(":")[0]
      .trim();
  }
}

function createDefaultAnalytics() {
  if (Logic.createDefaultAnalytics) {
    return Logic.createDefaultAnalytics();
  }

  return {
    createdAt: Date.now(),
    days: {}
  };
}

function normalizeAnalytics(analytics = {}) {
  if (Logic.normalizeAnalytics) {
    return Logic.normalizeAnalytics(analytics);
  }

  const normalized = {
    createdAt: Number.isFinite(analytics.createdAt) ? analytics.createdAt : Date.now(),
    days: {}
  };

  if (!analytics.days || typeof analytics.days !== "object") {
    return normalized;
  }

  for (const [date, day] of Object.entries(analytics.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== "object") {
      continue;
    }

    const domains = {};
    if (day.domains && typeof day.domains === "object") {
      for (const [domain, usedMs] of Object.entries(day.domains)) {
        const normalizedDomain = normalizeDomain(domain);
        const normalizedMs = Math.max(0, Number(usedMs) || 0);
        if (normalizedDomain && normalizedMs > 0) {
          domains[normalizedDomain] = (domains[normalizedDomain] || 0) + normalizedMs;
        }
      }
    }

    normalized.days[date] = {
      totalMs: Math.max(0, Number(day.totalMs) || Object.values(domains).reduce((sum, usedMs) => sum + usedMs, 0)),
      domains
    };
  }

  return normalized;
}

function recordUsage(analytics, start, end, domain) {
  if (Logic.recordSocialUsage) {
    return Logic.recordSocialUsage(analytics, start, end, domain);
  }

  const nextAnalytics = normalizeAnalytics(analytics);
  const normalizedDomain = normalizeDomain(domain);
  let cursor = start;

  if (!normalizedDomain || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return nextAnalytics;
  }

  while (cursor < end) {
    const nextBoundary = Math.min(end, getNextLocalDayStart(cursor));
    const usedMs = nextBoundary - cursor;
    const date = formatLocalDate(cursor);
    const day = nextAnalytics.days[date] || { totalMs: 0, domains: {} };

    day.totalMs += usedMs;
    day.domains[normalizedDomain] = (day.domains[normalizedDomain] || 0) + usedMs;
    nextAnalytics.days[date] = day;
    cursor = nextBoundary;
  }

  return nextAnalytics;
}

function getNoUseStreakDays(analytics) {
  if (Logic.getNoUseStreakDays) {
    return Logic.getNoUseStreakDays(analytics);
  }

  const normalized = normalizeAnalytics(analytics);
  const createdDate = new Date(normalized.createdAt);
  const cursor = new Date();
  let streak = 0;

  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - 1);
  createdDate.setHours(0, 0, 0, 0);

  while (cursor >= createdDate) {
    const date = formatLocalDate(cursor.getTime());
    if ((normalized.days[date]?.totalMs || 0) > 0) {
      break;
    }

    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function formatLocalDate(timestamp) {
  if (Logic.formatLocalDate) {
    return Logic.formatLocalDate(timestamp);
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextLocalDayStart(timestamp) {
  if (Logic.getNextLocalDayStart) {
    return Logic.getNextLocalDayStart(timestamp);
  }

  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

function normalizeBrowsingSettings(settings = {}) {
  if (Logic.normalizeBrowsingSettings) {
    return Logic.normalizeBrowsingSettings(settings, DEFAULT_PRIVATE_DOMAINS);
  }

  return {
    enabled: settings.enabled !== false,
    excludedDomains: normalizeDomains(settings.excludedDomains || DEFAULT_PRIVATE_DOMAINS)
  };
}

function createDefaultBrowsingState() {
  return {
    activeTabId: null,
    activeWindowId: null,
    activeDomain: null,
    activeSessionStart: null,
    lastSyncAt: null,
    idleState: "active"
  };
}

function createDefaultBrowsingAnalytics() {
  if (Logic.createDefaultBrowsingAnalytics) {
    return Logic.createDefaultBrowsingAnalytics();
  }

  return {
    createdAt: Date.now(),
    days: {},
    domains: {},
    recentSessions: []
  };
}

function createBrowsingDay() {
  if (Logic.createBrowsingDay) {
    return Logic.createBrowsingDay();
  }

  return {
    totalMs: 0,
    sessions: 0,
    domains: {},
    hours: {}
  };
}

function createBrowsingDomainStats() {
  if (Logic.createBrowsingDomainStats) {
    return Logic.createBrowsingDomainStats();
  }

  return {
    totalMs: 0,
    sessions: 0,
    firstSeen: null,
    lastSeen: null,
    categoryId: null
  };
}

function normalizeBrowsingAnalytics(analytics = {}) {
  if (Logic.normalizeBrowsingAnalytics) {
    return Logic.normalizeBrowsingAnalytics(analytics);
  }

  const normalized = {
    createdAt: Number.isFinite(analytics.createdAt) ? analytics.createdAt : Date.now(),
    days: {},
    domains: {},
    recentSessions: []
  };

  if (analytics.days && typeof analytics.days === "object") {
    for (const [date, day] of Object.entries(analytics.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== "object") {
        continue;
      }

      normalized.days[date] = normalizeBrowsingDay(day);
    }
  }

  if (analytics.domains && typeof analytics.domains === "object") {
    for (const [domain, stats] of Object.entries(analytics.domains)) {
      const normalizedDomain = normalizeDomain(domain);
      if (!normalizedDomain || !stats || typeof stats !== "object") {
        continue;
      }

      normalized.domains[normalizedDomain] = normalizeBrowsingDomainStats(stats);
    }
  }

  if (Array.isArray(analytics.recentSessions)) {
    normalized.recentSessions = analytics.recentSessions
      .map(normalizeBrowsingSession)
      .filter(Boolean)
      .slice(-MAX_RECENT_BROWSING_SESSIONS);
  }

  return normalized;
}

function normalizeBrowsingDay(day) {
  if (Logic.normalizeBrowsingDay) {
    return Logic.normalizeBrowsingDay(day);
  }

  const normalized = createBrowsingDay();
  normalized.totalMs = Math.max(0, Number(day.totalMs) || 0);
  normalized.sessions = Math.max(0, Number.parseInt(day.sessions, 10) || 0);

  if (day.domains && typeof day.domains === "object") {
    for (const [domain, stats] of Object.entries(day.domains)) {
      const normalizedDomain = normalizeDomain(domain);
      if (normalizedDomain && stats && typeof stats === "object") {
        normalized.domains[normalizedDomain] = normalizeBrowsingDomainStats(stats);
      }
    }
  }

  if (day.hours && typeof day.hours === "object") {
    for (const [hour, usedMs] of Object.entries(day.hours)) {
      const normalizedHour = Number.parseInt(hour, 10);
      const normalizedMs = Math.max(0, Number(usedMs) || 0);
      if (normalizedHour >= 0 && normalizedHour <= 23 && normalizedMs > 0) {
        normalized.hours[normalizedHour] = normalizedMs;
      }
    }
  }

  return normalized;
}

function normalizeBrowsingDomainStats(stats) {
  if (Logic.normalizeBrowsingDomainStats) {
    return Logic.normalizeBrowsingDomainStats(stats);
  }

  return {
    totalMs: Math.max(0, Number(stats.totalMs) || 0),
    sessions: Math.max(0, Number.parseInt(stats.sessions, 10) || 0),
    firstSeen: Number.isFinite(stats.firstSeen) ? stats.firstSeen : null,
    lastSeen: Number.isFinite(stats.lastSeen) ? stats.lastSeen : null,
    categoryId: typeof stats.categoryId === "string" ? stats.categoryId : null
  };
}

function normalizeBrowsingSession(session) {
  if (Logic.normalizeBrowsingSession) {
    return Logic.normalizeBrowsingSession(session);
  }

  if (!session || typeof session !== "object") {
    return null;
  }

  const domain = normalizeDomain(session.domain);
  const start = Number(session.start);
  const end = Number(session.end);
  const durationMs = Math.max(0, Number(session.durationMs) || end - start);

  if (!domain || !Number.isFinite(start) || !Number.isFinite(end) || end < start || durationMs <= 0) {
    return null;
  }

  return {
    domain,
    start,
    end,
    durationMs
  };
}

function clearBrowsingSession(state) {
  return {
    ...state,
    activeTabId: null,
    activeWindowId: null,
    activeDomain: null,
    activeSessionStart: null,
    lastSyncAt: null
  };
}

function recordBrowsingUsage(analytics, start, end, domain, sessionStart) {
  if (Logic.recordBrowsingUsage) {
    return Logic.recordBrowsingUsage(analytics, start, end, domain, sessionStart);
  }

  const nextAnalytics = normalizeBrowsingAnalytics(analytics);
  const normalizedDomain = normalizeDomain(domain);
  let cursor = start;
  let isFirstSlice = start === sessionStart;

  if (!normalizedDomain || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return nextAnalytics;
  }

  while (cursor < end) {
    const nextBoundary = Math.min(end, getNextBrowsingBoundary(cursor));
    const usedMs = nextBoundary - cursor;
    const date = formatLocalDate(cursor);
    const hour = new Date(cursor).getHours();
    const day = nextAnalytics.days[date] || createBrowsingDay();
    const dayDomain = day.domains[normalizedDomain] || createBrowsingDomainStats();
    const globalDomain = nextAnalytics.domains[normalizedDomain] || createBrowsingDomainStats();

    day.totalMs += usedMs;
    day.hours[hour] = (day.hours[hour] || 0) + usedMs;
    dayDomain.totalMs += usedMs;
    globalDomain.totalMs += usedMs;

    if (isFirstSlice) {
      day.sessions += 1;
      dayDomain.sessions += 1;
      globalDomain.sessions += 1;
      isFirstSlice = false;
    }

    dayDomain.firstSeen = dayDomain.firstSeen || cursor;
    dayDomain.lastSeen = nextBoundary;
    globalDomain.firstSeen = globalDomain.firstSeen || cursor;
    globalDomain.lastSeen = nextBoundary;
    day.domains[normalizedDomain] = dayDomain;
    nextAnalytics.domains[normalizedDomain] = globalDomain;
    nextAnalytics.days[date] = day;
    cursor = nextBoundary;
  }

  upsertRecentBrowsingSession(nextAnalytics, normalizedDomain, start, end, sessionStart);
  return nextAnalytics;
}

function upsertRecentBrowsingSession(analytics, domain, start, end, sessionStart) {
  const recentSessions = analytics.recentSessions;
  const lastSession = recentSessions[recentSessions.length - 1];

  if (lastSession && lastSession.domain === domain && lastSession.start === sessionStart) {
    lastSession.end = end;
    lastSession.durationMs = Math.max(0, end - sessionStart);
  } else {
    recentSessions.push({
      domain,
      start: sessionStart,
      end,
      durationMs: Math.max(0, end - sessionStart)
    });
  }

  analytics.recentSessions = recentSessions.slice(-MAX_RECENT_BROWSING_SESSIONS);
}

function getNextBrowsingBoundary(timestamp) {
  if (Logic.getNextBrowsingBoundary) {
    return Logic.getNextBrowsingBoundary(timestamp);
  }

  const date = new Date(timestamp);
  const nextHour = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() + 1).getTime();
  return Math.min(nextHour, getNextLocalDayStart(timestamp));
}
