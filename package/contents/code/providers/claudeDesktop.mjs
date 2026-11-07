import { REASON } from '../core/http.mjs';
import { toFiniteNumber, isPlainObject } from '../core/values.mjs';
import { MINUTE_MS, HOUR_MS, WEEK_MS } from '../core/units.mjs';
import { PERIOD, DISCOVERY, makeUsage, usageWindow, succeeded, unexpected, notAvailable } from '../core/usage.mjs';
import { isValidField } from '../core/accounts.mjs';
import { LIMIT, FOUND_LINE, MISSING_OUTPUT, wrapRead } from '../core/localRead.mjs';
import { KIND } from '../core/providerKind.mjs';
import { NO_MIN_INTERVAL_SECONDS } from './common.mjs';

export const MAX_HISTORY_BYTES = 1048576;
export const HISTORY_VERSION = 2;

const FIVE_HOURS_MS = 5 * HOUR_MS;
const CLEAR_DROP_POINTS = 10;
const MAX_SAMPLE_GAP_MS = 30 * MINUTE_MS;
const WINDOWS = [
  { field: 'fh', period: PERIOD.FIVE_HOUR, lengthMs: FIVE_HOURS_MS, estimate: (samples, now) => estimateFiveHourReset(samples, now) },
  { field: 'sd', period: PERIOD.WEEKLY, lengthMs: WEEK_MS, estimate: (samples, now) => estimateWeeklyReset(samples, now) },
];

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
export const API_TIMEOUT_SECONDS = 4;

// Reduces the live usage API answer to one compact JSON line:
// {"org": "...", "fh": {"p": percent, "r": resetMs}, "sd": {...}}
const LIVE_FILTER = String.raw`def ts: try (sub(\"[.][0-9]+\"; \"\") | sub(\"[+]00:00$\"; \"Z\") | fromdateiso8601 * 1000) catch null; `
  + String.raw`def w: if . == null or .utilization == null then null else {p: .utilization, r: (.resets_at | if . == null then null else ts end)} end; `
  + String.raw`select(.five_hour != null or .seven_day != null) | {org: \$o, fh: (.five_hour | w), sd: (.seven_day | w)}`;

// Reads the live usage with the Claude Code OAuth token. The credentials file is
// read again on every refresh, so a token renewed by Claude Code is picked up on
// the next cycle. An expired token is skipped to avoid failing calls; the token
// goes to curl through stdin so it never appears in the process list.
const READ_LIVE_SCRIPT = String.raw`live=""; c="$HOME/.claude/.credentials.json"; `
  + String.raw`if [ -n "$(command -v curl)" ] && [ -n "$(command -v jq)" ] && [ -f "$c" ]; then `
  + String.raw`a=$(jq -r ".claudeAiOauth.accessToken // empty" "$c" 2>/dev/null); `
  + String.raw`exp=$(jq -r ".claudeAiOauth.expiresAt // 0 | floor" "$c" 2>/dev/null); `
  + String.raw`org=$(jq -r ".oauthAccount.organizationUuid // empty" "$HOME/.claude.json" 2>/dev/null); `
  + String.raw`now=$(date +%s); `
  + String.raw`if [ -n "$a" ] && [ -n "$org" ] && [ "$exp" -gt "$now"000 ] 2>/dev/null; then `
  + String.raw`live=$(printf "Authorization: Bearer %s\n" "$a" | curl -fsS --proto =https --max-redirs 0 -m ` + API_TIMEOUT_SECONDS
  + String.raw` -H @- -H "anthropic-beta: oauth-2025-04-20" ` + USAGE_URL
  + String.raw` 2>/dev/null | jq -c --arg o "$org" "` + LIVE_FILTER + String.raw`" 2>/dev/null); `
  + String.raw`fi; fi; `;

// Output after the "found <size>" line: the live JSON line (empty when the API
// was not reachable), a newline, then the Claude Desktop history file, if any.
export const READ_HISTORY_COMMAND = wrapRead(READ_LIVE_SCRIPT
  + 'f="${XDG_CONFIG_HOME:-$HOME/.config}/Claude/plan-usage-history.json"; hist=""; '
  + 'if [ -f "$f" ] && [ ! -L "$f" ]; then hist=yes; fi; '
  + 'if [ -z "$live" ] && [ -z "$hist" ]; then ' + MISSING_OUTPUT + '; else '
  + 'hs=0; if [ -n "$hist" ]; then hs=$(' + LIMIT + ' wc -c < "$f" | tr -d " "); fi; '
  + 'ls=$(printf "%s" "$live" | wc -c | tr -d " "); '
  + 'printf "' + FOUND_LINE + ' %s\\n" $((ls + 1 + hs)); printf "%s\\n" "$live"; '
  + 'if [ -n "$hist" ]; then ' + LIMIT + ' head -c ' + MAX_HISTORY_BYTES + ' -- "$f"; fi; fi');

function splitRead(text) {
  const lineEnd = text.indexOf('\n');
  return lineEnd === -1 ? { live: text, history: '' } : { live: text.slice(0, lineEnd), history: text.slice(lineEnd + 1) };
}

function liveWindowOf(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  const percent = typeof value.p === 'number' ? toFiniteNumber(value.p) : null;
  const reset = typeof value.r === 'number' ? toFiniteNumber(value.r) : null;
  return percent === null ? null : { percent: percent, reset: reset };
}

export function parseLive(line) {
  if (typeof line !== 'string' || line.trim() === '') {
    return null;
  }
  let value;
  try {
    value = JSON.parse(line);
  } catch (error) {
    return null;
  }
  if (!isPlainObject(value) || !isValidField(value.org)) {
    return null;
  }
  const windows = [];
  WINDOWS.forEach((spec) => {
    const window = liveWindowOf(value[spec.field]);
    if (window !== null) {
      windows.push(usageWindow(spec.period, '', window.percent, window.reset));
    }
  });
  return windows.length === 0 ? null : { org: value.org, usage: makeUsage({ windows: windows }) };
}

