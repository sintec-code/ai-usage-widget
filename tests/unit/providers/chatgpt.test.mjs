import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { utimesSync } from 'node:fs';

import { chatgpt, MAX_LINE_BYTES, MAX_FILES } from '../../../package/contents/code/providers/chatgpt.mjs';
import { checkAccount } from '../../../package/contents/code/core/check.mjs';
import { ERROR_KIND, REASON, failure } from '../../../package/contents/code/core/http.mjs';
import { PERIOD, makeUsage, usageWindow } from '../../../package/contents/code/core/usage.mjs';
import { fakeHome, placeFixture, placeText, shellRunner, removeFakeHomes, fakeCurl, curlCall } from '../support/localFiles.mjs';

afterEach(removeFakeHomes);

const NOW = Date.UTC(2026, 9, 18, 12);
const ACCOUNT = Object.freeze({ id: 'achat', service: 'chatgpt', name: 'me@example.com' });
const FIXTURE = 'codex/rollout-2026-10-18T12-00-00-placeholder.jsonl';

function check(home, env) {
  return checkAccount(chatgpt, ACCOUNT, { runCommand: shellRunner(home, env).runCommand, clock: () => NOW, newBoundary: () => '' });
}

function line(rateLimits) {
  return JSON.stringify({ timestamp: '2026-10-18T12:00:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: null, rate_limits: rateLimits } }) + '\n';
}

test('ChatGPT needs no key and reads only the newest Codex session file', () => {
  assert.equal(chatgpt.needsKey, false);
  assert.deepEqual(chatgpt.fields, []);
  assert.match(chatgpt.readCommand, /rollout-\*\.jsonl/);
  assert.equal(chatgpt.maxReadBytes, MAX_LINE_BYTES);
});

test('the last rate limit line of the newest session gives the 5hr and weekly bars with reset times', async () => {
  const home = fakeHome();
  placeFixture(home, '.codex/sessions/2026/10/18/rollout-2026-10-18T12-00-00-placeholder.jsonl', FIXTURE);
  assert.deepEqual(await check(home), { ok: true, usage: makeUsage({ windows: [
    usageWindow(PERIOD.FIVE_HOUR, '', 37.5, 1792335600000),
    usageWindow(PERIOD.WEEKLY, '', 62, 1792800000000),
  ] }) });
});

test('CODEX_HOME wins over the home folder when it has sessions, and the newest file with limits counts', async () => {
  const home = fakeHome();
  placeFixture(home, '.codex/sessions/2026/10/18/rollout-2026-10-18T12-00-00-placeholder.jsonl', FIXTURE);
  const older = placeText(home, 'codex-home/sessions/2026/10/17/rollout-old.jsonl', line({ primary: { used_percent: 1, window_minutes: 300, resets_at: 1 } }));
  const newer = placeText(home, 'codex-home/sessions/2026/10/18/rollout-new.jsonl', line({ primary: { used_percent: 77, window_minutes: 1440, resets_at: 1792335600 } }));
  utimesSync(older, new Date(NOW - 7200000), new Date(NOW - 7200000));
  utimesSync(newer, new Date(NOW - 60000), new Date(NOW - 60000));
  const outcome = await check(home, { CODEX_HOME: home + '/codex-home' });
  assert.deepEqual(outcome.usage.windows.map((item) => [item.period, item.usedPercent]), [[PERIOD.DAILY, 77]]);
});

test('the newest session without limits is skipped for the next newest that has them', async () => {
  const home = fakeHome();
  const older = placeText(home, '.codex/sessions/2026/10/17/rollout-old.jsonl', line({ primary: { used_percent: 21, window_minutes: 300, resets_at: 1792335600 } }));
  const newer = placeText(home, '.codex/sessions/2026/10/18/rollout-new.jsonl', '{"type":"session_meta","payload":{}}\n');
  utimesSync(older, new Date(NOW - 7200000), new Date(NOW - 7200000));
  utimesSync(newer, new Date(NOW - 60000), new Date(NOW - 60000));
  assert.deepEqual((await check(home)).usage.windows.map((item) => item.usedPercent), [21]);
});

test('at most the 20 newest session files are read', async () => {
  const home = fakeHome();
  const oldest = placeText(home, '.codex/sessions/2026/10/01/rollout-oldest.jsonl', line({ primary: { used_percent: 9, window_minutes: 300, resets_at: 1 } }));
  utimesSync(oldest, new Date(NOW - 86400000), new Date(NOW - 86400000));
  for (let index = 0; index < MAX_FILES; index += 1) {
    const file = placeText(home, '.codex/sessions/2026/10/18/rollout-' + index + '.jsonl', '{"type":"session_meta","payload":{}}\n');
    utimesSync(file, new Date(NOW - index * 1000), new Date(NOW - index * 1000));
  }
  assert.deepEqual(await check(home), { ok: false, error: failure(ERROR_KIND.NOT_AVAILABLE, REASON.CODEX_NO_LIMITS) });
});

test('without resets_at the reset time is the line time plus resets_in_seconds', async () => {
  const home = fakeHome();
  placeText(home, '.codex/sessions/2026/10/18/rollout-x.jsonl', line({ primary: { used_percent: 5, window_minutes: 300, resets_in_seconds: 600 }, secondary: { used_percent: 6, window_minutes: 10080 } }));
  assert.deepEqual((await check(home)).usage.windows, [
    usageWindow(PERIOD.FIVE_HOUR, '', 5, Date.UTC(2026, 9, 18, 12) + 600000),
    usageWindow(PERIOD.WEEKLY, '', 6, null),
  ]);
});

test('the read prints the byte count of the found line, and found 0 when no file has limits', async () => {
  const home = fakeHome();
  placeText(home, '.codex/sessions/2026/10/18/rollout-x.jsonl', '{"type":"session_meta","payload":{}}\n');
  const empty = await shellRunner(home).runCommand(chatgpt.readCommand, 10000);
  assert.equal(empty.stdout, 'found 0\n');
  const text = line({ primary: { used_percent: 5, window_minutes: 300, resets_at: 1 } });
  placeText(home, '.codex/sessions/2026/10/18/rollout-x.jsonl', text);
  const found = await shellRunner(home).runCommand(chatgpt.readCommand, 10000);
  assert.equal(found.stdout, 'found ' + Buffer.byteLength(text.trim()) + '\n' + text.trim());
});

test('every tool of the session read runs inside timeout', () => {
  assert.match(chatgpt.readCommand, /timeout 8 find/);
  assert.match(chatgpt.readCommand, /timeout 8 grep/);
});

test('a CODEX_HOME without sessions falls back to the home folder', async () => {
  const home = fakeHome();
  placeFixture(home, '.codex/sessions/2026/10/18/rollout-x.jsonl', FIXTURE);
  assert.equal((await check(home, { CODEX_HOME: home + '/missing' })).usage.windows.length, 2);
});

test('with no session file the card says no Codex session was found', async () => {
  assert.deepEqual(await check(fakeHome()), { ok: false, error: failure(ERROR_KIND.NOT_AVAILABLE, REASON.CODEX_MISSING) });
});

test('a newest session without limits yet, or a changed line, has its own error', async () => {
  const empty = fakeHome();
  placeText(empty, '.codex/sessions/2026/10/18/rollout-x.jsonl', '{"type":"session_meta","payload":{}}\n');
  assert.deepEqual(await check(empty), { ok: false, error: failure(ERROR_KIND.NOT_AVAILABLE, REASON.CODEX_NO_LIMITS) });
  const cases = [
    line({}),
    line({ primary: { used_percent: '5', window_minutes: 300 } }),
    line({ primary: { used_percent: 5 } }),
    '{"payload":{"rate_limits":{"x":1}}\n',
    line({ primary: 'full' }),
    '{"payload":{"rate_limits":{ broken\n',
    '{"rate_limits":{"primary":{}}}\n',
  ];
  for (const text of cases) {
    const home = fakeHome();
    placeText(home, '.codex/sessions/2026/10/18/rollout-x.jsonl', text);
    assert.deepEqual(await check(home), { ok: false, error: failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON.FILE_FORMAT_CHANGED) }, text);
  }
});

test('a window without a reset time still shows', async () => {
  const home = fakeHome();
  placeText(home, '.codex/sessions/2026/10/18/rollout-x.jsonl', line({ primary: { used_percent: 5, window_minutes: 300, resets_at: null }, secondary: null }));
  assert.deepEqual((await check(home)).usage.windows, [usageWindow(PERIOD.FIVE_HOUR, '', 5, null)]);
});

test('a line longer than the cap is refused', async () => {
  const home = fakeHome();
  placeText(home, '.codex/sessions/2026/10/18/rollout-x.jsonl', line({ primary: { used_percent: 5, window_minutes: 300, resets_at: 1 }, pad: 'x'.repeat(MAX_LINE_BYTES) }));
  assert.deepEqual(await check(home), { ok: false, error: failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON.FILE_TOO_LARGE, null, { size: MAX_LINE_BYTES }) });
});

