import { ERROR_KIND, REASON } from './http.mjs';
import { PERCENT, MINUTE_MS, HOUR_MS, DAY_MS, WEEK_MS, CENTS_PER_DOLLAR } from './units.mjs';
import { LABEL, PERIOD, DISCOVERY, DEFAULT_CURRENCY } from './usage.mjs';
import { INVALID } from './accountActions.mjs';
import { MAX_RESPONSE_BYTES } from './curlCommand.mjs';
import { WALLET_ERROR } from './walletMessages.mjs';
import { MAX_ACCOUNT_NAME_LENGTH } from './accounts.mjs';

export const SEVERITY = Object.freeze({
  NORMAL: 'normal',
  WARNING: 'warning',
  CRITICAL: 'critical',
  UNKNOWN: 'unknown',
});

export const EMPTY_SECTION = Object.freeze({
  key: '',
  title: '',
  account: '',
  windows: [],
  mainRows: [],
  rows: [],
  isLoading: false,
  hasError: false,
  errorText: '',
  errorSeverity: SEVERITY.UNKNOWN,
  service: '',
  accent: '',
  badge: '',
});

// Brand accent per service for the redesigned cards; other services use the theme colour.
export const SERVICE_ACCENTS = Object.freeze({
  claude: '#d97757',
  chatgpt: '#10a37f',
});

// Length of each main window, used for the elapsed marker and the usage rate.
const WINDOW_LENGTH_MS = Object.freeze({
  [PERIOD.FIVE_HOUR]: 5 * HOUR_MS,
  [PERIOD.DAILY]: DAY_MS,
  [PERIOD.WEEKLY]: WEEK_MS,
});

// Heading on the main card and short label on the compact rows, per main period.
const WINDOW_NAMES = Object.freeze({
  [PERIOD.FIVE_HOUR]: { heading: 'Current session', shortLabel: 'Session' },
  [PERIOD.DAILY]: { heading: 'Daily limit', shortLabel: 'Day' },
  [PERIOD.WEEKLY]: { heading: 'Weekly limit', shortLabel: 'Week' },
  [PERIOD.MONTHLY]: { heading: 'Monthly limit', shortLabel: 'Month' },
});

// Below this much elapsed time a usage rate is too noisy to show.
const MIN_RATE_ELAPSED_MS = 6 * MINUTE_MS;
const WHOLE_RATE_FROM = 10;

const WARNING_PERCENT = 75;
const CRITICAL_PERCENT = 90;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COUNT_UNITS = [
  { size: 1e9, suffix: 'B' },
  { size: 1e6, suffix: 'M' },
  { size: 1e3, suffix: 'k' },
];
const CRITICAL_ERRORS = [ERROR_KIND.KEY_REJECTED, ERROR_KIND.NO_KEY];
const MAIN_PERIODS = [PERIOD.FIVE_HOUR, PERIOD.DAILY, PERIOD.WEEKLY, PERIOD.MONTHLY];
const MAIN_AMOUNT_LABELS = [LABEL.BALANCE, LABEL.INCLUDED_CREDITS_LEFT, LABEL.BUDGET_LEFT, LABEL.SPENT_THIS_MONTH];
const LOCKED_WALLET_REASONS = [REASON.WALLET_LOCKED, REASON.SECRET_SERVICE_UNAVAILABLE, REASON.SECRET_SERVICE_TIMEOUT];
const NO_VALUE = '--';
const PLACEHOLDER = /\{(\w+)\}/g;
const UNKNOWN_VALUE = 'unknown';
const KIB = 1024;
const MIB = KIB * KIB;
const SECONDS_PER_MINUTE = 60;

const PERIOD_TEXT = Object.freeze({
  [PERIOD.FIVE_HOUR]: '5hr',
  [PERIOD.DAILY]: 'daily',
  [PERIOD.WEEKLY]: 'weekly',
  [PERIOD.MONTHLY]: 'monthly',
  [PERIOD.HOURS]: '{count}hr',
  [PERIOD.DAYS]: '{count} days',
  [PERIOD.MINUTES]: '{count} min',
  [PERIOD.INTERVAL]: 'interval',
  [PERIOD.TOP_UP]: 'top-up',
});

