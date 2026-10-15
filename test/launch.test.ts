import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENTER_SCREEN, handOver, LEAVE_SCREEN, runInTerminal } from '../src/apps/launch.js';
import { FAKE_APP } from './helpers.js';

const env = (extra: Record<string, string>) => ({ ...process.env, ...extra });

describe('opening an app and coming back', () => {
  it('runs an app that ends right away, with the arguments (and --home)', async () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'termhub-run-')), 'out.txt');
    const fd = fs.openSync(out, 'w');
    const r = await runInTerminal([process.execPath, FAKE_APP], ['--home', '/tmp/x'], { stdio: ['ignore', fd, 'inherit'], env: env({ FAKE_APP_NAME: 'termchat' }) });
    fs.closeSync(fd);
    expect(r).toEqual({ code: 0, signal: null });
    expect(fs.readFileSync(out, 'utf8')).toBe('ran termchat --home /tmp/x\n');
    expect(await runInTerminal([process.execPath, FAKE_APP], [], { stdio: 'ignore', env: env({ FAKE_APP_CODE: '3' }) })).toEqual({ code: 3, signal: null });
    expect((await runInTerminal(['/does/not/exist'], [], { stdio: 'ignore' })).error).toBeTruthy();
  });

  it('an app that waits for input gets the keystrokes; termhub ignores ctrl+c meanwhile', async () => {
    const { spawn } = await import('node:child_process');
    // the terminal: a pipe the "user" types into
    const { PassThrough } = await import('node:stream');
    const keyboard = new PassThrough();
    let seen = '';
    const run = new Promise<{ code: number | null }>((resolve) => {
      const child = spawn(process.execPath, [FAKE_APP], { stdio: ['pipe', 'pipe', 'inherit'], env: env({ FAKE_APP_MODE: 'wait' }) });
      keyboard.pipe(child.stdin);
      child.stdout.on('data', (d) => (seen += d));
      child.on('exit', (code) => resolve({ code }));
    });
    keyboard.write('hello\n');
    expect(await run).toEqual({ code: 0 });
    expect(seen).toBe('got hello\n');

    // while runInTerminal waits, SIGINT doesn't end termhub – afterwards it's the default again
    const before = process.listenerCount('SIGINT');
    const waiting = runInTerminal([process.execPath, '-e', 'setTimeout(() => {}, 300)'], [], { stdio: 'ignore' });
    expect(process.listenerCount('SIGINT')).toBe(before + 1);
    process.emit('SIGINT', 'SIGINT');
    expect((await waiting).code).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  it('hands the terminal over in the right order and takes it back', async () => {
    const events: string[] = [];
    const term = { write: (s: string) => events.push(s === LEAVE_SCREEN ? 'leave' : s === ENTER_SCREEN ? 'enter' : s), detach: () => events.push('detach') };
    const r = await handOver(term, async () => {
      events.push('run');
      return { code: 0, signal: null };
    });
    expect(r.code).toBe(0);
    expect(events).toEqual(['detach', 'leave', 'run', 'enter']);
    // leave: mouse reporting off, cursor back, alternate screen left; enter: the opposite
    expect(LEAVE_SCREEN).toContain('\u001b[?1049l');
    expect(LEAVE_SCREEN).toContain('\u001b[?1007l');
    expect(ENTER_SCREEN).toContain('\u001b[?1049h');
    expect(ENTER_SCREEN).toContain('\u001b[?1007h');
    // even if the app can't start, termhub's screen comes back
    events.length = 0;
    await expect(handOver(term, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(events).toEqual(['detach', 'leave', 'enter']);
  });
});
