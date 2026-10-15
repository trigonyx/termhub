import { spawn } from 'node:child_process';
import { createUpdater, writableDir, type InstallResult, type InstallTarget } from 'termcore/app/update';
import type { CatalogApp } from './catalog.js';
import type { Copy, Detected } from './detect.js';
import { envPrefix } from '../core/paths.js';

/**
 * Installing, updating and removing apps – with termcore's install logic: the release tarball
 * from GitHub into npm's global folder, or into `~/.<app>/app` when that folder isn't ours
 * (never sudo).
 */

/** termcore's updater for a catalog app (also one termcore doesn't know). */
export function appUpdater(app: CatalogApp, installed = '0.0.0') {
  return createUpdater({ name: app.id, envPrefix: envPrefix(app.id), version: installed, repo: app.repo });
}

export interface OpResult {
  ok: boolean;
  /** what to tell the user in one line */
  message: string;
  /** the hint for a known problem (installHint) */
  hint?: string;
}

const isRoot = () => process.getuid?.() === 0;

/** A fresh install goes global if npm's folder is ours, else into the app's own folder. */
export function freshTarget(globalRoot: string | null): InstallTarget {
  return !isRoot() && writableDir(globalRoot) ? 'global' : 'local';
}

const tail = (output: string, n = 4) => output.trim().split('\n').slice(-n).join('\n');

function failed(app: CatalogApp, what: string, res: InstallResult): OpResult {
  const hint = appUpdater(app).installHint(res.output) ?? undefined;
  return { ok: false, message: `${what} ${app.name} failed${res.output.trim() ? `:\n${tail(res.output)}` : ''}`, ...(hint ? { hint } : {}) };
}

export async function installApp(app: CatalogApp, opts: { latest: string | null; globalRoot: string | null; onOutput?: (s: string) => void }): Promise<OpResult> {
  const u = appUpdater(app);
  const target = freshTarget(opts.globalRoot);
  opts.onOutput?.(`Installing ${app.name}${opts.latest ? ` ${opts.latest}` : ''} into ${target === 'global' ? "npm's global folder" : u.appDir()} …\n`);
  const res = await u.runInstall({ inherit: false, version: opts.latest, target, onOutput: opts.onOutput });
  return res.ok ? { ok: true, message: `${app.name} is installed` } : failed(app, 'Installing', res);
}

/** Runs `<app> update` – for a copy termhub didn't install (npm link, another Node's folder). */
function selfUpdate(copy: Copy, onOutput?: (s: string) => void): Promise<InstallResult> {
  return new Promise((resolve) => {
    const [cmd, ...args] = copy.command;
    let output = '';
    try {
      const p = spawn(cmd!, [...args, 'update'], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
      const take = (d: Buffer) => {
        output += String(d);
        onOutput?.(String(d));
      };
      p.stdout.on('data', take);
      p.stderr.on('data', take);
      p.on('error', (err) => resolve({ ok: false, output: `${output}\n${err.message}` }));
      p.on('close', (code) => resolve({ ok: code === 0, output }));
    } catch (err) {
      resolve({ ok: false, output: (err as Error).message });
    }
  });
}

export async function updateApp(app: CatalogApp, detected: Detected, opts: { latest: string | null; globalRoot: string | null; onOutput?: (s: string) => void }): Promise<OpResult> {
  // broken: install again where it was (or fresh)
  if (detected.state !== 'installed') {
    const where = detected.state === 'broken' ? detected.copies.find((c) => c.kind !== 'path')?.kind : undefined;
    const u = appUpdater(app);
    const target = (where as InstallTarget | undefined) ?? freshTarget(opts.globalRoot);
    const res = await u.runInstall({ inherit: false, version: opts.latest, target, onOutput: opts.onOutput });
    return res.ok ? { ok: true, message: `${app.name} is installed again` } : failed(app, 'Reinstalling', res);
  }
  const main = detected.main;
  if (main.kind === 'path') {
    opts.onOutput?.(`${app.name} wasn't installed by termhub (${main.where}) – running \`${app.bin} update\` …\n`);
    const res = await selfUpdate(main, opts.onOutput);
    return res.ok ? { ok: true, message: `${app.name} updated itself` } : failed(app, 'Updating', res);
  }
  const u = appUpdater(app, detected.version);
  opts.onOutput?.(`Updating ${app.name} ${detected.version}${opts.latest ? ` → ${opts.latest}` : ''} …\n`);
  const res = await u.runInstall({ inherit: false, version: opts.latest, target: main.kind, onOutput: opts.onOutput });
  return res.ok ? { ok: true, message: `${app.name} is updated` } : failed(app, 'Updating', res);
}

/** Removes every copy termhub can remove. The app's data (~/.termhub, ~/.<app>) stays. */
export async function uninstallApp(app: CatalogApp, detected: Detected, opts: { onOutput?: (s: string) => void } = {}): Promise<OpResult> {
  const copies = detected.state === 'missing' ? [] : detected.copies;
  const u = appUpdater(app);
  const removable = copies.filter((c): c is Copy & { kind: InstallTarget } => c.kind !== 'path');
  const elsewhere = copies.filter((c) => c.kind === 'path');
  if (!removable.length) {
    return {
      ok: false,
      message: elsewhere.length
        ? `${app.name} at ${elsewhere[0]!.where} wasn't installed by termhub – remove it the way it was installed (npm rm -g ${app.id}, npm unlink …)`
        : `${app.name} isn't installed`,
    };
  }
  for (const c of removable) {
    opts.onOutput?.(c.kind === 'global' ? `npm rm -g ${app.id}\n` : `Removing ${u.appDir()}\n`);
    const res = await u.runUninstall({ target: c.kind, onOutput: opts.onOutput });
    if (!res.ok) return failed(app, 'Removing', res);
  }
  const note = elsewhere.length ? ` (another copy is still at ${elsewhere[0]!.where})` : '';
  return { ok: true, message: `${app.name} is removed – your data and friends stay${note}` };
}
