import os from 'node:os';
import path from 'node:path';
import { Box, Text, useInput } from 'ink';
import { useState, type ReactNode } from 'react';
import { tildify } from 'termcore/app/paths';
import { MAX_STATUS_MSG, PROFILE_COLORS, STATUS_LABEL, type Status } from 'termcore/friends/profile';
import { formatId } from 'termcore/net/identity';
import { Swatches, swatchRows } from 'termcore/ui/components/Swatches';
import { useWheel } from 'termcore/ui/mouse';
import { presenceDot } from 'termcore/ui/presence';
import { idHex, theme } from 'termcore/ui/theme';
import { MIN_PASSPHRASE } from '../../core/backup.js';
import type { HubStore } from '../../core/store.js';
import type { Actions } from '../actions.js';
import { buildLines, Card, Field, Note, Pointer, SectionTitle, splitLayout, visibleLines } from '../components/List.js';

type RowId = 'name' | 'color' | 'status' | 'message' | 'id' | 'export' | 'import';
const ROWS: { id: RowId; label: string; section: string }[] = [
  { id: 'name', label: 'Name', section: 'Profile' },
  { id: 'color', label: 'Color', section: 'Profile' },
  { id: 'status', label: 'Status', section: 'Profile' },
  { id: 'message', label: 'Status message', section: 'Profile' },
  { id: 'id', label: 'Your ID', section: 'Identity' },
  { id: 'export', label: 'Export a backup …', section: 'Backup' },
  { id: 'import', label: 'Restore a backup …', section: 'Backup' },
];

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

/** "~/x" → the full path. */
export const expandHome = (p: string) => path.resolve(p.replace(/^~(?=$|[/\\])/, os.homedir()));

export const defaultBackupFile = (name: string, now = new Date()) =>
  path.join(os.homedir(), `termhub-backup-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'me'}-${now.toISOString().slice(0, 10)}.thb`);

/** Asks for a new passphrase twice (hidden); null if cancelled or they didn't match. */
export async function newPassphrase(actions: Actions, store: HubStore): Promise<string | null> {
  for (;;) {
    const first = await actions.secret('Passphrase for the backup', `At least ${MIN_PASSPHRASE} characters – without it the backup can't be opened`);
    if (first === null) return null;
    if ([...first].length < MIN_PASSPHRASE) {
      store.showToast(`The passphrase needs at least ${MIN_PASSPHRASE} characters`, 'error');
      continue;
    }
    const second = await actions.secret('The same passphrase again');
    if (second === null) return null;
    if (second === first) return first;
    store.showToast("The two passphrases don't match – try again", 'error');
  }
}

/** Export: where to, passphrase twice, write (0600). */
export async function exportFlow(actions: Actions, store: HubStore): Promise<void> {
  const file = await actions.prompt('Save the backup as', { hint: 'Your identity, profile, friends and settings – no chats or other app data', initial: tildify(defaultBackupFile(store.profile.name)) });
  if (!file) return;
  const pass = await newPassphrase(actions, store);
  if (!pass) return;
  store.showToast('Encrypting …');
  const target = expandHome(file);
  const s = store.exportBackup(target, pass);
  store.showToast(`Backup of ${s.name} with ${s.friends === 1 ? '1 friend' : `${s.friends} friends`} saved to ${tildify(target)}`, 'success');
}

/** Import: which file, the warning, passphrase, restore, then start over with the new identity. */
export async function importFlow(actions: Actions, store: HubStore): Promise<void> {
  const busy = await store.appsInTheWay();
  if (busy.length) {
    store.showToast(`Quit ${busy.join(', ')} first – a restore needs all apps closed`, 'error');
    return;
  }
  const file = await actions.prompt('Restore which backup?', { hint: 'The .thb file you exported (in any termhub)' });
  if (!file) return;
  const ok = await actions.confirm('This replaces your identity and friends on this computer. Go on?');
  if (!ok) return;
  const pass = await actions.secret('Passphrase of the backup');
  if (pass === null) return;
  store.showToast('Decrypting …');
  const r = await store.importBackup(expandHome(file), pass);
  actions.print(
    `Restored ${r.summary.name} (${formatId(r.summary.id)}) with ${r.summary.friends === 1 ? '1 friend' : `${r.summary.friends} friends`}${r.savedTo ? ` – the previous profile is in ${tildify(r.savedTo)}` : ''}`,
    'success',
  );
  actions.reload();
}

