import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { instanceRunning } from 'termcore/app/instance';
import { tildify } from 'termcore/app/paths';
import { npmGlobalRoot } from 'termcore/app/update';
import { formatId } from 'termcore/net/identity';
import { loadCatalog, rawUrl, type CatalogApp } from '../apps/catalog.js';
import { detectApp, fetchLatest, nodeSupports, statusOf } from '../apps/detect.js';
import { appUpdater, freshTarget } from '../apps/install.js';
import { runningApps } from '../apps/running.js';
import { decryptBackup, exportBackup, MIN_PASSPHRASE, restoreBackup } from '../core/backup.js';
import type { Paths } from '../core/paths.js';
import { compareVersions, self } from '../core/update.js';
import { REPO_CONFIGURED, VERSION } from '../core/version.js';
import { readLine, readSecret } from './secret.js';

/**
 * termhub's commands without a UI: `update`, `update --all`, `install <app>`, `backup`,
 * `restore`. npm's output goes straight to the terminal.
 */

const out = (s: string) => process.stdout.write(s);
const err = (s: string) => process.stderr.write(s);
const plain = (s: string) => s.replace(/`/g, '');

/** `termhub update`: termhub itself, like every app's `<app> update`. */
export async function updateSelf(): Promise<number> {
  if (self.installKind() === 'source') {
    out(`${plain(self.SOURCE_HINT)}\n`);
    return 1;
  }
  if (!REPO_CONFIGURED) {
    err("This build doesn't know its GitHub repo yet (package.json → repository).\n");
    return 1;
  }
  out('Checking for updates …\n');
  const latest = await self.fetchLatestVersion();
  if (latest && compareVersions(latest, VERSION) <= 0) {
    out(`termhub ${VERSION} is up to date.\n`);
    return 0;
  }
  out(latest ? `Updating termhub ${VERSION} → ${latest} …\n` : `Couldn't check the latest version – installing anyway …\n`);
  const res = await self.runInstall({ inherit: true, version: latest });
  if (res.ok) {
    const installed = await self.installedVersion();
    if (installed && latest && compareVersions(installed, latest) < 0) {
      err(`\n${plain(self.staleInstallHint(installed))}\n`);
      return 1;
    }
    out(`\nDone${installed ? ` – termhub ${installed} is installed` : ''}. Start it with: termhub\n`);
    return 0;
  }
  err(`\nUpdate failed. ${self.installHint(res.output) ?? 'See the npm output above.'}\n`);
  return 1;
}

async function catalog(paths: Paths): Promise<CatalogApp[]> {
  const c = await loadCatalog({ cacheFile: paths.catalogCache, url: process.env.TERMHUB_CATALOG_URL || undefined });
  if (c.source !== 'network') out(`(GitHub not reachable – using the ${c.source === 'cache' ? 'cached' : 'built-in'} app list)\n`);
  return c.apps;
}

/** `termhub update --all`: every installed app with a newer version, then termhub. */
export async function updateAll(paths: Paths): Promise<number> {
  const apps = await catalog(paths);
  const globalRoot = await npmGlobalRoot();
  const running = await runningApps(apps.map((a) => a.id), paths.homeArg);
  let failed = 0;
  let any = false;
  for (const app of apps) {
    const d = await detectApp(app, { globalRoot, appDir: appUpdater(app).appDir() });
    if (d.state === 'missing') continue;
    const latest = await fetchLatest(rawUrl(app.repo, 'package.json'));
    const s = statusOf(d, latest);
    if (s.kind === 'current') {
      out(`✓ ${app.name} ${s.version} is up to date\n`);
      continue;
    }
    any = true;
    out(`\n━━━ ${app.name} ${s.kind === 'update' ? `${s.version} → ${s.latest}` : '(broken – installing again)'} ━━━\n`);
    if (running.has(app.id)) {
      err(`${app.name} is open right now – quit it, then run termhub update --all again.\n`);
      failed++;
      continue;
    }
    const main = d.state === 'installed' ? d.main : null;
    let res;
    if (main?.kind === 'path') {
      const [cmd, ...args] = main.command;
      const r = spawnSync(cmd!, [...args, 'update'], { stdio: 'inherit', shell: process.platform === 'win32' });
      res = { ok: r.status === 0, output: '' };
    } else {
      const target = main ? main.kind : d.state === 'broken' ? ((d.copies.find((c) => c.kind !== 'path')?.kind as 'global' | 'local' | undefined) ?? freshTarget(globalRoot)) : freshTarget(globalRoot);
      res = await appUpdater(app, d.state === 'installed' ? d.version : '0.0.0').runInstall({ inherit: true, version: latest, target: target as 'global' | 'local' });
    }
    const after = await detectApp(app, { globalRoot, appDir: appUpdater(app).appDir() });
    if (res.ok && after.state === 'installed' && (!latest || compareVersions(after.version, latest) >= 0)) out(`✓ ${app.name} ${after.version}\n`);
    else {
      failed++;
      err(`✗ ${app.name} was not updated. ${appUpdater(app).installHint(res.output) ?? ''}\n`);
    }
  }
  out(`\n━━━ termhub ━━━\n`);
  // a source checkout doesn't update itself – that's no failure of the others
  const selfCode = self.installKind() === 'source' ? (out(`${plain(self.SOURCE_HINT)}\n`), 0) : await updateSelf();
  if (!any) out('All apps are up to date.\n');
  return failed || selfCode ? 1 : 0;
}

