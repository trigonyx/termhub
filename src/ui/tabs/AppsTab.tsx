import { Box, Text, useInput } from 'ink';
import type { ReactNode } from 'react';
import { tildify } from 'termcore/app/paths';
import { useWheel } from 'termcore/ui/mouse';
import { icons, theme } from 'termcore/ui/theme';
import { statusLabel, type AppStatus } from '../../apps/detect.js';
import type { AppEntry, HubStore } from '../../core/store.js';
import { VERSION } from '../../core/version.js';
import type { Actions } from '../actions.js';
import { Card, Field, Pointer, SectionTitle, splitLayout } from '../components/List.js';
import { TaskPanel, taskPanelRows } from '../components/TaskPanel.js';

/** The rows: every app of the catalog, then termhub itself. */
type Row = { type: 'app'; key: string; e: AppEntry } | { type: 'self'; key: 'termhub' };

interface Props {
  store: HubStore;
  width: number;
  height: number;
  actions: Actions;
  active: boolean;
  selectedKey: string | null;
  onSelect(key: string | null): void;
  footer(hints: string[]): ReactNode;
  /** rows the shell needs under the tab (a dialog or the command input), above the footer */
  bottomRows: number;
}

/** What the badge counts, in words: "2 unread messages", "1 invite". */
export function waitingText(id: string, n: number): string {
  const [one, many] = id === 'termchat' ? ['unread message', 'unread messages'] : id === 'keyrace' ? ['race invite', 'race invites'] : id === 'termdrop' ? ['file offer', 'file offers'] : ['new thing', 'new things'];
  return `${n} ${n === 1 ? one : many}`;
}

const statusColor = (s: AppStatus) => (s.kind === 'update' ? theme.accent : s.kind === 'current' ? theme.success : s.kind === 'broken' ? theme.error : theme.faint);

export function appsHints(row: Row | undefined, store: HubStore): string[] {
  const task = store.task;
  if (task && !task.running) return ['esc close', ...(task.restart ? ['enter restart termhub'] : [])];
  if (task?.running) return [`${task.title} …`];
  const base = ['↑↓ select'];
  if (row?.type === 'self') {
    base.push(store.updateAvailable ? 'u update' : 'u check', 'w what’s new');
  } else if (row) {
    const s = row.e.status;
    if (s.kind === 'missing') base.push('i install');
    else {
      if (s.kind !== 'broken') base.push('enter open');
      base.push(s.kind === 'update' || s.kind === 'broken' ? 'u update' : 'u check', 'x remove');
    }
    base.push('w what’s new');
  }
  return [...base, 'U update all', 'r refresh'];
}

