import { Box, Text, useApp, useInput } from 'ink';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PROFILE_COLORS } from 'termcore/friends/profile';
import { useCommandInput } from 'termcore/ui/commands/useCommandInput';
import { CommandMenu, menuHeight } from 'termcore/ui/components/CommandMenu';
import { Dialog, dialogHeight, type DialogSpec } from 'termcore/ui/components/Dialog';
import { Footer } from 'termcore/ui/components/Footer';
import { Header } from 'termcore/ui/components/Header';
import { InputBox, inputBoxHeight } from 'termcore/ui/components/InputBox';
import { Onboarding } from 'termcore/ui/components/Onboarding';
import { cleanPaste, edit, emptyEditor, type EditorState } from 'termcore/ui/editor';
import { useStoreVersion, useTerminalSize } from 'termcore/ui/hooks';
import { mouse } from 'termcore/ui/mouse';
import { idHex, theme } from 'termcore/ui/theme';
import type { Paths } from '../core/paths.js';
import { HubStore, type LaunchRequest, type StoreOptions } from '../core/store.js';
import { VERSION } from '../core/version.js';
import type { Actions } from './actions.js';
import { HELP, registry } from './commands.js';
import { Banner, bannerCompact, bannerHeight, LOGO_SMALL } from './components/Banner.js';
import { SECRET_HEIGHT, SecretPrompt } from './components/SecretPrompt.js';
import { TABS, Tabs, TABS_HEIGHT, type TabId } from './components/Tabs.js';
import { TextPanel } from './components/TextPanel.js';
import { AppsTab } from './tabs/AppsTab.js';
import { FriendsTab } from './tabs/FriendsTab.js';
import { ProfileTab } from './tabs/ProfileTab.js';
import { SettingsTab } from './tabs/SettingsTab.js';

/**
 * What outlives one Ink render: the store (friends stay connected while an app runs in front)
 * and where you were (tab, selection). cli.tsx renders Root again after an app quits.
 */
export interface Session {
  store: HubStore | null;
  tab: TabId;
  selected: Partial<Record<TabId, string | null>>;
  /** set by the UI: open this app (cli.tsx runs it once Ink has exited) */
  launch: LaunchRequest | null;
  /** a line for the footer when termhub comes back (e.g. how the app ended) */
  notice?: { text: string; kind: 'info' | 'success' | 'error' };
}

export function newSession(tab: TabId = 'friends'): Session {
  return { store: null, tab, selected: {}, launch: null };
}

type Phase = { name: 'onboarding' } | { name: 'starting' } | { name: 'ready'; store: HubStore } | { name: 'error'; message: string };

