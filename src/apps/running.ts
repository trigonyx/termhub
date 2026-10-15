import { instanceRunning } from 'termcore/app/instance';
import { appLock } from '../core/paths.js';

/**
 * Which apps run right now with this data folder – each running instance holds a lock in its
 * own folder (termcore's instance lock), so this works for every version and every app.
 */
export async function runningApps(ids: string[], home?: string, env: NodeJS.ProcessEnv = process.env): Promise<Set<string>> {
  const found = await Promise.all(ids.map(async (id) => ((await instanceRunning(appLock(id, home, env))) ? id : null)));
  return new Set(found.filter((id): id is string => id !== null));
}
