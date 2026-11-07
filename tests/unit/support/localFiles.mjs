import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const homes = [];

export function fakeHome() {
  const home = mkdtempSync(join(tmpdir(), 'ai-usage-home-'));
  homes.push(home);
  return home;
}

export function removeFakeHomes() {
  homes.splice(0).forEach((home) => rmSync(home, { recursive: true, force: true }));
}

export function placeFixture(home, relativePath, fixture) {
  const target = join(home, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(FIXTURE_ROOT, fixture), target);
  return target;
}

export function placeText(home, relativePath, text) {
  const target = join(home, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return target;
}

export function shellRunner(home, extraEnv = {}) {
  const calls = [];
  const runCommand = (command, timeoutMs) => {
    calls.push({ command, timeoutMs });
    const env = Object.assign({ PATH: process.env.PATH, HOME: home }, extraEnv);
    const result = spawnSync('sh', ['-c', command], { env, encoding: 'utf8', timeout: timeoutMs });
    const timedOut = Boolean(result.error && result.error.code === 'ETIMEDOUT');
    return Promise.resolve({ exitCode: result.status, stdout: timedOut ? '' : result.stdout, stderr: result.stderr, timedOut: timedOut });
  };
  return { runCommand, calls };
}

// Puts a fake curl first on the PATH of the returned environment. It records its
// stdin and arguments in the home folder and prints the reply, or fails like
// `curl -f` when the reply is null.
export function fakeCurl(home, reply) {
  const bin = join(home, 'fake-bin');
  mkdirSync(bin, { recursive: true });
  const script = join(bin, 'curl');
  writeFileSync(script, '#!/bin/sh\ncat > "$HOME/curl-stdin"\nprintf "%s\\n" "$@" > "$HOME/curl-args"\n'
    + 'if [ -f "$HOME/curl-reply" ]; then cat "$HOME/curl-reply"; else exit 22; fi\n', { mode: 0o755 });
  setCurlReply(home, reply);
  return { PATH: bin + ':' + process.env.PATH };
}

export function setCurlReply(home, reply) {
  const target = join(home, 'curl-reply');
  if (reply === null) {
    rmSync(target, { force: true });
  } else {
    writeFileSync(target, typeof reply === 'string' ? reply : JSON.stringify(reply));
  }
}

export function curlCall(home) {
  const read = (name) => {
    try {
      return readFileSync(join(home, name), 'utf8');
    } catch (error) {
      return null;
    }
  };
  const args = read('curl-args');
  return args === null ? null : { stdin: read('curl-stdin'), args: args.trim().split('\n') };
}
