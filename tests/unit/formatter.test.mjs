import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'UTC';

const {
  SEVERITY,
  EMPTY_SECTION,
  severityFor,
  formatPercent,
  formatMoney,
  formatCount,
  formatDuration,
  formatClock,
  formatBytes,
  periodText,
  windowLabel,
  labelText,
  reasonText,
  describeError,
  isWindowActive,
  walletErrorText,
  isWalletLockedError,
  doneText,
  nameRuleText,
  fieldRuleText,
  refreshChoiceText,
  invalidText,
  resultText,
  discoveryText,
  keyRuleText,
  saveFailedText,
  serviceRuleText,
  discoveryNamesRuleText,
  walletWaitingText,
  usageSummaryText,
  splitWindows,
  formatWeekdayClock,
  buildViewModel,
} = await import('../../package/contents/code/core/formatter.mjs');
const { createEntry, applySuccess, applyFailure, markLoading } = await import('../../package/contents/code/core/state.mjs');
const { ERROR_KIND, REASON, failure } = await import('../../package/contents/code/core/http.mjs');
const { MINUTE_MS, HOUR_MS } = await import('../../package/contents/code/core/units.mjs');
const { MAX_RESPONSE_BYTES } = await import('../../package/contents/code/core/curlCommand.mjs');
const { WALLET_ERROR } = await import('../../package/contents/code/core/walletMessages.mjs');
const { REFRESH_CHOICES_SECONDS } = await import('../../package/contents/code/core/accounts.mjs');
const { INVALID } = await import('../../package/contents/code/core/accountActions.mjs');
const { findProvider } = await import('../../package/contents/code/providers/registry.mjs');
const { PERIOD, LABEL, makeUsage, usageWindow, usageAmount, usageAmountProblem, usageCount, usageText } = await import('../../package/contents/code/core/usage.mjs');

const NOW = Date.UTC(2026, 9, 18, 12);
const INTERVAL = 30 * 1000;

function entry(service, name, title) {
  return createEntry({ account: { id: 'a' + service, service: service, name: name }, title: title, intervalMs: INTERVAL });
}

test('severity follows the 75 and 90 percent thresholds', () => {
  assert.equal(severityFor(10), SEVERITY.NORMAL);
  assert.equal(severityFor(74.9), SEVERITY.NORMAL);
  assert.equal(severityFor(75), SEVERITY.WARNING);
  assert.equal(severityFor(90), SEVERITY.CRITICAL);
  assert.equal(severityFor(130), SEVERITY.CRITICAL);
  assert.equal(severityFor(null), SEVERITY.UNKNOWN);
});

test('percentages are rounded to whole numbers', () => {
  assert.equal(formatPercent(84.8), '85%');
  assert.equal(formatPercent(0.2), '0%');
  assert.equal(formatPercent(120), '120%');
  assert.equal(formatPercent(null), '--');
});

test('US dollars have a dollar sign, other currencies their code, both with two decimals and thousands separators', () => {
  assert.equal(formatMoney(3.24), '$3.24');
  assert.equal(formatMoney(1234567.891, 'usd'), '$1,234,567.89');
  assert.equal(formatMoney(1234567.891, 'USD'), '$1,234,567.89');
  assert.equal(formatMoney(0), '$0.00');
  assert.equal(formatMoney(-5), '-$5.00');
  assert.equal(formatMoney(12.5, 'eur'), '12.50 EUR');
  assert.equal(formatMoney(133.5 / 100), '$1.34');
  assert.equal(formatMoney(1.005), '$1.01');
  assert.equal(formatMoney(0.004), '$0.00');
  assert.equal(formatMoney(-0.004), '$0.00');
  assert.equal(formatMoney(-1000, 'eur'), '-1,000.00 EUR');
});

test('large counts are shortened', () => {
  assert.equal(formatCount(950), '950');
  assert.equal(formatCount(50000), '50k');
  assert.equal(formatCount(1250), '1.3k');
  assert.equal(formatCount(2000000), '2M');
  assert.equal(formatCount(3400000000), '3.4B');
});

