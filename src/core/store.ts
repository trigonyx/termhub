import fs from 'node:fs';
import { pidAlive } from 'termcore/app/instance';
import { runningApps as runningSuite, runningPorts } from 'termcore/app/run';
import { isSuiteApp, SUITE, type SuiteAppName } from 'termcore/app/suite';
import { Toasts, type NoteKind, type Toast } from 'termcore/app/toasts';
import { npmGlobalRoot } from 'termcore/app/update';
import { displayName, type ContactOf } from 'termcore/friends/book';
import { appendLog, FriendNet, type FriendEvent } from 'termcore/friends/net';
import { cleanStatusMsg, normalizeColor, type Profile, type Status } from 'termcore/friends/profile';
import { reconcile, relStateFor, type ContactState, type RelState } from 'termcore/friends/state';
import type { DiscoveredPeer, DiscoveryOptions } from 'termcore/net/discovery';
import { DEFAULT_SETTINGS, type Animations, type Settings } from 'termcore/store/files';
import { Hub } from 'termcore/store/hub';
import { setAccent, setPersonColors } from 'termcore/ui/theme';
import { APP } from '../app.js';
import { cachedCatalog, loadCatalog, rawUrl, type Catalog, type CatalogApp } from '../apps/catalog.js';
import { fetchChangelog, sectionsBetween, whatsNewText } from '../apps/changelog.js';
import { detectApp, fetchLatest, nodeSupports, statusOf, type AppStatus, type DetectOptions, type Detected } from '../apps/detect.js';
import { appUpdater, installApp, uninstallApp, updateApp, type OpResult } from '../apps/install.js';
import { runningApps } from '../apps/running.js';
import { Seen } from '../apps/seen.js';
import { decryptBackup, exportBackup, restoreBackup, type BackupSummary } from './backup.js';
import { deliver, type DeliveryResult } from './courier.js';
import type { Paths } from './paths.js';
import { compareVersions, requestRestart, self } from './update.js';
import { REPO, VERSION } from './version.js';

export type { NoteKind, Toast };

/** The order the apps appear in wherever a friend's apps are listed. */
const APP_ORDER: string[] = ['termchat', 'keyrace', 'termdrop', 'termhub'];
const OTHER_APPS = (['termchat', 'keyrace', 'termdrop'] as const).map((app) => ({ app, udpPort: SUITE[app].udpPort }));
/** How often termhub looks which apps run on this computer (locks, run files). */
const POLL_MS = 2500;
/** How often a pending request is offered again to a friend who only runs another app. */
const RETRY_MS = 60_000;
/** Lines of npm output kept for the task panel. */
const LOG_LINES = 400;

export type Contact = ContactOf<object>;

export interface FriendView extends Contact {
  display: string;
  /** connected to their termhub */
  hub: boolean;
  /** the apps they're online in right now, e.g. ['termchat', 'keyrace'] */
  apps: string[];
  online: boolean;
  /** terminal in the background (only known through termhub) */
  away: boolean;
  status: Status;
  statusMsg?: string;
  /** where they are (now or last time) */
  ip?: string;
}

export interface NearbyView {
  id: string;
  name: string;
  ip: string;
  apps: string[];
}

export interface FriendsData {
  /** their requests to us */
  requests: FriendView[];
  /** friends (online first), then our pending and declined requests */
  friends: FriendView[];
  /** suite users on the network who aren't friends yet */
  nearby: NearbyView[];
  blocked: FriendView[];
}

export interface AppEntry {
  app: CatalogApp;
  /** undefined while it's being checked */
  detected?: Detected;
  /** undefined while it's being checked, null if GitHub couldn't be reached */
  latest?: string | null;
  running: boolean;
  /** updated since termhub last saw it: "new in 2.2.0" */
  newIn: { from: string; to: string } | null;
  status: AppStatus;
}

export interface SelfEntry {
  version: string;
  latest?: string | null;
  kind: 'npm' | 'source';
  newIn: { from: string; to: string } | null;
}

export type StepStatus = 'waiting' | 'running' | 'done' | 'failed' | 'skipped';

export interface TaskStep {
  id: string;
  label: string;
  status: StepStatus;
  note?: string;
}

/** An install, update or removal in progress (or just finished) – shown in the task panel. */
export interface Task {
  title: string;
  steps: TaskStep[];
  log: string[];
  running: boolean;
  ok?: boolean;
  message?: string;
  hint?: string;
  /** termhub itself was updated: offer a restart */
  restart?: boolean;
}

export interface LaunchRequest {
  id: string;
  name: string;
  command: string[];
  args: string[];
}

export interface StoreOptions {
  paths: Paths;
  port?: number;
  discovery?: boolean;
  discoveryPort?: number;
  /** Simulated network for discovery (tests). */
  discoveryOptions?: Pick<DiscoveryOptions, 'transport' | 'interfaces'>;
  dialIntervalMs?: number;
  debug?: boolean;
  notify?: (title: string, body: string) => void;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** npm's global folder (tests pass a temp folder) */
  globalRoot?: () => Promise<string | null>;
  /** don't load the catalog, versions or changelogs from the network (tests) */
  offline?: boolean;
  /** how a copy is asked for its version (tests) */
  ask?: DetectOptions['ask'];
  pathEnv?: string;
  courierWaitMs?: number;
  pollMs?: number;
  /** how often an open request is offered again to someone who only runs another app */
  retryMs?: number;
}

