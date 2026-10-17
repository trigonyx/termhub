import { render } from 'ink-testing-library';
import stringWidth from 'string-width';
import { afterEach, describe, expect, it } from 'vitest';
import { whatsNewText } from '../src/apps/changelog.js';
import { resolvePaths } from '../src/core/paths.js';
import type { HubStore } from '../src/core/store.js';
import { newSession, Main, Root } from '../src/ui/App.js';
import { LOGO, LOGO_SMALL, paintLine } from '../src/ui/components/Banner.js';
import { TextPanel } from '../src/ui/components/TextPanel.js';
import { profile, Stores, tmpDir, until } from './helpers.js';

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const frame = (r: { lastFrame(): string | undefined }) => strip(r.lastFrame() ?? '');

const stores = new Stores();
afterEach(() => stores.stopAll());

const BOB = 'BOBBOBBOBBOBBOBBOBBO';
const CARL = 'CARLCARLCARLCARLCARL';
const DANA = 'DANADANADANADANADANA';

function hubWithFriends(): HubStore {
  const s = stores.make(profile('Ada', '#73daca'));
  s.contacts.upsert(BOB, { publicKey: '', name: 'Bob', state: 'accepted', color: '#ff9e64', status: 'busy', statusMsg: 'deep work' });
  s.contacts.upsert(CARL, { publicKey: '', name: 'Carl', state: 'incoming' });
  s.contacts.upsert(DANA, { publicKey: '', name: 'Dana', state: 'blocked' });
  // Bob is online in termchat and keyrace (as discovery would tell)
  s.appsOf = (id: string) => (id === BOB ? ['termchat', 'keyrace'] : []);
  return s;
}

function main(store: HubStore, tab: 'friends' | 'apps' | 'profile' | 'settings' = 'friends', width = 100, rows = 36) {
  const session = newSession(tab);
  session.store = store;
  return render(<Main store={store} session={session} width={width} height={rows - 1} rows={rows} quit={() => {}} launch={() => {}} reload={() => {}} />);
}

