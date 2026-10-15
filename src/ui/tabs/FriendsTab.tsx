import { Box, Text, useInput } from 'ink';
import { useState, type ReactNode } from 'react';
import { formatId } from 'termcore/net/identity';
import { lastSeen } from 'termcore/ui/format';
import { useWheel } from 'termcore/ui/mouse';
import { presenceDot, statusText } from 'termcore/ui/presence';
import { icons, personHex, theme } from 'termcore/ui/theme';
import type { FriendView, HubStore, NearbyView } from '../../core/store.js';
import type { Actions } from '../actions.js';
import { buildLines, Card, Dot, Field, Note, Pointer, SectionTitle, splitLayout, visibleLines } from '../components/List.js';
import { appsLabel, presenceLine } from '../format.js';

type Entry =
  | { type: 'request'; key: string; f: FriendView }
  | { type: 'friend'; key: string; f: FriendView }
  | { type: 'nearby'; key: string; p: NearbyView }
  | { type: 'toggle'; key: string; count: number }
  | { type: 'blocked'; key: string; f: FriendView };

interface Props {
  store: HubStore;
  width: number;
  height: number;
  actions: Actions;
  active: boolean;
  selectedKey: string | null;
  onSelect(key: string | null): void;
  /** the footer line with these key hints (the shell adds the global ones and toasts) */
  footer(hints: string[]): ReactNode;
  /** rows the shell needs under the tab (a dialog or the command input), above the footer */
  bottomRows: number;
}

export function friendsHints(e: Entry | undefined): string[] {
  const base = ['↑↓ select'];
  if (e?.type === 'request') base.push('enter accept', 'x decline', 'b block');
  else if (e?.type === 'nearby') base.push('enter add friend');
  else if (e?.type === 'toggle') base.push('enter show/hide');
  else if (e?.type === 'blocked') base.push('b unblock', 'r rename', 'd remove');
  else if (e?.type === 'friend') {
    if (e.f.state === 'accepted') base.push('enter whois');
    if (e.f.state === 'declined') base.push('enter ask again');
    base.push('r rename', 'd remove', 'b block');
  }
  return [...base, 'a add by IP'];
}

/** The /whois text for a friend: IDs, safety code, where they are. */
export function whoisText(store: HubStore, f: FriendView): string {
  const code = store.safetyCodeWith(f.id);
  const lines = [
    `### ${f.display}${f.alias ? ` _(${f.name})_` : ''}`,
    '',
    `- ID: \`${formatId(f.id, true)}\``,
    `- Your ID: \`${formatId(store.identity.id, true)}\``,
    `- ${f.online ? `Online in ${appsLabel(f.apps)}` : lastSeen(f.lastSeen)}`,
    ...(f.ip ? [`- Address: ${f.ip}`] : []),
    ...(statusText(f.status, f.statusMsg) ? [`- Status: ${statusText(f.status, f.statusMsg)}`] : []),
    '',
    '### Safety code',
    '',
    code
      ? `\`${code}\`\n\nCompare it with ${f.display} in person or on the phone. If it's the same on both screens, nobody sits in the middle of your connections – in any app.`
      : `Not known yet – it appears once one of your apps has been connected to ${f.display}.`,
  ];
  return lines.join('\n');
}

