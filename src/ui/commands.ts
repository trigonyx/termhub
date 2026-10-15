import { tildify } from 'termcore/app/paths';
import type { NoteKind } from 'termcore/app/toasts';
import { normalizeColor, STATUSES, type Status } from 'termcore/friends/profile';
import { formatId } from 'termcore/net/identity';
import { ANIMATIONS, type Animations } from 'termcore/store/files';
import { CommandRegistry, type Command as BaseCommand } from 'termcore/ui/commands/registry';
import type { HubStore } from '../core/store.js';
import type { Actions } from './actions.js';
import type { TabId } from './components/Tabs.js';
import { whoisText } from './tabs/FriendsTab.js';
import { exportFlow, importFlow, idText } from './tabs/ProfileTab.js';

export interface CommandContext {
  store: HubStore;
  ui: Actions & { print(text: string, kind?: NoteKind): void; tab(id: TabId): void };
}

export type Command = BaseCommand<CommandContext>;

/** "192.168.1.20", "192.168.1.20:5050" → host and port. */
export function parseAddress(input: string): { host: string; port?: number } | null {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3}|[a-zA-Z0-9.-]+)(?::(\d{1,5}))?$/.exec(input.trim());
  if (!m) return null;
  const port = m[2] ? Number(m[2]) : undefined;
  if (port !== undefined && (port < 1 || port > 65535)) return null;
  return { host: m[1]!, ...(port ? { port } : {}) };
}

/** An app of the catalog by id or name (prefix is fine if it's unambiguous). */
function findApp(store: HubStore, query: string | undefined): string {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) throw new Error('Which app? e.g. termchat');
  const apps = store.appList();
  const exact = apps.find((e) => e.app.id === q || e.app.name.toLowerCase() === q);
  if (exact) return exact.app.id;
  const prefix = apps.filter((e) => e.app.id.startsWith(q));
  if (prefix.length === 1) return prefix[0]!.app.id;
  throw new Error(`No app called ${query} – there's ${apps.map((e) => e.app.id).join(', ')}`);
}

/** A friend by nickname, name or ID. */
function findFriend(store: HubStore, query: string) {
  const q = query.trim().toLowerCase().replace(/-/g, '');
  const all = store.contacts.all();
  const hit =
    all.find((c) => (c.alias ?? '').toLowerCase() === q || c.name.toLowerCase() === q || c.id.toLowerCase() === q) ??
    all.filter((c) => (c.alias ?? c.name).toLowerCase().startsWith(q) || c.id.toLowerCase().startsWith(q))[0];
  if (!hit) throw new Error(`No friend called ${query}`);
  return store.friend(hit.id)!;
}

export const HELP = `### termhub

The hub of termchat, keyrace and termdrop: profile, friends, shared settings and the apps.

### Everywhere

- \`tab\` / \`shift+tab\` or \`1\`–\`4\` switch tabs · \`/\` commands · \`?\` this help · \`q\` quit

### Friends

- \`enter\` accept a request / add someone from Nearby / whois · \`x\` decline
- \`a\` add by IP · \`r\` nickname · \`d\` remove · \`b\` block or unblock

### Apps

- \`enter\` open the app here – quit it to come back · \`i\` install · \`u\` update · \`U\` update everything
- \`x\` remove (your data stays) · \`w\` what's new · \`r\` check again

### Profile and Settings

- \`enter\` change the selected line · \`e\` export a backup
- Everything here is shared: open apps take it right away.

### Commands

- \`/add <ip>[:port]\` · \`/whois <friend>\` · \`/name <name>\` · \`/color <color|#rrggbb|reset>\`
- \`/status <available|busy|dnd> [message]\` · \`/accent <color|default>\` · \`/animations <nonstop|brief|off>\`
- \`/notifications on|off\` · \`/open <app>\` · \`/install <app>\` · \`/update [all|<app>]\` · \`/uninstall <app>\`
- \`/whatsnew <app>\` · \`/backup\` · \`/restore\` · \`/reset\` · \`/id\` · \`/quit\``;

