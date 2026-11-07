import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ALL_PROVIDERS, findProvider } from '../../package/contents/code/providers/registry.mjs';
import { KIND } from '../../package/contents/code/core/providerKind.mjs';
import { isValidLabel } from '../../package/contents/code/core/validation.mjs';
import { buildCheckCommand } from '../../package/contents/code/core/curlCommand.mjs';
import { DEFAULT_REFRESH_SECONDS, REFRESH_CHOICES_SECONDS } from '../../package/contents/code/core/accounts.mjs';
import { TEST_BOUNDARY, testAccount } from './support/replies.mjs';

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package');
const NOW = Date.UTC(2026, 9, 18);

test('the registry lists every service once, in the order of the service picker', () => {
  assert.deepEqual(ALL_PROVIDERS.map((p) => p.id), ['claude', 'chatgpt', 'openai', 'anthropic', 'xai', 'opencodeGo', 'opencodeZen', 'minimax', 'requesty', 'huggingFace', 'jetbrains']);
  assert.deepEqual(ALL_PROVIDERS.map((p) => p.title), ['Claude', 'ChatGPT', 'OpenAI API', 'Anthropic API', 'xAI API', 'OpenCode Go', 'OpenCode Zen', 'MiniMax', 'Requesty', 'Hugging Face', 'JetBrains AI']);
});

test('spend services are asked at most every 5 minutes, subscription limits follow the refresh choice', () => {
  const floors = {};
  ALL_PROVIDERS.forEach((provider) => { floors[provider.id] = provider.minIntervalSeconds; });
  assert.deepEqual(floors, { claude: 0, chatgpt: 0, openai: 300, anthropic: 300, xai: 300, opencodeGo: 0, opencodeZen: 300, minimax: 0, requesty: 300, huggingFace: 300, jetbrains: 0 });
});

test('every provider id is a valid label, so it is safe inside a secret-tool command', () => {
  ALL_PROVIDERS.forEach((provider) => assert.equal(isValidLabel(provider.id), true, provider.id));
});

test('a remote provider needs a key, has key help and implements the request interface', () => {
  ALL_PROVIDERS.filter((provider) => provider.kind === KIND.REMOTE).forEach((provider) => {
    assert.equal(provider.needsKey, true, provider.id);
    assert.match(provider.keyHelp, /^[A-Z][^.]*, from (the )?[A-Za-z ]+( \([a-z ]+\))?$/, provider.id);
    assert.equal(typeof provider.buildRequests, 'function', provider.id);
    assert.equal(typeof provider.interpret, 'function', provider.id);
    assert.equal(typeof provider.auth.header, 'string', provider.id);
    assert.ok(Array.isArray(provider.fields), provider.id);
  });
});

test('a local provider needs no key, reads with a fixed command and caps what it reads', () => {
  const local = ALL_PROVIDERS.filter((provider) => provider.kind === KIND.LOCAL);
  assert.deepEqual(local.map((p) => p.id), ['claude', 'chatgpt', 'jetbrains']);
  local.forEach((provider) => {
    assert.equal(provider.needsKey, false, provider.id);
    assert.equal(typeof provider.readCommand, 'string', provider.id);
    assert.ok(provider.maxReadBytes > 0, provider.id);
    assert.doesNotMatch(provider.readCommand, /secret-tool|(^|[^2])>/, provider.id);
  });
});

test('only the Claude and ChatGPT local providers call an API, over HTTPS only and with the token on stdin', () => {
  const local = ALL_PROVIDERS.filter((provider) => provider.kind === KIND.LOCAL);
  assert.deepEqual(local.filter((provider) => /curl/.test(provider.readCommand)).map((p) => p.id), ['claude', 'chatgpt']);
  local.filter((provider) => /curl/.test(provider.readCommand)).forEach((provider) => {
    const calls = provider.readCommand.match(/\| curl [^|]*/g);
    assert.equal(calls.length, 1, provider.id);
    assert.match(calls[0], /^\| curl -fsS --proto =https --max-redirs 0 -m \d+ -H @- /, provider.id);
    assert.match(calls[0], / https:\/\/[^ ]+ 2>\/dev\/null $/, provider.id);
    assert.doesNotMatch(calls[0], /\$a|Bearer/, provider.id);
  });
});

test('every remote request builds into a safe curl command', () => {
  ALL_PROVIDERS.filter((provider) => provider.kind === KIND.REMOTE).forEach((provider) => {
    const account = testAccount(provider, 'default', { teamId: '65c1e471-205f-4566-9c5a-07198bcdf4ce' });
    const command = buildCheckCommand({ providerId: provider.id, account: account.id, auth: provider.auth, requests: provider.buildRequests(NOW, account), boundary: TEST_BOUNDARY });
    assert.match(command, /--proto '=https' --max-redirs 0/, provider.id);
  });
});

test('main.xml has only the account list and the refresh choice, and turns nothing on', () => {
  const xml = readFileSync(join(PACKAGE, 'contents', 'config', 'main.xml'), 'utf8');
  const entries = Array.from(xml.matchAll(/<entry name="(\w+)" type="(\w+)">([\s\S]*?)<\/entry>/g)).map((match) => ({ name: match[1], type: match[2], body: match[3] }));
  assert.deepEqual(entries.map((entry) => entry.name + ':' + entry.type), ['accounts:String', 'refreshSeconds:Int']);
  assert.match(entries[0].body, /<default><\/default>/);
  assert.match(entries[1].body, new RegExp('<default>' + DEFAULT_REFRESH_SECONDS + '</default>'));
  assert.match(entries[1].body, new RegExp('<min>' + REFRESH_CHOICES_SECONDS[0] + '</min>'));
  assert.match(entries[1].body, new RegExp('<max>' + REFRESH_CHOICES_SECONDS[REFRESH_CHOICES_SECONDS.length - 1] + '</max>'));
  assert.doesNotMatch(xml, /Enabled/);
});

test('the Plasma configure dialog has no pages of the widget', () => {
  assert.deepEqual(readdirSync(join(PACKAGE, 'contents', 'config')), ['main.xml']);
});

test('the core modules never import a provider, the composition happens in UsageController.qml', () => {
  const coreDir = join(PACKAGE, 'contents', 'code', 'core');
  readdirSync(coreDir).forEach((file) => {
    assert.doesNotMatch(readFileSync(join(coreDir, file), 'utf8'), /from '\.\.\/providers\//, file);
  });
  assert.match(readFileSync(join(PACKAGE, 'contents', 'ui', 'UsageController.qml'), 'utf8'), /providers\/registry\.mjs/);
});

test('findProvider returns the provider or null', () => {
  assert.equal(findProvider('minimax').id, 'minimax');
  assert.equal(findProvider('nope'), null);
});

test('the panel shows no number: the tooltip has only the widget name', () => {
  const main = readFileSync(join(PACKAGE, 'contents', 'ui', 'main.qml'), 'utf8');
  assert.match(main, /toolTipMainText: "AI usage"/);
  assert.match(main, /toolTipSubText: ""/);
  assert.doesNotMatch(readFileSync(join(PACKAGE, 'contents', 'ui', 'CompactView.qml'), 'utf8'), /percent|viewModel/i);
});

test('the widget needs Plasma 6.4, the first release with SignalWatcher and asyncCall with callbacks', () => {
  assert.equal(JSON.parse(readFileSync(join(PACKAGE, 'metadata.json'), 'utf8'))['X-Plasma-API-Minimum-Version'], '6.4');
});
