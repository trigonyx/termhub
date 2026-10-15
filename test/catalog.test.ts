import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundledCatalog, cachedCatalog, catalogUrl, loadCatalog, parseCatalog, parseCatalogApp } from '../src/apps/catalog.js';
import { fakeGithub, tmpDir } from './helpers.js';

const CATALOG = 'trigonyx/termhub/apps.json';
const app = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, description: `${id} app`, repo: `trigonyx/${id}`, bin: id, node: 22, ...extra });

describe('catalog', () => {
  it('reads entries strictly and ignores fields it doesn’t know', () => {
    expect(parseCatalogApp({ ...app('termchat'), icon: '◆', screenshots: ['x'], future: { a: 1 } })).toEqual({
      id: 'termchat',
      name: 'termchat',
      description: 'termchat app',
      repo: 'trigonyx/termchat',
      bin: 'termchat',
      node: 22,
      icon: '◆',
    });
    // "22", ">=22" and missing work; nonsense drops only the field
    expect(parseCatalogApp(app('a', { node: '>=20' }))?.node).toBe(20);
    expect(parseCatalogApp(app('a', { node: 'soon' }))).not.toHaveProperty('node');
    // no bin: the id
    expect(parseCatalogApp({ id: 'keyrace', repo: 'trigonyx/keyrace' })).toMatchObject({ bin: 'keyrace', name: 'keyrace', description: '' });
    // escape sequences and long texts are cleaned
    expect(parseCatalogApp(app('a', { description: 'evil\u001b[2J text '.repeat(30), icon: '\u001b[31m' }))).toMatchObject({ description: expect.stringMatching(/^evil text/) });
    expect(parseCatalogApp(app('a', { icon: '\u001b[31m' }))).not.toHaveProperty('icon');
  });

  it('drops invalid entries, duplicates and termhub itself', () => {
    const apps = parseCatalog({
      v: 1,
      apps: [app('termchat'), app('termchat'), app('termhub'), app('Bad Id'), { id: 'x', repo: 'no-slash' }, { id: 'y', repo: 'a/b', bin: '../../etc' }, null, 'x', app('keyrace')],
    });
    expect(apps?.map((a) => a.id)).toEqual(['termchat', 'keyrace']);
    expect(parseCatalog({ apps: 'nope' })).toBeNull();
    expect(parseCatalog('<html>')).toBeNull();
    expect(parseCatalog(null)).toBeNull();
  });

  it('the built-in list has the suite apps', () => {
    expect(bundledCatalog().apps.map((a) => a.id)).toEqual(['termchat', 'keyrace', 'termdrop']);
    expect(catalogUrl({})).toBe('https://raw.githubusercontent.com/trigonyx/termhub/main/apps.json');
    expect(catalogUrl({ TERMHUB_RAW_URL: 'http://127.0.0.1:9/' })).toBe('http://127.0.0.1:9/trigonyx/termhub/main/apps.json');
  });

  it('loads from GitHub and caches; offline it’s the cache, else the built-in list', async () => {
    const cacheFile = path.join(tmpDir('cat'), 'hub', 'catalog.json');
    // a new app shows up without a termhub update
    const online = fakeGithub({ [CATALOG]: { v: 1, apps: [app('termchat'), app('newapp')] } });
    const c = await loadCatalog({ cacheFile, fetchImpl: online, now: () => 42 });
    expect(c).toMatchObject({ source: 'network', fetchedAt: 42 });
    expect(c.apps.map((a) => a.id)).toEqual(['termchat', 'newapp']);
    expect(fs.existsSync(cacheFile)).toBe(true);

    const offline = fakeGithub({ [CATALOG]: new Error('offline') });
    const cached = await loadCatalog({ cacheFile, fetchImpl: offline });
    expect(cached).toMatchObject({ source: 'cache', fetchedAt: 42 });
    expect(cached.apps.map((a) => a.id)).toEqual(['termchat', 'newapp']);

    // invalid JSON or an empty list never replaces the cache
    expect((await loadCatalog({ cacheFile, fetchImpl: fakeGithub({ [CATALOG]: '{nope' }) })).source).toBe('cache');
    expect((await loadCatalog({ cacheFile, fetchImpl: fakeGithub({ [CATALOG]: { v: 1, apps: [] } }) })).source).toBe('cache');
    expect((await loadCatalog({ cacheFile, fetchImpl: fakeGithub({}) })).source).toBe('cache'); // 404
    expect(cachedCatalog(cacheFile).apps).toHaveLength(2);

    // a broken cache: the built-in list
    fs.writeFileSync(cacheFile, '{garbage');
    const fallback = await loadCatalog({ cacheFile, fetchImpl: offline });
    expect(fallback.source).toBe('bundled');
    expect(fallback.apps.map((a) => a.id)).toEqual(['termchat', 'keyrace', 'termdrop']);
  });
});
