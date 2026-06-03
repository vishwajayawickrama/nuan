const browsingToday = document.getElementById("browsingToday");
const browsingWeek = document.getElementById("browsingWeek");
const browsingAverage = document.getElementById("browsingAverage");
const browsingTopDomain = document.getElementById("browsingTopDomain");
const browsingMode = document.getElementById("browsingMode");
const browsingDayCount = document.getElementById("browsingDayCount");
const browsingDailyTrend = document.getElementById("browsingDailyTrend");
const hourlyActivity = document.getElementById("hourlyActivity");
const topDomainCount = document.getElementById("topDomainCount");
const browsingDomainUsage = document.getElementById("browsingDomainUsage");
const recentSessions = document.getElementById("recentSessions");
const todayTotal = document.getElementById("todayTotal");
const streakDays = document.getElementById("streakDays");
const dayCount = document.getElementById("dayCount");
const dailyUsage = document.getElementById("dailyUsage");
const domainUsage = document.getElementById("domainUsage");

renderAnalytics();

async function renderAnalytics() {
  const [socialAnalytics, browsingAnalytics] = await Promise.all([
    requestAnalytics("getAnalytics"),
    requestAnalytics("getBrowsingAnalytics")
  ]);

  if (!browsingAnalytics || browsingAnalytics.ok === false) {
    renderBrowsingError(browsingAnalytics?.error || "Unable to read browsing analytics.");
  } else {
    renderBrowsingAnalytics(browsingAnalytics);
  }

  if (!socialAnalytics || socialAnalytics.ok === false) {
    renderSocialError(socialAnalytics?.error || "Unable to read social analytics.");
  } else {
    renderSocialAnalytics(socialAnalytics);
  }
}

async function requestAnalytics(type) {
  try {
    return await NuanRuntime.sendMessage({ type });
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Unable to contact the extension background worker."
    };
  }
}

function renderBrowsingAnalytics(analytics) {
  browsingMode.textContent = analytics.settings.enabled ? "tracking on" : "tracking off";
  browsingToday.textContent = formatDuration(analytics.today.totalMs);
  browsingWeek.textContent = formatDuration(analytics.weeklyTotalMs);
  browsingAverage.textContent = formatDuration(analytics.dailyAverageMs);
  browsingTopDomain.textContent = analytics.topDomain?.domain || "None";
  browsingDayCount.textContent = `${analytics.recentDays.length} ${pluralize("day", analytics.recentDays.length)}`;
  topDomainCount.textContent = `${analytics.topDomains.length} ${pluralize("domain", analytics.topDomains.length)}`;

  renderBarList(
    browsingDailyTrend,
    analytics.recentDays.map((day) => ({
      label: formatDate(day.date),
      value: formatDuration(day.totalMs),
      amount: day.totalMs
    })),
    "No browsing time recorded yet."
  );
  renderHourlyActivity(analytics.today.hours);
  renderBarList(
    browsingDomainUsage,
    analytics.topDomains.map((domain) => ({
      label: domain.domain,
      value: `${formatDuration(domain.totalMs)} · ${domain.sessions} ${pluralize("session", domain.sessions)}`,
      amount: domain.totalMs
    })),
    "No browsing domains recorded yet."
  );
  renderRecentSessions(analytics.recentSessions);
}

function renderSocialAnalytics(analytics) {
  todayTotal.textContent = formatDuration(analytics.today.totalMs);
  streakDays.textContent = `${analytics.noUseStreakDays} ${pluralize("day", analytics.noUseStreakDays)}`;
  dayCount.textContent = `${analytics.days.length} ${pluralize("day", analytics.days.length)}`;

  renderUsageRows(
    dailyUsage,
    analytics.days.map((day) => [formatDate(day.date), formatDuration(day.totalMs)]),
    "No tracked social time recorded yet."
  );
  renderUsageRows(
    domainUsage,
    analytics.mostUsedDomains.map((domain) => [domain.domain, formatDuration(domain.usedMs)]),
    "No tracked social domains recorded yet."
  );
}

function renderBarList(container, rows, emptyText) {
  if (rows.length === 0) {
    container.replaceChildren(createEmptyRow(emptyText));
    return;
  }

  const maxAmount = Math.max(...rows.map((row) => row.amount), 1);
  container.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("div");
      item.className = "bar-row";

      const label = document.createElement("span");
      label.textContent = row.label;

      const track = document.createElement("span");
      track.className = "bar-track";
      const fill = document.createElement("span");
      fill.className = "bar-fill";
      fill.style.width = `${Math.max(4, Math.round((row.amount / maxAmount) * 100))}%`;
      track.append(fill);

      const value = document.createElement("strong");
      value.textContent = row.value;

      item.append(label, track, value);
      return item;
    })
  );
}

function renderHourlyActivity(hours) {
  const cells = [];
  const maxAmount = Math.max(...Object.values(hours).map(Number), 1);

  for (let hour = 0; hour < 24; hour += 1) {
    const amount = Number(hours[hour]) || 0;
    const cell = document.createElement("div");
    cell.className = "hour-cell";
    cell.style.setProperty("--activity", amount / maxAmount);
    cell.title = `${hour.toString().padStart(2, "0")}:00 · ${formatDuration(amount)}`;
    cell.textContent = hour % 6 === 0 ? hour.toString().padStart(2, "0") : "";
    cells.push(cell);
  }

  hourlyActivity.replaceChildren(...cells);
}

function renderRecentSessions(sessions) {
  if (sessions.length === 0) {
    recentSessions.replaceChildren(createEmptyRow("No recent browsing sessions recorded yet."));
    return;
  }

  recentSessions.replaceChildren(
    ...sessions.slice(0, 20).map((session) => {
      const label = `${session.domain} · ${formatDateTime(session.start)}`;
      return createUsageRow(label, formatDuration(session.durationMs));
    })
  );
}

function renderUsageRows(container, rows, emptyText) {
  if (rows.length === 0) {
    container.replaceChildren(createEmptyRow(emptyText));
    return;
  }

  container.replaceChildren(...rows.map(([label, value]) => createUsageRow(label, value)));
}

function createUsageRow(label, value) {
  const row = document.createElement("div");
  row.className = "analytics-row";

  const labelElement = document.createElement("span");
  labelElement.textContent = label;

  const valueElement = document.createElement("strong");
  valueElement.textContent = value;

  row.append(labelElement, valueElement);
  return row;
}

function createEmptyRow(text) {
  const row = document.createElement("p");
  row.className = "analytics-empty";
  row.textContent = text;
  return row;
}

function renderBrowsingError(message) {
  browsingToday.textContent = "Error";
  browsingWeek.textContent = "Error";
  browsingAverage.textContent = "Error";
  browsingTopDomain.textContent = "Error";
  browsingDailyTrend.replaceChildren(createEmptyRow(message));
  hourlyActivity.replaceChildren(createEmptyRow(message));
  browsingDomainUsage.replaceChildren(createEmptyRow(message));
  recentSessions.replaceChildren(createEmptyRow(message));
}

function renderSocialError(message) {
  todayTotal.textContent = "Error";
  streakDays.textContent = "Error";
  dayCount.textContent = "0 days";
  dailyUsage.replaceChildren(createEmptyRow(message));
  domainUsage.replaceChildren(createEmptyRow(message));
}

function formatDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function pluralize(word, count) {
  return count === 1 ? word : `${word}s`;
}
