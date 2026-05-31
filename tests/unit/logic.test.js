const assert = require("node:assert/strict");
const test = require("node:test");
const logic = require("../../src/shared/logic/core.js");

test("normalizes domains from URLs, paths, ports, and mixed case", () => {
  assert.equal(logic.normalizeDomain(" HTTPS://www.Example.COM/path?q=1 "), "example.com");
  assert.equal(logic.normalizeDomain("www.reddit.com/r/test"), "reddit.com");
  assert.equal(logic.normalizeDomain("localhost:3000/path"), "localhost");
  assert.equal(logic.normalizeDomain(""), "");
  assert.equal(logic.normalizeDomain(null), "");
});

test("extracts only http and https hostnames", () => {
  assert.equal(logic.getHostname("https://www.github.com/a/b"), "github.com");
  assert.equal(logic.getHostname("http://sub.example.com"), "sub.example.com");
  assert.equal(logic.getHostname("chrome://extensions"), "");
  assert.equal(logic.getHostname("file:///tmp/index.html"), "");
});

test("matches domains and subdomains", () => {
  assert.equal(logic.getMatchedDomain("https://m.reddit.com/r/test", ["reddit.com"]), "reddit.com");
  assert.equal(logic.getMatchedDomain("https://notreddit.com", ["reddit.com"]), "");
  assert.equal(logic.isExcludedDomain("secure.chase.com", ["chase.com"]), true);
  assert.equal(logic.isExcludedDomain("example.com", ["chase.com"]), false);
});

test("records social usage across local day boundaries", () => {
  const start = new Date(2026, 0, 1, 23, 59, 0).getTime();
  const end = new Date(2026, 0, 2, 0, 1, 0).getTime();
  const analytics = logic.recordSocialUsage(logic.createDefaultAnalytics(start), start, end, "reddit.com");

  assert.equal(analytics.days["2026-01-01"].totalMs, 60000);
  assert.equal(analytics.days["2026-01-02"].totalMs, 60000);
  assert.equal(analytics.days["2026-01-01"].domains["reddit.com"], 60000);
  assert.equal(analytics.days["2026-01-02"].domains["reddit.com"], 60000);
});

test("does not change social analytics for zero-duration usage", () => {
  const start = new Date(2026, 0, 1, 12, 0, 0).getTime();
  const analytics = logic.createDefaultAnalytics(start);

  assert.deepEqual(logic.recordSocialUsage(analytics, start, start, "reddit.com"), analytics);
});

test("calculates no-use streak from completed local days", () => {
  const createdAt = new Date(2026, 0, 1, 9, 0, 0).getTime();
  const now = new Date(2026, 0, 5, 9, 0, 0).getTime();
  const analytics = logic.createDefaultAnalytics(createdAt);
  analytics.days["2026-01-02"] = { totalMs: 1000, domains: { "reddit.com": 1000 } };

  assert.equal(logic.getNoUseStreakDays(analytics, now), 2);
});

test("records browsing usage into day, hour, global domain, and recent sessions", () => {
  const start = new Date(2026, 0, 1, 10, 59, 0).getTime();
  const end = new Date(2026, 0, 1, 11, 1, 0).getTime();
  const analytics = logic.recordBrowsingUsage(logic.createDefaultBrowsingAnalytics(start), start, end, "github.com", start);
  const day = analytics.days["2026-01-01"];

  assert.equal(day.totalMs, 120000);
  assert.equal(day.hours[10], 60000);
  assert.equal(day.hours[11], 60000);
  assert.equal(day.sessions, 1);
  assert.equal(day.domains["github.com"].sessions, 1);
  assert.equal(analytics.domains["github.com"].totalMs, 120000);
  assert.equal(analytics.recentSessions.length, 1);
  assert.equal(analytics.recentSessions[0].durationMs, 120000);
});

test("does not change browsing analytics for zero-duration usage", () => {
  const start = new Date(2026, 0, 1, 12, 0, 0).getTime();
  const analytics = logic.createDefaultBrowsingAnalytics(start);

  assert.deepEqual(logic.recordBrowsingUsage(analytics, start, start, "github.com", start), analytics);
});

test("extends existing recent browsing session when session start matches", () => {
  const sessionStart = new Date(2026, 0, 1, 10, 0, 0).getTime();
  const firstEnd = sessionStart + 30000;
  const secondEnd = sessionStart + 60000;
  let analytics = logic.recordBrowsingUsage(logic.createDefaultBrowsingAnalytics(sessionStart), sessionStart, firstEnd, "github.com", sessionStart);
  analytics = logic.recordBrowsingUsage(analytics, firstEnd, secondEnd, "github.com", sessionStart);

  assert.equal(analytics.recentSessions.length, 1);
  assert.equal(analytics.recentSessions[0].durationMs, 60000);
});

test("normalizes browsing settings with fallback excluded domains", () => {
  const settings = logic.normalizeBrowsingSettings(
    { enabled: false, excludedDomains: ["https://www.Bank.com/login", "bank.com"] },
    ["default.com"]
  );

  assert.equal(settings.enabled, false);
  assert.deepEqual(settings.excludedDomains, ["bank.com"]);
});
