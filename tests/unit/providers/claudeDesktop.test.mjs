import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { claudeDesktop, newestSamples, samplesByOrg, estimateFiveHourReset, estimateWeeklyReset, MAX_HISTORY_BYTES } from '../../../package/contents/code/providers/claudeDesktop.mjs';
import { checkAccount, discoverAccounts } from '../../../package/contents/code/core/check.mjs';
import { ERROR_KIND, REASON, failure } from '../../../package/contents/code/core/http.mjs';
import { HOUR_MS, WEEK_MS } from '../../../package/contents/code/core/units.mjs';
import { PERIOD, makeUsage, usageWindow } from '../../../package/contents/code/core/usage.mjs';
import { fakeHome, placeFixture, placeText, shellRunner, removeFakeHomes, fakeCurl, curlCall, setCurlStatus } from '../support/localFiles.mjs';

afterEach(removeFakeHomes);

const NOW = Date.UTC(2026, 9, 18, 12);
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const ORG_A = '00000000-0000-4000-8000-0000000000aa';
const ORG_B = '00000000-0000-4000-8000-0000000000bb';
const FILE = '.config/Claude/plan-usage-history.json';

function account(org) {
  return { id: 'aclaude', service: 'claude', name: 'me@example.com', org: org };
}

function toolsFor(home) {
  return { runCommand: shellRunner(home).runCommand, clock: () => NOW, newBoundary: () => '' };
}

function homeWithFixture() {
  const home = fakeHome();
  placeFixture(home, FILE, 'claude-desktop/plan-usage-history.json');
  return home;
}

test('Claude needs no key, keeps the organization of the account and reads only the desktop app file', () => {
  assert.equal(claudeDesktop.needsKey, false);
  assert.deepEqual(claudeDesktop.fields.map((field) => [field.id, field.typed]), [['org', false]]);
  assert.match(claudeDesktop.readCommand, /"\$\{XDG_CONFIG_HOME:-\$HOME\/\.config\}\/Claude\/plan-usage-history\.json"/);
  assert.match(claudeDesktop.readCommand, new RegExp('timeout 8 head -c ' + MAX_HISTORY_BYTES + ' '));
});

test('the newest sample of the organization gives the 5hr and weekly bars, valid for five hours and seven days', async () => {
  const outcome = await checkAccount(claudeDesktop, account(ORG_A), toolsFor(homeWithFixture()));
  const sampleTime = 1792328400000;
  assert.deepEqual(outcome, { ok: true, usage: makeUsage({ windows: [
    usageWindow(PERIOD.FIVE_HOUR, '', 42.5, null, { validUntil: sampleTime + 5 * HOUR_MS, estimated: true }),
    usageWindow(PERIOD.WEEKLY, '', 61, null, { validUntil: sampleTime + WEEK_MS, estimated: true }),
  ] }) });
});

test('the file is read from XDG_CONFIG_HOME when it is set', async () => {
  const home = fakeHome();
  placeFixture(home, 'xdg/Claude/plan-usage-history.json', 'claude-desktop/plan-usage-history.json');
  const tools = { runCommand: shellRunner(home, { XDG_CONFIG_HOME: home + '/xdg' }).runCommand, clock: () => NOW, newBoundary: () => '' };
  assert.equal((await checkAccount(claudeDesktop, account(ORG_A), tools)).usage.windows.length, 2);
});

test('a symbolic link in place of the file is refused', async () => {
  const home = homeWithFixture();
  const { renameSync, symlinkSync } = await import('node:fs');
  const { join } = await import('node:path');
  renameSync(join(home, FILE), join(home, 'real.json'));
  symlinkSync(join(home, 'real.json'), join(home, FILE));
  assert.deepEqual(await checkAccount(claudeDesktop, account(ORG_A), toolsFor(home)), { ok: false, error: failure(ERROR_KIND.NOT_AVAILABLE, REASON.CLAUDE_FILE_MISSING) });
});

test('each organization uses its own newest sample', async () => {
  const outcome = await checkAccount(claudeDesktop, account(ORG_B), toolsFor(homeWithFixture()));
  assert.deepEqual(outcome.usage.windows.map((item) => item.usedPercent), [91, 12]);
});

