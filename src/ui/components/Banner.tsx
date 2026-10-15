import { Box, Text } from 'ink';
import chalk from 'chalk';
import stringWidth from 'string-width';
import type { Animations } from 'termcore/store/files';
import { hexToRgb, shineColor, SHINE_SWEEP, useShine } from 'termcore/ui/effects';
import { theme } from 'termcore/ui/theme';

/** "TERMHUB" in the ANSI Shadow figlet font (like keyrace's and termdrop's logos): 61 columns, 6 rows. */
export const LOGO = [
  '████████╗███████╗██████╗ ███╗   ███╗██╗  ██╗██╗   ██╗██████╗ ',
  '╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║  ██║██║   ██║██╔══██╗',
  '   ██║   █████╗  ██████╔╝██╔████╔██║███████║██║   ██║██████╔╝',
  '   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══██║██║   ██║██╔══██╗',
  '   ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║  ██║╚██████╔╝██████╔╝',
  '   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ',
];

/** Compact variant for narrow or short terminals: 29 columns, 2 rows. */
export const LOGO_SMALL = ['▀█▀ █▀▀ █▀█ █▀▄▀█ █ █ █ █ █▄▄', ' █  ██▄ █▀▄ █ ▀ █ █▀█ █▄█ █▄█'];

/** Where "HUB" starts in the small logo. */
const SMALL_HUB = 18;

export const LOGO_WIDTH = stringWidth(LOGO[0]!);

/** Big logo only where it fits comfortably. */
export function bannerCompact(width: number, rows: number): boolean {
  return width < 80 || rows < 34;
}

/** Rows the banner takes (logo and a gap). */
export function bannerHeight(compact: boolean): number {
  return (compact ? LOGO_SMALL.length : LOGO.length) + 1;
}

/**
 * Paints one logo line: the letters in the accent color, and – quietly – yours: the shadow
 * strokes of the big logo, or "HUB" in the small one, in your profile color. The glint runs
 * across both (`t` < 0: resting).
 */
export function paintLine(line: string, row: number, width: number, accent: string, mine: string, t: number, compact: boolean): string {
  let out = '';
  let col = 0;
  const shining = t >= 0 && t < SHINE_SWEEP;
  for (const ch of line) {
    if (ch === ' ') {
      out += ch;
      col++;
      continue;
    }
    const isShadow = !compact && ch !== '█';
    const hex = (compact ? col >= SMALL_HUB : isShadow) ? mine : accent;
    if (shining) {
      const [r, g, b] = shineColor(hexToRgb(hex), col, row, width, t);
      out += chalk.rgb(Math.round(r), Math.round(g), Math.round(b))(ch);
    } else out += chalk.hex(hex)(ch);
    col++;
  }
  return out;
}

/** The logo on top of every tab: a glint shortly after it appears (see useShine), then it rests. */
export function Banner({ width, compact, color, animate = true, mode = 'brief' }: { width: number; compact: boolean; color: string; animate?: boolean; mode?: Animations }) {
  const t = useShine(animate, mode);
  const lines = compact ? LOGO_SMALL : LOGO;
  const w = Math.max(...lines.map((l) => stringWidth(l)));
  return (
    <Box flexDirection="column" width={width} alignItems="center" flexShrink={0}>
      {lines.map((l, i) => (
        <Text key={i}>{paintLine(l, i, w, theme.accent, color, t, compact)}</Text>
      ))}
      <Text> </Text>
    </Box>
  );
}
