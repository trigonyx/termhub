import { describe, expect, it } from 'vitest';
import { parseChangelog, sectionsBetween, whatsNewText } from '../src/apps/changelog.js';

const CHANGELOG = `# Changelog

## 2.2.0 – 2026-10-20

- Groups can have a topic
- Faster startup

## 2.1.1 – 2026-10-18

- Fix a crash when a friend renames

## 2.1.0 – 2026-10-16

- Profile colors

## 2.0.0 – 2026-10-14

- Shared core termcore
`;

describe("what's new", () => {
  it('reads the sections the release script writes', () => {
    const s = parseChangelog(CHANGELOG);
    expect(s.map((x) => x.version)).toEqual(['2.2.0', '2.1.1', '2.1.0', '2.0.0']);
    expect(s[0]).toEqual({ version: '2.2.0', date: '2026-10-20', body: '- Groups can have a topic\n- Faster startup' });
  });

  it('picks the sections after the installed version up to the newest', () => {
    const s = parseChangelog(CHANGELOG);
    expect(sectionsBetween(s, '2.1.0', '2.2.0').map((x) => x.version)).toEqual(['2.2.0', '2.1.1']);
    expect(sectionsBetween(s, '2.0.0', '2.1.1').map((x) => x.version)).toEqual(['2.1.1', '2.1.0']);
    // nothing new
    expect(sectionsBetween(s, '2.2.0', '2.2.0')).toEqual([]);
    expect(sectionsBetween(s, '2.3.0', '2.2.0')).toEqual([]);
    // nothing installed: only the newest version's section
    expect(sectionsBetween(s, null, '2.2.0').map((x) => x.version)).toEqual(['2.2.0']);
    // versions without a section (pushed without a release) are skipped
    expect(sectionsBetween(s, '1.0.0', '9.0.0').map((x) => x.version)).toEqual(['2.2.0', '2.1.1', '2.1.0', '2.0.0']);
    expect(sectionsBetween(s, null, '2.1.2')).toEqual([]);
  });

  it('copes with other headings, odd files and escape sequences', () => {
    expect(parseChangelog('')).toEqual([]);
    expect(parseChangelog('just text\nno sections')).toEqual([]);
    const odd = parseChangelog('## [v1.2.0] - 2026-01-01\n- a\n## 1.1.0\n- b \u001b[2J\n## not a version\n- c\n## 1.1.0\n- duplicate');
    expect(odd.map((x) => x.version)).toEqual(['1.2.0', '1.1.0', '1.1.0']);
    expect(odd[1]!.body).toBe('- b \n## not a version\n- c');
    expect(odd[1]!.body).not.toContain('\u001b');
    // a duplicate heading counts once
    expect(sectionsBetween(odd, '1.0.0', '1.2.0').map((x) => x.version)).toEqual(['1.2.0', '1.1.0']);
  });

  it('turns sections into panel text', () => {
    const s = sectionsBetween(parseChangelog(CHANGELOG), '2.1.0', '2.2.0');
    expect(whatsNewText('termchat', s)).toBe(
      '### termchat 2.2.0 _2026-10-20_\n\n- Groups can have a topic\n- Faster startup\n\n### termchat 2.1.1 _2026-10-18_\n\n- Fix a crash when a friend renames',
    );
    expect(whatsNewText('x', [{ version: '1.0.0', body: '' }])).toContain('Maintenance release');
  });
});