test('reading leaves the file as it was', async () => {
  const home = homeWithFixture();
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const before = readFileSync(join(home, FILE), 'utf8');
  await checkAccount(claudeDesktop, account(ORG_A), toolsFor(home));
  assert.equal(readFileSync(join(home, FILE), 'utf8'), before);
});

test('a missing file, an unknown organization or a changed format each have their own error', async () => {
  assert.deepEqual(await checkAccount(claudeDesktop, account(ORG_A), toolsFor(fakeHome())), { ok: false, error: failure(ERROR_KIND.NOT_AVAILABLE, REASON.CLAUDE_FILE_MISSING) });
  assert.deepEqual(await checkAccount(claudeDesktop, account('00000000-0000-4000-8000-0000000000cc'), toolsFor(homeWithFixture())), { ok: false, error: failure(ERROR_KIND.NOT_AVAILABLE, REASON.CLAUDE_ORG_MISSING) });
  const changed = fakeHome();
  placeText(changed, FILE, '{"version":3,"samples":[]}');
  assert.deepEqual(await checkAccount(claudeDesktop, account(ORG_A), toolsFor(changed)), { ok: false, error: failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON.FILE_FORMAT_CHANGED) });
  const noValues = fakeHome();
  placeText(noValues, FILE, JSON.stringify({ version: 2, samples: [{ t: 1, org: ORG_A, u: { fh: '1' } }] }));
  assert.deepEqual(await checkAccount(claudeDesktop, account(ORG_A), toolsFor(noValues)), { ok: false, error: failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON.FILE_FORMAT_CHANGED) });
});

test('broken samples and organization ids that are not plain are skipped', () => {
  const text = JSON.stringify({ version: 2, samples: [null, { t: 'x', org: ORG_A, u: {} }, { t: 5, org: '../x', u: {} }, { t: 5, org: ORG_A, u: [] }, { t: 7, org: ORG_B, u: { fh: 1 } }] });
  assert.deepEqual(Array.from(newestSamples(text).keys()), [ORG_B]);
  assert.equal(newestSamples('{not json'), null);
});

test('discovery lists each organization with its current percentages, sorted', async () => {
  const result = await discoverAccounts(claudeDesktop, toolsFor(homeWithFixture()));
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.map((item) => [item.fields.org, item.usage.windows.map((w) => w.usedPercent)]), [[ORG_A, [42.5, 61]], [ORG_B, [91, 12]]]);
});

test('discovery of a missing or changed file says why', async () => {
  assert.deepEqual(await discoverAccounts(claudeDesktop, toolsFor(fakeHome())), { ok: false, error: failure(ERROR_KIND.NOT_AVAILABLE, REASON.CLAUDE_FILE_MISSING) });
  const changed = fakeHome();
  placeText(changed, FILE, '[]');
  assert.deepEqual(await discoverAccounts(claudeDesktop, toolsFor(changed)), { ok: false, error: failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON.FILE_FORMAT_CHANGED) });
});

const BASE = Date.UTC(2026, 9, 18, 8);
const MINUTE = 60000;

function history(name) {
  return samplesByOrg(readFileSync(join(FIXTURES, 'claude-desktop', name + '.json'), 'utf8'));
}

test('a normal window starts halfway between the last 0 and the first use, and resets five hours later', () => {
  const samples = history('history-normal-window').get(ORG_A);
  assert.equal(estimateFiveHourReset(samples, BASE + 2 * HOUR_MS + MINUTE), BASE + 7.5 * MINUTE + 5 * HOUR_MS);
});

test('an estimate that is already in the past is not shown', () => {
  const samples = history('history-normal-window').get(ORG_A);
  assert.equal(estimateFiveHourReset(samples, BASE + 6 * HOUR_MS), null);
});

test('a gap over 30 minutes around the start, because the app was closed, gives no estimate', () => {
  const samples = history('history-app-closed').get(ORG_A);
  assert.equal(estimateFiveHourReset(samples, BASE + 2 * HOUR_MS + 20 * MINUTE), null);
  assert.equal(estimateWeeklyReset(samples, BASE + 2 * HOUR_MS + 20 * MINUTE), null);
});

test('no drop in the history gives no estimate', () => {
  const samples = history('history-no-drop').get(ORG_A);
  assert.equal(estimateFiveHourReset(samples, BASE + HOUR_MS), null);
  assert.equal(estimateWeeklyReset(samples, BASE + HOUR_MS), null);
});

