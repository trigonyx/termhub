import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { icons, theme } from 'termcore/ui/theme';

/** One line of a tab's list: a section title, a gap, a hint, or something selectable. */
export type Line<E> = { kind: 'section'; title: string } | { kind: 'gap' } | { kind: 'note'; text: string } | { kind: 'entry'; entry: E; index: number };

/** The lines that fit, scrolled so the selected one is in view (roughly centered). */
export function visibleLines<E>(lines: Line<E>[], selected: number, height: number): Line<E>[] {
  const selLine = lines.findIndex((l) => l.kind === 'entry' && l.index === selected);
  const start = Math.max(0, Math.min(selLine - Math.floor(height / 2), lines.length - height));
  return lines.slice(start, start + height);
}

/** Builds lines from sections (empty ones are left out unless `empty` gives a hint for them). */
export function buildLines<E>(sections: { title: string; entries: E[]; empty?: string; show?: boolean }[], all: E[]): Line<E>[] {
  const lines: Line<E>[] = [];
  for (const s of sections) {
    if (!s.entries.length && !s.empty && !s.show) continue;
    if (lines.length) lines.push({ kind: 'gap' });
    lines.push({ kind: 'section', title: s.title });
    for (const e of s.entries) lines.push({ kind: 'entry', entry: e, index: all.indexOf(e) });
    if (!s.entries.length && s.empty) lines.push({ kind: 'note', text: s.empty });
  }
  return lines;
}

export function SectionTitle({ title }: { title: string }) {
  return (
    <Text color={theme.dim} bold wrap="truncate-end">
      {title.toUpperCase()}
    </Text>
  );
}

export function Note({ text }: { text: string }) {
  return (
    <Box paddingLeft={2}>
      <Text color={theme.faint} wrap="truncate-end">
        {text}
      </Text>
    </Box>
  );
}

/** Fixed-width cell for the pointer, so a crowded row never squeezes it. */
export function Pointer({ selected }: { selected: boolean }) {
  return (
    <Box width={2} flexShrink={0}>
      <Text color={theme.accent}>{selected ? icons.pointer : ' '}</Text>
    </Box>
  );
}

export function Dot({ icon, color }: { icon: string; color: string }) {
  return (
    <Box width={2} flexShrink={0}>
      <Text color={color}>{icon}</Text>
    </Box>
  );
}

/** The side panel: a rounded frame with a title. */
export function Card({ title, width, height, children, accent = false }: { title: string; width: number; height?: number; children: ReactNode; accent?: boolean }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={accent ? theme.accent : theme.border} paddingX={1} width={width} height={height} overflow="hidden" flexShrink={0}>
      {/* never squeezed: what doesn't fit is cut off at the bottom */}
      <Box flexDirection="column" flexShrink={0}>
        <Text bold wrap="truncate-end">
          {title}
        </Text>
        {children}
      </Box>
    </Box>
  );
}

/** "label   value" in a card. */
export function Field({ label, children, width = 10 }: { label: string; children: ReactNode; width?: number }) {
  return (
    <Box>
      <Box width={width} flexShrink={0}>
        <Text color={theme.dim}>{label}</Text>
      </Box>
      <Box flexShrink={1} minWidth={0}>
        {typeof children === 'string' ? <Text wrap="truncate-end">{children}</Text> : children}
      </Box>
    </Box>
  );
}

/** Side by side from this width on; below it the panel goes under the list. */
export const SIDE_BY_SIDE = 84;
export const PANEL_WIDTH = 40;

/** List and panel widths/heights for a tab body. */
export function splitLayout(width: number, height: number, panelRows: number) {
  const side = width >= SIDE_BY_SIDE;
  const panelHeight = side ? height : Math.min(panelRows, Math.max(0, height - 5));
  const showPanel = side || panelHeight >= 4;
  return {
    side,
    showPanel,
    listWidth: side ? width - PANEL_WIDTH - 1 : width,
    listHeight: side ? height : height - (showPanel ? panelHeight : 0),
    panelWidth: side ? PANEL_WIDTH : width,
    panelHeight,
  };
}
