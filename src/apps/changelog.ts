import { sanitizeText } from 'termcore/app/sanitize';
import { compareVersions } from 'termcore/app/update';

/**
 * "What's new": the sections of an app's CHANGELOG.md (written by termcore's release script,
 * `## 2.2.0 – 2026-10-20` and a bullet per change) between two versions.
 */
export interface ChangelogSection {
  version: string;
  date?: string;
  /** the section's lines without its heading */
  body: string;
}

const HEADING = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?(?:\s*[–—-]\s*(.+?))?\s*$/;
/** More than this is cut (a changelog from the network). */
const MAX_TEXT = 200_000;
const MAX_SECTIONS = 200;

export function parseChangelog(text: string): ChangelogSection[] {
  const clean = sanitizeText(text.slice(0, MAX_TEXT));
  const out: ChangelogSection[] = [];
  let current: { version: string; date?: string; lines: string[] } | null = null;
  const flush = () => {
    if (current) out.push({ version: current.version, ...(current.date ? { date: current.date } : {}), body: current.lines.join('\n').trim() });
  };
  for (const line of clean.split('\n')) {
    const h = HEADING.exec(line);
    if (h) {
      flush();
      if (out.length >= MAX_SECTIONS) return out;
      current = { version: h[1]!, ...(h[2] ? { date: h[2].trim() } : {}), lines: [] };
    } else if (/^#\s/.test(line)) {
      // the file's title – not part of any section
      continue;
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return out;
}

/**
 * The sections after `from` up to and including `to`, newest first. Without `from` (nothing
 * installed yet, or nothing new) it's just the section of `to`; versions missing from the file
 * are simply skipped.
 */
export function sectionsBetween(sections: ChangelogSection[], from: string | null | undefined, to: string): ChangelogSection[] {
  const seen = new Set<string>();
  const unique = sections.filter((s) => (seen.has(s.version) ? false : (seen.add(s.version), true)));
  const picked = from
    ? unique.filter((s) => compareVersions(s.version, from) > 0 && compareVersions(s.version, to) <= 0)
    : unique.filter((s) => s.version === to);
  return picked.sort((a, b) => compareVersions(b.version, a.version));
}

/** The text the What's-new panel shows (termcore's renderText: headings, bullets). */
export function whatsNewText(name: string, sections: ChangelogSection[]): string {
  return sections.map((s) => `### ${name} ${s.version}${s.date ? ` _${s.date}_` : ''}\n\n${s.body || '- Maintenance release'}`).join('\n\n');
}

export async function fetchChangelog(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Promise<ChangelogSection[] | null> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return parseChangelog(await res.text());
  } catch {
    return null;
  }
}