const byApp = (a: string, b: string) => (APP_ORDER.indexOf(a) === -1 ? 99 : APP_ORDER.indexOf(a)) - (APP_ORDER.indexOf(b) === -1 ? 99 : APP_ORDER.indexOf(b)) || a.localeCompare(b);

function parseAppPorts(v: unknown): Partial<Record<SuiteAppName, number>> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Partial<Record<SuiteAppName, number>> = {};
  for (const [k, p] of Object.entries(v as Record<string, unknown>)) if (isSuiteApp(k) && Number.isInteger(p) && (p as number) > 0 && (p as number) < 65536) out[k] = p as number;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Everything termhub knows and does, without the UI: friends (termcore's FriendNet on
 * `termhub/1`, finding people through every app's announcements), the apps (catalog,
 * detection, installs), profile, settings and the backup. The UI subscribes to it.
 */
export class HubStore {
  readonly net: FriendNet<never, object>;
  readonly hub: Hub;
  readonly paths: Paths;
  private readonly toasts: Toasts;
  private readonly seen: Seen;
  private readonly env: NodeJS.ProcessEnv;
  private listeners = new Set<() => void>();
  private notifyQueued = false;
  version = 0;

  catalog: Catalog;
  readonly apps = new Map<string, AppEntry>();
  self: SelfEntry;
  task: Task | null = null;
  /** an app is open in this terminal right now (termhub is in the background) */
  childRunning = false;
  /** the app to open next (the UI quits Ink, cli.tsx runs it and comes back) */
  launch: LaunchRequest | null = null;

  private globalRoot: string | null = null;
  private localRun = new Set<string>();
  private pollTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  /** friends whose last change still has to reach them (no app of theirs was reachable) */
  private pending = new Set<string>();
  private lastRetry = new Map<string, number>();
  private delivering = new Set<string>();
  private wasOnline = new Map<string, number>();
  private refreshing: Promise<void> | null = null;

  constructor(private readonly opts: StoreOptions) {
    this.paths = opts.paths;
    this.env = opts.env ?? process.env;
    this.hub = new Hub(opts.paths.hub);
    this.toasts = new Toasts(() => this.changed());
    this.seen = new Seen(opts.paths.seen);
    this.catalog = cachedCatalog(opts.paths.catalogCache);
    this.self = { version: VERSION, kind: self.installKind(), newIn: null };
    const before = this.seen.newerThanSeen('termhub', VERSION);
    if (before) this.self.newIn = { from: before, to: VERSION };
    this.seen.mark('termhub', VERSION);
    this.syncCatalog();
    this.net = new FriendNet<never, object>({
      app: APP,
      paths: opts.paths,
      hub: this.hub,
      port: opts.port,
      discovery: opts.discovery,
      discoveryPort: opts.discoveryPort,
      discoveryOptions: { ...opts.discoveryOptions, listApps: ['termhub', 'termchat', 'keyrace', 'termdrop'], alsoAsk: OTHER_APPS },
      dialIntervalMs: opts.dialIntervalMs,
      notify: opts.notify,
      wire: { parse: () => null, presence: (o) => (parseAppPorts(o.apps) ? { apps: parseAppPorts(o.apps) } : {}) },
      hooks: {
        changed: () => this.onNetChanged(),
        log: (l) => this.log(l),
        event: (e) => this.onEvent(e),
        message: () => {},
        // which apps we have open: friends who connect to our termhub see it right away
        presenceExtra: () => ({ apps: runningPorts(this.paths.hub.runDir) }),
        settings: (s) => this.applySettings(s),
      },
    });
    this.applySettings(this.hub.settings.get());
    setPersonColors((id) => this.contacts.get(id)?.color);
  }

  static createProfile(paths: Paths, name: string, color?: string): string {
    return Hub.createProfile(paths.hub, name, color).id;
  }

  static hasProfile(paths: Paths): boolean {
    return Hub.hasProfile(paths.hub);
  }

  get identity() {
    return this.net.identity;
  }

  get contacts() {
    return this.net.contacts;
  }

  // ───────────── Lifecycle ─────────────

  async start(): Promise<void> {
    await this.net.start();
    this.pollRunning();
    this.pollTimer = setInterval(() => this.pollRunning(), this.opts.pollMs ?? POLL_MS);
    this.pollTimer.unref();
    this.retryTimer = setInterval(() => this.retryPending(), Math.min(this.retryMs, 10_000));
    this.retryTimer.unref();
    void this.refreshApps({ catalog: true, latest: true });
    this.changed();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.toasts.stop();
    await this.net.stop();
  }