const LABEL_TEXT = Object.freeze({
  [LABEL.SPENT_THIS_MONTH]: 'Spent this month',
  [LABEL.BALANCE]: 'Balance',
  [LABEL.INPUT_TOKENS_THIS_MONTH]: 'Input tokens this month',
  [LABEL.OUTPUT_TOKENS_THIS_MONTH]: 'Output tokens this month',
  [LABEL.MEMBER_SPEND]: '{name}',
  [LABEL.BUDGET_LEFT]: 'Budget left',
  [LABEL.MEMBER_BUDGET_LEFT]: '{name} budget left',
  [LABEL.INCLUDED_CREDITS_LEFT]: 'Included credits left',
  [LABEL.PLAN]: 'Plan',
  [LABEL.BILLING_MODE]: 'Billing mode',
});

const REASON_TEXT = Object.freeze({
  [REASON.TIMEOUT]: 'timed out',
  [REASON.NO_CONNECTION]: 'no connection',
  [REASON.CURL_ERROR]: 'curl error, exit code {code}',
  [REASON.REQUEST_TIMEOUT]: 'the request timed out',
  [REASON.COMMAND_FAILED]: 'the check could not run',
  [REASON.INCOMPLETE]: 'the check stopped before the answer was complete',
  [REASON.TOOL_MISSING]: 'secret-tool, curl or timeout is not installed',
  [REASON.ANSWER_TOO_LARGE]: 'the answer was larger than {size}',
  [REASON.HTTP_STATUS]: 'HTTP {status}',
  [REASON.SERVICE_ERROR]: 'service error, HTTP {status}',
  [REASON.PAYMENT_REQUIRED]: 'payment required, HTTP 402',
  [REASON.REDIRECT]: 'the service answered with a redirect, HTTP {status}',
  [REASON.SHAPE_CHANGED]: 'the answer format changed',
  [REASON.SERVICE_CODE]: 'service code {code}',
  [REASON.INTERNAL]: 'internal error',
  [REASON.NO_KEY]: 'add the key in the widget settings',
  [REASON.KEY_FORMAT]: 'the stored key contains a space, a line break or a character that is not plain ASCII',
  [REASON.SECRET_SERVICE_TIMEOUT]: 'the Secret Service did not answer',
  [REASON.SECRET_SERVICE_UNAVAILABLE]: 'the Secret Service is locked or not running',
  [REASON.WALLET_LOCKED]: 'KWallet is locked',
  [REASON.TEAM_ORGANIZATION_REQUIRED]: 'the usage API needs a team organization in the Claude Console',
  [REASON.ADMIN_KEY_REQUIRED]: 'HTTP 401, use an Admin API key, an OAuth token with the org:admin scope, or a personal or service account key that is not scoped to a workspace',
  [REASON.OPENAI_ADMIN_KEY_REQUIRED]: 'HTTP {status}, use an Admin API key',
  [REASON.GO_SUBSCRIPTION_REQUIRED]: 'OpenCode Go subscription required',
  [REASON.ZEN_ALL_PERMISSIONS]: 'the service account key needs All permissions',
  [REASON.BALANCE_EXHAUSTED]: 'organization balance exhausted, HTTP 402',
  [REASON.BALANCE_NEEDS_MANAGE]: 'balance needs an API key with manage permission',
  [REASON.INSUFFICIENT_BALANCE]: 'insufficient balance, service code {code}',
  [REASON.FILE_READ_FAILED]: 'could not read the file',
  [REASON.FILE_TOO_LARGE]: 'the file was larger than {size}',
  [REASON.FILE_FORMAT_CHANGED]: 'the file format changed',
  [REASON.CLAUDE_FILE_MISSING]: 'the Claude desktop app file plan-usage-history.json was not found',
  [REASON.CLAUDE_ORG_MISSING]: 'the Claude desktop app file has no data for this account',
  [REASON.CODEX_MISSING]: 'no Codex session found',
  [REASON.CODEX_NO_LIMITS]: 'the newest Codex session file has no limits yet',
  [REASON.FIELD_MISSING]: 'the answer has no {field} field',
  [REASON.HF_BILLING_PERMISSION]: 'HTTP 403, the token needs the billing read permission',
  [REASON.JETBRAINS_LOG_MISSING]: 'no JetBrains IDE log was found',
  [REASON.JETBRAINS_NO_QUOTA]: 'the JetBrains IDE logs have no AI quota line yet',
});