export function AppsTab({ store, width, height: full, actions, active, selectedKey, onSelect, footer, bottomRows }: Props) {
  const height = Math.max(2, full - 1 - bottomRows);
  const entries = store.appList();
  const rows: Row[] = [...entries.map((e): Row => ({ type: 'app', key: e.app.id, e })), { type: 'self', key: 'termhub' }];
  let selected = rows.findIndex((r) => r.key === selectedKey);
  if (selected === -1) selected = 0;
  const current = rows[selected];
  const task = store.task;

  const run = (fn: () => Promise<unknown>) => {
    fn().catch((err: Error) => store.showToast(err.message, 'error'));
  };
  const move = (d: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, selected + d));
    onSelect(rows[next]!.key);
  };
  useWheel((dir) => move(dir), active && !task);

  const whatsNew = (id: string) =>
    run(async () => {
      store.showToast('Loading the changelog …');
      const w = await store.whatsNew(id);
      actions.panel(w.title, w.text);
    });

  useInput(
    (input, key) => {
      if (task) {
        if (task.running) return;
        if (key.return && task.restart) {
          store.restart();
          return actions.quit();
        }
        // (q stays "quit", like everywhere)
        if (key.escape || key.return) store.dismissTask();
        return;
      }
      if (key.upArrow || input === 'k') return move(-1);
      if (key.downArrow || input === 'j') return move(1);
      if (input === 'U') return run(() => store.updateAll());
      if (input === 'r') {
        store.showToast('Checking installed apps and versions …');
        return run(() => store.refreshApps({ catalog: true, latest: true }));
      }
      if (!current) return;
      if (current.type === 'self') {
        if (key.return) return store.showToast("That's this app – you're in it", 'info');
        if (input === 'u') return run(() => store.updateTermhub());
        if (input === 'w') return whatsNew('termhub');
        return;
      }
      const e = current.e;
      const id = e.app.id;
      if (key.return) {
        try {
          store.launchRequest(id);
          actions.launch(id);
        } catch (err) {
          store.showToast((err as Error).message, 'error');
        }
        return;
      }
      if (input === 'i') return run(() => store.install(id));
      if (input === 'u') {
        if (e.status.kind === 'current' && e.latest !== undefined) return store.showToast(`${e.app.name} ${e.status.version} is the newest version`, 'success');
        return run(() => store.update(id));
      }
      if (input === 'x') {
        if (e.status.kind === 'missing') return store.showToast(`${e.app.name} isn't installed`, 'info');
        void actions.confirm(`Remove ${e.app.name}? Your profile, friends and ${e.app.name}'s data stay.`).then((ok) => {
          if (ok) run(() => store.uninstall(id));
        });
        return;
      }
      if (input === 'w') return whatsNew(id);
    },
    { isActive: active },
  );

  const panelRows = task ? Math.max(taskPanelRows(task), 12) : 12;
  const L = splitLayout(width, height, panelRows);
  const inner = L.listWidth - 2;
  const avail = entries.filter((e) => e.status.kind === 'update').length;
  const source = store.catalog.source === 'network' ? '' : store.catalog.source === 'cache' ? ' · offline, from the cache' : ' · offline, built-in list';

  return (
    <Box flexDirection="column" width={width} height={full}>
      <Box flexDirection={L.side ? 'row' : 'column'} width={width} height={height} overflow="hidden">
        <Box flexDirection="column" width={L.listWidth} height={L.listHeight} paddingX={1} overflow="hidden" flexShrink={0}>
          <SectionTitle title={`Apps${avail ? ` · ${avail} update${avail === 1 ? '' : 's'}` : ''}${source}`} />
          {windowRows(rows, selected, L.listHeight - 1).map((r) => (
            <AppRow key={r.key} row={r} store={store} selected={r.key === rows[selected]?.key} width={inner} gap={L.listHeight - 1 > rows.length} />
          ))}
          {L.listHeight - rows.length - 2 >= 2 ? (
            <Box marginTop={1} paddingLeft={2}>
              <Text color={theme.faint} wrap="truncate-end">
                enter opens an app right here – quit it to come back
              </Text>
            </Box>
          ) : null}
        </Box>
        {L.showPanel ? (
          <Box marginLeft={L.side ? 1 : 0} flexShrink={0} height={L.panelHeight} overflow="hidden">
            {task ? <TaskPanel task={task} width={L.panelWidth} height={L.panelHeight} /> : <Detail store={store} row={current} width={L.panelWidth} height={L.panelHeight} />}
          </Box>
        ) : null}
      </Box>
      {footer(appsHints(current, store))}
    </Box>
  );
}

/** The rows that fit, scrolled to the selection. */
function windowRows(rows: Row[], selected: number, height: number): Row[] {
  if (rows.length <= height) return rows;
  const start = Math.max(0, Math.min(selected - Math.floor(height / 2), rows.length - height));
  return rows.slice(start, start + height);
}