describe('termhub screens', () => {
  it('the logo is one block, the small one too; your color only in the shadows', () => {
    expect(new Set(LOGO.map((l) => stringWidth(l))).size).toBe(1);
    expect(new Set(LOGO_SMALL.map((l) => stringWidth(l))).size).toBe(1);
    const painted = paintLine('█╗', 0, 2, '#ff0000', '#00ff00', -1, false);
    expect(painted).toContain('█');
    expect(strip(painted)).toBe('█╗');
  });

  it('Friends: requests, friends with the apps they’re in, blocked folded away, details', async () => {
    const s = hubWithFriends();
    const r = main(s);
    await tick();
    const f = frame(r);
    expect(f).toContain('REQUESTS · 1');
    expect(f).toContain('Carl');
    expect(f).toContain('wants to be friends');
    expect(f).toContain('FRIENDS · 1 ONLINE');
    expect(f).toContain('termchat · keyrace');
    expect(f).toContain('busy · deep');
    expect(f).toContain('BLOCKED · 1');
    expect(f).toContain('show the blocked person');
    expect(f).not.toContain('Dana');
    // the selected request's details and keys
    expect(f).toContain('wants to be friends');
    expect(f).toContain('enter accept · x decline');
    // down to Bob: his details
    r.stdin.write('j');
    await tick();
    expect(frame(r)).toContain('Safety code');
    expect(frame(r)).toMatch(/Online\s+● termchat · keyrace/);
    // unfold the blocked
    r.stdin.write('j');
    await tick();
    r.stdin.write('\r');
    await tick();
    expect(frame(r)).toContain('Dana');
    expect(frame(r)).toContain('▾ hide');
    r.unmount();
  });

  it('accepting a request moves it to friends', async () => {
    const s = hubWithFriends();
    const r = main(s);
    await tick();
    r.stdin.write('\r');
    await until(() => s.contacts.get(CARL)?.state === 'accepted', 2000, 'accepted');
    await tick();
    expect(frame(r)).not.toContain('REQUESTS');
    r.unmount();
  });

  it('Apps: status per app, termhub itself, keys; the install panel', async () => {
    const s = stores.make(profile('Ada'));
    const tc = s.entry('termchat')!;
    tc.detected = { state: 'installed', version: '2.1.0', main: { kind: 'global', where: '/g/termchat', command: [] }, copies: [] };
    tc.latest = '2.2.0';
    tc.status = { kind: 'update', version: '2.1.0', latest: '2.2.0' };
    const kr = s.entry('keyrace')!;
    kr.detected = { state: 'missing' };
    kr.latest = '2.0.0';
    const td = s.entry('termdrop')!;
    td.detected = { state: 'installed', version: '2.0.0', main: { kind: 'local', where: '/x/node_modules/termdrop', command: [] }, copies: [] };
    td.latest = '2.0.0';
    td.status = { kind: 'current', version: '2.0.0' };
    td.running = true;
    td.newIn = { from: '1.0.0', to: '2.0.0' };
    s.self.latest = '0.0.0';
    const r = main(s, 'apps');
    await tick();
    let f = frame(r);
    expect(f).toContain('⬆ 2.1.0 → 2.2.0');
    expect(f).toContain('○ not installed');
    expect(f).toContain('✓ 2.0.0');
    expect(f).toContain('running');
    expect(f).toContain('new in 2.0.0');
    expect(f).toContain('termhub (this app)');
    expect(f).toContain('APPS · 1 UPDATE');
    expect(f).toContain('enter open · u update · x remove');
    expect(f).toContain('Apps ⬆1');

    // an install in progress: steps and npm's output, then the result
    s.task = { title: 'Installing keyrace', steps: [{ id: 'keyrace', label: 'keyrace', status: 'running' }], log: ['npm http fetch GET 200 https://github.com/…', 'added 1 package'], running: true };
    s.changed();
    await tick();
    f = frame(r);
    expect(f).toContain('Installing keyrace …');
    expect(f).toContain('added 1 package');
    s.task = { ...s.task, running: false, ok: false, message: 'Installing keyrace failed', hint: 'npm isn’t allowed to write – fix it with sudo chown', steps: [{ id: 'keyrace', label: 'keyrace', status: 'failed' }] };
    s.changed();
    await tick();
    f = frame(r);
    expect(f).toContain('✗ Installing keyrace failed');
    expect(f).toContain('sudo chown');
    expect(f).toContain('esc close');
    r.stdin.write('\u001b');
    await tick(80);
    expect(s.task).toBeNull();
    r.unmount();
  });

  it('Apps: badges count what each app has waiting – messages, invites, files', async () => {
    const s = stores.make(profile('Ada'));
    const until = Date.now() + 60_000;
    s.hub.inbox.update((box) => {
      box.waiting = { termchat: { n: 2 }, termdrop: { n: 5, live: true } };
      box.notices = [
        { id: 'm1', app: 'termchat', kind: 'msg', title: 'Bob', body: 'hi', ts: 1, until, from: BOB },
        { id: 'r1', app: 'keyrace', kind: 'invite', title: 'Bob', body: 'invites you to a race', ts: 2, until, from: BOB },
        { id: 'n1', app: 'termdrop', kind: 'offer', title: 'Bob', body: 'note', ts: 3, until, from: BOB, local: true },
      ];
    });
    expect(s.badge('termchat')).toBe(3);
    expect(s.badge('keyrace')).toBe(1);
    // termdrop's count only means something while it runs; a local note is never counted
    expect(s.badge('termdrop')).toBe(0);
    s.entry('termdrop')!.running = true;
    expect(s.badge('termdrop')).toBe(5);
    const r = main(s, 'apps');
    await tick();
    const f = frame(r);
    expect(f).toContain('Apps 9');
    expect(f).toMatch(/termchat .* 3   │/);
    expect(f).toContain('3 unread messages');
    r.unmount();
  });

  it('opening an app that runs elsewhere is refused with a hint', async () => {
    const s = stores.make(profile('Ada'));
    const td = s.entry('termchat')!;
    td.detected = { state: 'installed', version: '2.0.0', main: { kind: 'global', where: '/g', command: ['x'] }, copies: [] };
    td.running = true;
    const r = main(s, 'apps');
    await tick();
    r.stdin.write('\r');
    await tick();
    expect(frame(r)).toContain('already open in another window');
    r.unmount();
  });

  it("What's new opens as a scrollable panel", async () => {
    const text = whatsNewText('termchat', [
      { version: '2.2.0', date: '2026-10-20', body: '- Topics for groups' },
      { version: '2.1.1', body: '- A fix' },
    ]);
    let closed = false;
    const r = render(<TextPanel title="What's new in termchat 2.2.0 (you have 2.1.0)" text={text} width={80} height={14} onClose={() => (closed = true)} />);
    await tick();
    const f = frame(r);
    expect(f).toContain("What's new in termchat 2.2.0");
    expect(f).toContain('termchat 2.2.0');
    expect(f).toContain('Topics for groups');
    expect(f).toContain('termchat 2.1.1');
    r.stdin.write('\u001b');
    await tick();
    expect(closed).toBe(true);
  });

  it('Profile: name, color with a live preview, status, ID and backup', async () => {
    const s = stores.make(profile('Ada'));
    const r = main(s, 'profile');
    await tick();
    let f = frame(r);
    for (const t of ['Name', 'Ada', 'Color', 'from your ID', 'Status', 'available', 'Status message', 'Your ID', 'Export a backup', 'Restore a backup']) expect(f).toContain(t);
    r.stdin.write('j');
    await tick();
    r.stdin.write('\r');
    await tick();
    f = frame(r);
    expect(f).toContain('[██]');
    expect(f).toContain('←→ choose · enter apply');
    r.stdin.write('\u001b[C');
    await tick();
    expect(frame(r)).toContain('orange');
    // tab doesn't switch tabs while choosing
    r.stdin.write('\r');
    await tick();
    expect(s.profile.color).toBe('#ff9e64');
    // down to the status: what dnd does
    r.stdin.write('j');
    await tick();
    expect(frame(r)).toContain('do not disturb');
    expect(frame(r)).toContain('termdrop offers');
    r.unmount();
  });

  it('Settings: accent with a preview, animations, notifications, reset', async () => {
    const s = stores.make(profile('Ada'));
    const r = main(s, 'settings');
    await tick();
    let f = frame(r);
    for (const t of ['Accent color', 'claude orange (default)', 'Animations', 'brief', 'Desktop notifications', 'on', 'Reset to defaults', 'termchat  v2.1.0']) expect(f).toContain(t);
    r.stdin.write('\r');
    await tick();
    r.stdin.write('\u001b[C');
    await tick();
    r.stdin.write('\u001b[C');
    await tick();
    f = frame(r);
    expect(f).toContain('Preview');
    expect(f).toContain('orange');
    r.stdin.write('\r');
    await tick();
    expect(s.settings.accent).toBe('#ff9e64');
    r.stdin.write('j');
    await tick();
    r.stdin.write('j');
    await tick();
    r.stdin.write('\r');
    await tick();
    expect(s.settings.notifications).toBe(false);
    r.unmount();
  });

  it('tabs switch with tab, shift+tab and 1–4; / opens the commands; ? the help', async () => {
    const s = stores.make(profile('Ada'));
    const r = main(s);
    await tick();
    expect(frame(r)).toContain('FRIENDS');
    r.stdin.write('\t');
    await tick();
    expect(frame(r)).toContain('APPS');
    r.stdin.write('\u001b[Z');
    await tick();
    r.stdin.write('\u001b[Z');
    await tick();
    expect(frame(r)).toContain('Accent color');
    r.stdin.write('3');
    await tick();
    expect(frame(r)).toContain('Status message');
    r.stdin.write('/');
    await tick();
    r.stdin.write('acc');
    await tick();
    expect(frame(r)).toContain('/accent');
    r.stdin.write('\u001b');
    await tick();
    r.stdin.write('?');
    await tick();
    expect(frame(r)).toContain('Everywhere');
    r.unmount();
  });

  it('narrow terminals stack the panels', async () => {
    const s = hubWithFriends();
    const r = main(s, 'friends', 62, 24);
    await tick();
    const lines = frame(r).split('\n');
    expect(lines.every((l) => stringWidth(l) <= 62)).toBe(true);
    expect(frame(r)).toContain('Carl');
    r.unmount();
  });
});

describe('first start', () => {
  it('onboarding: name and color, then the hub', async () => {
    const paths = resolvePaths(tmpDir('first'), {});
    const session = newSession();
    const r = render(<Root paths={paths} options={{ port: 0, discovery: false, offline: true, globalRoot: async () => null, pathEnv: '' }} session={session} />);
    await tick();
    expect(frame(r)).toContain('What should your friends see you as?');
    r.stdin.write('Ada');
    await tick();
    r.stdin.write('\r');
    await tick();
    expect(frame(r)).toContain('Pick your color');
    r.stdin.write('\u001b[C');
    await tick();
    r.stdin.write('\r');
    await tick();
    expect(frame(r)).toContain('Welcome, Ada!');
    r.stdin.write('\r');
    await until(() => session.store !== null, 5000, 'store');
    await tick(100);
    expect(frame(r)).toContain('FRIENDS');
    expect(session.store!.profile).toMatchObject({ name: 'Ada', color: '#ff9e64' });
    stores.all.push(session.store!);
    r.unmount();
  });
});