export function FriendsTab({ store, width, height: full, actions, active, selectedKey, onSelect, footer, bottomRows }: Props) {
  const height = Math.max(2, full - 1 - bottomRows);
  const data = store.friendsData();
  const [showBlocked, setShowBlocked] = useState(false);
  const sections = {
    requests: data.requests.map((f): Entry => ({ type: 'request', key: `r:${f.id}`, f })),
    friends: data.friends.map((f): Entry => ({ type: 'friend', key: `f:${f.id}`, f })),
    nearby: data.nearby.map((p): Entry => ({ type: 'nearby', key: `n:${p.id}`, p })),
    blocked: data.blocked.length
      ? [{ type: 'toggle', key: 'toggle', count: data.blocked.length } as Entry, ...(showBlocked ? data.blocked.map((f): Entry => ({ type: 'blocked', key: `b:${f.id}`, f })) : [])]
      : [],
  };
  const entries = [...sections.requests, ...sections.friends, ...sections.nearby, ...sections.blocked];
  let selected = entries.findIndex((e) => e.key === selectedKey);
  if (selected === -1) selected = 0;
  const current = entries[selected];

  const attempt = (fn: () => void | Promise<unknown>) => {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((err: Error) => store.showToast(err.message, 'error'));
    } catch (err) {
      store.showToast((err as Error).message, 'error');
    }
  };

  const move = (d: number) => {
    const next = Math.max(0, Math.min(entries.length - 1, selected + d));
    if (entries[next]) onSelect(entries[next]!.key);
  };
  useWheel((dir) => move(dir), active);

  useInput(
    (input, key) => {
      if (key.upArrow || input === 'k') return move(-1);
      if (key.downArrow || input === 'j') return move(1);
      if (key.pageUp) return move(-10);
      if (key.pageDown) return move(10);
      if (input === 'a') {
        void actions.prompt('Add a friend by IP', { hint: 'e.g. 192.168.1.20 – or with a port: 192.168.1.20:5050' }).then((v) => {
          if (v) void actions.runCommand(`/add ${v}`);
        });
        return;
      }
      if (!current) return;
      const f = current.type === 'nearby' || current.type === 'toggle' ? null : current.f;
      if (key.return) {
        if (current.type === 'request') {
          attempt(() => store.accept(current.f.id));
          return onSelect(`f:${current.f.id}`);
        }
        if (current.type === 'nearby') return attempt(() => store.requestNearby(current.p.id));
        if (current.type === 'toggle') return setShowBlocked((s) => !s);
        if (current.type === 'blocked') return store.showToast(`${current.f.display} is blocked – b unblocks`, 'info');
        if (f?.state === 'declined') return attempt(() => store.request(f.id));
        if (f?.state === 'outgoing') return store.showToast(`Waiting for ${f.display} to accept your friend request`, 'info');
        if (f) return actions.panel(`whois ${f.display}`, whoisText(store, f));
        return;
      }
      if (input === 'x' && current.type === 'request') return attempt(() => store.decline(current.f.id));
      if (!f) return;
      if (input === 'r') {
        void actions.prompt(`Nickname for ${f.name}`, { hint: "Leave it empty to use their own name – it's the same in every app", initial: f.alias }).then((v) => {
          if (v !== null) attempt(() => store.rename(f.id, v));
        });
        return;
      }
      if (input === 'd') {
        void actions.confirm(f.state === 'incoming' ? `Decline ${f.display}'s request?` : `Remove ${f.display}? (in every app)`).then((ok) => {
          if (ok) attempt(() => (f.state === 'incoming' ? store.decline(f.id) : store.removeFriend(f.id)));
        });
        return;
      }
      if (input === 'b') {
        if (f.state === 'blocked') return attempt(() => store.unblock(f.id));
        void actions.confirm(`Block ${f.display}? No app will accept a connection from them.`).then((ok) => {
          if (ok) attempt(() => store.block(f.id));
        });
      }
    },
    { isActive: active },
  );

  const panelRows = 13;
  const L = splitLayout(width, height, panelRows);
  const inner = L.listWidth - 2;
  const online = data.friends.filter((f) => f.state === 'accepted' && f.online).length;
  const scanning = store.me.scanning;
  const lines = buildLines<Entry>(
    [
      { title: `Requests · ${data.requests.length}`, entries: sections.requests },
      {
        title: data.friends.length ? `Friends · ${online} online` : 'Friends',
        entries: sections.friends,
        empty: 'No friends yet – add someone from Nearby, or press a',
      },
      { title: scanning ? 'Nearby · searching the network …' : 'Nearby', entries: sections.nearby, empty: 'Nobody else here has a suite app open right now' },
      { title: `Blocked · ${data.blocked.length}`, entries: sections.blocked },
    ],
    entries,
  );
  const visible = visibleLines(lines, selected, L.listHeight);

  return (
    <Box flexDirection="column" width={width} height={full}>
      <Box flexDirection={L.side ? 'row' : 'column'} width={width} height={height} overflow="hidden">
        <Box flexDirection="column" width={L.listWidth} height={L.listHeight} paddingX={1} overflow="hidden" flexShrink={0}>
          {visible.map((l, i) => {
            if (l.kind === 'gap') return <Text key={`g${i}`}> </Text>;
            if (l.kind === 'section') return <SectionTitle key={`s${i}`} title={l.title} />;
            if (l.kind === 'note') return <Note key={`n${i}`} text={l.text} />;
            return <Row key={l.entry.key} entry={l.entry} selected={l.index === selected} width={inner} open={showBlocked} />;
          })}
        </Box>
        {L.showPanel ? (
          <Box marginLeft={L.side ? 1 : 0} flexShrink={0} height={L.panelHeight} overflow="hidden">
            <Detail store={store} entry={current} width={L.panelWidth} height={L.panelHeight} />
          </Box>
        ) : null}
      </Box>
      {footer(friendsHints(current))}
    </Box>
  );
}