function readSample(value) {
  if (!isPlainObject(value) || !isValidField(value.org) || !isPlainObject(value.u)) {
    return null;
  }
  const time = toFiniteNumber(value.t);
  return time === null ? null : { org: value.org, time: time, values: value.u };
}

export function samplesByOrg(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return null;
  }
  if (!isPlainObject(value) || value.version !== HISTORY_VERSION || !Array.isArray(value.samples)) {
    return null;
  }
  const byOrg = new Map();
  value.samples.map(readSample).forEach((sample) => {
    if (sample !== null) {
      byOrg.set(sample.org, (byOrg.get(sample.org) || []).concat([sample]));
    }
  });
  byOrg.forEach((samples) => samples.sort((first, second) => first.time - second.time));
  return byOrg;
}

export function newestSamples(text) {
  const byOrg = samplesByOrg(text);
  if (byOrg === null) {
    return null;
  }
  const newest = new Map();
  byOrg.forEach((samples, org) => newest.set(org, samples[samples.length - 1]));
  return newest;
}

function seriesOf(samples, field) {
  return samples
    .map((sample) => ({ time: sample.time, percent: typeof sample.values[field] === 'number' ? toFiniteNumber(sample.values[field]) : null }))
    .filter((point) => point.percent !== null);
}

function isClearDrop(previous, current) {
  return previous.percent - current.percent >= CLEAR_DROP_POINTS;
}

function midpointOf(previous, current) {
  return current.time - previous.time > MAX_SAMPLE_GAP_MS ? null : (previous.time + current.time) / 2;
}

export function estimateFiveHourReset(samples, now) {
  const series = seriesOf(samples, 'fh');
  for (let index = series.length - 1; index > 0; index -= 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (current.percent > 0 && (previous.percent === 0 || isClearDrop(previous, current))) {
      const start = midpointOf(previous, current);
      const reset = start === null ? null : start + FIVE_HOURS_MS;
      return reset !== null && reset > now ? reset : null;
    }
  }
  return null;
}

export function estimateWeeklyReset(samples, now) {
  const series = seriesOf(samples, 'sd');
  for (let index = series.length - 1; index > 0; index -= 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (isClearDrop(previous, current) || (current.percent === 0 && previous.percent > 0)) {
      const reset = midpointOf(previous, current);
      if (reset === null) {
        return null;
      }
      let next = reset + WEEK_MS;
      while (next <= now) {
        next += WEEK_MS;
      }
      return next;
    }
  }
  return null;
}

function usageOf(samples, now) {
  const sample = samples[samples.length - 1];
  const windows = [];
  WINDOWS.forEach((spec) => {
    const percent = typeof sample.values[spec.field] === 'number' ? toFiniteNumber(sample.values[spec.field]) : null;
    if (percent !== null) {
      windows.push(usageWindow(spec.period, '', percent, spec.estimate(samples, now), { validUntil: sample.time + spec.lengthMs, estimated: true }));
    }
  });
  return windows.length === 0 ? null : makeUsage({ windows: windows });
}

function interpret(read, account, now) {
  if (!read.found) {
    return notAvailable(REASON.CLAUDE_FILE_MISSING);
  }
  const parts = splitRead(read.text);
  const live = parseLive(parts.live);
  if (live !== null && live.org === account.org) {
    return succeeded(live.usage);
  }
  if (parts.history.trim() === '') {
    return notAvailable(REASON.CLAUDE_FILE_MISSING);
  }
  const byOrg = samplesByOrg(parts.history);
  if (byOrg === null) {
    return unexpected(REASON.FILE_FORMAT_CHANGED);
  }
  if (!byOrg.has(account.org)) {
    return notAvailable(REASON.CLAUDE_ORG_MISSING);
  }
  const usage = usageOf(byOrg.get(account.org), now);
  return usage === null ? unexpected(REASON.FILE_FORMAT_CHANGED) : succeeded(usage);
}

function discover(read, now) {
  if (!read.found) {
    return notAvailable(REASON.CLAUDE_FILE_MISSING);
  }
  const parts = splitRead(read.text);
  const live = parseLive(parts.live);
  const byOrg = parts.history.trim() === '' ? new Map() : samplesByOrg(parts.history);
  if (byOrg === null) {
    return unexpected(REASON.FILE_FORMAT_CHANGED);
  }
  const items = Array.from(byOrg.keys()).sort()
    .map((org) => ({ fields: { org: org }, usage: live !== null && live.org === org ? live.usage : usageOf(byOrg.get(org), now) }))
    .filter((item) => item.usage !== null);
  if (live !== null && !byOrg.has(live.org)) {
    items.push({ fields: { org: live.org }, usage: live.usage });
  }
  return { ok: true, items: items };
}

export const claudeDesktop = Object.freeze({
  id: 'claude',
  title: 'Claude',
  kind: KIND.LOCAL,
  minIntervalSeconds: NO_MIN_INTERVAL_SECONDS,
  needsKey: false,
  keyHelp: '',
  fields: Object.freeze([Object.freeze({ id: 'org', label: 'Organization', typed: false })]),
  readCommand: READ_HISTORY_COMMAND,
  maxReadBytes: MAX_HISTORY_BYTES,
  interpret: interpret,
  discover: discover,
  discoveryText: Object.freeze({ reading: DISCOVERY.CLAUDE_READING, none: DISCOVERY.CLAUDE_NONE_NEW }),
});