test('two organizations get their own estimates, from a 0 and from a clear drop', () => {
  const byOrg = history('history-two-orgs');
  const now = BASE + 90 * MINUTE;
  assert.equal(estimateFiveHourReset(byOrg.get(ORG_A), now), BASE + 7.5 * MINUTE + 5 * HOUR_MS);
  assert.equal(estimateFiveHourReset(byOrg.get(ORG_B), now), BASE + HOUR_MS + 5 * MINUTE + 5 * HOUR_MS);
  assert.equal(estimateWeeklyReset(byOrg.get(ORG_A), now), BASE + 7.5 * MINUTE + WEEK_MS);
  assert.equal(estimateWeeklyReset(byOrg.get(ORG_B), now), null);
});

test('the weekly estimate steps forward by seven days until it is in the future', () => {
  const samples = history('history-two-orgs').get(ORG_A);
  assert.equal(estimateWeeklyReset(samples, BASE + 15 * 24 * HOUR_MS), BASE + 7.5 * MINUTE + 3 * WEEK_MS);
});

test('a drop of the weekly use to 0 also counts as a weekly reset', () => {
  const samples = [
    { org: ORG_A, time: BASE, values: { sd: 5 } },
    { org: ORG_A, time: BASE + 10 * MINUTE, values: { sd: 0 } },
  ];
  assert.equal(estimateWeeklyReset(samples, BASE + HOUR_MS), BASE + 5 * MINUTE + WEEK_MS);
});

test('the card gets the estimates marked as estimates', async () => {
  const home = fakeHome();
  placeFixture(home, FILE, 'claude-desktop/history-two-orgs.json');
  const now = BASE + 90 * MINUTE;
  const outcome = await checkAccount(claudeDesktop, account(ORG_A), { runCommand: shellRunner(home).runCommand, clock: () => now, newBoundary: () => '' });
  assert.deepEqual(outcome.usage.windows.map((item) => [item.period, item.resetsAt, item.estimated]), [
    [PERIOD.FIVE_HOUR, BASE + 7.5 * MINUTE + 5 * HOUR_MS, true],
    [PERIOD.WEEKLY, BASE + 7.5 * MINUTE + WEEK_MS, true],
  ]);
});

const LIVE_REPLY = Object.freeze({
  five_hour: { utilization: 34, resets_at: '2026-10-18T14:40:00.136476+00:00' },
  seven_day: { utilization: 53, resets_at: '2026-10-22T04:00:00.136492+00:00' },
  seven_day_opus: null,
});

const LIVE_USAGE = makeUsage({ windows: [
  usageWindow(PERIOD.FIVE_HOUR, '', 34, Date.UTC(2026, 9, 18, 14, 40)),
  usageWindow(PERIOD.WEEKLY, '', 53, Date.UTC(2026, 9, 22, 4)),
] });

// The read command compares the token expiry with the real clock, not NOW.
function placeClaudeLogin(home, org, expiresAt) {
  placeText(home, '.claude/.credentials.json', JSON.stringify({ claudeAiOauth: { accessToken: 'claude-token', refreshToken: 'r', expiresAt: expiresAt } }));
  placeText(home, '.claude.json', JSON.stringify({ oauthAccount: { organizationUuid: org } }));
}

function liveTools(home, env) {
  return { runCommand: shellRunner(home, env).runCommand, clock: () => NOW, newBoundary: () => '' };
}

test('the live usage API read with the Claude Code token wins over the desktop app history', async () => {
  const home = homeWithFixture();
  placeClaudeLogin(home, ORG_A, Date.now() + HOUR_MS);
  const env = fakeCurl(home, LIVE_REPLY);
  assert.deepEqual(await checkAccount(claudeDesktop, account(ORG_A), liveTools(home, env)), { ok: true, usage: LIVE_USAGE });
  const call = curlCall(home);
  assert.equal(call.stdin, 'Authorization: Bearer claude-token\n');
  assert.ok(call.args.includes('https://api.anthropic.com/api/oauth/usage'));
  assert.ok(!call.args.some((arg) => arg.includes('claude-token')));
});

test('the live usage works without a desktop app history file', async () => {
  const home = fakeHome();
  placeClaudeLogin(home, ORG_A, Date.now() + HOUR_MS);
  const env = fakeCurl(home, LIVE_REPLY);
  assert.deepEqual(await checkAccount(claudeDesktop, account(ORG_A), liveTools(home, env)), { ok: true, usage: LIVE_USAGE });
});