export function Root({ paths, options, session, notice }: { paths: Paths; options: Omit<StoreOptions, 'paths'>; session: Session; notice?: string }) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState<Phase>(() =>
    session.store ? { name: 'ready', store: session.store } : HubStore.hasProfile(paths) ? { name: 'starting' } : { name: 'onboarding' },
  );
  const quitting = useRef(false);

  const quit = useCallback(() => {
    if (quitting.current) return;
    quitting.current = true;
    const store = session.store;
    session.store = null;
    void (store ? store.stop() : Promise.resolve()).finally(() => exit());
  }, [exit, session]);

  const launch = useCallback(
    (req: LaunchRequest) => {
      session.launch = req;
      exit();
    },
    [exit, session],
  );

  const reload = useCallback(() => {
    const store = session.store;
    session.store = null;
    setPhase({ name: 'starting' });
    void store?.stop();
  }, [session]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') quit();
  });

  useEffect(() => {
    if (phase.name !== 'starting') return;
    let cancelled = false;
    (async () => {
      try {
        const store = new HubStore({ paths, ...options });
        await store.start();
        if (cancelled) return void store.stop();
        if (notice) store.showToast(notice, 'success');
        session.store = store;
        setPhase({ name: 'ready', store });
      } catch (err) {
        setPhase({ name: 'error', message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.name]);

  // one spare row so Ink doesn't clear the whole screen on every render
  const height = Math.max(10, rows - 1);

  if (phase.name === 'onboarding') {
    return (
      <Onboarding
        logo={LOGO_SMALL}
        tagline="the hub of termchat, keyrace and termdrop"
        width={columns}
        colors={PROFILE_COLORS}
        create={(name, color) => HubStore.createProfile(paths, name, color)}
        onDone={() => setPhase({ name: 'starting' })}
      />
    );
  }
  if (phase.name === 'starting') {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color={theme.dim}>Starting termhub …</Text>
      </Box>
    );
  }
  if (phase.name === 'error') {
    return (
      <Box paddingX={2} paddingY={1} flexDirection="column">
        <Text color={theme.error} bold>
          termhub could not start
        </Text>
        <Text>{phase.message}</Text>
        <Text color={theme.dim}>ctrl+c to quit</Text>
      </Box>
    );
  }
  return <Main store={phase.store} session={session} width={columns} height={height} rows={rows} quit={quit} launch={launch} reload={reload} />;
}

type Overlay = { kind: 'panel'; title: string; text: string } | null;
type Bottom = { kind: 'dialog'; spec: DialogSpec } | { kind: 'secret'; title: string; hint?: string; resolve(v: string | null): void } | null;

export function Main({
  store,
  session,
  width,
  height,
  rows,
  quit,
  launch,
  reload,
}: {
  store: HubStore;
  session: Session;
  width: number;
  height: number;
  rows: number;
  quit(): void;
  launch(req: LaunchRequest): void;
  reload(): void;
}) {
  useStoreVersion(store);
  const [tab, setTabState] = useState<TabId>(session.tab);
  const [selected, setSelected] = useState(session.selected);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [bottom, setBottom] = useState<Bottom>(null);
  const [capture, setCapture] = useState(false);
  const [commandMode, setCommandMode] = useState(false);
  const commandRef = useRef(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [history, setHistory] = useState<string[]>([]);

  const setTab = (t: TabId) => {
    session.tab = t;
    setCapture(false);
    setTabState(t);
  };
  const select = (t: TabId) => (key: string | null) => {
    session.selected = { ...session.selected, [t]: key };
    setSelected(session.selected);
  };

  // terminal window focus → desktop notifications only while in the background
  useEffect(() => {
    mouse.on('focus', (f) => store.setFocused(f));
    return () => void mouse.removeAllListeners('focus');
  }, [store]);

  // back from an app: how it ended
  useEffect(() => {
    if (session.notice) {
      store.showToast(session.notice.text, session.notice.kind);
      session.notice = undefined;
    }
  }, [store, session]);

  const actions: Actions = useMemo(() => {
    const ask = <T,>(make: (resolve: (v: T) => void) => DialogSpec) =>
      new Promise<T>((resolve) =>
        setBottom({
          kind: 'dialog',
          spec: make((v) => {
            setBottom(null);
            resolve(v);
          }),
        }),
      );
    const a: Actions = {
      quit,
      confirm: (title) => ask<boolean>((resolve) => ({ kind: 'confirm', title, resolve })),
      prompt: (title, opts) => ask<string | null>((resolve) => ({ kind: 'prompt', title, hint: opts?.hint, initial: opts?.initial, resolve })),
      pick: (title, options, preselect) =>
        ask<string[] | null>((resolve) => ({ kind: 'pick', title, options, multi: false, opts: { initial: preselect }, resolve })).then((ids) => ids?.[0] ?? null),
      secret: (title, hint) =>
        new Promise<string | null>((resolve) =>
          setBottom({
            kind: 'secret',
            title,
            hint,
            resolve: (v) => {
              setBottom(null);
              resolve(v);
            },
          }),
        ),
      panel: (title, text) => setOverlay({ kind: 'panel', title, text }),
      print: (text, kind = 'info') => {
        if (text.includes('\n')) setOverlay({ kind: 'panel', title: 'termhub', text });
        else store.showToast(text.replace(/[`*]/g, ''), kind);
      },
      runCommand: async (input) => {
        await registry.execute(input, { store, ui: { ...a, tab: setTab } });
        setHistory((h) => (h[h.length - 1] === input ? h : [...h.slice(-99), input]));
      },
      launch: (id) => {
        try {
          launch(store.launchRequest(id));
        } catch (err) {
          store.showToast((err as Error).message, 'error');
        }
      },
      reload,
      capture: (on) => setCapture(on),
    };
    return a;
  }, [store, quit, launch, reload]);

  const closeCommand = () => {
    commandRef.current = false;
    setCommandMode(false);
    setEditor(emptyEditor);
  };
  const cmd = useCommandInput({
    registry,
    editor,
    setEditor,
    onSubmit: async (value: string) => {
      closeCommand();
      if (value.trim()) await actions.runCommand(value.trim());
    },
    onEscape: closeCommand,
  });

  const idle = !overlay && !bottom && !commandMode;

  useInput(
    (input, key) => {
      if (commandRef.current) {
        // the input box isn't active yet – pass characters on to it
        const text = cleanPaste(input);
        if (text && !key.ctrl && !key.meta) setEditor((e) => edit.insert(e, text));
        return;
      }
      if (key.tab) {
        const i = TABS.indexOf(tab);
        return setTab(TABS[(i + (key.shift ? TABS.length - 1 : 1)) % TABS.length]!);
      }
      if (/^[1-4]$/.test(input)) return setTab(TABS[Number(input) - 1]!);
      if (input.startsWith('/')) {
        commandRef.current = true;
        setCommandMode(true);
        setEditor({ value: input, cursor: input.length });
        return;
      }
      if (input === '?') return actions.panel('Help', HELP);
      if (input === 'q') {
        if (store.task?.running) return store.showToast(`${store.task.title} is still running – quit when it's done (or ctrl+c)`, 'error');
        quit();
      }
    },
    { isActive: idle && !capture },
  );

  // ── Layout ──
  const compact = bannerCompact(width, rows);
  // the logo only where the tabs still get enough room (stacked panels need more)
  const showBanner = height >= (width >= 84 ? 20 : 30);
  const banner = showBanner ? bannerHeight(compact) : 0;
  const bottomHeight =
    bottom?.kind === 'dialog' ? dialogHeight(bottom.spec) : bottom?.kind === 'secret' ? SECRET_HEIGHT : commandMode ? inputBoxHeight(editor, width) + menuHeight(cmd.items.length) : 0;
  const bodyHeight = Math.max(4, height - 2 - banner - TABS_HEIGHT);

  const profileColor = store.profile.color ?? idHex(store.identity.id);
  const tabActive = idle;

  const footer = (hints: string[]): ReactNode => (
    <>
      {bottom?.kind === 'dialog' ? (
        <Dialog spec={bottom.spec} width={width} />
      ) : bottom?.kind === 'secret' ? (
        <SecretPrompt title={bottom.title} hint={bottom.hint} width={width} onDone={bottom.resolve} />
      ) : commandMode ? (
        <>
          <InputBox state={editor} onChange={setEditor} onSubmit={cmd.submit} onKey={cmd.onKey} isActive width={width} history={history} borderColor={theme.accent} singleLine />
          <CommandMenu items={cmd.items} selected={cmd.selected} width={width} />
        </>
      ) : null}
      <Footer
        hints={commandMode ? ['enter run', 'tab complete', 'esc cancel'] : bottom ? [] : capture ? hints : [...hints, '/ commands', '? help', 'q quit']}
        toast={store.toast}
        width={width}
      />
    </>
  );

  const props = { store, width, actions, footer, height: bodyHeight, bottomRows: bottomHeight, active: tabActive, selectedKey: selected[tab] ?? null, onSelect: select(tab) };
  let body: ReactNode;
  if (overlay) body = <TextPanel title={overlay.title} text={overlay.text} width={width} height={bodyHeight} onClose={() => setOverlay(null)} />;
  else if (tab === 'friends') body = <FriendsTab {...props} />;
  else if (tab === 'apps') body = <AppsTab {...props} />;
  else if (tab === 'profile') body = <ProfileTab {...props} />;
  else body = <SettingsTab {...props} />;

  const requests = store.friendsData().requests.length;
  const updates = store.appList().filter((e) => e.status.kind === 'update').length + (store.updateAvailable ? 1 : 0);
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Header
        app="termhub"
        version={VERSION}
        width={width}
        me={{ ...store.me, color: profileColor }}
        address={store.me.ips[0] ? `${store.me.ips[0]}:${store.me.port}` : 'no network'}
        online={store.onlineCount()}
        updateAvailable={store.updateAvailable}
      />
      {showBanner ? <Banner width={width} compact={compact} color={profileColor} animate={store.isFocused && idle} mode={store.settings.animations} /> : null}
      <Tabs active={tab} width={width} badges={{ ...(requests ? { friends: `${requests}` } : {}), ...(updates ? { apps: `⬆${updates}` } : {}) }} />
      {body}
    </Box>
  );
}
