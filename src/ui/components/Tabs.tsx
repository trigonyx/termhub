import { Box, Text } from 'ink';
import { theme } from 'termcore/ui/theme';

export const TABS = ['friends', 'apps', 'profile', 'settings'] as const;
export type TabId = (typeof TABS)[number];

export const TAB_LABEL: Record<TabId, string> = { friends: 'Friends', apps: 'Apps', profile: 'Profile', settings: 'Settings' };

/** Rows the tab bar takes (the tabs and a rule). */
export const TABS_HEIGHT = 2;

/**
 * The tab bar, like Claude Code's /config: the active tab on an accent background; a badge
 * shows what's waiting (requests, updates).
 */
export function Tabs({ active, width, badges = {} }: { active: TabId; width: number; badges?: Partial<Record<TabId, string>> }) {
  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      <Box paddingX={1}>
        {TABS.map((id, i) => {
          const on = id === active;
          return (
            <Box key={id} marginRight={1}>
              <Text backgroundColor={on ? theme.accent : undefined} color={on ? theme.onAccent : theme.dim} bold={on}>
                {` ${TAB_LABEL[id]} `}
              </Text>
              {badges[id] ? <Text color={theme.accent}>{badges[id]} </Text> : null}
              {i < TABS.length - 1 ? <Text color={theme.faint}> </Text> : null}
            </Box>
          );
        })}
        <Box flexGrow={1} />
        {width >= 72 ? <Text color={theme.faint}>tab/1-4 switch</Text> : null}
      </Box>
      <Text color={theme.faint}>{'─'.repeat(Math.max(0, width))}</Text>
    </Box>
  );
}
