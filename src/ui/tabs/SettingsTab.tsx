import { Box, Text, useInput } from 'ink';
import { useState, type ReactNode } from 'react';
import { PROFILE_COLORS } from 'termcore/friends/profile';
import type { Animations } from 'termcore/store/files';
import { Swatches, swatchRows } from 'termcore/ui/components/Swatches';
import { useWheel } from 'termcore/ui/mouse';
import { DEFAULT_ACCENT, idHex, theme } from 'termcore/ui/theme';
import type { HubStore } from '../../core/store.js';
import type { Actions } from '../actions.js';
import { buildLines, Card, Note, Pointer, SectionTitle, splitLayout, visibleLines } from '../components/List.js';
import { PREVIEW_ROWS, ThemePreview } from '../components/ThemePreview.js';

type RowId = 'accent' | 'animations' | 'notifications' | 'reset';
const ROWS: { id: RowId; label: string; section: string }[] = [
  { id: 'accent', label: 'Accent color', section: 'Look' },
  { id: 'animations', label: 'Animations', section: 'Look' },
  { id: 'notifications', label: 'Desktop notifications', section: 'Notifications' },
  { id: 'reset', label: 'Reset to defaults', section: 'All settings' },
];

/** The accents to choose from: the default orange first, then the palette. */
export const ACCENTS: { name: string; hex: string }[] = [{ name: 'claude orange (default)', hex: DEFAULT_ACCENT.toLowerCase() }, ...PROFILE_COLORS];

const ANIMATION_HINT: Record<Animations, string> = {
  nonstop: "the logo glints every few seconds, termchat's <rgb>/<shine> keep moving",
  brief: 'a glint when a screen appears, then everything rests',
  off: 'nothing moves',
};

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