test('durations read in minutes, hours and days', () => {
  assert.equal(formatDuration(30 * 1000), 'less than a minute');
  assert.equal(formatDuration(5 * MINUTE_MS), '5 min');
  assert.equal(formatDuration(2 * HOUR_MS), '2 h');
  assert.equal(formatDuration(2 * HOUR_MS + 10 * MINUTE_MS), '2 h 10 min');
  assert.equal(formatDuration(3 * 24 * HOUR_MS), '3 d');
  assert.equal(formatDuration(3 * 24 * HOUR_MS + 5 * HOUR_MS), '3 d 5 h');
});

test('clock times show the time today, the weekday this week, and the date later', () => {
  assert.equal(formatClock(Date.UTC(2026, 9, 18, 14, 5), NOW), '14:05');
  assert.equal(formatClock(Date.UTC(2026, 9, 19, 9, 0), NOW), 'Mon 09:00');
  assert.equal(formatClock(Date.UTC(2026, 10, 3, 9, 0), NOW), 'Nov 3');
});

test('limit labels are 5hr, daily, weekly and monthly, with the model or member name in front where there is one', () => {
  assert.equal(windowLabel(usageWindow(PERIOD.FIVE_HOUR, '', 1, null)), '5hr');
  assert.equal(windowLabel(usageWindow(PERIOD.DAILY, '', 1, null)), 'daily');
  assert.equal(windowLabel(usageWindow(PERIOD.WEEKLY, '', 1, null)), 'weekly');
  assert.equal(windowLabel(usageWindow(PERIOD.MONTHLY, '', 1, null)), 'monthly');
  assert.equal(windowLabel(usageWindow(PERIOD.FIVE_HOUR, 'MiniMax-M*', 1, null)), 'MiniMax-M* 5hr');
  assert.equal(windowLabel(usageWindow(PERIOD.MONTHLY, 'alice', 1, null)), 'alice monthly');
  assert.equal(windowLabel(usageWindow(PERIOD.TOP_UP, '', 1, null)), 'top-up');
});

test('other window lengths name their length', () => {
  assert.equal(periodText({ period: PERIOD.HOURS, count: 2 }), '2hr');
  assert.equal(periodText({ period: PERIOD.DAYS, count: 3 }), '3 days');
  assert.equal(periodText({ period: PERIOD.MINUTES, count: 45 }), '45 min');
  assert.equal(periodText({ period: PERIOD.INTERVAL, count: null }), 'interval');
});

test('amount, count and text labels become display text', () => {
  assert.equal(labelText(usageAmount(LABEL.MEMBER_SPEND, 'bob', 1, null, true)), 'bob');
  assert.equal(labelText(usageAmount(LABEL.SPENT_THIS_MONTH, '', 1, null, false)), 'Spent this month');
  assert.equal(labelText(usageAmount(LABEL.BALANCE, '', 1, null, false)), 'Balance');
  assert.equal(labelText(usageCount(LABEL.INPUT_TOKENS_THIS_MONTH, 1)), 'Input tokens this month');
  assert.equal(labelText(usageText(LABEL.PLAN, 'PRO')), 'Plan');
  assert.equal(labelText(usageText(LABEL.BILLING_MODE, 'prepaid')), 'Billing mode');
  assert.equal(labelText({ label: 'unknown_code', name: '' }), 'unknown_code');
});

test('every reason code has its own text and no text keeps a placeholder', () => {
  for (const reason of Object.keys(REASON)) {
    const withParams = reasonText(failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON[reason], null, { status: 503, code: 35, field: 'currency', size: 2048 }));
    assert.notEqual(withParams, REASON[reason], reason);
    assert.doesNotMatch(withParams, /[{}]/, reason);
    assert.doesNotMatch(reasonText(failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON[reason])), /[{}]/, reason);
  }
  assert.equal(reasonText(failure(ERROR_KIND.CANNOT_CONNECT, REASON.CURL_ERROR)), 'curl error, exit code unknown');
});

