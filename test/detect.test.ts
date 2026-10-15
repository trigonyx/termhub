import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CatalogApp } from '../src/apps/catalog.js';
import { askVersion, detectApp, fetchLatest, findOnPath, nodeSupports, statusLabel, statusOf, type Detected } from '../src/apps/detect.js';
import { fakeGithub, fakePackage, tmpDir } from './helpers.js';

const APP: CatalogApp = { id: 'termdrop', name: 'termdrop', description: '', repo: 'trigonyx/termdrop', bin: 'termdrop', node: 22 };

/** A command on the PATH that prints "<name> <version>". */
function onPath(dir: string, name: string, version: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\necho "${name} ${version}"\n`, { mode: 0o755 });
  return file;
}

describe('finding installed apps', () => {
  it('globally installed', async () => {
    const global = tmpDir('g');
    fakePackage(global, 'termdrop', '2.1.0');
    const d = await detectApp(APP, { globalRoot: global, appDir: tmpDir('local'), pathEnv: '' });
    expect(d).toMatchObject({ state: 'installed', version: '2.1.0', main: { kind: 'global' } });
  });

  it('in its own folder (updates without sudo), and the newer copy wins', async () => {
    const appDir = tmpDir('local');
    fakePackage(path.join(appDir, 'node_modules'), 'termdrop', '2.2.0');
    const d = await detectApp(APP, { globalRoot: null, appDir, pathEnv: '' });
    expect(d).toMatchObject({ state: 'installed', version: '2.2.0', main: { kind: 'local' } });

    // both: the global command starts the newer local copy – that's the one to update
    const global = tmpDir('g');
    fakePackage(global, 'termdrop', '2.0.0');
    const both = await detectApp(APP, { globalRoot: global, appDir, pathEnv: '', ask: async (c) => (c.kind === 'global' ? '2.2.0' : null) });
    expect(both).toMatchObject({ state: 'installed', version: '2.2.0', main: { kind: 'local' } });
    expect((both as Extract<Detected, { state: 'installed' }>).copies.map((c) => c.kind)).toEqual(['global', 'local']);
  });

  it('only on the PATH (npm link, another Node)', async () => {
    const bin = tmpDir('bin');
    onPath(bin, 'termdrop', '2.0.1');
    expect(findOnPath('termdrop', bin)).toBe(path.join(bin, 'termdrop'));
    const d = await detectApp(APP, { globalRoot: tmpDir('g'), appDir: tmpDir('local'), pathEnv: bin });
    expect(d).toMatchObject({ state: 'installed', version: '2.0.1', main: { kind: 'path' } });
  });

  it('not installed', async () => {
    expect(await detectApp(APP, { globalRoot: tmpDir('g'), appDir: tmpDir('local'), pathEnv: tmpDir('bin') })).toEqual({ state: 'missing' });
    expect(await detectApp(APP, { globalRoot: null, appDir: tmpDir('local'), pathEnv: '' })).toEqual({ state: 'missing' });
  });

  it('broken installations', async () => {
    // files missing
    const g1 = tmpDir('g');
    fakePackage(g1, 'termdrop', '2.0.0', { cli: false });
    expect(await detectApp(APP, { globalRoot: g1, appDir: tmpDir('l'), pathEnv: '' })).toMatchObject({ state: 'broken', reason: expect.stringContaining('incomplete') });
    // someone else's package in its place
    const g2 = tmpDir('g');
    fakePackage(g2, 'termdrop', '2.0.0', { pkgName: 'evil' });
    expect(await detectApp(APP, { globalRoot: g2, appDir: tmpDir('l'), pathEnv: '' })).toMatchObject({ state: 'broken', reason: expect.stringContaining('package.json') });
    // it's there but doesn't start
    const g3 = tmpDir('g');
    const dir = fakePackage(g3, 'termdrop', '2.0.0');
    fs.writeFileSync(path.join(dir, 'dist', 'cli.js'), 'process.exit(3)');
    expect(await detectApp(APP, { globalRoot: g3, appDir: tmpDir('l'), pathEnv: '' })).toMatchObject({ state: 'broken', reason: expect.stringContaining('--version') });
  });

  it('asks the app for its version', async () => {
    const g = tmpDir('g');
    const dir = fakePackage(g, 'termdrop', '3.4.5');
    const cli = path.join(dir, 'dist', 'cli.js');
    expect(await askVersion({ kind: 'global', where: dir, command: [process.execPath, cli] }, APP)).toBe('3.4.5');
    fs.writeFileSync(cli, 'console.log("termdrop 9.9.9\\u001b[2J")');
    expect(await askVersion({ kind: 'global', where: dir, command: [process.execPath, cli] }, APP)).toBe('9.9.9');
    fs.writeFileSync(cli, 'console.log("something else 1.2.3")');
    expect(await askVersion({ kind: 'global', where: dir, command: [process.execPath, cli] }, APP)).toBeNull();
    expect(await askVersion({ kind: 'path', where: '/nope', command: ['/nope/termdrop'] }, APP)).toBeNull();
  });
});

describe('versions and status', () => {
  const installed = (version: string): Detected => ({ state: 'installed', version, main: { kind: 'global', where: '/x', command: [] }, copies: [] });

  it('compares with the newest version', () => {
    expect(statusOf(installed('2.1.0'), '2.2.0')).toEqual({ kind: 'update', version: '2.1.0', latest: '2.2.0' });
    expect(statusOf(installed('2.10.0'), '2.9.0')).toEqual({ kind: 'current', version: '2.10.0' });
    expect(statusOf(installed('2.1.0'), null)).toEqual({ kind: 'current', version: '2.1.0' });
    expect(statusOf({ state: 'missing' }, '2.0.0')).toEqual({ kind: 'missing' });
    expect(statusOf(undefined, '2.0.0')).toEqual({ kind: 'missing' });
    expect(statusOf({ state: 'broken', reason: 'x', copies: [] }, '2.0.0')).toEqual({ kind: 'broken', reason: 'x' });
  });

  it('labels', () => {
    expect(statusLabel({ kind: 'missing' })).toBe('○ not installed');
    expect(statusLabel({ kind: 'current', version: '2.1.0' })).toBe('✓ 2.1.0');
    expect(statusLabel({ kind: 'update', version: '2.1.0', latest: '2.2.0' })).toBe('⬆ 2.1.0 → 2.2.0');
  });

  it('reads the newest version from package.json on GitHub and rejects anything odd', async () => {
    const gh = fakeGithub({ 'trigonyx/termdrop/package.json': { version: '2.2.0' }, 'trigonyx/odd/package.json': { version: '2.2.0\u001b[2J' } });
    expect(await fetchLatest('https://raw.githubusercontent.com/trigonyx/termdrop/main/package.json', gh)).toBe('2.2.0');
    expect(await fetchLatest('https://raw.githubusercontent.com/trigonyx/odd/main/package.json', gh)).toBeNull();
    expect(await fetchLatest('https://raw.githubusercontent.com/trigonyx/missing/main/package.json', gh)).toBeNull();
  });

  it('knows which Node an app needs', () => {
    expect(nodeSupports(APP, '22.1.0')).toBe(true);
    expect(nodeSupports(APP, '20.11.0')).toBe(false);
    expect(nodeSupports({ ...APP, node: undefined }, '18.0.0')).toBe(true);
  });
});
