import { readJson, writeJsonAtomic } from 'termcore/app/storage';
import { compareVersions } from 'termcore/app/update';

/**
 * Which version of each app termhub saw last time (`~/.termhub/hub/seen.json`). An app that got
 * newer since – updated by itself, or by termhub – gets a quiet "new in 2.2.0" until its
 * What's-new was opened.
 */
interface SeenFile {
  v: 1;
  versions: Record<string, string>;
}

const VERSION_RE = /^\d+\.\d+\.\d+$/;

export class Seen {
  private versions: Record<string, string>;

  constructor(private readonly file: string) {
    let raw: SeenFile | null = null;
    try {
      raw = readJson<SeenFile | null>(file, null);
    } catch {
      raw = null;
    }
    this.versions = {};
    for (const [id, v] of Object.entries(raw?.versions ?? {})) if (typeof v === 'string' && VERSION_RE.test(v)) this.versions[id] = v;
  }

  get(id: string): string | undefined {
    return this.versions[id];
  }

  /**
   * The version an app had last time if it's newer now (→ "new in"), else null. The very first
   * sighting is no news.
   */
  newerThanSeen(id: string, installed: string): string | null {
    const before = this.versions[id];
    return before && compareVersions(installed, before) > 0 ? before : null;
  }

  /** Remembers what's installed now. */
  mark(id: string, version: string | null): void {
    if (version === null) {
      if (!(id in this.versions)) return;
      delete this.versions[id];
    } else {
      if (this.versions[id] === version) return;
      this.versions[id] = version;
    }
    try {
      writeJsonAtomic(this.file, { v: 1, versions: this.versions } satisfies SeenFile);
    } catch {
      // only costs a hint
    }
  }
}