test('an expired token skips the API, and the next refresh after Claude Code renews it reads it live again', async () => {
  const home = homeWithFixture();
  placeClaudeLogin(home, ORG_A, Date.now() - HOUR_MS);
  const env = fakeCurl(home, LIVE_REPLY);
  const expired = await checkAccount(claudeDesktop, account(ORG_A), liveTools(home, env));
  assert.equal(curlCall(home), null);
  assert.ok(expired.ok && expired.usage.windows.every((window) => window.estimated));
  placeClaudeLogin(home, ORG_A, Date.now() + HOUR_MS);
  assert.deepEqual(await checkAccount(claudeDesktop, account(ORG_A), liveTools(home, env)), { ok: true, usage: LIVE_USAGE });
});

test('a failing live usage API falls back to the desktop app history', async () => {
  const home = homeWithFixture();
  placeClaudeLogin(home, ORG_A, Date.now() + HOUR_MS);
  const env = fakeCurl(home, null);
  const outcome = await checkAccount(claudeDesktop, account(ORG_A), liveTools(home, env));
  assert.ok(outcome.ok && outcome.usage.windows.every((window) => window.estimated));
});

test('live usage of another organization never shows on this account', async () => {
  const home = homeWithFixture();
  placeClaudeLogin(home, ORG_B, Date.now() + HOUR_MS);
  const env = fakeCurl(home, LIVE_REPLY);
  const outcome = await checkAccount(claudeDesktop, account(ORG_A), liveTools(home, env));
  assert.ok(outcome.ok && outcome.usage.windows.every((window) => window.estimated));
});

test('discovery offers the organization of the Claude Code login with its live usage', async () => {
  const home = fakeHome();
  placeClaudeLogin(home, ORG_A, Date.now() + HOUR_MS);
  const env = fakeCurl(home, LIVE_REPLY);
  const found = await discoverAccounts(claudeDesktop, liveTools(home, env));
  assert.deepEqual(found.items, [{ fields: { org: ORG_A }, usage: LIVE_USAGE }]);
});

test('Claude is checked at most every 3 minutes, since its usage API rate limits frequent calls', () => {
  assert.equal(claudeDesktop.minIntervalSeconds, 180);
});

test('a rate limited usage API keeps the last live values instead of the older desktop app history', async () => {
  const home = homeWithFixture();
  placeClaudeLogin(home, ORG_A, Date.now() + HOUR_MS);
  const env = fakeCurl(home, null);
  setCurlStatus(home, 429);
  const outcome = await checkAccount(claudeDesktop, account(ORG_A), liveTools(home, env));
  assert.deepEqual(outcome, { ok: false, error: failure(ERROR_KIND.RATE_LIMITED, REASON.HTTP_STATUS, NOW + 5 * 60 * 1000, { status: 429 }) });
});

test('another failing status of the usage API still falls back to the desktop app history', async () => {
  const home = homeWithFixture();
  placeClaudeLogin(home, ORG_A, Date.now() + HOUR_MS);
  const env = fakeCurl(home, null);
  setCurlStatus(home, 500);
  const outcome = await checkAccount(claudeDesktop, account(ORG_A), liveTools(home, env));
  assert.ok(outcome.ok && outcome.usage.windows.every((window) => window.estimated));
});

test('discovery ignores a rate limited usage API and offers the history organizations', async () => {
  const home = homeWithFixture();
  placeClaudeLogin(home, ORG_A, Date.now() + HOUR_MS);
  const env = fakeCurl(home, null);
  setCurlStatus(home, 429);
  const found = await discoverAccounts(claudeDesktop, liveTools(home, env));
  assert.ok(found.ok && found.items.length > 0 && found.items.every((item) => item.usage.windows.every((window) => window.estimated)));
});

test('a rate limited usage API for the Claude Code organization leaves accounts of other organizations on the desktop app history', async () => {
  const home = homeWithFixture();
  placeClaudeLogin(home, ORG_B, Date.now() + HOUR_MS);
  const env = fakeCurl(home, null);
  setCurlStatus(home, 429);
  const outcome = await checkAccount(claudeDesktop, account(ORG_A), liveTools(home, env));
  assert.ok(outcome.ok && outcome.usage.windows.every((window) => window.estimated));
});