test('size texts come from the limit that was hit', () => {
  assert.equal(formatBytes(1048576), '1 MiB');
  assert.equal(formatBytes(65536), '64 KiB');
  assert.equal(formatBytes(512), '512 bytes');
  assert.equal(reasonText(failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON.ANSWER_TOO_LARGE)), 'the answer was larger than ' + formatBytes(MAX_RESPONSE_BYTES));
  assert.equal(reasonText(failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON.FILE_TOO_LARGE, null, { size: 65536 })), 'the file was larger than 64 KiB');
});

test('the service specific texts are plain', () => {
  assert.equal(reasonText(failure(ERROR_KIND.NO_KEY, REASON.NO_KEY)), 'add the key in the widget settings');
  assert.match(reasonText(failure(ERROR_KIND.KEY_REJECTED, REASON.ADMIN_KEY_REQUIRED)), /Admin API key.*org:admin.*not scoped to a workspace/);
  assert.equal(reasonText(failure(ERROR_KIND.KEY_REJECTED, REASON.OPENAI_ADMIN_KEY_REQUIRED, null, { status: 401 })), 'HTTP 401, use an Admin API key');
  assert.equal(reasonText(failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON.FIELD_MISSING, null, { field: 'costCents' })), 'the answer has no costCents field');
  assert.equal(reasonText(failure(ERROR_KIND.NOT_AVAILABLE, REASON.CLAUDE_FILE_MISSING)), 'the Claude desktop app file plan-usage-history.json was not found');
  assert.equal(reasonText(failure(ERROR_KIND.NOT_AVAILABLE, REASON.JETBRAINS_LOG_MISSING)), 'no JetBrains IDE log was found');
});

test('each error kind has its own plain message and no next try time', () => {
  assert.equal(describeError(failure(ERROR_KIND.CANNOT_CONNECT, REASON.TIMEOUT)), 'Cannot connect (timed out)');
  assert.equal(describeError(failure(ERROR_KIND.KEY_REJECTED, REASON.HTTP_STATUS, null, { status: 401 })), 'Key rejected (HTTP 401)');
  assert.equal(describeError(failure(ERROR_KIND.RATE_LIMITED, REASON.HTTP_STATUS, NOW + HOUR_MS, { status: 429 })), 'Rate limited');
  assert.equal(describeError(failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON.REDIRECT, null, { status: 302 })), 'Unexpected answer (the service answered with a redirect, HTTP 302)');
  assert.equal(describeError(failure(ERROR_KIND.NOT_AVAILABLE, REASON.GO_SUBSCRIPTION_REQUIRED)), 'OpenCode Go subscription required');
  assert.equal(describeError(failure(ERROR_KIND.NO_KEY, REASON.NO_KEY)), 'Add the key in the widget settings');
});

test('a window is active until its reset time or its validity end passes', () => {
  assert.equal(isWindowActive(usageWindow(PERIOD.WEEKLY, '', 1, NOW + 1), NOW), true);
  assert.equal(isWindowActive(usageWindow(PERIOD.WEEKLY, '', 1, NOW), NOW), false);
  assert.equal(isWindowActive(usageWindow(PERIOD.WEEKLY, '', 1, null), NOW), true);
  assert.equal(isWindowActive(usageWindow(PERIOD.FIVE_HOUR, '', 1, null, { validUntil: NOW }), NOW), false);
  assert.equal(isWindowActive(usageWindow(PERIOD.FIVE_HOUR, '', 1, null, { validUntil: NOW + 1 }), NOW), true);
});

