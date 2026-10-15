import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { useWheel } from 'termcore/ui/mouse';
import { renderText } from 'termcore/ui/text';
import { theme } from 'termcore/ui/theme';

/**
 * Longer text (help, What's new, /whois) over the tab: ↑↓/space scroll, esc/q/enter close.
 * termcore's renderText does headings, bullets, `code` and _dim_.
 */
export function TextPanel({ title, text, width, height, onClose }: { title: string; text: string; width: number; height: number; onClose(): void }) {
  const lines = renderText(text, width - 6);
  const inner = Math.max(1, height - 4);
  const max = Math.max(0, lines.length - inner);
  const [top, setTop] = useState(0);
  const scroll = (d: number) => setTop((t) => Math.max(0, Math.min(max, t + d)));
  useWheel((dir) => scroll(dir * 3));
  useInput((input, key) => {
    if (key.upArrow || input === 'k') return scroll(-1);
    if (key.downArrow || input === 'j') return scroll(1);
    if (key.pageUp) return scroll(-inner);
    if (key.pageDown || input === ' ') return scroll(inner);
    if (key.escape || key.return || input === 'q' || input === 'w' || input === '?') onClose();
  });
  const shown = lines.slice(top, top + inner);
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={2} width={width} height={height - 1} overflow="hidden">
        <Text bold wrap="truncate-end">
          {title}
        </Text>
        {shown.map((l, i) => (
          <Text key={i} wrap="truncate-end">
            {l || ' '}
          </Text>
        ))}
      </Box>
      <Box paddingX={1}>
        <Text color={theme.dim} wrap="truncate-end">
          {max > 0 ? `↑↓ scroll (${Math.round((top / max) * 100)}%) · ` : ''}esc close
        </Text>
      </Box>
    </Box>
  );
}