  // ───────────── Subscription for React ─────────────

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  changed(): void {
    this.version++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const fn of this.listeners) fn();
    });
  }

  private onNetChanged(): void {
    this.noteLastSeen();
    this.changed();
  }

  private applySettings(s: Settings): void {
    if (setAccent(s.accent)) this.changed();
  }

  private log(line: string): void {
    if (this.opts.debug) appendLog(this.paths.log, line);
  }

  // ───────────── Me ─────────────

  get me() {
    return this.net.me;
  }

  get profile(): Profile {
    return this.hub.me;
  }

  get settings(): Settings {
    return this.net.settings;
  }

  get toast(): Toast | null {
    return this.toasts.current;
  }

  showToast(text: string, kind: NoteKind = 'info'): void {
    this.toasts.show(text, kind);
  }

  get isFocused(): boolean {
    return this.net.isFocused;
  }

  setFocused(focused: boolean): void {
    this.net.setFocused(focused);
  }

  /** Desktop banner – not while an app runs in front (it notifies about its own things). */
  private notify(body: string): void {
    if (!this.childRunning) this.net.notify('termhub', body);
  }

  // ───────────── Friends: views ─────────────

  /** Apps someone runs on their computer right now, as far as we can tell. */
  appsOf(id: string): string[] {
    const apps = new Set<string>();
    const p = this.net.discovered(id);
    if (p) {
      apps.add(p.app);
      for (const a of Object.keys(p.apps ?? {})) apps.add(a);
    }
    if (this.net.isOnline(id)) {
      apps.add('termhub');
      const extra = this.net.presenceOf(id)?.extra.apps as Record<string, number> | undefined;
      for (const a of Object.keys(extra ?? {})) apps.add(a);
    }
    return [...apps].sort(byApp);
  }

  friend(id: string): FriendView | undefined {
    const c = this.contacts.get(id);
    if (!c) return undefined;
    const hub = this.net.isOnline(id);
    const apps = c.state === 'blocked' ? [] : this.appsOf(id);
    const presence = this.net.presenceOf(id);
    const status = presence?.status ?? c.status ?? 'available';
    const statusMsg = presence ? presence.msg : c.statusMsg;
    return {
      ...c,
      display: displayName(c),
      hub,
      apps,
      online: apps.length > 0,
      away: hub && (presence?.away ?? false),
      status,
      ...(statusMsg ? { statusMsg } : { statusMsg: undefined }),
      ip: this.net.discovered(id)?.ip ?? c.lastIp,
    };
  }

  friendsData(): FriendsData {
    const all = this.contacts.all().map((c) => this.friend(c.id)!);
    const order: Record<ContactState, number> = { accepted: 0, outgoing: 1, declined: 2, incoming: 3, blocked: 4 };
    const friends = all
      .filter((f) => f.state === 'accepted' || f.state === 'outgoing' || f.state === 'declined')
      .sort((a, b) => order[a.state] - order[b.state] || Number(b.online) - Number(a.online) || a.display.localeCompare(b.display));
    return {
      requests: all.filter((f) => f.state === 'incoming').sort((a, b) => b.lastActivity - a.lastActivity),
      friends,
      nearby: this.net.nearby().map((p) => ({ id: p.id, name: p.name, ip: p.ip, apps: [...new Set([p.app, ...Object.keys(p.apps ?? {})])].sort(byApp) })),
      blocked: all.filter((f) => f.state === 'blocked').sort((a, b) => a.display.localeCompare(b.display)),
    };
  }

  /** Accepted friends online in any app (the header's count). */
  onlineCount(): number {
    return this.contacts.all().filter((c) => c.state === 'accepted' && this.appsOf(c.id).length > 0).length;
  }

  safetyCodeWith(id: string): string | null {
    return this.net.safetyCodeWith(id);
  }

  peerName(id: string): string {
    return this.net.peerName(id);
  }

  /** Friends who were online and aren't anymore: remember when we last saw them. */
  private noteLastSeen(): void {
    const now = Date.now();
    const online = new Map<string, number>();
    for (const c of this.contacts.all()) {
      if (c.state !== 'accepted') continue;
      const p = this.net.discovered(c.id);
      if (p || this.net.isOnline(c.id)) online.set(c.id, p?.lastSeen ?? now);
    }
    for (const [id, at] of this.wasOnline) {
      if (!online.has(id) && this.contacts.get(id) && (this.contacts.get(id)!.lastSeen ?? 0) < at) {
        this.contacts.upsert(id, { lastSeen: at });
      }
    }
    this.wasOnline = online;
  }

  // ───────────── Friends: actions ─────────────

  private onEvent(e: FriendEvent): void {
    switch (e.kind) {
      case 'accepted':
        return this.showToast(e.byThem ? `${e.who} accepted your friend request` : `You and ${e.who} are now friends`, 'success');
      case 'incoming':
        this.showToast(`${e.who} wants to be friends`, 'info');
        return this.notify(`${e.who} wants to be friends`);
      case 'removedUs':
        return this.showToast(`${e.who} removed you as a friend – your request is waiting to be accepted`, 'error');
      case 'declinedUs':
        return this.showToast(`${e.who} declined your friend request`, 'error');
      case 'withdrawn':
        return this.showToast(`${e.who} withdrew their friend request`);
      case 'requestSent':
        return this.showToast(`Friend request sent to ${e.who} – waiting for them to accept`);
      case 'unreachable':
      case 'linked':
        return;
    }
  }

  /** Request to someone under Nearby. */
  async requestNearby(id: string): Promise<void> {
    const name = this.net.discovered(id)?.name ?? this.peerName(id);
    const r = this.net.requestNearby(id);
    if (r === 'accepted') this.showToast(`You and ${this.peerName(id)} are now friends`, 'success');
    else this.showToast(`Friend request sent to ${name}`);
    await this.pass(id, { t: 'state', state: relStateFor(this.contacts.get(id)?.state ?? null) });
  }

  accept(id: string): void {
    const c = this.contacts.get(id);
    if (!c || !this.net.accept(id)) return;
    this.showToast(`You and ${displayName(c)} are now friends`, 'success');
    void this.pass(id, { t: 'state', state: 'accepted' });
  }

  decline(id: string): void {
    const c = this.contacts.get(id);
    if (!c) return;
    const online = this.net.isOnline(id);
    this.net.decline(id);
    this.showToast(`Declined ${displayName(c)}'s request`);
    if (!online) void this.pass(id, { t: 'decline' }, c);
  }

  removeFriend(id: string): void {
    const c = this.contacts.get(id);
    if (!c) return;
    const online = this.net.isOnline(id);
    this.net.peerBook.update(id, { name: displayName(c) });
    this.net.remove(id);
    this.showToast(`Removed ${displayName(c)}`);
    if (!online) void this.pass(id, { t: 'state', state: 'none' }, c);
  }

  block(id: string): void {
    const c = this.net.block(id);
    if (c) this.showToast(`${displayName(c)} is blocked – in every app. No more connections are accepted.`, 'error');
  }

  unblock(id: string): void {
    const c = this.net.unblock(id);
    if (!c) return;
    this.showToast(`Unblocked ${displayName(c)} – friend request sent`, 'success');
    void this.pass(id, { t: 'state', state: 'outgoing' });
  }

  /** Ask again after a decline. */
  request(id: string): void {
    this.net.request(id);
    this.showToast('Friend request sent again');
    void this.pass(id, { t: 'state', state: 'outgoing' });
  }

  rename(id: string, alias: string): void {
    this.net.rename(id, alias);
  }

  /**
   * Adds someone by IP – for networks that block discovery. Tries their termhub first, then
   * each app on its usual port (or the protocol that answers on `port`).
   */
  async addByAddress(host: string, port?: number): Promise<string> {
    const tries: { app: SuiteAppName; port: number }[] = port
      ? (['termhub', 'termchat', 'keyrace', 'termdrop'] as SuiteAppName[]).map((app) => ({ app, port }))
      : (['termhub', 'termchat', 'keyrace', 'termdrop'] as SuiteAppName[]).map((app) => ({ app, port: SUITE[app].tcpPort }));
    let lastError = 'nobody answered';
    for (const t of tries) {
      try {
        if (t.app === 'termhub') return await this.net.addByAddress(host, t.port);
        const r = await this.courier(t.app, host, t.port, null, { t: 'state', state: 'outgoing' });
        const existing = this.contacts.get(r.peerId);
        if (!existing) {
          this.contacts.upsert(r.peerId, { publicKey: r.publicKey, name: r.peerName, state: 'outgoing', lastIp: r.remoteAddress, ...(r.color ? { color: r.color } : {}) });
          this.contacts.setPorts(r.peerId, { [t.app]: t.port });
          this.showToast(`Friend request sent to ${r.peerName} (they have ${t.app} open)`);
        } else if (existing.state === 'incoming') {
          this.net.setState(r.peerId, 'accepted');
        }
        this.applyAnswer(r.peerId, r);
        return r.peerId;
      } catch (err) {
        lastError = (err as Error).message;
      }
    }
    throw new Error(`Couldn't reach anyone at ${host}${port ? `:${port}` : ''} (${lastError})`);
  }

  /** Where someone's apps listen right now (discovery), else where they did last time. */
  private targets(id: string): { app: SuiteAppName; ip: string; port: number }[] {
    const out: { app: SuiteAppName; ip: string; port: number }[] = [];
    const p: DiscoveredPeer | undefined = this.net.discovered(id);
    if (p) {
      const ports = { ...p.apps, [p.app]: p.port } as Partial<Record<SuiteAppName, number>>;
      for (const [app, port] of Object.entries(ports)) if (app !== 'termhub' && port) out.push({ app: app as SuiteAppName, ip: p.ip, port });
    } else {
      const raw = this.contacts.raw(id);
      if (raw?.lastIp) for (const [app, port] of Object.entries(raw.ports ?? {})) if (app !== 'termhub' && port) out.push({ app: app as SuiteAppName, ip: raw.lastIp, port });
    }
    return out.sort((a, b) => byApp(a.app, b.app));
  }

  private courier(app: SuiteAppName, ip: string, port: number, peerId: string | null, send: { t: 'state'; state: RelState } | { t: 'decline' }): Promise<DeliveryResult> {
    return deliver({
      protocol: `${app}/1`,
      ip,
      port,
      peerId,
      me: this.identity,
      name: this.profile.name,
      ...(this.profile.color ? { color: this.profile.color } : {}),
      links: this.hub.myLinks(),
      send,
      waitMs: this.opts.courierWaitMs,
    });
  }

  /**
   * Gets a friendship change to someone who isn't connected to our termhub: our own app that
   * they run passes it on by itself (shared list); otherwise termhub delivers it in that app's
   * protocol. If nothing reaches them, it's offered again later – and every app sends it anyway
   * the next time it connects to them.
   */
  private async pass(id: string, send: { t: 'state'; state: RelState } | { t: 'decline' }, removed?: Contact): Promise<'hub' | 'app' | 'courier' | 'later'> {
    if (this.net.isOnline(id)) return 'hub';
    const targets = this.targets(id);
    if (!targets.length && removed?.lastIp) {
      // gone from the list already: their last address
      const raw = { lastIp: removed.lastIp };
      for (const app of ['termchat', 'keyrace', 'termdrop'] as SuiteAppName[]) targets.push({ app, ip: raw.lastIp, port: SUITE[app].tcpPort });
    }
    const local = this.localApps();
    if (targets.some((t) => local.has(t.app))) return 'app';
    if (this.delivering.has(id)) {
      this.pending.add(id);
      return 'later';
    }
    this.delivering.add(id);
    try {
      for (const t of targets) {
        if (local.has(t.app)) continue;
        try {
          const r = await this.courier(t.app, t.ip, t.port, id, send);
          this.pending.delete(id);
          if (!removed) this.applyAnswer(id, r);
          this.log(`Delivered ${send.t === 'state' ? send.state : 'decline'} to ${id} through ${t.app}`);
          return 'courier';
        } catch (err) {
          this.log(`Couldn't deliver to ${id} through ${t.app} (${t.ip}:${t.port}): ${(err as Error).message}`);
        }
      }
    } finally {
      this.delivering.delete(id);
    }
    if (!removed) this.pending.add(id);
    return 'later';
  }

  /** Their answer in a courier session: the same rules as a `state` in a session. */
  private applyAnswer(id: string, r: DeliveryResult): void {
    let prev: ContactState | null = null;
    const now = Date.now();
    const updated = this.contacts.mutate(id, (cur) => {
      if (!cur) return undefined;
      prev = cur.state;
      const next = r.theirState ? reconcile(cur.state, r.theirState) : cur.state;
      if (next === null) return null;
      return {
        publicKey: r.publicKey,
        name: r.peerName,
        state: next,
        lastIp: r.remoteAddress,
        lastSeen: now,
        ...(r.color ? { color: r.color } : {}),
        ...(next !== cur.state ? { lastActivity: now } : {}),
      };
    });
    const next = updated?.state ?? null;
    if (prev === 'outgoing' && next === 'accepted') this.showToast(`${displayName(updated!)} accepted your friend request`, 'success');
    if (prev === 'accepted' && next === 'outgoing') this.showToast(`${displayName(updated!)} removed you as a friend`, 'error');
    this.changed();
  }

  /** Requests that couldn't be delivered, and our open requests to people who only run other apps. */
  private retryPending(): void {
    if (this.stopped) return;
    const now = Date.now();
    for (const c of this.contacts.all()) {
      const due = this.pending.has(c.id) || c.state === 'outgoing';
      if (!due || this.net.isOnline(c.id) || !this.net.discovered(c.id)) continue;
      if (now - (this.lastRetry.get(c.id) ?? 0) < this.retryMs && !this.pending.has(c.id)) continue;
      this.lastRetry.set(c.id, now);
      void this.pass(c.id, { t: 'state', state: relStateFor(c.state) });
    }
  }

  private get retryMs(): number {
    return this.opts.retryMs ?? RETRY_MS;
  }

  /** Suite apps running on this computer (their run files; termhub itself excluded). */
  private localApps(): Set<string> {
    return new Set(runningSuite(this.paths.hub.runDir, pidAlive).filter((r) => r.app !== 'termhub').map((r) => r.app));
  }

  // ───────────── Profile and settings ─────────────

  setName(name: string): string {
    const clean = this.net.setName(name);
    this.showToast(`You're ${clean} now – in every app`, 'success');
    return clean;
  }

  setColor(color: string | undefined): void {
    const hex = color === undefined ? undefined : normalizeColor(color);
    if (color !== undefined && !hex) throw new Error('Use a color from the palette or #rrggbb');
    this.hub.setProfile({ color: hex ?? undefined });
  }

  setStatus(status: Status, msg?: string | null): void {
    const patch: Partial<Profile> = { status };
    if (msg !== undefined) patch.statusMsg = msg === null ? undefined : cleanStatusMsg(msg);
    this.hub.setProfile(patch);
  }

  setStatusMsg(msg: string): void {
    this.hub.setProfile({ statusMsg: cleanStatusMsg(msg) });
  }

  setAccent(color: string | undefined): void {
    const hex = color === undefined ? undefined : normalizeColor(color);
    if (color !== undefined && !hex) throw new Error('Use a color from the palette or #rrggbb');
    this.hub.setSettings({ accent: hex ?? undefined });
  }

  setAnimations(mode: Animations): void {
    this.net.setAnimations(mode);
  }

  setNotifications(on: boolean): void {
    this.net.setNotifications(on);
  }

  resetSettings(): void {
    this.hub.settings.update(() => ({ ...DEFAULT_SETTINGS }));
    this.showToast('Settings are back to their defaults – in every app', 'success');
  }

  // ───────────── Backup ─────────────

  exportBackup(file: string, passphrase: string): BackupSummary {
    return exportBackup(this.paths.hub, file, passphrase, VERSION);
  }

  /** The other suite apps that run right now (a restore has to wait for them). */
  async appsInTheWay(): Promise<string[]> {
    const ids = [...new Set([...this.catalog.apps.map((a) => a.id), 'termchat', 'keyrace', 'termdrop'])];
    return [...(await runningApps(ids, this.paths.homeArg, this.env))];
  }

  /**
   * Replaces identity and friends with the backup's. Afterwards the store must be recreated
   * (the identity changed) – the UI does that.
   */
  async importBackup(file: string, passphrase: string): Promise<{ summary: BackupSummary; savedTo: string | null }> {
    const busy = await this.appsInTheWay();
    if (busy.length) throw new Error(`Quit ${busy.join(', ')} first – a restore needs all apps closed`);
    const content = decryptBackup(fs.readFileSync(file, 'utf8'), passphrase);
    return restoreBackup(this.paths.hub, content);
  }

  // ───────────── Apps ─────────────

  private syncCatalog(): void {
    const ids = new Set(this.catalog.apps.map((a) => a.id));
    for (const id of this.apps.keys()) if (!ids.has(id)) this.apps.delete(id);
    for (const app of this.catalog.apps) {
      const prev = this.apps.get(app.id);
      if (prev) prev.app = app;
      else this.apps.set(app.id, { app, running: false, newIn: null, status: { kind: 'missing' } });
    }
  }

  appList(): AppEntry[] {
    return this.catalog.apps.map((a) => this.apps.get(a.id)!).filter(Boolean);
  }

  private async globalFolder(): Promise<string | null> {
    this.globalRoot = await (this.opts.globalRoot ?? (() => npmGlobalRoot()))();
    return this.globalRoot;
  }

  /** Detects every app again (and loads catalog and newest versions if asked). */
  refreshApps(what: { catalog?: boolean; latest?: boolean } = {}): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        if (what.catalog && !this.opts.offline) {
          this.catalog = await loadCatalog({ cacheFile: this.paths.catalogCache, fetchImpl: this.opts.fetchImpl, url: this.env.TERMHUB_CATALOG_URL || undefined });
          this.syncCatalog();
          this.changed();
        }
        const globalRoot = await this.globalFolder();
        await Promise.all(this.appList().map((e) => this.detect(e, globalRoot)));
        await this.pollRunning();
        if (what.latest) await this.fetchVersions();
      } finally {
        this.refreshing = null;
        this.changed();
      }
    })();
    return this.refreshing;
  }

  private async detect(e: AppEntry, globalRoot: string | null): Promise<void> {
    const before = e.detected?.state === 'installed' ? e.detected.version : null;
    e.detected = await detectApp(e.app, { globalRoot, appDir: appUpdater(e.app).appDir(), pathEnv: this.opts.pathEnv, ask: this.opts.ask });
    const now = e.detected.state === 'installed' ? e.detected.version : null;
    if (now) {
      // newer than last time termhub looked (or than before an update just now)
      const from = before && compareVersions(now, before) > 0 ? before : this.seen.newerThanSeen(e.app.id, now);
      if (from) e.newIn = { from, to: now };
      this.seen.mark(e.app.id, now);
    }
    e.status = statusOf(e.detected, e.latest);
  }

  private async fetchVersions(): Promise<void> {
    if (this.opts.offline) return;
    const fetchImpl = this.opts.fetchImpl;
    await Promise.all([
      ...this.appList().map(async (e) => {
        e.latest = await fetchLatest(rawUrl(e.app.repo, 'package.json', this.env), fetchImpl);
        e.status = statusOf(e.detected, e.latest);
      }),
      (async () => {
        this.self.latest = this.env.TERMHUB_NO_UPDATE_CHECK === '1' ? null : await fetchLatest(this.env.TERMHUB_UPDATE_URL || rawUrl(REPO, 'package.json', this.env), fetchImpl);
      })(),
    ]);
    this.changed();
  }

  /** termhub's own update, if there is one (the header shows it). */
  get updateAvailable(): string | null {
    const l = this.self.latest;
    return l && compareVersions(l, VERSION) > 0 ? l : null;
  }

  /** Which apps run (their instance locks) – and tells termhub friends when that changes. */
  private async pollRunning(): Promise<void> {
    if (this.stopped) return;
    const ids = this.appList().map((e) => e.app.id);
    const running = await runningApps(ids, this.paths.homeArg, this.env);
    let changed = false;
    for (const e of this.appList()) {
      const r = running.has(e.app.id);
      if (e.running !== r) {
        e.running = r;
        changed = true;
      }
    }
    const local = this.localApps();
    if ([...local].sort().join() !== [...this.localRun].sort().join()) {
      this.localRun = local;
      this.net.broadcastPresence();
      changed = true;
    }
    if (changed) this.changed();
  }

  entry(id: string): AppEntry | undefined {
    return this.apps.get(id);
  }

  /** What `enter` opens – or why it can't. */
  launchRequest(id: string): LaunchRequest {
    const e = this.apps.get(id);
    if (!e) throw new Error(`There's no app called ${id}`);
    const d = e.detected;
    if (!d || d.state === 'missing') throw new Error(`${e.app.name} isn't installed yet – press i to install it`);
    if (d.state === 'broken') throw new Error(`${e.app.name} doesn't start (${d.reason}) – press u to install it again`);
    if (e.running) throw new Error(`${e.app.name} is already open in another window – switch there, or quit it first`);
    const args = this.paths.homeArg ? ['--home', this.paths.homeArg] : [];
    // the global command starts a newer local copy by itself
    const main = d.copies.find((c) => c.kind === 'global') ?? d.main;
    return { id, name: e.app.name, command: main.command, args };
  }

  /** Back from an app: it may have updated itself, and it isn't running anymore. */
  async afterLaunch(id: string): Promise<void> {
    const e = this.apps.get(id);
    if (e) await this.detect(e, this.globalRoot);
    await this.pollRunning();
    this.changed();
  }

  // ───────────── Tasks: install, update, remove ─────────────

  private startTask(title: string, steps: { id: string; label: string }[]): Task {
    if (this.task?.running) throw new Error('Wait until the current task is done');
    this.task = { title, steps: steps.map((s) => ({ ...s, status: 'waiting' })), log: [], running: true };
    this.changed();
    return this.task;
  }

  private output(task: Task, chunk: string): void {
    const lines = chunk.replace(/\r/g, '').split('\n');
    // continue the last line
    if (task.log.length && lines.length) task.log[task.log.length - 1] += lines.shift()!;
    task.log.push(...lines);
    if (task.log.length > LOG_LINES) task.log.splice(0, task.log.length - LOG_LINES);
    this.changed();
  }

  private finishTask(task: Task, r: OpResult): void {
    task.running = false;
    task.ok = r.ok;
    task.message = r.message;
    if (r.hint) task.hint = r.hint;
    this.changed();
  }

  /** Closes the panel of a finished task. */
  dismissTask(): void {
    if (this.task && !this.task.running) {
      this.task = null;
      this.changed();
    }
  }

  private step(task: Task, id: string, status: StepStatus, note?: string): void {
    const s = task.steps.find((x) => x.id === id);
    if (s) {
      s.status = status;
      if (note !== undefined) s.note = note;
    }
    this.changed();
  }

  async install(id: string): Promise<OpResult> {
    const e = this.apps.get(id);
    if (!e) throw new Error(`There's no app called ${id}`);
    if (e.detected?.state === 'installed') throw new Error(`${e.app.name} is installed already${e.status.kind === 'update' ? ' – press u to update it' : ''}`);
    if (!nodeSupports(e.app)) throw new Error(`${e.app.name} needs Node.js ${e.app.node} or newer (this is ${process.versions.node})`);
    const task = this.startTask(`Installing ${e.app.name}`, [{ id, label: e.app.name }]);
    this.step(task, id, 'running');
    const globalRoot = await this.globalFolder();
    const r = await installApp(e.app, { latest: e.latest ?? null, globalRoot, onOutput: (s) => this.output(task, s) });
    await this.detect(e, globalRoot);
    const d = e.detected as Detected | undefined;
    const version = d?.state === 'installed' ? d.version : null;
    const ok = r.ok && version !== null;
    const result = ok ? { ...r, message: `${e.app.name} ${version} is installed – press enter to open it` } : r.ok ? { ok: false, message: `npm finished, but ${e.app.name} doesn't start` } : r;
    this.step(task, id, ok ? 'done' : 'failed', version ?? undefined);
    this.finishTask(task, result);
    return result;
  }

  async update(id: string): Promise<OpResult> {
    const e = this.apps.get(id);
    if (!e) throw new Error(`There's no app called ${id}`);
    if (!e.detected || e.detected.state === 'missing') throw new Error(`${e.app.name} isn't installed – press i to install it`);
    if (e.running) throw new Error(`${e.app.name} is open right now – quit it first, then update`);
    const task = this.startTask(`Updating ${e.app.name}`, [{ id, label: e.app.name }]);
    const r = await this.updateOne(task, e);
    this.finishTask(task, r);
    return r;
  }

  private async updateOne(task: Task, e: AppEntry): Promise<OpResult> {
    this.step(task, e.app.id, 'running');
    const globalRoot = await this.globalFolder();
    const before = e.detected?.state === 'installed' ? e.detected.version : null;
    const r = await updateApp(e.app, e.detected!, { latest: e.latest ?? null, globalRoot, onOutput: (s) => this.output(task, s) });
    await this.detect(e, globalRoot);
    if (!r.ok) {
      this.step(task, e.app.id, 'failed');
      return r;
    }
    const now = e.detected?.state === 'installed' ? e.detected.version : null;
    if (!now) {
      this.step(task, e.app.id, 'failed');
      return { ok: false, message: `npm finished, but ${e.app.name} doesn't start` };
    }
    if (e.latest && compareVersions(now, e.latest) < 0) {
      this.step(task, e.app.id, 'failed', now);
      return { ok: false, message: appUpdater(e.app).staleInstallHint(now).replace(`${e.app.name} update`, 'u') };
    }
    this.step(task, e.app.id, 'done', before && before !== now ? `${before} → ${now}` : now);
    return { ok: true, message: before && before !== now ? `${e.app.name} ${now} is installed (was ${before}) – w shows what's new` : `${e.app.name} ${now} is up to date` };
  }

  /** termhub itself (the restart comes afterwards, see Task.restart). */
  private async updateSelf(task: Task): Promise<OpResult> {
    this.step(task, 'termhub', 'running');
    if (this.self.kind === 'source') {
      this.step(task, 'termhub', 'skipped', 'source folder');
      return { ok: true, message: self.SOURCE_HINT.replace(/`/g, '') };
    }
    const latest = this.self.latest ?? null;
    this.output(task, `Updating termhub ${VERSION}${latest ? ` → ${latest}` : ''} …\n`);
    const res = await self.runInstall({ inherit: false, version: latest, onOutput: (s) => this.output(task, s) });
    if (!res.ok) {
      this.step(task, 'termhub', 'failed');
      const hint = self.installHint(res.output);
      return { ok: false, message: `Updating termhub failed`, ...(hint ? { hint } : {}) };
    }
    const installed = await self.installedVersion();
    if (installed && latest && compareVersions(installed, latest) < 0) {
      this.step(task, 'termhub', 'failed', installed);
      return { ok: false, message: self.staleInstallHint(installed) };
    }
    this.step(task, 'termhub', 'done', `${VERSION} → ${installed ?? latest ?? 'latest'}`);
    task.restart = true;
    return { ok: true, message: `termhub ${installed ?? latest} is installed – restart termhub to use it` };
  }

  async updateTermhub(): Promise<OpResult> {
    if (!this.updateAvailable && this.self.latest !== null) {
      const r = { ok: true, message: `termhub ${VERSION} is up to date` };
      this.showToast(r.message, 'success');
      return r;
    }
    const task = this.startTask('Updating termhub', [{ id: 'termhub', label: 'termhub (this app)' }]);
    const r = await this.updateSelf(task);
    this.finishTask(task, r);
    return r;
  }

  /**
   * Updates every installed app that has a newer version, one after the other, and termhub
   * last (then the UI offers a restart).
   */
  async updateAll(): Promise<OpResult> {
    const due = this.appList().filter((e) => e.detected?.state === 'installed' && e.status.kind === 'update');
    const selfDue = !!this.updateAvailable;
    if (!due.length && !selfDue) {
      const r = { ok: true, message: 'Everything is up to date' };
      this.showToast(r.message, 'success');
      return r;
    }
    const task = this.startTask('Updating all apps', [
      ...due.map((e) => ({ id: e.app.id, label: e.app.name })),
      ...(selfDue ? [{ id: 'termhub', label: 'termhub (this app)' }] : []),
    ]);
    const failed: string[] = [];
    for (const e of due) {
      if (e.running) {
        this.step(task, e.app.id, 'skipped', 'open right now – quit it first');
        failed.push(e.app.name);
        continue;
      }
      const r = await this.updateOne(task, e);
      if (!r.ok) {
        failed.push(e.app.name);
        if (r.hint) task.hint = r.hint;
      }
    }
    if (selfDue) {
      const r = await this.updateSelf(task);
      if (!r.ok) failed.push('termhub');
    }
    const r: OpResult = failed.length
      ? { ok: false, message: `Not updated: ${failed.join(', ')} – see above`, ...(task.hint ? { hint: task.hint } : {}) }
      : { ok: true, message: task.restart ? 'All updated – restart termhub to use the new version' : 'All apps are up to date' };
    this.finishTask(task, r);
    return r;
  }

  async uninstall(id: string): Promise<OpResult> {
    const e = this.apps.get(id);
    if (!e) throw new Error(`There's no app called ${id}`);
    if (!e.detected || e.detected.state === 'missing') throw new Error(`${e.app.name} isn't installed`);
    if (e.running) throw new Error(`${e.app.name} is open right now – quit it first`);
    const task = this.startTask(`Removing ${e.app.name}`, [{ id, label: e.app.name }]);
    this.step(task, id, 'running');
    const r = await uninstallApp(e.app, e.detected, { onOutput: (s) => this.output(task, s) });
    await this.detect(e, this.globalRoot);
    if (r.ok) {
      e.newIn = null;
      this.seen.mark(id, null);
    }
    this.step(task, id, r.ok ? 'done' : 'failed');
    this.finishTask(task, r);
    return r;
  }

  /** Asks for a restart after termhub updated itself (cli.tsx starts the new version). */
  restart(): void {
    requestRestart();
  }

  // ───────────── What's new ─────────────

  /** The CHANGELOG sections of an app (or termhub: id 'termhub') that are new to you. */
  async whatsNew(id: string): Promise<{ title: string; text: string }> {
    const isSelf = id === 'termhub';
    const e = isSelf ? null : this.apps.get(id);
    if (!isSelf && !e) throw new Error(`There's no app called ${id}`);
    const name = isSelf ? 'termhub' : e!.app.name;
    const repo = isSelf ? REPO : e!.app.repo;
    const installed = isSelf ? VERSION : e!.detected?.state === 'installed' ? e!.detected.version : null;
    const latest = isSelf ? (this.self.latest ?? null) : (e!.latest ?? null);
    const newIn = isSelf ? this.self.newIn : e!.newIn;
    if (this.opts.offline) throw new Error("Can't load the changelog offline");
    const sections = await fetchChangelog(rawUrl(repo, 'CHANGELOG.md', this.env), this.opts.fetchImpl);
    if (!sections) throw new Error(`Couldn't load ${name}'s changelog – are you online?`);
    let picked;
    let title;
    if (installed && latest && compareVersions(latest, installed) > 0) {
      picked = sectionsBetween(sections, installed, latest);
      title = `What's new in ${name} ${latest} (you have ${installed})`;
    } else if (installed && newIn) {
      picked = sectionsBetween(sections, newIn.from, newIn.to);
      title = `What's new in ${name} ${newIn.to} (since ${newIn.from})`;
    } else {
      const v = installed ?? latest;
      picked = v ? sectionsBetween(sections, null, v) : sections.slice(0, 1);
      title = `${name} ${v ?? ''}`.trim();
    }
    if (!picked.length) picked = sections.slice(0, 1);
    if (isSelf) this.self.newIn = null;
    else e!.newIn = null;
    this.changed();
    return { title, text: picked.length ? whatsNewText(name, picked) : `${name} has no changelog yet.` };
  }
}
