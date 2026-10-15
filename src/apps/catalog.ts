import { readJson, writeJsonAtomic } from 'termcore/app/storage';
import { sanitizeText } from 'termcore/app/sanitize';
import bundled from '../../apps.json';
import { REPO } from '../core/version.js';

/**
 * The catalog: which apps termhub offers (`apps.json` in the termhub repo). termhub loads it from
 * GitHub on every start, so new apps show up without a termhub update; the last good copy is
 * cached, and the copy built into termhub is the fallback.
 */
export interface CatalogApp {
  /** npm package name = folder name (`~/.<id>`) */
  id: string;
  name: string;
  description: string;
  /** "owner/repo" on GitHub */
  repo: string;
  /** the command it installs */
  bin: string;
  /** lowest Node.js major version it runs on */
  node?: number;
  /** one character in front of the name */
  icon?: string;
}

export type CatalogSource = 'network' | 'cache' | 'bundled';

export interface Catalog {
  apps: CatalogApp[];
  source: CatalogSource;
  /** when the network copy was fetched (cache and network) */
  fetchedAt?: number;
}

const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const REPO_RE = /^[A-Za-z0-9_.-]{1,64}\/[A-Za-z0-9_.-]{1,100}$/;
const MAX_APPS = 50;

const text = (v: unknown, max: number) => (typeof v === 'string' ? [...sanitizeText(v).replace(/\s+/g, ' ').trim()].slice(0, max).join('') : '');

/** One entry, strictly checked: anything odd drops the entry, unknown fields are ignored. */
export function parseCatalogApp(raw: unknown): CatalogApp | null {
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (typeof o.id !== 'string' || !ID_RE.test(o.id) || o.id === 'termhub') return null;
  if (typeof o.repo !== 'string' || !REPO_RE.test(o.repo)) return null;
  const bin = typeof o.bin === 'string' ? o.bin : o.id;
  if (!ID_RE.test(bin)) return null;
  const node = typeof o.node === 'number' ? o.node : typeof o.node === 'string' ? Number(/^\D*(\d+)/.exec(o.node)?.[1]) : NaN;
  // one narrow character, nothing that could move the cursor
  const icon = typeof o.icon === 'string' ? text(o.icon, 1) : '';
  return {
    id: o.id,
    name: text(o.name, 32) || o.id,
    description: text(o.description, 120),
    repo: o.repo,
    bin,
    ...(Number.isInteger(node) && node > 0 && node < 100 ? { node } : {}),
    ...(icon && /^[^\p{Cc}\p{Cf}\p{Z}]$/u.test(icon) ? { icon } : {}),
  };
}

/** The apps of a catalog file; null if it isn't one at all (garbage, an error page …). */
export function parseCatalog(raw: unknown): CatalogApp[] | null {
  const list = (raw as { apps?: unknown })?.apps;
  if (!raw || typeof raw !== 'object' || !Array.isArray(list)) return null;
  const seen = new Set<string>();
  const out: CatalogApp[] = [];
  for (const entry of list.slice(0, MAX_APPS)) {
    const app = parseCatalogApp(entry);
    if (!app || seen.has(app.id)) continue;
    seen.add(app.id);
    out.push(app);
  }
  return out;
}

/** The catalog built into this termhub (apps.json at build time). */
export function bundledCatalog(): Catalog {
  return { apps: parseCatalog(bundled) ?? [], source: 'bundled' };
}

/** raw.githubusercontent.com, or `TERMHUB_RAW_URL` (tests, mirrors). */
export const rawBase = (env: NodeJS.ProcessEnv = process.env) => (env.TERMHUB_RAW_URL || 'https://raw.githubusercontent.com').replace(/\/+$/, '');

/** A file on the default branch of a repo. */
export const rawUrl = (repo: string, file: string, env?: NodeJS.ProcessEnv) => `${rawBase(env)}/${repo}/main/${file}`;

export const catalogUrl = (env: NodeJS.ProcessEnv = process.env) => env.TERMHUB_CATALOG_URL || rawUrl(REPO, 'apps.json', env);

interface CacheFile {
  v: 1;
  fetchedAt: number;
  catalog: unknown;
}

/** What's there without the network: the cached copy, else the built-in one. */
export function cachedCatalog(cacheFile: string): Catalog {
  let cache: CacheFile | null = null;
  try {
    cache = readJson<CacheFile | null>(cacheFile, null);
  } catch {
    cache = null;
  }
  const apps = parseCatalog(cache?.catalog);
  if (apps && apps.length) return { apps, source: 'cache', fetchedAt: typeof cache?.fetchedAt === 'number' ? cache.fetchedAt : undefined };
  return bundledCatalog();
}

/**
 * Loads the catalog from GitHub (5 s at most) and caches it; offline, on an error or with an
 * invalid file it's the cached copy, else the built-in one.
 */
export async function loadCatalog(opts: { cacheFile: string; url?: string; fetchImpl?: typeof fetch; timeoutMs?: number; now?: () => number }): Promise<Catalog> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(opts.url ?? catalogUrl(), { signal: AbortSignal.timeout(opts.timeoutMs ?? 5000) });
    if (res.ok) {
      const raw = (await res.json()) as unknown;
      const apps = parseCatalog(raw);
      if (apps && apps.length) {
        const fetchedAt = (opts.now ?? Date.now)();
        try {
          writeJsonAtomic(opts.cacheFile, { v: 1, fetchedAt, catalog: raw } satisfies CacheFile);
        } catch {
          // no cache then – the catalog itself is fine
        }
        return { apps, source: 'network', fetchedAt };
      }
    }
  } catch {
    // offline, timeout, not JSON …
  }
  return cachedCatalog(opts.cacheFile);
}