const LIVE_REPLY = Object.freeze({
  plan_type: 'plus',
  rate_limit: {
    allowed: true,
    primary_window: { used_percent: 9, limit_window_seconds: 18000, reset_after_seconds: 100, reset_at: 1792335600 },
    secondary_window: { used_percent: 1, limit_window_seconds: 604800, reset_after_seconds: 200, reset_at: 1792800000 },
  },
});

const LIVE_WINDOWS = [
  usageWindow(PERIOD.FIVE_HOUR, '', 9, 1792335600000),
  usageWindow(PERIOD.WEEKLY, '', 1, 1792800000000),
];

function placePiToken(home) {
  placeText(home, '.pi/agent/auth.json', JSON.stringify({ 'openai-codex': { type: 'oauth', access: 'pi-token', refresh: 'r', expires: 1, accountId: 'acct-pi' } }));
}

test('the live usage API read with the pi token wins over the Codex session files', async () => {
  const home = fakeHome();
  placeFixture(home, '.codex/sessions/2026/10/18/rollout-2026-10-18T12-00-00-placeholder.jsonl', FIXTURE);
  placePiToken(home);
  const env = fakeCurl(home, LIVE_REPLY);
  assert.deepEqual(await check(home, env), { ok: true, usage: makeUsage({ windows: LIVE_WINDOWS }) });
  const call = curlCall(home);
  assert.equal(call.stdin, 'Authorization: Bearer pi-token\nChatGPT-Account-Id: acct-pi\n');
  assert.ok(call.args.includes('https://chatgpt.com/backend-api/wham/usage'));
  assert.ok(!call.args.some((arg) => arg.includes('pi-token')));
});