test('wallet results have plain texts, and locked or silent wallets tell the user to unlock KWallet', () => {
  assert.equal(walletErrorText(WALLET_ERROR.NOT_RUNNING), 'KWallet is not running');
  assert.match(walletErrorText(WALLET_ERROR.LOCKED), /Unlock KWallet and try again/);
  assert.match(walletErrorText(WALLET_ERROR.NO_ANSWER), /Unlock KWallet and try again/);
  assert.equal(walletErrorText('something new'), 'KWallet answered with an error');
  assert.equal(isWalletLockedError(WALLET_ERROR.LOCKED), true);
  assert.equal(isWalletLockedError(WALLET_ERROR.NO_ANSWER), true);
  assert.equal(isWalletLockedError(WALLET_ERROR.WRITE_FAILED), false);
});

test('settings texts are plain', () => {
  assert.equal(doneText('add', 'MiniMax', 'me@example.com'), 'Added MiniMax me@example.com');
  assert.equal(doneText('edit', 'MiniMax', 'me'), 'Saved MiniMax me');
  assert.equal(doneText('remove', 'MiniMax', 'me'), 'Deleted MiniMax me');
  assert.equal(nameRuleText(), 'Type a name or email of 1 to 100 characters');
  assert.equal(fieldRuleText('Team ID'), 'Team ID: use letters, digits and - only, at most 64');
});

test('the refresh choices read 30 seconds, 1, 5, 15, 30 and 60 minutes', () => {
  assert.deepEqual(REFRESH_CHOICES_SECONDS.map(refreshChoiceText), ['30 seconds', '1 minute', '5 minutes', '15 minutes', '30 minutes', '60 minutes']);
});

test('the summary of found Claude accounts lists each limit with its percent', () => {
  const usage = makeUsage({ windows: [usageWindow(PERIOD.FIVE_HOUR, '', 12.4, null), usageWindow(PERIOD.WEEKLY, '', 40, null)] });
  assert.equal(usageSummaryText(usage), '5hr 12%, weekly 40%');
});

test('a refused form names the rule that failed', () => {
  assert.equal(invalidText(INVALID.NAME, findProvider('minimax')), 'Type a name or email of 1 to 100 characters');
  assert.equal(invalidText(INVALID.FIELD, findProvider('xai')), 'Team ID: use letters, digits and - only, at most 64');
  assert.equal(invalidText(INVALID.FIELD, null), 'Field: use letters, digits and - only, at most 64');
  assert.equal(invalidText(INVALID.KEY, findProvider('minimax')), 'Paste the key');
  assert.equal(invalidText(INVALID.SERVICE, null), 'Pick a service');
  assert.equal(invalidText(INVALID.ACCOUNT, null), 'This account is not known any more');
  assert.equal(keyRuleText(), 'Paste the key');
  assert.equal(saveFailedText(), 'The account could not be saved');
});

test('a settings result becomes its done text, its wallet text or its rule text', () => {
  assert.equal(resultText({ ok: true, action: 'add', title: 'MiniMax', name: 'me' }, null), 'Added MiniMax me');
  assert.equal(resultText({ ok: false, invalid: '', walletCode: WALLET_ERROR.NOT_RUNNING }, null), 'KWallet is not running');
  assert.equal(resultText({ ok: false, invalid: INVALID.KEY, walletCode: '' }, null), 'Paste the key');
});

test('the discovery text comes from the codes the provider supplies', () => {
  const claude = findProvider('claude');
  assert.equal(discoveryText(claude, null, 0), 'Reading the Claude desktop app file');
  assert.equal(discoveryText(claude, { ok: true, items: [] }, 0), 'No new accounts found in the Claude desktop app file');
  assert.equal(discoveryText(claude, { ok: true, items: [1] }, 1), '');
  assert.equal(discoveryText(claude, { ok: false, error: failure(ERROR_KIND.NOT_AVAILABLE, REASON.CLAUDE_FILE_MISSING) }, 0), 'The Claude desktop app file plan-usage-history.json was not found');
  assert.equal(discoveryText(findProvider('minimax'), null, 0), '');
  assert.equal(discoveryText(null, { ok: true, items: [] }, 0), '');
});