const commands: Command[] = [
  { name: 'help', aliases: ['?'], description: 'Keys and commands', scope: 'global', run: (ctx) => ctx.ui.panel('Help', HELP) },
  { name: 'friends', description: 'Friends tab', scope: 'global', run: (ctx) => ctx.ui.tab('friends') },
  { name: 'apps', description: 'Apps tab', scope: 'global', run: (ctx) => ctx.ui.tab('apps') },
  { name: 'profile', description: 'Profile tab', scope: 'global', run: (ctx) => ctx.ui.tab('profile') },
  { name: 'settings', description: 'Settings tab', scope: 'global', run: (ctx) => ctx.ui.tab('settings') },
  {
    name: 'add',
    usage: '<ip>[:port]',
    description: 'Add a friend by IP address',
    scope: 'global',
    minArgs: 1,
    async run(ctx, args) {
      const a = parseAddress(args[0]!);
      if (!a) throw new Error('Use an address like 192.168.1.20 or 192.168.1.20:5050');
      ctx.ui.print(`Connecting to ${a.host} …`);
      await ctx.store.addByAddress(a.host, a.port);
    },
  },
  {
    name: 'whois',
    usage: '<friend>',
    description: 'ID, safety code and where a friend is online',
    scope: 'global',
    minArgs: 1,
    run(ctx, _args, rest) {
      const f = findFriend(ctx.store, rest);
      ctx.ui.panel(`whois ${f.display}`, whoisText(ctx.store, f));
    },
  },
  { name: 'id', description: 'Your ID and what safety codes are', scope: 'global', run: (ctx) => ctx.ui.panel('Your ID', idText(ctx.store.identity.id)) },
  {
    name: 'name',
    usage: '<name>',
    description: 'Change your name (every app)',
    scope: 'global',
    minArgs: 1,
    run: (ctx, _a, rest) => void ctx.store.setName(rest),
  },
  {
    name: 'color',
    usage: '<color|#rrggbb|reset>',
    description: 'Your profile color',
    scope: 'global',
    minArgs: 1,
    run(ctx, args) {
      if (args[0] === 'reset') ctx.store.setColor(undefined);
      else ctx.store.setColor(args[0]);
      ctx.ui.print(args[0] === 'reset' ? 'Your color comes from your ID again' : `Your color is ${normalizeColor(args[0])} now`, 'success');
    },
  },
  {
    name: 'status',
    usage: '<available|busy|dnd> [message]',
    description: 'Your status (and message)',
    scope: 'global',
    minArgs: 1,
    run(ctx, args, rest) {
      const s = args[0]!.toLowerCase() as Status;
      if (!STATUSES.includes(s)) throw new Error('Status is available, busy or dnd');
      const msg = rest.slice(args[0]!.length).trim();
      ctx.store.setStatus(s, msg ? msg : undefined);
      ctx.ui.print(`You're ${s === 'dnd' ? 'in do not disturb' : s}${msg ? ` · ${msg}` : ''}`, 'success');
    },
  },
  {
    name: 'accent',
    usage: '<color|#rrggbb|default>',
    description: 'Accent color of every app',
    scope: 'global',
    minArgs: 1,
    run(ctx, args) {
      ctx.store.setAccent(args[0] === 'default' ? undefined : args[0]);
      ctx.ui.print('Accent changed – every open app takes it right away', 'success');
    },
  },
  {
    name: 'animations',
    usage: '<nonstop|brief|off>',
    description: 'How much moves, in every app',
    scope: 'global',
    minArgs: 1,
    run(ctx, args) {
      const m = args[0] as Animations;
      if (!ANIMATIONS.includes(m)) throw new Error('Animations are nonstop, brief or off');
      ctx.store.setAnimations(m);
      ctx.ui.print(`Animations: ${m}`, 'success');
    },
  },
  {
    name: 'notifications',
    usage: '<on|off>',
    description: 'Desktop notifications in every app',
    scope: 'global',
    minArgs: 1,
    run(ctx, args) {
      if (args[0] !== 'on' && args[0] !== 'off') throw new Error('Use /notifications on or off');
      ctx.store.setNotifications(args[0] === 'on');
      ctx.ui.print(`Desktop notifications ${args[0]}`, 'success');
    },
  },
  {
    name: 'reset',
    description: 'Shared settings back to their defaults',
    scope: 'global',
    async run(ctx) {
      if (await ctx.ui.confirm('Reset accent, animations and notifications for every app?')) ctx.store.resetSettings();
    },
  },
  {
    name: 'open',
    usage: '<app>',
    description: 'Open an app in this terminal',
    scope: 'global',
    minArgs: 1,
    run(ctx, args) {
      const id = findApp(ctx.store, args[0]);
      ctx.store.launchRequest(id);
      ctx.ui.launch(id);
    },
  },
  {
    name: 'install',
    usage: '<app>',
    description: 'Install an app',
    scope: 'global',
    minArgs: 1,
    async run(ctx, args) {
      const id = findApp(ctx.store, args[0]);
      ctx.ui.tab('apps');
      await ctx.store.install(id);
    },
  },
  {
    name: 'update',
    usage: '[all|<app>]',
    description: 'Update termhub, an app, or everything',
    scope: 'global',
    async run(ctx, args) {
      ctx.ui.tab('apps');
      if (!args[0] || args[0] === 'termhub') await ctx.store.updateTermhub();
      else if (args[0] === 'all') await ctx.store.updateAll();
      else await ctx.store.update(findApp(ctx.store, args[0]));
    },
  },
  {
    name: 'uninstall',
    aliases: ['remove'],
    usage: '<app>',
    description: 'Remove an app (its data stays)',
    scope: 'global',
    minArgs: 1,
    async run(ctx, args) {
      const id = findApp(ctx.store, args[0]);
      if (await ctx.ui.confirm(`Remove ${id}? Your profile, friends and its data stay.`)) {
        ctx.ui.tab('apps');
        await ctx.store.uninstall(id);
      }
    },
  },
  {
    name: 'whatsnew',
    usage: '<app>',
    description: "What's new in an app (or termhub)",
    scope: 'global',
    async run(ctx, args) {
      const id = !args[0] || args[0] === 'termhub' ? 'termhub' : findApp(ctx.store, args[0]);
      const w = await ctx.store.whatsNew(id);
      ctx.ui.panel(w.title, w.text);
    },
  },
  { name: 'backup', description: 'Export an encrypted backup of your identity', scope: 'global', run: (ctx) => exportFlow(ctx.ui, ctx.store) },
  { name: 'restore', description: 'Restore a backup (replaces identity and friends)', scope: 'global', run: (ctx) => importFlow(ctx.ui, ctx.store) },
  {
    name: 'where',
    description: 'Where termhub keeps its data',
    scope: 'global',
    run(ctx) {
      const p = ctx.store.paths;
      ctx.ui.panel(
        'Data',
        `- Shared by all apps: \`${tildify(p.hub.dir)}\`\n- termhub's own (catalog cache, log): \`${tildify(p.home)}\`\n- Your ID: \`${formatId(ctx.store.identity.id, true)}\``,
      );
    },
  },
  { name: 'quit', aliases: ['exit', 'q'], description: 'Quit termhub', scope: 'global', run: (ctx) => ctx.ui.quit() },
];

export const registry = new CommandRegistry<CommandContext>(commands);