test('without a pi token the Codex login token reads the live usage', async () => {
  const home = fakeHome();
  placeText(home, '.codex/auth.json', JSON.stringify({ tokens: { access_token: 'codex-token', account_id: 'acct-codex' } }));
  const env = fakeCurl(home, LIVE_REPLY);
  assert.deepEqual(await check(home, env), { ok: true, usage: makeUsage({ windows: LIVE_WINDOWS }) });
  assert.equal(curlCall(home).stdin, 'Authorization: Bearer codex-token\nChatGPT-Account-Id: acct-codex\n');
});

test('a failing live usage API falls back to the newest Codex session file', async () => {
  const home = fakeHome();
  placeFixture(home, '.codex/sessions/2026/10/18/rollout-2026-10-18T12-00-00-placeholder.jsonl', FIXTURE);
  placePiToken(home);
  const env = fakeCurl(home, null);
  assert.deepEqual((await check(home, env)).usage.windows.map((item) => item.usedPercent), [37.5, 62]);
});

test('an API answer without a primary window falls back to the Codex session file', async () => {
  const home = fakeHome();
  placeFixture(home, '.codex/sessions/2026/10/18/rollout-2026-10-18T12-00-00-placeholder.jsonl', FIXTURE);
  placePiToken(home);
  const env = fakeCurl(home, { rate_limit: null });
  assert.deepEqual((await check(home, env)).usage.windows.map((item) => item.usedPercent), [37.5, 62]);
});
