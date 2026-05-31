const SUGGESTED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "reddit.com",
  "x.com",
  "twitter.com",
  "snapchat.com",
  "pinterest.com",
  "youtube.com",
  "threads.net",
  "bsky.app",
  "discord.com",
  "twitch.tv",
  "tumblr.com"
];

const form = document.getElementById("settingsForm");
const limitMinutes = document.getElementById("limitMinutes");
const decreaseLimit = document.getElementById("decreaseLimit");
const increaseLimit = document.getElementById("increaseLimit");
const domains = document.getElementById("domains");
const domainInput = document.getElementById("domainInput");
const addDomainButton = document.getElementById("addDomainButton");
const selectedDomains = document.getElementById("selectedDomains");
const availableDomains = document.getElementById("availableDomains");
const domainCount = document.getElementById("domainCount");
const browsingAnalyticsEnabled = document.getElementById("browsingAnalyticsEnabled");
const excludedDomains = document.getElementById("excludedDomains");
const clearBrowsingData = document.getElementById("clearBrowsingData");
const confirmModal = document.getElementById("confirmModal");
const confirmMessage = document.getElementById("confirmMessage");
const cancelRemoveDomain = document.getElementById("cancelRemoveDomain");
const confirmRemoveDomain = document.getElementById("confirmRemoveDomain");
const message = document.getElementById("message");
const toast = document.getElementById("toast");

let activeDomains = [];
let pendingRemovalDomain = "";
let toastTimeout = 0;

loadSettings();
decreaseLimit.append(createIcon("minus"));
increaseLimit.append(createIcon("plus"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  syncDomainsField();

  const response = await chrome.runtime.sendMessage({
    type: "saveSettings",
    settings: {
      limitMinutes: limitMinutes.value,
      domains: activeDomains
    }
  });
  const browsingResponse = await chrome.runtime.sendMessage({
    type: "saveBrowsingAnalyticsSettings",
    settings: {
      enabled: browsingAnalyticsEnabled.checked,
      excludedDomains: splitDomainTextarea(excludedDomains.value)
    }
  });

  if (!response.ok) {
    message.textContent = response.error;
    message.className = "error";
    showToast(response.error, "error");
    return;
  }

  if (!browsingResponse.ok) {
    message.textContent = browsingResponse.error;
    message.className = "error";
    showToast(browsingResponse.error, "error");
    return;
  }

  limitMinutes.value = response.settings.limitMinutes;
  activeDomains = response.settings.domains;
  browsingAnalyticsEnabled.checked = browsingResponse.settings.enabled;
  excludedDomains.value = browsingResponse.settings.excludedDomains.join("\n");
  renderDomains();
  message.textContent = "";
  message.className = "";
  showToast("Settings saved", "success");
});

addDomainButton.addEventListener("click", () => {
  addDomain(domainInput.value);
});

domainInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addDomain(domainInput.value);
  }
});

decreaseLimit.addEventListener("click", () => {
  stepLimit(-1);
});

increaseLimit.addEventListener("click", () => {
  stepLimit(1);
});

cancelRemoveDomain.addEventListener("click", closeRemoveModal);

confirmRemoveDomain.addEventListener("click", () => {
  if (!pendingRemovalDomain) {
    return;
  }

  activeDomains = activeDomains.filter((activeDomain) => activeDomain !== pendingRemovalDomain);
  renderDomains();
  closeRemoveModal();
});

confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) {
    closeRemoveModal();
  }
});

clearBrowsingData.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "clearBrowsingAnalytics" });
  if (!response.ok) {
    showToast(response.error || "Unable to clear browsing data.", "error");
    return;
  }

  showToast("Browsing data cleared", "success");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.hidden) {
    closeRemoveModal();
  }
});

async function loadSettings() {
  const settings = await chrome.runtime.sendMessage({ type: "getSettings" });
  const browsingSettings = await chrome.runtime.sendMessage({ type: "getBrowsingSettings" });
  limitMinutes.value = settings.limitMinutes;
  activeDomains = settings.domains;
  browsingAnalyticsEnabled.checked = browsingSettings.enabled;
  excludedDomains.value = browsingSettings.excludedDomains.join("\n");
  renderDomains();
}

function renderDomains() {
  syncDomainsField();
  domainCount.textContent = `${activeDomains.length} active`;
  selectedDomains.replaceChildren(...activeDomains.map(createSelectedChip));

  const available = SUGGESTED_DOMAINS.filter((domain) => !activeDomains.includes(domain));
  availableDomains.replaceChildren(...available.map(createAvailableChip));
}

function createSelectedChip(domain) {
  const chip = document.createElement("button");
  chip.className = "domain-chip selected";
  chip.type = "button";
  chip.dataset.domain = domain;
  chip.setAttribute("aria-label", `Remove ${domain}`);
  chip.textContent = domain;

  const icon = createChipIcon("x");
  icon.setAttribute("aria-hidden", "true");
  chip.append(icon);

  chip.addEventListener("click", () => {
    openRemoveModal(domain);
  });

  return chip;
}

function createAvailableChip(domain) {
  const chip = document.createElement("button");
  chip.className = "domain-chip available";
  chip.type = "button";
  chip.dataset.domain = domain;
  chip.setAttribute("aria-label", `Add ${domain}`);

  const icon = createChipIcon("plus");
  icon.setAttribute("aria-hidden", "true");
  chip.append(icon, domain);

  chip.addEventListener("click", () => {
    addDomain(domain);
  });

  return chip;
}

function addDomain(value) {
  const domain = normalizeDomain(value);
  if (!domain || activeDomains.includes(domain)) {
    domainInput.value = "";
    return;
  }

  activeDomains = [...activeDomains, domain];
  domainInput.value = "";
  renderDomains();
}

function normalizeDomain(value) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^www\./, "").split("/")[0];
  }
}

function syncDomainsField() {
  domains.value = activeDomains.join("\n");
}

function splitDomainTextarea(value) {
  return value
    .split(/\n|,/)
    .map(normalizeDomain)
    .filter(Boolean);
}

function stepLimit(direction) {
  const currentValue = Number.parseInt(limitMinutes.value, 10);
  const current = Number.isFinite(currentValue) ? currentValue : 1;
  limitMinutes.value = Math.max(1, current + direction);
}

function openRemoveModal(domain) {
  pendingRemovalDomain = domain;
  confirmMessage.textContent = `${domain} will stop counting toward your browsing limit after you save.`;
  confirmModal.hidden = false;
  confirmRemoveDomain.focus();
}

function closeRemoveModal() {
  pendingRemovalDomain = "";
  confirmModal.hidden = true;
}

function showToast(text, variant = "success") {
  window.clearTimeout(toastTimeout);
  toast.textContent = text;
  toast.className = `toast ${variant}`;
  toast.hidden = false;

  toastTimeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function createIcon(name) {
  const paths = {
    minus: ["M5 12h14"],
    plus: ["M5 12h14", "M12 5v14"],
    x: ["M18 6 6 18", "M6 6l12 12"]
  };
  const icon = document.createElement("span");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.4");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  for (const pathData of paths[name]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  }

  icon.append(svg);
  return icon;
}

function createChipIcon(name) {
  return createIcon(name);
}