test('a card shows the service and the typed name, the main bars by period with reset times, then Balance and Spent this month, then the additional rows', () => {
  const usage = makeUsage({
    windows: [usageWindow(PERIOD.WEEKLY, '', 10, null), usageWindow(PERIOD.FIVE_HOUR, '', 84.8, NOW + 2 * HOUR_MS + 5 * MINUTE_MS), usageWindow(PERIOD.HOURS, '', 7, null, { count: 2 }), usageWindow(PERIOD.TOP_UP, '', 25, null)],
    texts: [usageText(LABEL.PLAN, 'PRO')],
    amounts: [usageAmount(LABEL.SPENT_THIS_MONTH, '', 12.3456, 50, false), usageAmount(LABEL.BALANCE, '', 7, null, false), usageAmount(LABEL.MEMBER_SPEND, 'bob', 1.23, null, true)],
    counts: [usageCount(LABEL.INPUT_TOKENS_THIS_MONTH, 2000000)],
  });
  const view = buildViewModel([applySuccess(markLoading(entry('requesty', 'me@example.com', 'Requesty'), NOW), usage, NOW)], NOW);
  const section = view.sections[0];
  assert.equal(section.title, 'Requesty');
  assert.equal(section.account, 'me@example.com');
  assert.deepEqual(section.windows[0], { label: '5hr', percentText: '85%', fraction: 0.848, severity: SEVERITY.WARNING, resetText: 'Resets in 2 h 5 min (14:05)', isExpired: false, elapsedFraction: 175 / 300, rateText: '29%/h' });
  assert.deepEqual(section.windows.map((item) => [item.label, item.resetText]), [['5hr', 'Resets in 2 h 5 min (14:05)'], ['weekly', '']]);
  assert.deepEqual(section.mainRows, [{ label: 'Balance', valueText: '$7.00', isProblem: false }, { label: 'Spent this month', valueText: '$12.35 of $50.00', isProblem: false }]);
  assert.deepEqual(section.rows, [
    { label: 'Input tokens this month', valueText: '2M', isProblem: false },
    { label: 'Plan', valueText: 'PRO', isProblem: false },
    { label: '2hr', valueText: '7%', isProblem: false },
    { label: 'bob', valueText: '$1.23, no limit', isProblem: false },
    { label: 'top-up', valueText: '25%', isProblem: false },
  ]);
  assert.deepEqual(Object.keys(section).sort(), Object.keys(EMPTY_SECTION).sort());
  assert.doesNotMatch(JSON.stringify(view), /check|highest|note/i);
});

test('several entries for one period give one main bar, the one closest to its limit, and the others become additional rows', () => {
  const usage = makeUsage({ windows: [
    usageWindow(PERIOD.MONTHLY, 'alice', 40, null),
    usageWindow(PERIOD.MONTHLY, 'bob', 75, null),
    usageWindow(PERIOD.DAILY, 'speech-hd', 100, null, { canBeMain: false }),
    usageWindow(PERIOD.DAILY, 'video', 3, null),
  ] });
  const section = buildViewModel([applySuccess(entry('opencodeZen', 'x', 'OpenCode Zen'), usage, NOW)], NOW).sections[0];
  assert.deepEqual(section.windows.map((item) => [item.label, item.percentText]), [['daily', '3%'], ['monthly', '75%']]);
  assert.deepEqual(section.rows, [{ label: 'alice monthly', valueText: '40%', isProblem: false }, { label: 'speech-hd daily', valueText: '100%', isProblem: false }]);
});

test('an active window wins the main bar over an expired one', () => {
  const usage = makeUsage({ windows: [usageWindow(PERIOD.FIVE_HOUR, 'old', 99, NOW - MINUTE_MS), usageWindow(PERIOD.FIVE_HOUR, 'now', 20, NOW + HOUR_MS)] });
  assert.equal(splitWindows(usage.windows, NOW).main[0].name, 'now');
  assert.equal(splitWindows(usage.windows, NOW).extra[0].name, 'old');
});

