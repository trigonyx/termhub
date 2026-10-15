import { spawn } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { profile, Stores, until } from './helpers.js';

const stores = new Stores();
afterEach(() => stores.stopAll());

/** A second process watching the shared folder, like a running app. */
function watcher(home: string) {
  const lines: Record<string, unknown>[] = [];
  const child = spawn(path.resolve('node_modules/.bin/tsx'), [path.resolve('test/fixtures/watcher.ts'), home], { stdio: ['ignore', 'pipe', 'inherit'] });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    for (let nl = buf.indexOf('\n'); nl !== -1; nl = buf.indexOf('\n')) {
      lines.push(JSON.parse(buf.slice(0, nl)));
      buf = buf.slice(nl + 1);
    }
  });
  return { lines, last: () => lines.at(-1), stop: () => child.kill() };
}

describe('changes reach the other apps through the shared data', { timeout: 30_000 }, () => {
  it('profile and settings changed in termhub show up in a second process', async () => {
    const paths = profile('Ada');
    const s = stores.make(paths);
    const w = watcher(paths.hub.dir);
    try {
      await until(() => w.lines.length > 0, 15_000, 'watcher started');
      expect(w.last()).toMatchObject({ name: 'Ada', accent: null, animations: 'brief' });
      s.setName('Ada L.');
      s.setColor('teal');
      s.setStatus('dnd');
      await until(() => w.last()?.name === 'Ada L.' && w.last()?.color === '#73daca' && w.last()?.status === 'dnd', 5000, 'profile');
      s.setAccent('#7aa2f7');
      s.setAnimations('off');
      await until(() => w.last()?.accent === '#7aa2f7' && w.last()?.animations === 'off', 5000, 'settings');
      s.resetSettings();
      await until(() => w.last()?.accent === null && w.last()?.animations === 'brief', 5000, 'reset');
    } finally {
      w.stop();
    }
  });

  it('rejects colors that aren’t colors', () => {
    const s = stores.make(profile('Ada'));
    expect(() => s.setColor('mauve-ish')).toThrow('#rrggbb');
    expect(() => s.setAccent('#12')).toThrow('#rrggbb');
    s.setColor('#ABC');
    expect(s.profile.color).toBe('#aabbcc');
    s.setColor(undefined);
    expect(s.profile.color).toBeUndefined();
    s.setStatus('busy', 'x'.repeat(100));
    expect(s.profile.statusMsg).toHaveLength(60);
  });
});