export function SettingsTab({ store, width, height: full, actions, active, selectedKey, onSelect, footer, bottomRows }: Props) {
  const height = Math.max(2, full - 1 - bottomRows);
  const settings = store.settings;
  let selected = ROWS.findIndex((r) => r.id === selectedKey);
  if (selected === -1) selected = 0;
  const current = ROWS[selected]!;
  const [picking, setPicking] = useState<number | null>(null);
  const accent = (settings.accent ?? DEFAULT_ACCENT).toLowerCase();

  const run = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      store.showToast((err as Error).message, 'error');
    }
  };
  const stop = () => {
    setPicking(null);
    actions.capture(false);
  };
  const move = (d: number) => onSelect(ROWS[Math.max(0, Math.min(ROWS.length - 1, selected + d))]!.id);
  useWheel((dir) => (picking === null ? move(dir) : setPicking((p) => Math.max(0, Math.min(ACCENTS.length - 1, (p ?? 0) + dir)))), active);

  const activate = () => {
    switch (current.id) {
      case 'accent': {
        const i = ACCENTS.findIndex((c) => c.hex === accent);
        setPicking(i === -1 ? 0 : i);
        return actions.capture(true);
      }
      case 'animations':
        return void actions
          .pick(
            'Animations',
            (['nonstop', 'brief', 'off'] as Animations[]).map((m) => ({ id: m, label: m, hint: ANIMATION_HINT[m] })),
            settings.animations,
          )
          .then((v) => {
            if (v) run(() => store.setAnimations(v as Animations));
          });
      case 'notifications':
        run(() => store.setNotifications(!settings.notifications));
        return store.showToast(`Desktop notifications ${settings.notifications ? 'off' : 'on'} – in every app`, 'success');
      case 'reset':
        return void actions.confirm('Reset accent, animations and notifications to their defaults (for every app)?').then((ok) => {
          if (ok) run(() => store.resetSettings());
        });
    }
  };

  useInput(
    (input, key) => {
      if (picking !== null) {
        const n = ACCENTS.length;
        if (key.leftArrow || input === 'h' || key.upArrow) return setPicking((p) => ((p ?? 0) - 1 + n) % n);
        if (key.rightArrow || input === 'l' || key.downArrow || key.tab) return setPicking((p) => ((p ?? 0) + 1) % n);
        if (key.escape) return stop();
        if (key.return) {
          const c = ACCENTS[picking]!;
          run(() => store.setAccent(picking === 0 ? undefined : c.hex));
          store.showToast(`Accent: ${c.name} – every open app takes it right away`, 'success');
          return stop();
        }
        if (input === 'c') {
          stop();
          return void actions.prompt('Accent color as #rrggbb', { hint: 'e.g. #ff8800', initial: settings.accent }).then((v) => {
            if (v) run(() => store.setAccent(v));
          });
        }
        return;
      }
      if (key.upArrow || input === 'k') return move(-1);
      if (key.downArrow || input === 'j') return move(1);
      if (key.return || (input === ' ' && current.id === 'notifications')) return activate();
    },
    { isActive: active },
  );

  const previewAccent = picking !== null ? ACCENTS[picking]!.hex : accent;
  const L = splitLayout(width, height, PREVIEW_ROWS + 4);
  const inner = L.listWidth - 2;
  const lines = buildLines(
    ['Look', 'Notifications', 'All settings'].map((section) => ({ title: section, entries: ROWS.filter((r) => r.section === section) })),
    ROWS,
  );
  const pickerRows = picking !== null ? swatchRows(ACCENTS.length, inner - 4) + 1 : 0;
  const visible = visibleLines(lines, selected, L.listHeight - pickerRows);

  const value = (id: RowId): ReactNode => {
    switch (id) {
      case 'accent': {
        const named = ACCENTS.find((c) => c.hex === previewAccent);
        return (
          <Text>
            <Text color={previewAccent}>██ </Text>
            <Text color={theme.dim}>{named?.name ?? previewAccent}</Text>
          </Text>
        );
      }
      case 'animations':
        return <Text>{settings.animations}</Text>;
      case 'notifications':
        return <Text color={settings.notifications ? theme.success : theme.dim}>{settings.notifications ? 'on' : 'off'}</Text>;
      default:
        return null;
    }
  };

  const hints = picking !== null ? ['←→ choose', 'enter apply', 'c custom #rrggbb', 'esc cancel'] : ['↑↓ select', current.id === 'notifications' ? 'enter toggle' : current.id === 'reset' ? 'enter reset' : 'enter change'];

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
                  <Box width={24} flexShrink={0}>
                    <Text bold={sel} color={sel ? theme.accent : undefined} wrap="truncate-end">
                      {r.label}
                    </Text>
                  </Box>
                  <Box flexShrink={1} minWidth={0}>
                    {value(r.id)}
                  </Box>
                </Box>
                {r.id === 'accent' && picking !== null ? (
                  <Box paddingLeft={4} flexDirection="column">
                    <Swatches colors={ACCENTS} selected={picking} width={inner - 4} />
                    <Text color={theme.dim}>{ACCENTS[picking]!.name}</Text>
                  </Box>
                ) : null}
              </Box>
            );
          })}
        </Box>
        {L.showPanel ? (
          <Box marginLeft={L.side ? 1 : 0} flexShrink={0} flexDirection="column" height={L.panelHeight} overflow="hidden">
            {current.id === 'accent' || picking !== null ? (
              <>
                <Text color={theme.dim}>{picking !== null ? ' Preview' : ' Every app, in this color'}</Text>
                <ThemePreview accent={previewAccent} width={L.panelWidth} name={store.profile.name} nameColor={store.profile.color ?? idHex(store.identity.id)} />
              </>
            ) : (
              <Explain row={current.id} width={L.panelWidth} height={L.panelHeight} />
            )}
          </Box>
        ) : null}
      </Box>
      {footer(hints)}
    </Box>
  );
}

function Explain({ row, width, height }: { row: RowId; width: number; height: number }) {
  const text: Record<RowId, string> = {
    accent: '',
    animations: `nonstop – ${ANIMATION_HINT.nonstop}\n\nbrief – ${ANIMATION_HINT.brief} (default)\n\noff – ${ANIMATION_HINT.off}`,
    notifications:
      "A desktop banner when something happens while the terminal is in the background: a message, a race invite, a file, a friend request. Never in do not disturb.",
    reset: 'Accent back to the orange, animations brief, notifications on. Profile and friends stay as they are.',
  };
  return (
    <Card title="Shared by all apps" width={width} height={height}>
      {text[row].split('\n').map((l, i) => (
        <Text key={i} color={theme.dim} wrap="wrap">
          {l || ' '}
        </Text>
      ))}
      <Text> </Text>
      <Text color={theme.faint} wrap="wrap">
        Saved in ~/.termhub/settings.json – open apps change right away.
      </Text>
    </Card>
  );
}
