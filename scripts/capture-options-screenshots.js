const path = require("node:path");
const os = require("node:os");
const { chromium } = require("@playwright/test");

const extensionPath = path.resolve(__dirname, "..");
const outDir = path.resolve(__dirname, "../resources/screenshots");

(async () => {
  const userDataDir = path.join(os.tmpdir(), `nuan-screen-${Date.now()}`);
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

  let sw = context.serviceWorkers()[0];
  for (let attempt = 0; attempt < 20 && !sw; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    sw = context.serviceWorkers()[0];
  }
  if (!sw) {
    throw new Error("Service worker not found");
  }
  const extensionId = new URL(sw.url()).host;

  const optionsUrl = `chrome-extension://${extensionId}/src/ui/options/options.html`;

  // Unlocked state
  const page = await context.newPage();
  await page.goto(optionsUrl);
  await page.waitForTimeout(600);
  await page.evaluate(() => chrome.storage.local.clear());
  await page.reload();
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 980, height: 800 });
  await page.screenshot({ path: path.join(outDir, "settings-unlocked.png") });

  // Locked state
  await page.evaluate(async () => {
    const now = Date.now();
    await chrome.storage.local.set({
      settings: { limitMinutes: 5, domains: ["facebook.com", "instagram.com", "tiktok.com", "reddit.com"] },
      settingsLock: { lastChangeAt: now - 2 * 24 * 60 * 60 * 1000, monthlyChanges: 1, monthKey: "2099-12" }
    });
  });
  await page.reload();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, "settings-locked.png") });

  await context.close();
  console.log("Screenshots written to", outDir);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});