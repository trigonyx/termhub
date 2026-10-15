import type { Link } from 'termcore/friends/links';
import type { RelState } from 'termcore/friends/state';
import { parseWire, type BaseWire } from 'termcore/friends/wire';
import type { Identity } from 'termcore/net/identity';
import { Network } from 'termcore/net/network';
import type { Session } from 'termcore/net/peer';

/**
 * termhub only speaks `termhub/1`. A friend who has only termchat open can't be reached that
 * way – so a friendship change (a request, accepting, removing) is delivered in a short session
 * in that app's protocol: the base messages (`links`, `state`, `decline`) are the same in every
 * app. termhub never stays connected: it says what changed, waits for the answer and leaves.
 *
 * Only used when none of our own apps that the friend runs is open – otherwise that app passes
 * the change on by itself (shared friend list), and a second session under our id would replace
 * its connection.
 */

export interface Delivery {
  /** `termchat/1` … */
  protocol: string;
  ip: string;
  port: number;
  /** null: we don't know who's there yet (adding by IP) */
  peerId: string | null;
  me: Identity;
  name: string;
  color?: string;
  links: Link[];
  /** what we tell them: our view of the friendship, or a decline */
  send: { t: 'state'; state: RelState } | { t: 'decline' };
  /** how long we wait for their answer */
  waitMs?: number;
}

export interface DeliveryResult {
  peerId: string;
  peerName: string;
  publicKey: string;
  remoteAddress: string;
  /** what they answered about the friendship (null: no answer in time) */
  theirState: RelState | null;
  color?: string;
}

const WAIT_MS = 1500;

export async function deliver(d: Delivery): Promise<DeliveryResult> {
  const network = new Network<BaseWire>({
    protocol: d.protocol,
    me: d.me,
    getName: () => d.name,
    parse: (plain) => parseWire<never>(plain),
  });
  let session: Session<BaseWire> | null = null;
  try {
    session = await network.dial(d.ip, d.port, d.peerId ?? undefined);
    const s = session;
    if (d.peerId && s.peerId !== d.peerId) throw new Error('Someone else is now reachable at this address');
    const answer = new Promise<{ state: RelState; color?: string } | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), d.waitMs ?? WAIT_MS);
      timer.unref();
      s.on('message', (m) => {
        if (m.t === 'state') {
          clearTimeout(timer);
          resolve({ state: m.state, ...(m.color ? { color: m.color } : {}) });
        }
      });
      s.on('close', () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
    if (d.links.length) s.send({ t: 'links', links: d.links });
    if (d.send.t === 'state') s.send({ t: 'state', name: d.name, state: d.send.state, port: 0, ...(d.color ? { color: d.color } : {}) });
    else s.send({ t: 'decline' });
    const their = await answer;
    return {
      peerId: s.peerId,
      peerName: s.peerName,
      publicKey: s.peerPublicRaw.toString('base64url'),
      remoteAddress: s.remoteAddress,
      theirState: their?.state ?? null,
      ...(their?.color ? { color: their.color } : {}),
    };
  } finally {
    session?.close('termhub delivered a change', true);
    await network.stop();
  }
}
