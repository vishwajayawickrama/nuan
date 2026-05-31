(() => {
if (window.__timeGuardContentLoaded) {
  return;
}
window.__timeGuardContentLoaded = true;

const TOAST_ID = "time-guard-toast";
const OVERLAY_ID = "time-guard-countdown";
const WARNING_MS = 60 * 1000;
const FINAL_COUNTDOWN_MS = 3 * 1000;

let warningTimer = null;
let countdownTimer = null;
let countdownInterval = null;
let activeResetAt = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "trackingStarted") {
    startTrackingNotice(message.remainingMs, message.resetAt);
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "trackingPaused") {
    clearScheduledNotices();
    removeCountdown();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "showOneMinuteWarning") {
    showToast("1 minute remaining before social media is blocked.", "warning", 6000);
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "startClosingCountdown") {
    startClosingCountdown(message.resetAt);
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "showBlockedCloseToast") {
    showBlockedCloseToast(message.resetAt, message.closeDelayMs);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

function startTrackingNotice(remainingMs, resetAt) {
  clearScheduledNotices();
  removeCountdown();
  activeResetAt = resetAt || null;

  showToast(`Tracking started. ${formatDuration(remainingMs)} remaining.`, "info", 4000);

  if (remainingMs > WARNING_MS) {
    warningTimer = window.setTimeout(() => {
      showToast("1 minute remaining before social media is blocked.", "warning", 6000);
    }, remainingMs - WARNING_MS);
  } else if (remainingMs > FINAL_COUNTDOWN_MS) {
    showToast("Less than 1 minute remaining before social media is blocked.", "warning", 6000);
  }

  if (remainingMs > FINAL_COUNTDOWN_MS) {
    countdownTimer = window.setTimeout(() => startClosingCountdown(activeResetAt), remainingMs - FINAL_COUNTDOWN_MS);
  } else {
    startClosingCountdown(activeResetAt);
  }
}

function startClosingCountdown(resetAt = activeResetAt) {
  clearScheduledNotices();
  let remaining = 3;
  renderCountdown(remaining, resetAt);

  countdownInterval = window.setInterval(() => {
    remaining -= 1;

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      chrome.runtime.sendMessage({ type: "countdownFinished" });
      return;
    }

    renderCountdown(remaining, resetAt);
  }, 1000);
}

function clearScheduledNotices() {
  if (warningTimer) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }

  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function showToast(message, tone, durationMs) {
  const toast = getOrCreateToast();
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;

  window.setTimeout(() => {
    if (toast.textContent === message) {
      toast.hidden = true;
    }
  }, durationMs);
}

function showBlockedCloseToast(resetAt, closeDelayMs = 1600) {
  const resetText = resetAt ? formatResetTime(resetAt) : "the next reset";
  showToast(`Social media is blocked. You can return at ${resetText}.`, "blocked", closeDelayMs + 800);
}

function renderCountdown(seconds, resetAt) {
  const overlay = getOrCreateCountdown();
  const waitMs = resetAt ? Math.max(0, resetAt - Date.now()) : null;

  overlay.replaceChildren();
  const title = document.createElement("div");
  title.className = "time-guard-countdown-title";
  title.textContent = `Closing in ${seconds}`;
  overlay.append(title);

  if (waitMs !== null) {
    const detail = document.createElement("div");
    detail.className = "time-guard-countdown-detail";
    detail.textContent = `Wait ${formatLongDuration(waitMs)} to use social media again.`;
    overlay.append(detail);
  }

  overlay.hidden = false;
}

function removeCountdown() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.remove();
  }
}

function getOrCreateToast() {
  let toast = document.getElementById(TOAST_ID);
  if (toast) {
    return toast;
  }

  toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.hidden = true;
  document.documentElement.append(toast);
  injectStyles();
  return toast;
}

function getOrCreateCountdown() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.hidden = true;
  document.documentElement.append(overlay);
  injectStyles();
  return overlay;
}

function injectStyles() {
  if (document.getElementById("time-guard-styles")) {
    return;
  }

  const styles = document.createElement("style");
  styles.id = "time-guard-styles";
  styles.textContent = `
    #${TOAST_ID} {
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 2147483647;
      max-width: min(360px, calc(100vw - 36px));
      border-radius: 8px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.26);
      color: #ffffff;
      font: 600 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 12px 14px;
      background: #176b52;
    }

    #${TOAST_ID}[data-tone="warning"] {
      background: #9a6700;
    }

    #${TOAST_ID}[data-tone="blocked"] {
      background: #8a2b20;
    }

    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 18px;
      background: rgba(12, 14, 16, 0.72);
      color: #ffffff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      text-align: center;
      padding: 24px;
    }

    #${OVERLAY_ID} .time-guard-countdown-title {
      font-size: clamp(42px, 9vw, 96px);
      font-weight: 800;
      line-height: 1;
    }

    #${OVERLAY_ID} .time-guard-countdown-detail {
      max-width: min(620px, calc(100vw - 48px));
      font-size: clamp(18px, 3vw, 28px);
      font-weight: 650;
      line-height: 1.25;
    }

    #${TOAST_ID}[hidden],
    #${OVERLAY_ID}[hidden] {
      display: none !important;
    }
  `;
  document.documentElement.append(styles);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatLongDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatResetTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}
})();
