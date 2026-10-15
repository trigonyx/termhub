import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePaths, type Paths } from '../src/core/paths.js';
import { HubStore, type StoreOptions } from '../src/core/store.js';

export const tmpDir = (tag = 'test') => fs.mkdtempSync(path.join(os.tmpdir(), `termhub-${tag}-`));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until(cond: () => boolean, ms = 6000, what = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(10);
  }
}

export const FAKE_NPM = path.resolve('test/fixtures/fake-npm.mjs');
export const FAKE_APP = path.resolve('test/fixtures/fake-app.mjs');

/** A person's data folder with a profile (never the real ~/.termhub). */
export function profile(name: string, color?: string): Paths {
  const paths = resolvePaths(tmpDir(name.toLowerCase()), {});
  HubStore.createProfile(paths, name, color);
  return paths;
}

/** A fake GitHub: `files['owner/repo/file']` is served for raw.githubusercontent.com/owner/repo/main/file. */
export function fakeGithub(files: Record<string, unknown>): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/main\/(.+)$/.exec(u);
    const key = m ? `${m[1]}/${m[2]}` : u;
    if (!(key in files)) return { ok: false, status: 404, json: async () => ({}), text: async () => 'Not Found' };
    const body = files[key];
    if (body instanceof Error) throw body;
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  }) as unknown as typeof fetch & { calls: string[] };
  f.calls = calls;
  return f;
}

/** Fake npm (TERMHUB_NPM) installing into temp folders; returns the folders and its call log. */
export function fakeNpm(apps: string[] = ['termchat', 'keyrace', 'termdrop']) {
  const global = tmpDir('npm-global');
  const log = path.join(tmpDir('npm-log'), 'calls.jsonl');
  const env: Record<string, string> = { TERMHUB_NPM: FAKE_NPM, FAKE_NPM_GLOBAL: global, FAKE_NPM_LOG: log };
  for (const a of apps) env[`${a.toUpperCase()}_APP_DIR`] = tmpDir(`${a}-local`);
  Object.assign(process.env, env);
  return {
    global,
    env,
    localDir: (app: string) => env[`${app.toUpperCase()}_APP_DIR`]!,
    calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[]) : []),
    restore: () => {
      for (const k of [...Object.keys(env), 'FAKE_NPM_VERSION', 'FAKE_NPM_DENY_GLOBAL', 'FAKE_NPM_FAIL']) delete process.env[k];
    },
  };
}

/** An installed app package, the way npm leaves it (cli prints "<name> <version>"). */
export function fakePackage(root: string, name: string, version: string, opts: { cli?: boolean; pkgName?: string } = {}): string {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: opts.pkgName ?? name, version, bin: { [name]: 'dist/cli.js' } }));
  const cli = path.join(dir, 'dist', 'cli.js');
  if (opts.cli !== false) fs.writeFileSync(cli, `console.log(${JSON.stringify(`${name} ${version}`)});\n`);
  return dir;
}

export class Stores {
  readonly all: HubStore[] = [];

  make(paths: Paths, opts: Partial<StoreOptions> = {}): HubStore {
    const s = new HubStore({ paths, port: 0, discovery: false, offline: true, dialIntervalMs: 100, globalRoot: async () => null, pathEnv: '', ...opts });
    this.all.push(s);
    return s;
  }

  async boot(name: string, opts: Partial<StoreOptions> = {}): Promise<HubStore> {
    const s = this.make(profile(name), opts);
    await s.start();
    return s;
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.all.splice(0).map((s) => s.stop()));
  }
}
