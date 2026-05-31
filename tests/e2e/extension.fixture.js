const path = require("node:path");
const { chromium, test: base, expect } = require("@playwright/test");

const extensionPath = path.resolve(__dirname, "../..");

const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = path.join("/private/tmp", `nuan-extension-profile-${Date.now()}-${Math.random()}`);
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--disable-crash-reporter",
        "--disable-crashpad",
        "--no-sandbox"
      ]
    });

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker");
    }

    const extensionId = new URL(serviceWorker.url()).host;
    await use(extensionId);
  },

  extensionPage: async ({ context, extensionId }, use) => {
    async function openExtensionPage(relativePath) {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${relativePath}`);
      return page;
    }

    await use(openExtensionPage);
  }
});

async function clearExtensionStorage(page) {
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.runtime.sendMessage({ type: "getSettings" });
    await chrome.runtime.sendMessage({ type: "getBrowsingSettings" });
  });
}

module.exports = {
  expect,
  test,
  clearExtensionStorage
};