const WALLET_ERROR_TEXT = Object.freeze({
  [WALLET_ERROR.NOT_RUNNING]: 'KWallet is not running',
  [WALLET_ERROR.NO_ANSWER]: 'KWallet did not answer. Unlock KWallet and try again.',
  [WALLET_ERROR.NO_ANSWER_AFTER_OPEN]: 'KWallet did not answer. Try again.',
  [WALLET_ERROR.LOCKED]: 'KWallet is locked or could not open the wallet. Unlock KWallet and try again.',
  [WALLET_ERROR.WRITE_FAILED]: 'KWallet could not save the key',
  [WALLET_ERROR.REMOVE_FAILED]: 'KWallet could not remove the key',
  [WALLET_ERROR.FAILED]: 'KWallet answered with an error',
  [WALLET_ERROR.INVALID_KEY]: 'The key must be plain ASCII without spaces or line breaks',
  [WALLET_ERROR.CANCELLED]: 'Stopped waiting for KWallet',
});

const LOCKED_WALLET_ERRORS = [WALLET_ERROR.LOCKED, WALLET_ERROR.NO_ANSWER];

const DISCOVERY_TEXT = Object.freeze({
  [DISCOVERY.CLAUDE_READING]: 'Reading the Claude desktop app file',
  [DISCOVERY.CLAUDE_NONE_NEW]: 'No new accounts found in the Claude desktop app file',
});

const KEY_RULE_TEXT = 'Paste the key';
const SERVICE_RULE_TEXT = 'Pick a service';
const UNKNOWN_ACCOUNT_TEXT = 'This account is not known any more';
const SAVE_FAILED_TEXT = 'The account could not be saved';
const DISCOVERY_NAMES_RULE_TEXT = 'Type a name or email for at least one organization';
const WALLET_WAITING_TEXT = 'Waiting for KWallet. Type the wallet password in the KWallet window.';

const DONE_TEXT = Object.freeze({
  add: 'Added {title} {account}',
  edit: 'Saved {title} {account}',
  remove: 'Deleted {title} {account}',
  unlock: 'KWallet is open',
});

function fill(template, values) {
  return template.replace(PLACEHOLDER, (match, key) => (values[key] === undefined || values[key] === null ? UNKNOWN_VALUE : String(values[key])));
}

