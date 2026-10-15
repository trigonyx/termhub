import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeGithub, fakeNpm, profile, Stores } from './helpers.js';

const stores = new Stores();
let npm: ReturnType<typeof fakeNpm> | null = null;
afterEach(async () => {
  await stores.stopAll();
  npm?.restore();
  npm = null;
});

const CATALOG = { v: 1, apps: ['termchat', 'keyrace', 'termdrop'].map((id) => ({ id, name: id, description: `${id}!`, repo: `trigonyx/${id}`, bin: id, node: 22 })) };

function github(latest: Record<string, string>, extra: Record<string, unknown> = {}) {
  return fakeGithub({
    'trigonyx/termhub/apps.json': CATALOG,
    'trigonyx/termhub/package.json': { version: '0.0.0' },
    ...Object.fromEntries(Object.entries(latest).map(([id, v]) => [`trigonyx/${id}/package.json`, { version: v }])),
    ...extra,
  });
}

/** A store with fake npm and a fake GitHub, apps detected. */
async function setup(latest: Record<string, string>) {
  npm = fakeNpm();
  const s = stores.make(profile('Ada'), { offline: false, fetchImpl: github(latest), globalRoot: async () => npm!.global });
  await s.refreshApps({ catalog: true, latest: true });
  return s;
}

