import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { render } from 'ink';
import { acquireLock, startInstanceServer, type Lock } from 'termcore/app/instance';
import { Hub, migrationNotice } from 'termcore/store/hub';
import { MOUSE_OFF, MouseFilterStdin } from 'termcore/ui/mouse';
import { ALT_SCREEN_OFF, ENTER_SCREEN, handOver, runInTerminal, SHOW_CURSOR } from './apps/launch.js';
import * as tasks from './cli/tasks.js';
import { resolvePaths } from './core/paths.js';
import { restartRequested, self } from './core/update.js';
import { VERSION } from './core/version.js';
import { newSession, Root } from './ui/App.js';

const HELP = `termhub – the hub of termchat, keyrace and termdrop: your profile and friends,
who's online where, shared settings, and installing, opening and updating the apps

Usage: termhub [options]
       termhub update            Update termhub
       termhub update --all      Update every installed app, then termhub
       termhub install <app>     Install an app (termchat, keyrace, termdrop …)
       termhub backup <file>     Export an encrypted backup of your identity and friends
       termhub restore <file>    Restore one (replaces identity and friends on this computer)

  --home <dir>      Data directory (default: ~/.termhub, shared by all apps; or $TERMHUB_HOME).
                    Apps opened from termhub get the same --home.
  --port <port>     TCP port (default: 5056, falls back if taken)
  --no-discovery    Don't search the network automatically
  --debug           Write a connection log to <home>/hub/termhub.log
  -h, --help        Show this help
  -v, --version     Show the version
`;

async function main(): Promise<void> {
  let values;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        home: { type: 'string' },
        port: { type: 'string' },
        'no-discovery': { type: 'boolean' },
        debug: { type: 'boolean' },
        all: { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      strict: true,
    }));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP}`);
    process.exit(2);
  }
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`termhub ${VERSION}\n`);
    return;
  }
  const paths = resolvePaths(values.home);
  const [cmd, arg, ...extra] = positionals;
  if (cmd) {
    const usage = (u: string): never => {
      process.stderr.write(`Usage: ${u}\n`);
      process.exit(2);
    };
    if (extra.length) usage(`termhub ${cmd} …`);
    switch (cmd) {
      case 'update':
        if (arg) usage('termhub update [--all]');
        process.exit(values.all ? await tasks.updateAll(paths) : await tasks.updateSelf());
      case 'install':
        process.exit(await tasks.install(paths, arg ?? usage('termhub install <app>')));
      case 'backup':
        process.exit(await tasks.backup(paths, arg ?? usage('termhub backup <file>')));
      case 'restore':
        process.exit(await tasks.restore(paths, arg ?? usage('termhub restore <file>'), { yes: values.yes }));
      default:
        process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
        process.exit(2);
    }
  }

  let port: number | undefined;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`Invalid port: ${values.port}\n`);
      process.exit(2);
    }
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('termhub needs an interactive terminal.\n');
    process.exit(1);
  }

  // one termhub per data folder
  let lock: Lock;
  try {
    const got = await acquireLock(paths.lock, paths.socket);
    if (!('release' in got)) {
      process.stderr.write(`termhub is already open in another window (pid ${got.holder.pid}).\n`);
      process.exit(1);
    }
    lock = got;
  } catch (err) {
    process.stderr.write(`Couldn't start termhub: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // first start of the suite's 2.x: identity, name and friends of the old apps move into ~/.termhub
  let notice: string | undefined;
  try {
    const report = Hub.prepare(paths.hub);
    if (report.migrated) notice = migrationNotice(report.friends);
  } catch (err) {
    lock.release();
    process.stderr.write(`Couldn't read your profile in ${paths.hub.dir}: ${(err as Error).message}\n`);
    process.exit(1);
  }
  try {
    await startInstanceServer(paths.socket);
  } catch {
    // a second start then only sees the lock – it still can't start
  }

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    lock.release();
    if (process.platform !== 'win32') fs.rmSync(paths.socket, { force: true });
    process.stdout.write(MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
  };
  process.stdout.write(ENTER_SCREEN);
  process.on('exit', restore);
  const crash = (err: unknown) => {
    restore();
    process.stderr.write(`\ntermhub crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  };
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);
  for (const sig of ['SIGTERM', 'SIGHUP'] as const) process.on(sig, () => process.exit(0));

  const options = { port, discovery: !values['no-discovery'], debug: values.debug };
  const session = newSession();
  // Render, and whenever the UI asks to open an app: leave the screen, run it, come back.
  for (let first = true; ; first = false) {
    const stdin = new MouseFilterStdin(process.stdin);
    const app = render(<Root paths={paths} options={options} session={session} notice={first ? notice : undefined} />, {
      exitOnCtrlC: false,
      patchConsole: true,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });
    try {
      await app.waitUntilExit();
    } catch (err) {
      crash(err);
    }
    const launch = session.launch;
    session.launch = null;
    if (!launch || !session.store) {
      stdin.detach();
      break;
    }
    const store = session.store;
    store.childRunning = true;
    const r = await handOver({ write: (s) => process.stdout.write(s), detach: () => stdin.detach() }, () => runInTerminal(launch.command, launch.args));
    store.childRunning = false;
    session.notice = r.error
      ? { text: `${launch.name} didn't start: ${r.error}`, kind: 'error' }
      : r.code
        ? { text: `${launch.name} ended with an error (exit code ${r.code})`, kind: 'error' }
        : { text: `Back from ${launch.name}`, kind: 'info' };
    await store.afterLaunch(launch.id);
  }

  restore();
  if (!restartRequested()) process.exit(0);
  // after an update of termhub: start the new version in this terminal
  const child = spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', () => process.exit(0));
}

/**
 * Updates without write access to npm's global folder land in ~/.termhub/app. If a newer
 * copy is there, it runs instead of this one (with the same arguments).
 */
async function start(): Promise<void> {
  const local = self.installKind() === 'npm' ? self.newerLocalInstall(fileURLToPath(import.meta.url)) : null;
  if (local) {
    try {
      await import(pathToFileURL(local.cli).href);
      return;
    } catch (err) {
      process.stderr.write(`Couldn't start termhub ${local.version} (${(err as Error).message}) – starting ${VERSION} instead.\n`);
    }
  }
  await main();
}

void start();