function textFor(table, code) {
  return Object.prototype.hasOwnProperty.call(table, code) ? table[code] : code;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatBytes(bytes) {
  if (bytes >= MIB && bytes % MIB === 0) {
    return bytes / MIB + ' MiB';
  }
  if (bytes >= KIB && bytes % KIB === 0) {
    return bytes / KIB + ' KiB';
  }
  return bytes + ' bytes';
}

export function periodText(item) {
  return fill(textFor(PERIOD_TEXT, item.period), { count: item.count });
}

export function windowLabel(item) {
  const period = periodText(item);
  return item.name ? item.name + ' ' + period : period;
}

export function labelText(item) {
  return fill(textFor(LABEL_TEXT, item.label), { name: item.name });
}

export function reasonText(error) {
  const params = Object.assign({}, error.params);
  params.size = formatBytes(typeof params.size === 'number' ? params.size : MAX_RESPONSE_BYTES);
  return fill(textFor(REASON_TEXT, error.reason), params);
}

export function walletErrorText(code) {
  return Object.prototype.hasOwnProperty.call(WALLET_ERROR_TEXT, code) ? WALLET_ERROR_TEXT[code] : WALLET_ERROR_TEXT[WALLET_ERROR.FAILED];
}

export function isWalletLockedError(code) {
  return LOCKED_WALLET_ERRORS.indexOf(code) !== -1;
}

export function doneText(action, title, account) {
  return fill(textFor(DONE_TEXT, action), { title: title, account: account });
}

export function nameRuleText() {
  return 'Type a name or email of 1 to ' + MAX_ACCOUNT_NAME_LENGTH + ' characters';
}

export function fieldRuleText(label) {
  return label + ': use letters, digits and - only, at most 64';
}

export function keyRuleText() {
  return KEY_RULE_TEXT;
}

export function serviceRuleText() {
  return SERVICE_RULE_TEXT;
}

export function discoveryNamesRuleText() {
  return DISCOVERY_NAMES_RULE_TEXT;
}

export function walletWaitingText() {
  return WALLET_WAITING_TEXT;
}

export function saveFailedText() {
  return SAVE_FAILED_TEXT;
}

export function invalidText(invalid, provider) {
  const typed = provider ? provider.fields.filter((field) => field.typed) : [];
  switch (invalid) {
    case INVALID.NAME:
      return nameRuleText();
    case INVALID.FIELD:
      return fieldRuleText(typed.length > 0 ? typed[0].label : 'Field');
    case INVALID.KEY:
      return KEY_RULE_TEXT;
    case INVALID.SERVICE:
      return SERVICE_RULE_TEXT;
    default:
      return UNKNOWN_ACCOUNT_TEXT;
  }
}

export function resultText(result, provider) {
  if (result.ok) {
    return doneText(result.action, result.title, result.name);
  }
  return result.walletCode ? walletErrorText(result.walletCode) : invalidText(result.invalid, provider);
}

export function discoveryText(provider, result, newCount) {
  const texts = provider && provider.discoveryText ? provider.discoveryText : {};
  if (result === null) {
    return texts.reading ? textFor(DISCOVERY_TEXT, texts.reading) : '';
  }
  if (!result.ok) {
    return describeError(result.error);
  }
  return newCount === 0 && texts.none ? textFor(DISCOVERY_TEXT, texts.none) : '';
}

export function refreshChoiceText(seconds) {
  if (seconds < SECONDS_PER_MINUTE) {
    return seconds + ' seconds';
  }
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  return minutes === 1 ? '1 minute' : minutes + ' minutes';
}

export function severityFor(percent) {
  if (percent === null || percent === undefined) {
    return SEVERITY.UNKNOWN;
  }
  if (percent >= CRITICAL_PERCENT) {
    return SEVERITY.CRITICAL;
  }
  return percent >= WARNING_PERCENT ? SEVERITY.WARNING : SEVERITY.NORMAL;
}

export function formatPercent(percent) {
  return percent === null || percent === undefined ? NO_VALUE : Math.round(percent) + '%';
}

export function formatMoney(value, currency) {
  const code = String(currency || DEFAULT_CURRENCY).toLowerCase();
  const cents = Math.round((Math.abs(value) + Number.EPSILON) * CENTS_PER_DOLLAR);
  const parts = (cents / CENTS_PER_DOLLAR).toFixed(2).split('.');
  const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + parts[1];
  const sign = value < 0 && cents > 0 ? '-' : '';
  return code === DEFAULT_CURRENCY ? sign + '$' + grouped : sign + grouped + ' ' + code.toUpperCase();
}

function trimDecimal(value) {
  const text = value.toFixed(1);
  return text.slice(-2) === '.0' ? text.slice(0, -2) : text;
}

export function formatCount(value) {
  for (const unit of COUNT_UNITS) {
    if (value >= unit.size) {
      return trimDecimal(value / unit.size) + unit.suffix;
    }
  }
  return String(Math.round(value));
}

function joinUnits(major, majorUnit, minor, minorUnit) {
  return minor > 0 ? major + ' ' + majorUnit + ' ' + minor + ' ' + minorUnit : major + ' ' + majorUnit;
}

export function formatDuration(ms) {
  if (ms < MINUTE_MS) {
    return 'less than a minute';
  }
  if (ms < HOUR_MS) {
    return Math.floor(ms / MINUTE_MS) + ' min';
  }
  if (ms < DAY_MS) {
    return joinUnits(Math.floor(ms / HOUR_MS), 'h', Math.floor((ms % HOUR_MS) / MINUTE_MS), 'min');
  }
  return joinUnits(Math.floor(ms / DAY_MS), 'd', Math.floor((ms % DAY_MS) / HOUR_MS), 'h');
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Default time of day format; the widget passes the locale format instead.
export function clock24(time) {
  const date = new Date(time);
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

export function formatClock(time, now, timeText = clock24) {
  const date = new Date(time);
  const clock = timeText(time);
  if (isSameDay(date, new Date(now))) {
    return clock;
  }
  if (Math.abs(time - now) < WEEK_MS - DAY_MS) {
    return WEEKDAYS[date.getDay()] + ' ' + clock;
  }
  return MONTHS[date.getMonth()] + ' ' + date.getDate();
}

export function describeError(error) {
  switch (error.kind) {
    case ERROR_KIND.CANNOT_CONNECT:
      return 'Cannot connect (' + reasonText(error) + ')';
    case ERROR_KIND.KEY_REJECTED:
      return 'Key rejected (' + reasonText(error) + ')';
    case ERROR_KIND.RATE_LIMITED:
      return 'Rate limited';
    case ERROR_KIND.UNEXPECTED_ANSWER:
      return 'Unexpected answer (' + reasonText(error) + ')';
    default:
      return capitalize(reasonText(error));
  }
}

export function isWindowActive(item, now) {
  const reset = item.resetsAt === null || item.resetsAt > now;
  const valid = item.validUntil === null || item.validUntil === undefined || item.validUntil > now;
  return reset && valid;
}

export function formatWeekdayClock(time, timeText = clock24) {
  return WEEKDAYS[new Date(time).getDay()] + ' ' + timeText(time);
}

function estimatedResetText(item, now, timeText) {
  return 'Resets about ' + (item.period === PERIOD.WEEKLY ? formatWeekdayClock(item.resetsAt, timeText) : formatClock(item.resetsAt, now, timeText));
}

function resetText(item, now, isExpired, timeText) {
  if (isExpired) {
    return item.resetsAt !== null && item.resetsAt <= now ? 'Reset at ' + formatClock(item.resetsAt, now, timeText) + ', no newer data' : 'No newer data';
  }
  if (item.resetsAt === null) {
    return '';
  }
  return item.estimated ? estimatedResetText(item, now, timeText) : 'Resets in ' + formatDuration(item.resetsAt - now) + ' (' + formatClock(item.resetsAt, now, timeText) + ')';
}

function elapsedMs(item, now, isExpired) {
  const length = WINDOW_LENGTH_MS[item.period];
  if (isExpired || length === undefined || item.resetsAt === null) {
    return null;
  }
  return Math.min(Math.max(length - (item.resetsAt - now), 0), length);
}

function rateText(item, elapsed) {
  if (elapsed === null || elapsed < MIN_RATE_ELAPSED_MS) {
    return '';
  }
  const perHour = item.usedPercent / (elapsed / HOUR_MS);
  const shown = perHour >= WHOLE_RATE_FROM ? String(Math.round(perHour)) : String(Math.round(perHour * 10) / 10);
  return shown + '%/h';
}

function windowView(item, now, timeText) {
  const isExpired = !isWindowActive(item, now);
  const elapsed = elapsedMs(item, now, isExpired);
  return {
    label: windowLabel(item),
    percentText: formatPercent(item.usedPercent),
    fraction: Math.min(Math.max(item.usedPercent / PERCENT, 0), 1),
    severity: isExpired ? SEVERITY.UNKNOWN : severityFor(item.usedPercent),
    resetText: resetText(item, now, isExpired, timeText),
    isExpired: isExpired,
    elapsedFraction: elapsed === null ? null : elapsed / WINDOW_LENGTH_MS[item.period],
    rateText: rateText(item, elapsed),
  };
}

function amountText(item) {
  const value = formatMoney(item.value, item.currency);
  if (item.noLimit) {
    return value + ', no limit';
  }
  return item.limit === null ? value : value + ' of ' + formatMoney(item.limit, item.currency);
}

function bestWindow(candidates, now) {
  const ranked = candidates.slice().sort((a, b) => rankOf(b, now) - rankOf(a, now) || b.usedPercent - a.usedPercent);
  return ranked[0];
}

function rankOf(item, now) {
  return (item.canBeMain ? 2 : 0) + (isWindowActive(item, now) ? 1 : 0);
}

export function splitWindows(windows, now) {
  const main = [];
  const extra = [];
  MAIN_PERIODS.forEach((period) => {
    const candidates = windows.filter((item) => item.period === period);
    if (candidates.length > 0) {
      main.push(bestWindow(candidates, now));
    }
  });
  windows.forEach((item) => {
    if (main.indexOf(item) === -1) {
      extra.push(item);
    }
  });
  return { main: main, extra: extra };
}

function isMainAmount(item) {
  return item.name === '' && MAIN_AMOUNT_LABELS.indexOf(item.label) !== -1;
}

function mainAmounts(amounts) {
  return MAIN_AMOUNT_LABELS
    .map((label) => amounts.filter((item) => item.name === '' && item.label === label)[0])
    .filter((item) => item !== undefined);
}

function extraWindowRow(item) {
  return { label: windowLabel(item), valueText: formatPercent(item.usedPercent), isProblem: false };
}

function amountRow(item) {
  if (item.problem) {
    return { label: labelText(item), valueText: describeError(item.problem), isProblem: true };
  }
  return { label: labelText(item), valueText: amountText(item), isProblem: false };
}

function extraRows(usage, extraWindows) {
  const entries = extraWindows.filter((item) => item.period !== PERIOD.TOP_UP).map(extraWindowRow)
    .concat(usage.amounts.filter((item) => !isMainAmount(item)).map(amountRow));
  const topUps = extraWindows.filter((item) => item.period === PERIOD.TOP_UP).map(extraWindowRow);
  return usage.counts.map((item) => ({ label: labelText(item), valueText: formatCount(item.value), isProblem: false }))
    .concat(usage.texts.map((item) => ({ label: labelText(item), valueText: item.value, isProblem: false })))
    .concat(entries)
    .concat(topUps);
}

const NO_USAGE = Object.freeze({ windows: [], amounts: [], counts: [], texts: [] });

function mainBarView(item, now, timeText) {
  const label = periodText(item);
  const names = WINDOW_NAMES[item.period] || { heading: label, shortLabel: label };
  return Object.assign(windowView(item, now, timeText), { label: label, heading: names.heading, shortLabel: names.shortLabel });
}

function sectionView(entry, now, timeText) {
  const usage = entry.usage || NO_USAGE;
  const split = splitWindows(usage.windows, now);
  return {
    key: entry.key,
    title: entry.title,
    account: entry.account.name,
    windows: split.main.map((item) => mainBarView(item, now, timeText)),
    mainRows: mainAmounts(usage.amounts).map(amountRow),
    rows: extraRows(usage, split.extra),
    isLoading: entry.isLoading,
    hasError: entry.error !== null,
    errorText: entry.error ? describeError(entry.error) : '',
    errorSeverity: entry.error && CRITICAL_ERRORS.indexOf(entry.error.kind) !== -1 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
    service: entry.account.service,
    accent: Object.prototype.hasOwnProperty.call(SERVICE_ACCENTS, entry.account.service) ? SERVICE_ACCENTS[entry.account.service] : '',
    badge: badgeLetter(entry),
  };
}

function badgeLetter(entry) {
  const source = String(entry.account.name || '').trim() || String(entry.title || '').trim();
  return source === '' ? '' : source.charAt(0).toUpperCase();
}

export function usageSummaryText(usage) {
  return usage.windows.map((item) => windowLabel(item) + ' ' + formatPercent(item.usedPercent)).join(', ');
}

// options.timeText(ms) formats a time of day; it defaults to 24 hour HH:MM.
export function buildViewModel(entries, now, options) {
  const timeText = options && typeof options.timeText === 'function' ? options.timeText : clock24;
  const sections = entries.map((entry) => sectionView(entry, now, timeText));
  const sectionsByKey = Object.create(null);
  sections.forEach((section) => { sectionsByKey[section.key] = section; });
  return {
    sections: sections,
    keys: sections.map((section) => section.key),
    sectionsByKey: sectionsByKey,
    hasErrors: sections.some((section) => section.hasError),
    hasAccounts: entries.length > 0,
    walletLocked: entries.some((entry) => entry.error !== null && LOCKED_WALLET_REASONS.indexOf(entry.error.reason) !== -1),
  };
}