describe('installing and updating apps', { timeout: 30_000 }, () => {
  it('installs the newest release into npm’s global folder', async () => {
    const s = await setup({ termchat: '2.1.0', keyrace: '2.0.0', termdrop: '2.0.0' });
    expect(s.entry('termchat')!.status).toEqual({ kind: 'missing' });
    const r = await s.install('termchat');
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining('termchat 2.1.0 is installed') });
    expect(npm!.calls().at(-1)).toEqual(['install', '-g', '--prefer-online', 'https://github.com/trigonyx/termchat/tarball/v2.1.0']);
    expect(s.entry('termchat')!.status).toEqual({ kind: 'current', version: '2.1.0' });
    expect(s.task).toMatchObject({ running: false, ok: true, steps: [{ id: 'termchat', status: 'done', note: '2.1.0' }] });
    expect(s.task!.log.join('\n')).toContain('added 1 package');
    await expect(s.install('termchat')).rejects.toThrow('installed already');
  });

  it('falls back to the app’s own folder without permission, and explains failures', async () => {
    const s = await setup({ termchat: '2.1.0', keyrace: '2.0.0', termdrop: '2.0.0' });
    process.env.FAKE_NPM_DENY_GLOBAL = '1';
    const r = await s.install('keyrace');
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(npm!.localDir('keyrace'), 'node_modules', 'keyrace', 'package.json'))).toBe(true);
    expect(s.entry('keyrace')!.detected).toMatchObject({ state: 'installed', main: { kind: 'local' } });

    delete process.env.FAKE_NPM_DENY_GLOBAL;
    process.env.FAKE_NPM_FAIL = 'npm ERR! code EACCES\nnpm ERR! permission denied';
    s.dismissTask();
    const bad = await s.install('termdrop');
    expect(bad.ok).toBe(false);
    expect(bad.hint).toContain('chown');
    expect(s.task).toMatchObject({ ok: false, steps: [{ status: 'failed' }] });
  });

  it('updates one app where it is installed, and shows "new in"', async () => {
    const s = await setup({ termchat: '2.1.0', keyrace: '2.0.0', termdrop: '2.0.0' });
    process.env.FAKE_NPM_VERSION = '2.0.0';
    await s.install('termdrop');
    delete process.env.FAKE_NPM_VERSION;
    s.entry('termdrop')!.latest = '2.2.0';
    await s.refreshApps();
    expect(s.entry('termdrop')!.status).toEqual({ kind: 'update', version: '2.0.0', latest: '2.2.0' });
    s.dismissTask();
    const r = await s.update('termdrop');
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining('(was 2.0.0)') });
    expect(s.entry('termdrop')!.status).toEqual({ kind: 'current', version: '2.2.0' });
    expect(s.entry('termdrop')!.newIn).toEqual({ from: '2.0.0', to: '2.2.0' });
    expect(npm!.calls().at(-1)).toContain('https://github.com/trigonyx/termdrop/tarball/v2.2.0');
  });

  it('updates all installed apps one after the other – nothing else', async () => {
    const s = await setup({ termchat: '2.0.0', keyrace: '2.0.0', termdrop: '2.0.0' });
    await s.install('termchat');
    s.dismissTask();
    await s.install('keyrace');
    s.dismissTask();
    for (const id of ['termchat', 'keyrace', 'termdrop']) s.entry(id)!.latest = '2.5.0';
    await s.refreshApps();
    const before = npm!.calls().length;
    const r = await s.updateAll();
    expect(r.ok).toBe(true);
    expect(s.task!.steps.map((x) => [x.id, x.status])).toEqual([
      ['termchat', 'done'],
      ['keyrace', 'done'],
    ]);
    // termdrop isn't installed: not touched
    const installs = npm!.calls().slice(before).map((c) => c.at(-1));
    expect(installs).toEqual(['https://github.com/trigonyx/termchat/tarball/v2.5.0', 'https://github.com/trigonyx/keyrace/tarball/v2.5.0']);
    expect(s.entry('termdrop')!.status.kind).toBe('missing');
    s.dismissTask();
    expect((await s.updateAll()).message).toBe('Everything is up to date');
  });

  it('removes an app (global or local) and keeps its data', async () => {
    const s = await setup({ termchat: '2.1.0', keyrace: '2.0.0', termdrop: '2.0.0' });
    await s.install('termchat');
    s.dismissTask();
    const data = path.join(s.paths.hub.dir, 'termchat');
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'history.jsonl'), 'keep me');
    const r = await s.uninstall('termchat');
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining('data and friends stay') });
    expect(npm!.calls().at(-1)).toEqual(['rm', '-g', 'termchat']);
    expect(s.entry('termchat')!.status.kind).toBe('missing');
    expect(fs.readFileSync(path.join(data, 'history.jsonl'), 'utf8')).toBe('keep me');

    process.env.FAKE_NPM_DENY_GLOBAL = '1';
    s.dismissTask();
    await s.install('keyrace');
    s.dismissTask();
    expect((await s.uninstall('keyrace')).ok).toBe(true);
    expect(fs.existsSync(npm!.localDir('keyrace'))).toBe(false);
  });

  it('one task at a time; running apps are left alone', async () => {
    const s = await setup({ termchat: '2.1.0', keyrace: '2.0.0', termdrop: '2.0.0' });
    const first = s.install('termchat');
    await expect(s.install('keyrace')).rejects.toThrow('Wait until');
    await first;
    s.dismissTask();
    s.entry('termchat')!.running = true;
    await expect(s.update('termchat')).rejects.toThrow('open right now');
    await expect(s.uninstall('termchat')).rejects.toThrow('open right now');
    expect(() => s.launchRequest('termchat')).toThrow('already open');
    s.entry('termchat')!.running = false;
    expect(s.launchRequest('termchat')).toMatchObject({ id: 'termchat', command: [process.execPath, expect.stringContaining('cli.js')], args: ['--home', s.paths.hub.dir] });
    expect(() => s.launchRequest('keyrace')).toThrow("isn't installed");
  });

  it("What's new: the sections between installed and newest, or since termhub last saw it", async () => {
    npm = fakeNpm();
    const gh = github(
      { termchat: '2.2.0', keyrace: '2.0.0', termdrop: '2.0.0' },
      { 'trigonyx/termchat/CHANGELOG.md': '# Changelog\n\n## 2.2.0 – 2026-10-20\n\n- Topics\n\n## 2.1.0 – 2026-10-16\n\n- Colors\n\n## 2.0.0 – 2026-10-14\n\n- Core\n' },
    );
    const paths = profile('Ada');
    const s = stores.make(paths, { offline: false, fetchImpl: gh, globalRoot: async () => npm!.global });
    await s.refreshApps({ catalog: true, latest: true });
    process.env.FAKE_NPM_VERSION = '2.0.0';
    await s.install('termchat');
    s.dismissTask();
    const w = await s.whatsNew('termchat');
    expect(w.title).toContain('2.2.0 (you have 2.0.0)');
    expect(w.text).toContain('Topics');
    expect(w.text).toContain('Colors');
    expect(w.text).not.toContain('Core');

    // termchat updated itself while termhub was closed: the next termhub says "new in"
    process.env.FAKE_NPM_VERSION = '2.1.0';
    await s.update('termchat');
    s.entry('termchat')!.newIn = null;
    await stores.stopAll();
    process.env.FAKE_NPM_VERSION = '2.2.0';
    // (as if `termchat update` ran meanwhile)
    const { appUpdater } = await import('../src/apps/install.js');
    await appUpdater(s.entry('termchat')!.app).runInstall({ inherit: false, target: 'global', version: '2.2.0' });
    const again = stores.make(paths, { offline: false, fetchImpl: gh, globalRoot: async () => npm!.global });
    await again.refreshApps({ catalog: true, latest: true });
    expect(again.entry('termchat')!.newIn).toEqual({ from: '2.1.0', to: '2.2.0' });
    const w2 = await again.whatsNew('termchat');
    expect(w2.title).toContain('since 2.1.0');
    expect(w2.text).toContain('Topics');
    expect(w2.text).not.toContain('Colors');
    expect(again.entry('termchat')!.newIn).toBeNull();
  });
});