const COLOR_OPTIONS = PROFILE_COLORS;

export function ProfileTab({ store, width, height: full, actions, active, selectedKey, onSelect, footer, bottomRows }: Props) {
  const height = Math.max(2, full - 1 - bottomRows);
  const profile = store.profile;
  const me = store.identity;
  let selected = ROWS.findIndex((r) => r.id === selectedKey);
  if (selected === -1) selected = 0;
  const current = ROWS[selected]!;
  const [picking, setPicking] = useState<number | null>(null);
  const myColor = profile.color ?? idHex(me.id);

  const run = (fn: () => void | Promise<unknown>) => {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((err: Error) => store.showToast(err.message, 'error'));
    } catch (err) {
      store.showToast((err as Error).message, 'error');
    }
  };
  const stopPicking = () => {
    setPicking(null);
    actions.capture(false);
  };
  const move = (d: number) => onSelect(ROWS[Math.max(0, Math.min(ROWS.length - 1, selected + d))]!.id);
  useWheel((dir) => (picking === null ? move(dir) : setPicking((p) => Math.max(0, Math.min(COLOR_OPTIONS.length - 1, (p ?? 0) + dir)))), active);

  const activate = () => {
    switch (current.id) {
      case 'name':
        return void actions.prompt('Your name', { hint: 'Friends see it in every app', initial: profile.name }).then((v) => {
          if (v) run(() => void store.setName(v));
        });
      case 'color': {
        const i = COLOR_OPTIONS.findIndex((c) => c.hex === profile.color);
        setPicking(i === -1 ? 0 : i);
        return actions.capture(true);
      }
      case 'status':
        return void actions
          .pick(
            'Your status',
            (['available', 'busy', 'dnd'] as Status[]).map((s) => ({ id: s, label: STATUS_LABEL[s], hint: s === 'dnd' ? 'no pop-ups or notifications in any app' : undefined })),
            profile.status,
          )
          .then((v) => {
            if (v) run(() => store.setStatus(v as Status));
          });
      case 'message':
        return void actions.prompt('Status message', { hint: `Up to ${MAX_STATUS_MSG} characters, shown next to your name – empty clears it`, initial: profile.statusMsg }).then((v) => {
          if (v !== null) run(() => store.setStatusMsg(v));
        });
      case 'id':
        return actions.panel('Your ID', idText(me.id));
      case 'export':
        return run(() => exportFlow(actions, store));
      case 'import':
        return run(() => importFlow(actions, store));
    }
  };

  useInput(
    (input, key) => {
      if (picking !== null) {
        const n = COLOR_OPTIONS.length;
        if (key.leftArrow || input === 'h' || key.upArrow) return setPicking((p) => ((p ?? 0) - 1 + n) % n);
        if (key.rightArrow || input === 'l' || key.downArrow || key.tab) return setPicking((p) => ((p ?? 0) + 1) % n);
        if (key.escape) return stopPicking();
        if (key.return) {
          const c = COLOR_OPTIONS[picking]!;
          run(() => store.setColor(c.hex));
          store.showToast(`Your color is ${c.name} now – in every app`, 'success');
          return stopPicking();
        }
        if (input === 'c') {
          stopPicking();
          return void actions.prompt('Your color as #rrggbb', { hint: 'e.g. #ff8800', initial: profile.color }).then((v) => {
            if (v) run(() => store.setColor(v));
          });
        }
        if (input === '0') {
          run(() => store.setColor(undefined));
          store.showToast('Your color comes from your ID again', 'success');
          return stopPicking();
        }
        return;
      }
      if (key.upArrow || input === 'k') return move(-1);
      if (key.downArrow || input === 'j') return move(1);
      if (key.return) return activate();
      if (input === 'e') return run(() => exportFlow(actions, store));
    },
    { isActive: active },
  );

  const previewColor = picking !== null ? COLOR_OPTIONS[picking]!.hex : myColor;
  const L = splitLayout(width, height, 12);
  const inner = L.listWidth - 2;
  const entries = ROWS;
  const lines = buildLines(
    ['Profile', 'Identity', 'Backup'].map((section) => ({ title: section, entries: ROWS.filter((r) => r.section === section) })),
    entries,
  );
  // the swatches open under the color row
  const pickerRows = picking !== null ? swatchRows(COLOR_OPTIONS.length, inner - 4) + 1 : 0;
  const visible = visibleLines(lines, selected, L.listHeight - pickerRows);
  const dot = presenceDot({ online: true, status: profile.status });

  const value = (id: RowId): ReactNode => {
    switch (id) {
      case 'name':
        return (
          <Text bold color={previewColor}>
            {profile.name}
          </Text>
        );
      case 'color': {
        const named = PROFILE_COLORS.find((c) => c.hex === (picking !== null ? previewColor : profile.color));
        return (
          <Text>
            <Text color={previewColor}>██ </Text>
            <Text color={theme.dim}>{named ? named.name : profile.color && picking === null ? profile.color : picking !== null ? previewColor : 'from your ID'}</Text>
          </Text>
        );
      }
      case 'status':
        return (
          <Text>
            <Text color={dot.color}>{profile.status === 'available' ? '●' : dot.icon} </Text>
            {STATUS_LABEL[profile.status]}
          </Text>
        );
      case 'message':
        return profile.statusMsg ? <Text>{profile.statusMsg}</Text> : <Text color={theme.faint}>–</Text>;
      case 'id':
        return <Text color={theme.dim}>{formatId(me.id, true)}</Text>;
      default:
        return null;
    }
  };

  const hints =
    picking !== null
      ? ['←→ choose', 'enter apply', 'c custom #rrggbb', '0 from my ID', 'esc cancel']
      : ['↑↓ select', current.id === 'id' ? 'enter details' : current.id.startsWith('ex') || current.id.startsWith('im') ? 'enter start' : 'enter change', 'e export backup'];

  return (
    <Box flexDirection="column" width={width} height={full}>
      <Box flexDirection={L.side ? 'row' : 'column'} width={width} height={height} overflow="hidden">
        <Box flexDirection="column" width={L.listWidth} height={L.listHeight} paddingX={1} overflow="hidden" flexShrink={0}>
          {visible.map((l, i) => {
            if (l.kind === 'gap') return <Text key={`g${i}`}> </Text>;
            if (l.kind === 'section') return <SectionTitle key={`s${i}`} title={l.title} />;
            if (l.kind === 'note') return <Note key={`n${i}`} text={l.text} />;
            const r = l.entry;
            const sel = l.index === selected;
            return (
              <Box key={r.id} flexDirection="column">
                <Box>
                  <Pointer selected={sel} />
                  <Box width={20} flexShrink={0}>
                    <Text bold={sel} color={sel ? theme.accent : undefined} wrap="truncate-end">
                      {r.label}
                    </Text>
                  </Box>
                  <Box flexShrink={1} minWidth={0}>
                    {value(r.id)}
                  </Box>
                </Box>
                {r.id === 'color' && picking !== null ? (
                  <Box paddingLeft={4} flexDirection="column">
                    <Swatches colors={COLOR_OPTIONS} selected={picking} width={inner - 4} />
                    <Text color={theme.dim}>{COLOR_OPTIONS[picking]!.name}</Text>
                  </Box>
                ) : null}
              </Box>
            );
          })}
        </Box>
        {L.showPanel ? (
          <Box marginLeft={L.side ? 1 : 0} flexShrink={0} height={L.panelHeight} overflow="hidden">
            <Explain row={current.id} store={store} width={L.panelWidth} height={L.panelHeight} color={previewColor} />
          </Box>
        ) : null}
      </Box>
      {footer(hints)}
    </Box>
  );
}

