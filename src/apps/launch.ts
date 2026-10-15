import { spawn, type StdioOptions } from 'node:child_process';
import { MOUSE_OFF, MOUSE_ON } from 'termcore/ui/mouse';

/**
 * Opening an app from the launcher: termhub leaves its screen, the app runs in the same
 * terminal, and when it quits termhub comes back. The order matters:
 *
 *  1. Ink is unmounted (raw mode off), and termhub stops reading the terminal (the stdin filter
 *     is detached and stdin paused) – otherwise both processes would get every keystroke.
 *  2. Mouse/focus/paste reporting off, the alternate screen left, cursor shown.
 *  3. The app runs with the terminal (`stdio: inherit`). Ctrl+C belongs to it: termhub ignores
 *     SIGINT/SIGQUIT/SIGTSTP while it runs (the terminal sends them to both).
 *  4. Back: alternate screen and reporting on again, and a fresh Ink render (cli.tsx).
 *
 * termhub's network keeps running meanwhile – friends still see you, requests still arrive.
 */

export const ALT_SCREEN_ON = '\u001b[?1049h\u001b[H';
export const ALT_SCREEN_OFF = '\u001b[?1049l';
export const SHOW_CURSOR = '\u001b[?25h';
/** Resets colors and the scroll region an app may have left behind. */
const RESET = '\u001b[0m\u001b[r';

/** What termhub writes before handing over the terminal. */
export const LEAVE_SCREEN = MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF;
/** And when it gets the terminal back. */
export const ENTER_SCREEN = RESET + ALT_SCREEN_ON + MOUSE_ON;

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** couldn't start at all */
  error?: string;
}

const IGNORED: NodeJS.Signals[] = ['SIGINT', 'SIGQUIT', 'SIGTSTP'];

/** Runs `command` in this terminal and resolves when it has ended. */
export function runInTerminal(command: string[], args: string[] = [], opts: { stdio?: StdioOptions; env?: NodeJS.ProcessEnv } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const ignore = () => {};
    const restore = () => {
      for (const sig of IGNORED) if (process.platform !== 'win32' || sig === 'SIGINT') process.off(sig, ignore);
    };
    for (const sig of IGNORED) if (process.platform !== 'win32' || sig === 'SIGINT') process.on(sig, ignore);
    const [cmd, ...pre] = command;
    let settled = false;
    const done = (r: RunResult) => {
      if (settled) return;
      settled = true;
      restore();
      resolve(r);
    };
    try {
      const child = spawn(cmd!, [...pre, ...args], {
        stdio: opts.stdio ?? 'inherit',
        env: opts.env ?? process.env,
        shell: process.platform === 'win32' && !cmd!.endsWith('.js') && cmd !== process.execPath,
      });
      child.on('error', (err) => done({ code: null, signal: null, error: err.message }));
      child.on('exit', (code, signal) => done({ code, signal }));
    } catch (err) {
      done({ code: null, signal: null, error: (err as Error).message });
    }
  });
}

/** Everything around runInTerminal that touches the terminal (cli.tsx passes the real ones). */
export interface Terminal {
  write(s: string): void;
  /** stops reading the terminal (MouseFilterStdin.detach) */
  detach(): void;
}

export async function handOver(term: Terminal, run: () => Promise<RunResult>): Promise<RunResult> {
  term.detach();
  term.write(LEAVE_SCREEN);
  try {
    return await run();
  } finally {
    term.write(ENTER_SCREEN);
  }
}
