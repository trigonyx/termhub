import type { PickOption } from 'termcore/ui/components/Dialog';
import type { NoteKind } from '../core/store.js';

/** What the tabs need from the app shell: dialogs, panels, commands, opening apps. */
export interface Actions {
  quit(): void;
  confirm(title: string): Promise<boolean>;
  prompt(title: string, opts?: { hint?: string; initial?: string }): Promise<string | null>;
  pick(title: string, options: PickOption[], preselect?: string): Promise<string | null>;
  /** a passphrase (not shown while typing) */
  secret(title: string, hint?: string): Promise<string | null>;
  /** longer text over the tab (help, What's new, /whois) */
  panel(title: string, text: string): void;
  print(text: string, kind?: NoteKind): void;
  runCommand(input: string): Promise<void>;
  /** leaves termhub's screen, runs the app, comes back */
  launch(id: string): void;
  /** starts the store again (after a restore changed the identity) */
  reload(): void;
  /** a tab handles every key itself for a moment (color pickers) */
  capture(on: boolean): void;
}
