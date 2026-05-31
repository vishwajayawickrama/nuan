const { test, expect, clearExtensionStorage } = require("./extension.fixture");

test("extension pages load and render key controls", async ({ extensionPage }) => {
  const popup = await extensionPage("src/ui/popup/popup.html");
  await expect(popup.locator("h1")).toHaveText("Nuan");
  await expect(popup.locator("#stateBadge")).not.toHaveText("Error");

  const options = await extensionPage("src/ui/options/options.html");
  await expect(options.locator("h1")).toHaveText("Settings");
  await expect(options.locator("#limitMinutes")).toHaveValue(/\d+/);
  await expect(options.locator("#browsingAnalyticsEnabled")).toBeChecked();

  const analytics = await extensionPage("src/ui/analytics/analytics.html");
  await expect(analytics.locator("h1")).toHaveText("Analytics");
  await expect(analytics.locator("#browsingToday")).not.toHaveText("Error");
  await expect(analytics.locator("#todayTotal")).not.toHaveText("Error");
});

test("settings save and clear browsing data controls work", async ({ extensionPage }) => {
  const options = await extensionPage("src/ui/options/options.html");
  await clearExtensionStorage(options);
  await options.reload();

  await options.locator("#limitMinutes").fill("2");
  await options.locator("#domainInput").fill("example-social.test");
  await options.locator("#addDomainButton").click();
  await options.locator("#excludedDomains").fill("private.test\nsecure.example.test");
  await options.locator("form button[type='submit']").click();
  await expect(options.locator("#toast")).toContainText("Settings saved");

  await options.locator("#clearBrowsingData").click();
  await expect(options.locator("#toast")).toContainText("Browsing data cleared");
});

test("analytics page renders empty states from clean storage", async ({ extensionPage }) => {
  const analytics = await extensionPage("src/ui/analytics/analytics.html");
  await clearExtensionStorage(analytics);
  await analytics.reload();

  await expect(analytics.locator("#browsingToday")).toContainText("0s");
  await expect(analytics.locator("#browsingDailyTrend")).toContainText("No browsing time recorded yet.");
  await expect(analytics.locator("#dailyUsage")).toContainText("No tracked social time recorded yet.");
});