function Row({ entry, selected, width, open }: { entry: Entry; selected: boolean; width: number; open: boolean }) {
  const nameWidth = Math.min(20, Math.max(10, Math.floor(width * 0.32)));
  const nameCell = (text: string, color?: string) => (
    <Box width={nameWidth} flexShrink={0}>
      <Text bold={selected} color={selected ? theme.accent : color} wrap="truncate-end">
        {text}
      </Text>
    </Box>
  );
  if (entry.type === 'toggle') {
    return (
      <Box>
        <Pointer selected={selected} />
        <Text color={theme.dim} wrap="truncate-end">
          {open ? '▾ hide' : `▸ show ${entry.count === 1 ? 'the blocked person' : `${entry.count} blocked people`}`}
        </Text>
      </Box>
    );
  }
  if (entry.type === 'nearby') {
    const p = entry.p;
    return (
      <Box>
        <Pointer selected={selected} />
        <Dot icon={icons.online} color={theme.success} />
        {nameCell(p.name)}
        <Text color={theme.dim} wrap="truncate-end">
          {appsLabel(p.apps)} · {p.ip}
        </Text>
      </Box>
    );
  }
  const f = entry.f;
  if (entry.type === 'request') {
    return (
      <Box>
        <Pointer selected={selected} />
        <Dot icon={icons.request} color={theme.accent} />
        {nameCell(f.display, personHex(f.id, f.color))}
        <Text wrap="truncate-end">wants to be friends</Text>
        {f.online ? <Text color={theme.dim}> · {appsLabel(f.apps)}</Text> : null}
      </Box>
    );
  }
  const accepted = f.state === 'accepted';
  const dot = !accepted
    ? { icon: f.state === 'blocked' ? icons.error : f.state === 'declined' ? icons.error : icons.pending, color: f.state === 'blocked' ? theme.error : theme.faint }
    : presenceDot({ online: f.online, away: f.away, status: f.status });
  const status = accepted && f.online ? statusText(f.status === 'available' ? undefined : f.status, f.statusMsg) : '';
  return (
    <Box>
      <Pointer selected={selected} />
      <Dot icon={dot.icon} color={dot.color} />
      {nameCell(f.display, accepted ? personHex(f.id, f.color) : undefined)}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          {accepted && f.online ? <Text color={theme.success}>{icons.online} </Text> : null}
          <Text color={accepted && f.online ? undefined : theme.dim} italic={!accepted}>
            {presenceLine(f)}
          </Text>
          {status ? <Text color={theme.dim}> · {status}</Text> : null}
        </Text>
      </Box>
    </Box>
  );
}

function Detail({ store, entry, width, height }: { store: HubStore; entry: Entry | undefined; width: number; height: number }) {
  if (!entry || entry.type === 'toggle') {
    const me = store.me;
    return (
      <Card title="Friends" width={width} height={height}>
        <Text color={theme.dim} wrap="wrap">
          Your friends are the same in termchat, keyrace, termdrop and here. Whatever you change in this tab – accepting,
          renaming, blocking – applies to every app right away.
        </Text>
        <Text> </Text>
        <Text color={theme.dim} wrap="wrap">
          Others on your network show up under Nearby. Not there? Press <Text color={theme.accent}>a</Text> and enter their IP.
        </Text>
        <Text> </Text>
        <Field label="Yours">{me.ips.length ? me.ips.join(', ') : 'no network'}</Field>
      </Card>
    );
  }
  if (entry.type === 'nearby') {
    const p = entry.p;
    return (
      <Card title={p.name} width={width} height={height}>
        <Field label="ID">{formatId(p.id)}</Field>
        <Field label="Address">{p.ip}</Field>
        <Field label="Open">{appsLabel(p.apps)}</Field>
        <Text> </Text>
        <Text color={theme.dim} wrap="wrap">
          On your network, not a friend yet. <Text color={theme.accent}>enter</Text> sends a friend request – they see it in
          whichever app they have open.
        </Text>
      </Card>
    );
  }
  const f = entry.f;
  const code = store.safetyCodeWith(f.id);
  const accepted = f.state === 'accepted';
  const dot = presenceDot({ online: f.online, away: f.away, status: f.status });
  const state: Record<string, string> = {
    accepted: 'friends',
    outgoing: 'your request is waiting',
    incoming: 'wants to be friends',
    declined: 'declined your request',
    blocked: 'blocked by you',
  };
  return (
    <Card title={f.display} width={width} height={height}>
      {f.alias ? <Field label="Name">{f.name}</Field> : null}
      <Field label="ID">{formatId(f.id, true)}</Field>
      <Field label="State">{state[f.state] ?? f.state}</Field>
      {accepted || f.state === 'incoming' ? (
        <Field label="Online">
          {f.online ? (
            <Text wrap="truncate-end">
              <Text color={theme.success}>{icons.online} </Text>
              {appsLabel(f.apps)}
            </Text>
          ) : (
            <Text color={theme.dim}>{lastSeen(f.lastSeen)}</Text>
          )}
        </Field>
      ) : null}
      {accepted ? (
        <Field label="Status">
          <Text wrap="truncate-end">
            <Text color={dot.color}>{f.status === 'available' ? icons.online : dot.icon} </Text>
            {f.status === 'dnd' ? 'do not disturb' : f.status}
            {f.statusMsg ? <Text color={theme.dim}> · {f.statusMsg}</Text> : null}
          </Text>
        </Field>
      ) : null}
      <Field label="Address">{f.ip ?? '–'}</Field>
      <Field label="Alias">{f.alias ?? '–'}</Field>
      <Text> </Text>
      <Text color={theme.dim}>Safety code</Text>
      <Text color={code ? theme.accent : theme.faint} wrap="truncate-end">
        {code ?? 'once you were connected'}
      </Text>
      <Text color={theme.faint} wrap="truncate-end">
        same on both screens = no one in the middle
      </Text>
    </Card>
  );
}
