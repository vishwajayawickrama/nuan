(function attachNuanLogic(root, factory) {
  const logic = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = logic;
  }

  root.NuanLogic = logic;
})(typeof globalThis !== "undefined" ? globalThis : self, () => {
  const MAX_RECENT_BROWSING_SESSIONS = 500;
  const SETTINGS_CHANGE_LOCK_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const SETTINGS_CHANGE_MONTH_LIMIT = 2;

  function getHostname(url) {
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

  function normalizeDomain(value) {
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

  function normalizeDomains(domains, fallbackDomains = []) {
    const source = Array.isArray(domains) ? domains : fallbackDomains;
    return [...new Set(source.map(normalizeDomain).filter(Boolean))];
  }

  function domainMatches(hostname, domain) {
    return Boolean(hostname && domain && (hostname === domain || hostname.endsWith(`.${domain}`)));
  }

  function getMatchedDomain(url, domains) {
    const hostname = getHostname(url);
    if (!hostname) {
      return "";
    }

    return domains.find((domain) => domainMatches(hostname, domain)) || "";
  }

  function isExcludedDomain(hostname, excludedDomains) {
    return excludedDomains.some((domain) => domainMatches(hostname, domain));
  }

  function formatLocalDate(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getNextLocalDayStart(timestamp) {
    const date = new Date(timestamp);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  }

  function getNextBrowsingBoundary(timestamp) {
    const date = new Date(timestamp);
    const nextHour = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() + 1).getTime();
    return Math.min(nextHour, getNextLocalDayStart(timestamp));
  }

  function createDefaultAnalytics(createdAt = Date.now()) {
    return {
      createdAt,
      days: {}
    };
  }

  function normalizeAnalytics(analytics = {}) {
    const normalized = createDefaultAnalytics(Number.isFinite(analytics.createdAt) ? analytics.createdAt : Date.now());

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

  function recordSocialUsage(analytics, start, end, domain) {
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

  function getNoUseStreakDays(analytics, now = Date.now()) {
    const normalized = normalizeAnalytics(analytics);
    const createdDate = new Date(normalized.createdAt);
    const cursor = new Date(now);
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

  function createDefaultBrowsingAnalytics(createdAt = Date.now()) {
    return {
      createdAt,
      days: {},
      domains: {},
      recentSessions: []
    };
  }

  function createBrowsingDay() {
    return {
      totalMs: 0,
      sessions: 0,
      domains: {},
      hours: {}
    };
  }

  function createBrowsingDomainStats() {
    return {
      totalMs: 0,
      sessions: 0,
      firstSeen: null,
      lastSeen: null,
      categoryId: null
    };
  }

  function normalizeBrowsingDomainStats(stats) {
    return {
      totalMs: Math.max(0, Number(stats.totalMs) || 0),
      sessions: Math.max(0, Number.parseInt(stats.sessions, 10) || 0),
      firstSeen: Number.isFinite(stats.firstSeen) ? stats.firstSeen : null,
      lastSeen: Number.isFinite(stats.lastSeen) ? stats.lastSeen : null,
      categoryId: typeof stats.categoryId === "string" ? stats.categoryId : null
    };
  }

  function normalizeBrowsingDay(day) {
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

  function normalizeBrowsingSession(session) {
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

    return { domain, start, end, durationMs };
  }

  function normalizeBrowsingAnalytics(analytics = {}) {
    const normalized = createDefaultBrowsingAnalytics(
      Number.isFinite(analytics.createdAt) ? analytics.createdAt : Date.now()
    );

    if (analytics.days && typeof analytics.days === "object") {
      for (const [date, day] of Object.entries(analytics.days)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && day && typeof day === "object") {
          normalized.days[date] = normalizeBrowsingDay(day);
        }
      }
    }

    if (analytics.domains && typeof analytics.domains === "object") {
      for (const [domain, stats] of Object.entries(analytics.domains)) {
        const normalizedDomain = normalizeDomain(domain);
        if (normalizedDomain && stats && typeof stats === "object") {
          normalized.domains[normalizedDomain] = normalizeBrowsingDomainStats(stats);
        }
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

  function recordBrowsingUsage(analytics, start, end, domain, sessionStart = start) {
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

  function normalizeBrowsingSettings(settings = {}, fallbackExcludedDomains = []) {
    return {
      enabled: settings.enabled !== false,
      excludedDomains: normalizeDomains(settings.excludedDomains || fallbackExcludedDomains, fallbackExcludedDomains)
    };
  }

  function normalizeLimit(value, fallbackLimit) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackLimit;
  }

  function getMonthKey(now = Date.now()) {
    const date = new Date(now);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function getNextMonthStart(now = Date.now()) {
    const date = new Date(now);
    return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0).getTime();
  }

  function createDefaultSettingsLock() {
    return {
      lastChangeAt: null,
      monthlyChanges: 0,
      monthKey: null
    };
  }

  function normalizeSettingsLock(lock = {}, now = Date.now()) {
    const normalized = createDefaultSettingsLock();
    const rawLastChangeAt = Number.isFinite(lock.lastChangeAt) ? Math.max(0, lock.lastChangeAt) : null;
    normalized.lastChangeAt = rawLastChangeAt === null ? null : Math.min(rawLastChangeAt, now);
    normalized.monthlyChanges = Math.max(0, Number.parseInt(lock.monthlyChanges, 10) || 0);
    normalized.monthKey = typeof lock.monthKey === "string" && /^\d{4}-\d{2}$/.test(lock.monthKey)
      ? lock.monthKey
      : null;
    return normalized;
  }

  function isSettingsChangeAllowed(lock, now = Date.now()) {
    const normalized = normalizeSettingsLock(lock, now);
    const monthKey = getMonthKey(now);
    const monthlyChanges = normalized.monthKey === monthKey ? normalized.monthlyChanges : 0;

    if (monthlyChanges >= SETTINGS_CHANGE_MONTH_LIMIT) {
      return {
        allowed: false,
        reason: "monthly",
        nextChangeAt: getNextMonthStart(now),
        monthKey
      };
    }

    if (normalized.lastChangeAt && now < normalized.lastChangeAt + SETTINGS_CHANGE_LOCK_WEEK_MS) {
      return {
        allowed: false,
        reason: "weekly",
        nextChangeAt: normalized.lastChangeAt + SETTINGS_CHANGE_LOCK_WEEK_MS,
        monthKey
      };
    }

    return {
      allowed: true,
      reason: null,
      nextChangeAt: null,
      monthKey
    };
  }

  function applySettingsChange(lock, now = Date.now()) {
    const normalized = normalizeSettingsLock(lock, now);
    const monthKey = getMonthKey(now);
    const monthlyChanges = normalized.monthKey === monthKey ? normalized.monthlyChanges : 0;

    normalized.monthlyChanges = monthlyChanges + 1;
    normalized.monthKey = monthKey;
    normalized.lastChangeAt = now;
    return normalized;
  }

  return {
    MAX_RECENT_BROWSING_SESSIONS,
    SETTINGS_CHANGE_LOCK_WEEK_MS,
    SETTINGS_CHANGE_MONTH_LIMIT,
    applySettingsChange,
    createBrowsingDay,
    createBrowsingDomainStats,
    createDefaultAnalytics,
    createDefaultBrowsingAnalytics,
    createDefaultSettingsLock,
    domainMatches,
    formatLocalDate,
    getHostname,
    getMatchedDomain,
    getMonthKey,
    getNextBrowsingBoundary,
    getNextLocalDayStart,
    getNextMonthStart,
    getNoUseStreakDays,
    isExcludedDomain,
    isSettingsChangeAllowed,
    normalizeAnalytics,
    normalizeBrowsingAnalytics,
    normalizeBrowsingDay,
    normalizeBrowsingDomainStats,
    normalizeBrowsingSession,
    normalizeBrowsingSettings,
    normalizeDomain,
    normalizeDomains,
    normalizeLimit,
    normalizeSettingsLock,
    recordBrowsingUsage,
    recordSocialUsage
  };
});