function AppRow({ row, store, selected, width, gap }: { row: Row; store: HubStore; selected: boolean; width: number; gap: boolean }) {
  const nameWidth = 12;
  if (row.type === 'self') {
    const up = store.updateAvailable;
    return (
      <Box marginTop={gap ? 1 : 0}>
        <Pointer selected={selected} />
        <Box width={2} flexShrink={0}>
          <Text color={theme.accent}>⌂</Text>
        </Box>
        <Box width={nameWidth + 7} flexShrink={0}>
          <Text bold={selected} color={selected ? theme.accent : undefined} wrap="truncate-end">
            termhub <Text color={theme.dim}>(this app)</Text>
          </Text>
        </Box>
        <Text color={up ? theme.accent : theme.success} wrap="truncate-end">
          {up ? `⬆ ${VERSION} → ${up}` : `✓ ${VERSION}`}
          {store.self.newIn ? <Text color={theme.dim}> · new in {store.self.newIn.to}</Text> : null}
        </Text>
      </Box>
    );
  }
  const e = row.e;
  const badge = store.badge(e.app.id);
  const checking = e.detected === undefined;
  const label = checking ? 'checking …' : statusLabel(e.status);
  const statusWidth = Math.min(22, Math.max(12, label.length + 1));
  return (
    <Box>
      <Pointer selected={selected} />
      <Box width={2} flexShrink={0}>
        <Text color={theme.accent}>{e.app.icon ?? '·'}</Text>
      </Box>
      <Box width={nameWidth} flexShrink={0}>
        <Text bold={selected} color={selected ? theme.accent : undefined} wrap="truncate-end">
          {e.app.name}
        </Text>
      </Box>
      <Box width={statusWidth} flexShrink={0}>
        <Text color={checking ? theme.faint : statusColor(e.status)} wrap="truncate-end">
          {label}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          {e.running ? <Text color={theme.success}>{icons.online} running </Text> : null}
          {e.newIn ? <Text color={theme.accent}>new in {e.newIn.to} </Text> : null}
          {width >= 70 ? <Text color={theme.dim}>{e.app.description}</Text> : null}
        </Text>
      </Box>
      <Box width={5} flexShrink={0} justifyContent="flex-end">
        {badge > 0 ? (
          <Text backgroundColor={theme.accent} color={theme.onAccent} bold>
            {` ${badge > 99 ? '99+' : badge} `}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

function Detail({ store, row, width, height }: { store: HubStore; row: Row | undefined; width: number; height: number }) {
  if (!row) return null;
  if (row.type === 'self') {
    const up = store.updateAvailable;
    return (
      <Card title="termhub" width={width} height={height}>
        <Text color={theme.dim} wrap="wrap">
          This app: your profile, friends and settings for the whole suite, and the launcher.
        </Text>
        <Text> </Text>
        <Field label="Installed">{VERSION}</Field>
        <Field label="Newest">{store.self.latest === undefined ? 'checking …' : (store.self.latest ?? 'unknown (offline?)')}</Field>
        <Field label="Runs from">{store.self.kind === 'npm' ? 'npm install' : 'a source folder'}</Field>
        <Text> </Text>
        {up ? (
          <Text color={theme.accent} wrap="wrap">
            {VERSION} → {up}: u updates termhub (then restart it). U updates every app and termhub last.
          </Text>
        ) : (
          <Text color={theme.dim}>Up to date.</Text>
        )}
      </Card>
    );
  }
  const e = row.e;
  const d = e.detected;
  const main = d?.state === 'installed' ? d.main : null;
  const where = main ? (main.kind === 'global' ? "npm's global folder" : main.kind === 'local' ? tildify(main.where.replace(/[/\\]node_modules[/\\][^/\\]+$/, '')) : tildify(main.where)) : '–';
  const node = e.app.node ? `Node.js ${e.app.node}+` : 'any';
  const badge = store.badge(e.app.id);
  return (
    <Card title={`${e.app.icon ? `${e.app.icon} ` : ''}${e.app.name}`} width={width} height={height}>
      <Text color={theme.dim} wrap="wrap">
        {e.app.description || ' '}
      </Text>
      <Text> </Text>
      <Field label="Installed">{d === undefined ? 'checking …' : d.state === 'installed' ? d.version : d.state === 'broken' ? 'broken' : 'no'}</Field>
      <Field label="Newest">{e.latest === undefined ? 'checking …' : (e.latest ?? 'unknown (offline?)')}</Field>
      <Field label="Where">{where}</Field>
      <Field label="Needs">{node}</Field>
      <Field label="Repo">{e.app.repo}</Field>
      {badge > 0 ? (
        <Field label="Waiting">
          <Text color={theme.accent} wrap="truncate-end">
            {waitingText(e.app.id, badge)}
          </Text>
        </Field>
      ) : null}
      <Text> </Text>
      {d?.state === 'broken' ? (
        <Text color={theme.error} wrap="wrap">
          {d.reason}. u installs it again.
        </Text>
      ) : e.running ? (
        <Text color={theme.success} wrap="wrap">
          {icons.online} Open in another window right now – it can't be opened, updated or removed here until you quit it.
        </Text>
      ) : e.newIn ? (
        <Text color={theme.accent} wrap="wrap">
          New in {e.newIn.to} (you had {e.newIn.from}) – w shows what changed.
        </Text>
      ) : e.status.kind === 'update' ? (
        <Text color={theme.accent} wrap="wrap">
          {e.status.version} → {e.status.latest}: u updates it, w shows what's new.
        </Text>
      ) : e.status.kind === 'missing' ? (
        <Text color={theme.dim} wrap="wrap">
          i installs it from GitHub – no sudo needed.
        </Text>
      ) : (
        <Text color={theme.dim} wrap="wrap">
          enter opens it in this terminal.
        </Text>
      )}
    </Card>
  );
}