test('a spend without a limit says so', () => {
  const usage = makeUsage({ amounts: [usageAmount(LABEL.SPENT_THIS_MONTH, '', 3.5, null, true)] });
  assert.equal(buildViewModel([applySuccess(entry('requesty', 'x', 'Requesty'), usage, NOW)], NOW).sections[0].mainRows[0].valueText, '$3.50, no limit');
});

test('a bar never grows past full', () => {
  const usage = makeUsage({ windows: [usageWindow(PERIOD.WEEKLY, '', 130, null)] });
  assert.equal(buildViewModel([applySuccess(entry('requesty', 'x', 'Requesty'), usage, NOW)], NOW).sections[0].windows[0].fraction, 1);
});

test('a window whose reset time or validity has passed is greyed', () => {
  const usage = makeUsage({ windows: [usageWindow(PERIOD.FIVE_HOUR, '', 95, NOW - MINUTE_MS), usageWindow(PERIOD.WEEKLY, '', 96, null, { validUntil: NOW - 1 }), usageWindow(PERIOD.MONTHLY, '', 10, null)] });
  const view = buildViewModel([applySuccess(entry('chatgpt', 'x', 'ChatGPT'), usage, NOW)], NOW);
  assert.deepEqual(view.sections[0].windows.map((item) => [item.isExpired, item.severity, item.resetText]), [
    [true, SEVERITY.UNKNOWN, 'Reset at 11:59, no newer data'],
    [true, SEVERITY.UNKNOWN, 'No newer data'],
    [false, SEVERITY.NORMAL, ''],
  ]);
});

test('an error keeps the last values and shows the error text', () => {
  const good = applySuccess(entry('requesty', 'x', 'Requesty'), makeUsage({ windows: [usageWindow(PERIOD.MONTHLY, '', 50, null)] }), NOW - HOUR_MS);
  const failed = applyFailure(good, failure(ERROR_KIND.KEY_REJECTED, REASON.HTTP_STATUS, null, { status: 401 }), NOW);
  const section = buildViewModel([failed], NOW).sections[0];
  assert.equal(section.windows.length, 1);
  assert.equal(section.hasError, true);
  assert.equal(section.errorText, 'Key rejected (HTTP 401)');
  assert.equal(section.errorSeverity, SEVERITY.CRITICAL);
});

test('a missing Codex session shows on the card like any other message', () => {
  const missing = applyFailure(entry('chatgpt', 'x', 'ChatGPT'), failure(ERROR_KIND.NOT_AVAILABLE, REASON.CODEX_MISSING), NOW);
  const view = buildViewModel([missing], NOW);
  assert.equal(view.sections.length, 1);
  assert.equal(view.sections[0].errorText, 'No Codex session found');
});

test('a rate limit or a lost connection is a warning, not critical', () => {
  const limited = applyFailure(entry('requesty', 'x', 'Requesty'), failure(ERROR_KIND.RATE_LIMITED, REASON.HTTP_STATUS), NOW);
  const offline = applyFailure(entry('minimax', 'x', 'MiniMax'), failure(ERROR_KIND.CANNOT_CONNECT, REASON.NO_CONNECTION), NOW);
  buildViewModel([limited, offline], NOW).sections.forEach((section) => assert.equal(section.errorSeverity, SEVERITY.WARNING));
});

test('with no accounts the view is empty and carries no number', () => {
  const view = buildViewModel([], NOW);
  assert.equal(view.hasAccounts, false);
  assert.equal(view.hasErrors, false);
  assert.deepEqual(Object.keys(view).sort(), ['hasAccounts', 'hasErrors', 'keys', 'sections', 'sectionsByKey', 'walletLocked']);
});

