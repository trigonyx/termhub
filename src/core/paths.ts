import os from 'node:os';
import path from 'node:path';
import { basePaths, socketPath, type BasePaths } from 'termcore/app/paths';

export { tildify } from 'termcore/app/paths';

/**
 * termhub's paths. The shared data is `hub` (~/.termhub) like for every app; termhub's own
 * things (lock, socket, log, catalog cache, what's-new bookkeeping) live in its own subfolder
 * `~/.termhub/hub/`, so they never mix with the shared files.
 */
export interface Paths extends BasePaths {
  /** the catalog as last downloaded (apps.json) */
  catalogCache: string;
  /** installed versions termhub saw last time ("new in 2.2.0") */
  seen: string;
  /** `--home` as given (passed on to the apps termhub opens) */
  homeArg?: string;
}

export function resolvePaths(home?: string, env: NodeJS.ProcessEnv = process.env): Paths {
  const base = basePaths('termhub', home, env);
  const own = path.join(base.hub.dir, 'hub');
  return {
    ...base,
    home: own,
    config: path.join(own, 'config.json'),
    log: path.join(own, 'termhub.log'),
    lock: path.join(own, 'termhub.lock'),
    socket: socketPath(own, 'termhub'),
    catalogCache: path.join(own, 'catalog.json'),
    seen: path.join(own, 'seen.json'),
    ...(home ? { homeArg: path.resolve(home) } : {}),
  };
}

/**
 * Where an app keeps its own data – the same rule termcore's resolveHomes uses, for any app in
 * the catalog (also ones termcore doesn't know yet): `<home>/<app>` with --home or
 * $TERMHUB_HOME, `$<APP>_HOME`, else `~/.<app>`.
 */
export function appHome(id: string, home?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (home) return path.join(path.resolve(home), id);
  const own = env[`${envPrefix(id)}_HOME`];
  if (own) return path.resolve(own);
  if (env.TERMHUB_HOME) return path.join(path.resolve(env.TERMHUB_HOME), id);
  return path.join(os.homedir(), `.${id}`);
}

/** The lock an app's running instance holds (`~/.<app>/<app>.lock`). */
export const appLock = (id: string, home?: string, env?: NodeJS.ProcessEnv) => path.join(appHome(id, home, env), `${id}.lock`);

/** `termdrop` → `TERMDROP` (prefix of an app's environment variables). */
export const envPrefix = (id: string) => id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
