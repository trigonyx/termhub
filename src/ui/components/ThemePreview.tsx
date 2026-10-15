import { Box, Text } from 'ink';
import { icons, theme } from 'termcore/ui/theme';

/** Rows of the preview (frame included). */
export const PREVIEW_ROWS = 9;

/**
 * A small piece of an app in a given accent color – header, a list with a selection and a
 * progress bar – so you see an accent before every app takes it.
 */
export function ThemePreview({ accent, width, name, nameColor }: { accent: string; width: number; name: string; nameColor?: string }) {
  const inner = Math.max(10, width - 4);
  const bar = Math.max(4, inner - 12);
  const filled = Math.round(bar * 0.62);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} width={width} flexShrink={0}>
      <Text wrap="truncate-end">
        <Text backgroundColor={accent} color={theme.onAccent} bold>
          {' termchat '}
        </Text>
        <Text color={theme.faint}> v2.1.0 </Text>
        <Text bold color={nameColor}>
          {name}
        </Text>
      </Text>
      <Text color={theme.faint}>{'─'.repeat(inner)}</Text>
      <Text wrap="truncate-end">
        <Text color={accent}>{icons.pointer} </Text>
        <Text color={theme.success}>{icons.online} </Text>
        <Text color={accent} bold>
          Sam
        </Text>
        <Text color={theme.dim}> · see you at 4?</Text>
      </Text>
      <Text wrap="truncate-end">
        {'  '}
        <Text color={theme.faint}>{icons.offline} </Text>
        Robin<Text color={theme.dim}> · last seen 2h ago</Text>
      </Text>
      <Text> </Text>
      <Text wrap="truncate-end">
        <Text color={accent}>{'█'.repeat(filled)}</Text>
        <Text color={theme.faint}>{'░'.repeat(bar - filled)}</Text>
        <Text color={theme.dim}> 62% </Text>
        <Text color={accent}>/help</Text>
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        <Text color={accent}>enter</Text> open · <Text color={accent}>/</Text> commands
      </Text>
    </Box>
  );
}
