import { Text, useInput } from 'ink';
import { useRef, useState } from 'react';
import { DialogFrame } from 'termcore/ui/components/Dialog';
import { theme } from 'termcore/ui/theme';

export const SECRET_HEIGHT = 6;

/**
 * Asks for a passphrase without showing it (one ● per character). enter confirms, esc cancels;
 * pastes are taken as typed.
 */
export function SecretPrompt({ title, hint, width, onDone }: { title: string; hint?: string; width: number; onDone(value: string | null): void }) {
  const [value, setValue] = useState('');
  const latest = useRef('');
  const set = (v: string) => {
    latest.current = v;
    setValue(v);
  };
  useInput((input, key) => {
    if (key.escape) return onDone(null);
    if (key.return) return onDone(latest.current);
    if (key.backspace || key.delete) return set([...latest.current].slice(0, -1).join(''));
    if (key.ctrl && input === 'u') return set('');
    if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
    const clean = input.replace(/[\r\n\u0000-\u001f\u007f]/g, '');
    if (clean) set(latest.current + clean);
  });
  const n = [...value].length;
  return (
    <DialogFrame width={width}>
      <Text bold wrap="truncate-end">
        {title}
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {hint ?? ' '}
      </Text>
      <Text wrap="truncate-end">
        <Text color={theme.accent}>❯ </Text>
        {'●'.repeat(Math.min(n, Math.max(0, width - 8)))}
        <Text inverse> </Text>
      </Text>
      <Text color={theme.dim}>enter confirm · esc cancel</Text>
    </DialogFrame>
  );
}