test('a locked or silent Secret Service asks for the Unlock KWallet button', () => {
  const locked = applyFailure(entry('requesty', 'x', 'Requesty'), failure(ERROR_KIND.CANNOT_CONNECT, REASON.WALLET_LOCKED), NOW);
  const silent = applyFailure(entry('minimax', 'x', 'MiniMax'), failure(ERROR_KIND.CANNOT_CONNECT, REASON.SECRET_SERVICE_TIMEOUT), NOW);
  const other = applyFailure(entry('openai', 'x', 'OpenAI API'), failure(ERROR_KIND.CANNOT_CONNECT, REASON.TIMEOUT), NOW);
  assert.equal(buildViewModel([locked], NOW).walletLocked, true);
  assert.equal(buildViewModel([silent], NOW).walletLocked, true);
  assert.equal(buildViewModel([other], NOW).walletLocked, false);
});

test('cards are looked up by account id in a map without inherited names', () => {
  const view = buildViewModel([applySuccess(entry('requesty', 'x', 'Requesty'), makeUsage({}), NOW)], NOW);
  assert.equal(view.sectionsByKey.toString, undefined);
  assert.equal(view.sectionsByKey.arequesty.title, 'Requesty');
});


test('the form and wallet texts live in one place', () => {
  assert.equal(serviceRuleText(), 'Pick a service');
  assert.equal(keyRuleText(), 'Paste the key');
  assert.equal(discoveryNamesRuleText(), 'Type a name or email for at least one organization');
  assert.equal(walletWaitingText(), 'Waiting for KWallet. Type the wallet password in the KWallet window.');
});

test('a main row that could not be read keeps its label and says why', () => {
  const usage = makeUsage({ amounts: [
    usageAmount(LABEL.SPENT_THIS_MONTH, '', 3.5, null, true),
    usageAmountProblem(LABEL.BALANCE, failure(ERROR_KIND.NOT_AVAILABLE, REASON.BALANCE_NEEDS_MANAGE)),
  ] });
  const section = buildViewModel([applySuccess(entry('requesty', 'x', 'Requesty'), usage, NOW)], NOW).sections[0];
  assert.deepEqual(section.mainRows, [
    { label: 'Balance', valueText: 'Balance needs an API key with manage permission', isProblem: true },
    { label: 'Spent this month', valueText: '$3.50, no limit', isProblem: false },
  ]);
  const timedOut = makeUsage({ amounts: [usageAmountProblem(LABEL.BALANCE, failure(ERROR_KIND.CANNOT_CONNECT, REASON.TIMEOUT))] });
  assert.equal(buildViewModel([applySuccess(entry('requesty', 'x', 'Requesty'), timedOut, NOW)], NOW).sections[0].mainRows[0].valueText, 'Cannot connect (timed out)');
  const changed = makeUsage({ amounts: [usageAmountProblem(LABEL.BALANCE, failure(ERROR_KIND.UNEXPECTED_ANSWER, REASON.SHAPE_CHANGED))] });
  assert.equal(buildViewModel([applySuccess(entry('requesty', 'x', 'Requesty'), changed, NOW)], NOW).sections[0].mainRows[0].valueText, 'Unexpected answer (the answer format changed)');
});

test('an estimated reset says about, with the weekday for the weekly window', () => {
  const usage = makeUsage({ windows: [
    usageWindow(PERIOD.FIVE_HOUR, '', 40, Date.UTC(2026, 9, 18, 14, 30), { estimated: true }),
    usageWindow(PERIOD.WEEKLY, '', 20, Date.UTC(2026, 9, 19, 14, 30), { estimated: true }),
  ] });
  const section = buildViewModel([applySuccess(entry('claude', 'x', 'Claude'), usage, NOW)], NOW).sections[0];
  assert.deepEqual(section.windows.map((item) => item.resetText), ['Resets about 14:30', 'Resets about Mon 14:30']);
  assert.equal(formatWeekdayClock(Date.UTC(2026, 9, 18, 9, 5)), 'Sun 09:05');
});

function twelveHour(time) {
  const date = new Date(time);
  const hours = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;
  return hours + ':' + String(date.getMinutes()).padStart(2, '0') + (date.getHours() < 12 ? ' a.m.' : ' p.m.');
}