export function idText(id: string): string {
  return [
    '### Your ID',
    '',
    `\`${formatId(id, true)}\``,
    '',
    "It comes from a secret key that never leaves this computer (and your encrypted backups). That's how friends recognize you in every app – even when your name or address changes.",
    '',
    '### Safety codes',
    '',
    'For every friend there is a safety code (Friends tab, or /whois). It is made from both of your keys: if the code is the same on both screens, nobody can sit in the middle of your connections. Compare it once in person or on the phone.',
  ].join('\n');
}

function Explain({ row, store, width, height, color }: { row: RowId; store: HubStore; width: number; height: number; color: string }) {
  const profile = store.profile;
  switch (row) {
    case 'name':
    case 'color':
      return (
        <Card title="How friends see you" width={width} height={height}>
          <Text> </Text>
          <Text>
            {'  '}
            <Text bold color={color}>
              {profile.name}
            </Text>
            {profile.status !== 'available' ? <Text color={theme.dim}> · {STATUS_LABEL[profile.status]}</Text> : null}
          </Text>
          <Text> </Text>
          <Text color={theme.dim} wrap="wrap">
            Name and color are the same in termchat, keyrace and termdrop. Changes reach your friends right away – through
            every app you have open.
          </Text>
        </Card>
      );
    case 'status':
    case 'message':
      return (
        <Card title="Status" width={width} height={height}>
          <Text wrap="wrap">
            <Text color={theme.success}>● available</Text> <Text color={theme.dim}>– as usual</Text>
          </Text>
          <Text wrap="wrap">
            <Text color={theme.warning}>◑ busy</Text> <Text color={theme.dim}>– friends see it, nothing else changes</Text>
          </Text>
          <Text wrap="wrap">
            <Text color={theme.error}>⊘ do not disturb</Text>
          </Text>
          <Text color={theme.dim} wrap="wrap">
            {'  '}no desktop notifications or pop-ups in any app: termchat messages arrive quietly, keyrace invites and
            termdrop offers (even from trusted friends) wait under Requests.
          </Text>
          <Text> </Text>
          <Text color={theme.dim} wrap="wrap">
            The message (up to {MAX_STATUS_MSG} characters) appears next to your name.
          </Text>
        </Card>
      );
    case 'id':
      return (
        <Card title="Your ID" width={width} height={height}>
          <Text color={theme.accent} wrap="wrap">
            {formatId(store.identity.id, true)}
          </Text>
          <Text> </Text>
          <Text color={theme.dim} wrap="wrap">
            Made from a secret key on this computer. Friends recognize you by it, in every app, whatever your name or address.
          </Text>
          <Text> </Text>
          <Text color={theme.dim} wrap="wrap">
            Safety code: made from both your keys – the same on both screens means nobody is in the middle. See it per friend
            under Friends.
          </Text>
        </Card>
      );
    case 'export':
    case 'import':
      return (
        <Card title="Backup" width={width} height={height}>
          <Text color={theme.dim} wrap="wrap">
            One file with your key, profile, friends and settings, encrypted with a passphrase (scrypt + ChaCha20-Poly1305).
            Chats, results and transfers aren't in it.
          </Text>
          <Text> </Text>
          <Text color={theme.dim} wrap="wrap">
            Restoring it on another computer makes that computer you – with all your friends. It replaces the identity that
            was there (a copy goes to ~/.termhub/legacy). All apps have to be closed for it.
          </Text>
          <Text> </Text>
          <Field label="CLI">
            <Text color={theme.accent}>termhub backup|restore &lt;file&gt;</Text>
          </Field>
        </Card>
      );
  }
}