/** `termhub install <app>`. */
export async function install(paths: Paths, name: string): Promise<number> {
  const apps = await catalog(paths);
  const app = apps.find((a) => a.id === name.toLowerCase() || a.name.toLowerCase() === name.toLowerCase());
  if (!app) {
    err(`No app called ${name}. Apps: ${apps.map((a) => a.id).join(', ')}\n`);
    return 2;
  }
  if (!nodeSupports(app)) {
    err(`${app.name} needs Node.js ${app.node} or newer (this is ${process.versions.node}).\n`);
    return 1;
  }
  const globalRoot = await npmGlobalRoot();
  const before = await detectApp(app, { globalRoot, appDir: appUpdater(app).appDir() });
  if (before.state === 'installed') {
    out(`${app.name} ${before.version} is already installed. Update it with: termhub update --all\n`);
    return 0;
  }
  const latest = await fetchLatest(rawUrl(app.repo, 'package.json'));
  const target = freshTarget(globalRoot);
  out(`Installing ${app.name}${latest ? ` ${latest}` : ''} …\n`);
  const res = await appUpdater(app).runInstall({ inherit: true, version: latest, target });
  const after = await detectApp(app, { globalRoot, appDir: appUpdater(app).appDir() });
  if (res.ok && after.state === 'installed') {
    out(`\nDone – ${app.name} ${after.version} is installed. Start it with: ${app.bin} (or from termhub)\n`);
    return 0;
  }
  err(`\nInstalling ${app.name} failed. ${appUpdater(app).installHint(res.output) ?? 'See the npm output above.'}\n`);
  return 1;
}

async function passphrase(confirm: boolean): Promise<string | null> {
  const env = process.env.TERMHUB_PASSPHRASE;
  if (env) return env;
  for (;;) {
    const first = await readSecret('Passphrase: ');
    if (first === null) return null;
    if (!confirm) return first;
    if ([...first].length < MIN_PASSPHRASE) {
      err(`At least ${MIN_PASSPHRASE} characters, please.\n`);
      continue;
    }
    const second = await readSecret('Again: ');
    if (second === null) return null;
    if (second === first) return first;
    err("They don't match – once more.\n");
  }
}

/** `termhub backup <file>`. */
export async function backup(paths: Paths, file: string): Promise<number> {
  if (!fs.existsSync(paths.hub.identity)) {
    err('There is no profile to back up yet – start termhub (or any app) once first.\n');
    return 1;
  }
  out('The backup holds your identity, profile, friends and settings (no chats or other app data),\nencrypted with a passphrase. Without the passphrase nobody – you neither – can open it.\n');
  const pass = await passphrase(true);
  if (!pass) return 1;
  try {
    const target = path.resolve(file);
    const s = exportBackup(paths.hub, target, pass, VERSION);
    out(`Saved ${s.name} (${formatId(s.id)}) with ${s.friends === 1 ? '1 friend' : `${s.friends} friends`} to ${tildify(target)}\n`);
    return 0;
  } catch (e) {
    err(`${(e as Error).message}\n`);
    return 1;
  }
}

/** `termhub restore <file>` – only while no app runs, after a clear warning. */
export async function restore(paths: Paths, file: string, opts: { yes?: boolean } = {}): Promise<number> {
  const running = await runningApps(['termhub', 'termchat', 'keyrace', 'termdrop'], paths.homeArg);
  // termhub's own lock lives in its subfolder
  if (await instanceRunning(paths.lock)) running.add('termhub');
  if (running.size) {
    err(`Quit ${[...running].join(', ')} first – a restore needs every app closed.\n`);
    return 1;
  }
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    err(`Can't read ${file}: ${(e as Error).message}\n`);
    return 1;
  }
  out('This replaces your identity and friends on this computer with the ones in the backup.\n');
  if (fs.existsSync(paths.hub.identity)) out(`(The current ones are kept as a copy in ${tildify(paths.hub.legacyDir)}.)\n`);
  if (!opts.yes && !process.env.TERMHUB_PASSPHRASE) {
    const answer = await readLine('Type "yes" to go on: ');
    if (answer.toLowerCase() !== 'yes') {
      out('Nothing changed.\n');
      return 1;
    }
  }
  const pass = await passphrase(false);
  if (!pass) return 1;
  try {
    const content = decryptBackup(text, pass);
    const r = restoreBackup(paths.hub, content);
    out(`Restored ${r.summary.name} (${formatId(r.summary.id)}) with ${r.summary.friends === 1 ? '1 friend' : `${r.summary.friends} friends`}.\n`);
    if (r.savedTo) out(`The previous profile is in ${tildify(r.savedTo)}.\n`);
    return 0;
  } catch (e) {
    err(`${(e as Error).message}\n`);
    return 1;
  }
}