test('clock times use the time format the widget passes in, such as the 12 hour locale format', () => {
  assert.equal(formatClock(Date.UTC(2026, 9, 18, 14, 5), NOW, twelveHour), '2:05 p.m.');
  assert.equal(formatClock(Date.UTC(2026, 9, 19, 9, 0), NOW, twelveHour), 'Mon 9:00 a.m.');
  assert.equal(formatWeekdayClock(Date.UTC(2026, 9, 18, 0, 5), twelveHour), 'Sun 12:05 a.m.');
  const usage = makeUsage({ windows: [
    usageWindow(PERIOD.FIVE_HOUR, '', 40, NOW + 2 * HOUR_MS + 5 * MINUTE_MS),
    usageWindow(PERIOD.WEEKLY, '', 20, Date.UTC(2026, 9, 19, 14, 30), { estimated: true }),
    usageWindow(PERIOD.MONTHLY, '', 95, NOW - MINUTE_MS),
  ] });
  const section = buildViewModel([applySuccess(entry('chatgpt', 'x', 'ChatGPT'), usage, NOW)], NOW, { timeText: twelveHour }).sections[0];
  assert.deepEqual(section.windows.map((item) => item.resetText), ['Resets in 2 h 5 min (2:05 p.m.)', 'Resets about Mon 2:30 p.m.', 'Reset at 11:59 a.m., no newer data']);
});

test('without a time format the clock stays at 24 hours', () => {
  const usage = makeUsage({ windows: [usageWindow(PERIOD.FIVE_HOUR, '', 40, NOW + 2 * HOUR_MS + 5 * MINUTE_MS)] });
  assert.equal(buildViewModel([applySuccess(entry('chatgpt', 'x', 'ChatGPT'), usage, NOW)], NOW, {}).sections[0].windows[0].resetText, 'Resets in 2 h 5 min (14:05)');
});

test('a main bar knows how much of its window has passed and how fast it is used per hour', () => {
  const usage = makeUsage({ windows: [
    usageWindow(PERIOD.FIVE_HOUR, '', 30, NOW + 2 * HOUR_MS),
    usageWindow(PERIOD.WEEKLY, '', 20, NOW + 84 * HOUR_MS),
    usageWindow(PERIOD.MONTHLY, '', 10, NOW + 24 * HOUR_MS),
  ] });
  const windows = buildViewModel([applySuccess(entry('chatgpt', 'x', 'ChatGPT'), usage, NOW)], NOW).sections[0].windows;
  assert.deepEqual(windows.map((item) => [item.label, item.elapsedFraction, item.rateText]), [
    ['5hr', 0.6, '10%/h'],
    ['weekly', 0.5, '0.2%/h'],
    ['monthly', null, ''],
  ]);
});

test('a bar without a reset time, just started or expired has no elapsed marker or rate', () => {
  const usage = makeUsage({ windows: [
    usageWindow(PERIOD.FIVE_HOUR, '', 3, NOW + 5 * HOUR_MS - 2 * MINUTE_MS),
    usageWindow(PERIOD.WEEKLY, '', 20, null),
    usageWindow(PERIOD.DAILY, '', 50, NOW - MINUTE_MS),
  ] });
  const windows = buildViewModel([applySuccess(entry('chatgpt', 'x', 'ChatGPT'), usage, NOW)], NOW).sections[0].windows;
  assert.deepEqual(windows.map((item) => [item.label, item.elapsedFraction, item.rateText]), [
    ['5hr', 2 / 300, ''],
    ['daily', null, ''],
    ['weekly', null, ''],
  ]);
});

test('a card carries its service, the service accent colour and a badge letter from the account name', () => {
  const view = buildViewModel([
    entry('claude', 'personal', 'Claude'),
    entry('chatgpt', 'work@example.com', 'ChatGPT'),
    entry('requesty', '', 'Requesty'),
  ], NOW);
  assert.deepEqual(view.sections.map((section) => [section.service, section.accent, section.badge]), [
    ['claude', '#d97757', 'P'],
    ['chatgpt', '#10a37f', 'W'],
    ['requesty', '', 'R'],
  ]);
});
