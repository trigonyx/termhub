import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { compareVersions } from 'termcore/app/update';
import type { CatalogApp } from './catalog.js';
import { envPrefix } from '../core/paths.js';

/**
 * Is an app installed, where, and which version? Found the same way the apps find themselves:
 * npm's global folder, their own install folder `~/.<app>/app` (termcore's updates without
 * sudo), and the PATH (a source checkout with `npm link`, another Node installation …). The
 * version comes from the app itself (`<app> --version`).
 */

const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** One copy of an app on disk. */
export interface Copy {
  kind: 'global' | 'local' | 'path';
  /** its package folder (global/local) or the command (path) */
  where: string;
  /** what package.json says (global/local) */
  version?: string;
  /** how to start it: [program, ...args] */
  command: string[];
}

export type Detected =
  | { state: 'missing' }
  | {
      state: 'installed';
      version: string;
      /** the copy that starts (and gets updated) */
      main: Copy;
      copies: Copy[];
    }
  | {
      state: 'broken';
      reason: string;
      /** what's there, so it can be reinstalled or removed */
      copies: Copy[];
    };

export interface DetectOptions {
  /** npm's global node_modules (null: unknown) */
  globalRoot: string | null;
  /** the app's own install folder (`~/.<app>/app`) */
  appDir: string;
  /** PATH to search (default: process.env.PATH) */
  pathEnv?: string;
  /** asks a copy for its version (default: runs `<command> --version`) */
  ask?: (copy: Copy, app: CatalogApp) => Promise<string | null>;
}

/** package.json of an installed package, if it's really that app. */
function readPackage(root: string, id: string): { version: string; bin: string } | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown; bin?: unknown };
    if (pkg?.name !== id || typeof pkg.version !== 'string' || !VERSION_RE.test(pkg.version)) return null;
    const bins = pkg.bin as Record<string, unknown> | string | undefined;
    const bin = typeof bins === 'string' ? bins : typeof bins?.[id] === 'string' ? (bins[id] as string) : 'dist/cli.js';
    return { version: pkg.version, bin };
  } catch {
    return null;
  }
}

/** A package folder → a copy (or a reason why it's broken). */
function packageCopy(kind: 'global' | 'local', root: string, app: CatalogApp): Copy | { broken: string; where: string } | null {
  if (!fs.existsSync(root)) return null;
  const pkg = readPackage(root, app.id);
  if (!pkg) return { broken: `${root} has no valid package.json`, where: root };
  const cli = path.resolve(root, pkg.bin);
  if (!cli.startsWith(root + path.sep) || !fs.existsSync(cli)) return { broken: `${app.name}'s files in ${root} are incomplete`, where: root };
  return { kind, where: root, version: pkg.version, command: [process.execPath, cli] };
}

const realpath = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/** The command on the PATH, like `which`. */
export function findOnPath(bin: string, pathEnv = process.env.PATH ?? ''): string | null {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const file = path.join(dir, bin + ext);
      try {
        const st = fs.statSync(file);
        if (st.isFile() && (process.platform === 'win32' || st.mode & 0o111)) return file;
      } catch {
        // not here
      }
    }
  }
  return null;
}

/** Runs `<command> --version` and reads "<app> x.y.z" from it (null: it doesn't start). */
export function askVersion(copy: Copy, app: CatalogApp, timeoutMs = 10_000): Promise<string | null> {
  return new Promise((resolve) => {
    const [cmd, ...args] = copy.command;
    try {
      execFile(
        cmd!,
        [...args, '--version'],
        { timeout: timeoutMs, env: { ...process.env, [`${envPrefix(app.id)}_NO_UPDATE_CHECK`]: '1' }, shell: process.platform === 'win32' && copy.kind === 'path' },
        (err, stdout) => {
          const v = new RegExp(`${app.id.replace(/[-]/g, '\\-')} v?(\\d+\\.\\d+\\.\\d+)`).exec(String(stdout))?.[1];
          resolve(err || !v ? null : v);
        },
      );
    } catch {
      resolve(null);
    }
  });
}

export async function detectApp(app: CatalogApp, opts: DetectOptions): Promise<Detected> {
  const ask = opts.ask ?? ((c: Copy, a: CatalogApp) => askVersion(c, a));
  const copies: Copy[] = [];
  const broken: string[] = [];
  const add = (c: Copy | { broken: string; where: string } | null) => {
    if (!c) return;
    if ('broken' in c) broken.push(c.broken);
    else copies.push(c);
  };
  if (opts.globalRoot) add(packageCopy('global', path.join(opts.globalRoot, app.id), app));
  add(packageCopy('local', path.join(opts.appDir, 'node_modules', app.id), app));

  // on the PATH but none of the above: npm link, a source folder, another Node's global folder
  const onPath = findOnPath(app.bin, opts.pathEnv);
  if (onPath) {
    const real = realpath(onPath);
    const known = [opts.globalRoot ? path.join(opts.globalRoot, app.id) : null, path.join(opts.appDir, 'node_modules', app.id)]
      .filter((d): d is string => !!d)
      .map(realpath);
    if (!known.some((d) => real.startsWith(d + path.sep))) copies.push({ kind: 'path', where: onPath, command: [onPath] });
  }

  if (!copies.length) return broken.length ? { state: 'broken', reason: broken[0]!, copies } : { state: 'missing' };

  // the global command starts a newer copy from the app folder by itself (termcore's update)
  const global = copies.find((c) => c.kind === 'global');
  const local = copies.find((c) => c.kind === 'local');
  const pathCopy = copies.find((c) => c.kind === 'path');
  const main = global ?? local ?? pathCopy!;
  const version = await ask(main, app);
  if (!version) {
    return { state: 'broken', reason: `${app.bin} --version failed – the installation looks damaged`, copies };
  }
  // where updates go: the copy that actually runs
  const runs = local && global && local.version && global.version && compareVersions(local.version, global.version) > 0 ? local : main;
  return { state: 'installed', version, main: runs, copies };
}

/** What the Apps tab shows for an app. */
export type AppStatus =
  | { kind: 'missing' }
  | { kind: 'broken'; reason: string }
  | { kind: 'current'; version: string }
  | { kind: 'update'; version: string; latest: string };

export function statusOf(d: Detected | undefined, latest: string | null | undefined): AppStatus {
  if (!d || d.state === 'missing') return { kind: 'missing' };
  if (d.state === 'broken') return { kind: 'broken', reason: d.reason };
  if (latest && compareVersions(latest, d.version) > 0) return { kind: 'update', version: d.version, latest };
  return { kind: 'current', version: d.version };
}

/** "✓ 2.1.0", "⬆ 2.1.0 → 2.2.0", "○ not installed", "⚠ broken". */
export function statusLabel(s: AppStatus): string {
  switch (s.kind) {
    case 'missing':
      return '○ not installed';
    case 'broken':
      return '⚠ broken';
    case 'current':
      return `✓ ${s.version}`;
    case 'update':
      return `⬆ ${s.version} → ${s.latest}`;
  }
}

/** The newest version on GitHub: `version` in package.json of main (like every app's update check). */
export async function fetchLatest(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Promise<string | null> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const v = ((await res.json()) as { version?: unknown })?.version;
    return typeof v === 'string' && VERSION_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Does this Node.js run the app? */
export function nodeSupports(app: CatalogApp, nodeVersion = process.versions.node): boolean {
  return !app.node || Number(nodeVersion.split('.')[0]) >= app.node;
}
