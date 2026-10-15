import { Box, Text } from 'ink';
import { sanitizeText } from 'termcore/app/sanitize';
import { icons, theme } from 'termcore/ui/theme';
import type { StepStatus, Task } from '../../core/store.js';

const STEP: Record<StepStatus, { icon: string; color: string }> = {
  waiting: { icon: '·', color: theme.faint },
  running: { icon: '◐', color: theme.accent },
  done: { icon: icons.done, color: theme.success },
  failed: { icon: icons.error, color: theme.error },
  skipped: { icon: '–', color: theme.dim },
};

/** Rows the panel wants: frame, title, steps, a few log lines, result. */
export function taskPanelRows(task: Task): number {
  return 2 + 1 + task.steps.length + 1 + 6 + (task.running ? 0 : 2 + (task.hint ? 2 : 0));
}

/**
 * An install, update or removal: one line per app with its state, npm's output underneath (the
 * newest lines that fit), and at the end the result – with the hint for a known problem.
 */
export function TaskPanel({ task, width, height }: { task: Task; width: number; height: number }) {
  const inner = width - 4;
  const result = task.running ? 0 : 1 + (task.message ? task.message.split('\n').length : 0) + (task.hint ? 2 : 0);
  const logRows = Math.max(0, height - 2 - 1 - task.steps.length - 1 - result);
  const log = task.log
    .map((l) => sanitizeText(l).replace(/\t/g, ' '))
    .filter((l, i, all) => l.trim() || i < all.length - 1)
    .slice(-logRows);
  const done = !task.running;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={done ? (task.ok ? theme.success : theme.error) : theme.accent} paddingX={1} width={width} height={height} overflow="hidden" flexShrink={0}>
      <Text bold wrap="truncate-end">
        {task.title}
        {task.running ? <Text color={theme.dim}> …</Text> : null}
      </Text>
      {task.steps.map((s) => (
        <Box key={s.id}>
          <Box width={2} flexShrink={0}>
            <Text color={STEP[s.status].color}>{STEP[s.status].icon}</Text>
          </Box>
          <Text wrap="truncate-end">
            {s.label}
            {s.note ? <Text color={theme.dim}> · {s.note}</Text> : null}
          </Text>
        </Box>
      ))}
      <Text color={theme.faint}>{'─'.repeat(Math.max(0, inner))}</Text>
      {log.map((l, i) => (
        <Text key={i} color={theme.dim} wrap="truncate-end">
          {l || ' '}
        </Text>
      ))}
      {done ? (
        <>
          <Box flexGrow={1} />
          {task.message?.split('\n').map((l, i) => (
            <Text key={i} color={i === 0 ? (task.ok ? theme.success : theme.error) : theme.dim} wrap="truncate-end">
              {i === 0 ? `${task.ok ? icons.done : icons.error} ` : '  '}
              {l}
            </Text>
          ))}
          {task.hint ? (
            <Text color={theme.warning} wrap="wrap">
              {task.hint}
            </Text>
          ) : null}
          <Text color={theme.dim}>esc close</Text>
        </>
      ) : null}
    </Box>
  );
}
