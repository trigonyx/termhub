import { afterEach, describe, expect, it } from 'vitest';
import { basePaths } from 'termcore/app/paths';
import { SUITE, defineApp, type SuiteAppName } from 'termcore/app/suite';
import { FriendNet } from 'termcore/friends/net';
import { FakeLan } from 'termcore/net/fakelan';
import { Hub } from 'termcore/store/hub';
import type { HubStore } from '../src/core/store.js';
import { profile, Stores, until } from './helpers.js';

/**
 * Two people on one computer (two homes on 127.0.0.1), a simulated Wi-Fi for discovery. termhub
 * with termcore's FriendNet as the other person's app – the same code the apps run.
 */
const stores = new Stores();
const nets: FriendNet[] = [];
afterEach(async () => {
  await stores.stopAll();
  await Promise.all(nets.splice(0).map((n) => n.stop()));
});

async function app(name: SuiteAppName, home: string, lan: FakeLan): Promise<FriendNet> {
  const paths = basePaths(name, home, {});
  const hub = new Hub(paths.hub);
  const d = lan.join('127.0.0.1', undefined, SUITE[name].udpPort);
  const net = new FriendNet<never, object>({
    app: defineApp(name, { version: '2.1.0', repository: { url: `git+https://github.com/trigonyx/${name}.git` } }),
    paths,
    hub,
    port: 0,
    discoveryOptions: { transport: d.transport, interfaces: d.interfaces },
    dialIntervalMs: 100,
    wire: { parse: () => null },
    hooks: { changed: () => {}, message: () => {} },
  });
  await net.start();
  nets.push(net);
  return net;
}

async function hubOf(name: string, lan: FakeLan, home?: string): Promise<HubStore> {
  const paths = home ? (await import('../src/core/paths.js')).resolvePaths(home, {}) : profile(name);
  const d = lan.join('127.0.0.1', undefined, SUITE.termhub.udpPort);
  const s = stores.make(paths, { discovery: true, discoveryOptions: { transport: d.transport, interfaces: d.interfaces }, pollMs: 100, retryMs: 300, courierWaitMs: 500 });
  await s.start();
  return s;
}

describe('friends and where they are online', { timeout: 40_000 }, () => {
  it('termhub sees a friend who only has termdrop open – and befriends them through it', async () => {
    const lan = new FakeLan();
    lan.broadcast = true;
    const alice = await hubOf('Alice', lan);
    const bobHome = profile('Bob').hub.dir;
    const bob = await app('termdrop', bobHome, lan);
    const bobId = bob.identity.id;

    // under Nearby, found through termdrop's answer
    await until(() => alice.friendsData().nearby.some((p) => p.id === bobId), 8000, 'nearby');
    expect(alice.friendsData().nearby.find((p) => p.id === bobId)).toMatchObject({ name: 'Bob', apps: ['termdrop'] });

    // enter: the request reaches Bob's termdrop, though Alice has no termdrop open
    await alice.requestNearby(bobId);
    await until(() => bob.contacts.get(alice.identity.id)?.state === 'incoming', 6000, 'request in termdrop');
    expect(alice.friend(bobId)?.state).toBe('outgoing');

    // Bob accepts in termdrop; termhub asks again a little later and learns it
    bob.accept(alice.identity.id);
    await until(() => alice.friend(bobId)?.state === 'accepted', 8000, 'accepted');
    const f = alice.friend(bobId)!;
    expect(f).toMatchObject({ online: true, apps: ['termdrop'], hub: false });
    expect(alice.onlineCount()).toBe(1);

    // Bob quits termdrop: offline, last seen remembered
    await bob.stop();
    nets.splice(nets.indexOf(bob), 1);
    await until(() => alice.friend(bobId)?.online === false, 15_000, 'offline');
    await until(() => (alice.friend(bobId)?.lastSeen ?? 0) > 0, 3000, 'last seen');
  });

  it('two people befriend each other in termhub and see each other in the apps afterwards', async () => {
    const lan = new FakeLan();
    lan.broadcast = true;
    const alice = await hubOf('Alice', lan);
    const carl = await hubOf('Carl', lan);
    await until(() => alice.friendsData().nearby.some((p) => p.id === carl.identity.id), 8000, 'nearby');
    await alice.requestNearby(carl.identity.id);
    await until(() => carl.friendsData().requests.some((f) => f.id === alice.identity.id), 6000, 'request');
    carl.accept(alice.identity.id);
    await until(() => alice.friend(carl.identity.id)?.state === 'accepted' && alice.friend(carl.identity.id)?.hub === true, 6000, 'friends in termhub');

    // status and messages travel between hubs
    carl.setStatus('busy', 'in a meeting');
    await until(() => alice.friend(carl.identity.id)?.status === 'busy', 4000, 'status');
    expect(alice.friend(carl.identity.id)?.statusMsg).toBe('in a meeting');

    // Carl opens termchat: Alice's termhub shows it
    const carlChat = await app('termchat', carl.paths.hub.dir, lan);
    await until(() => (alice.friend(carl.identity.id)?.apps ?? []).join() === 'termchat,termhub', 8000, 'online in termchat');

    // and Alice's termchat knows Carl as a friend right away – no request in the app
    const aliceChat = await app('termchat', alice.paths.hub.dir, lan);
    await until(() => aliceChat.isOnline(carl.identity.id) && carlChat.isOnline(alice.identity.id), 10_000, 'connected in termchat');
    expect(aliceChat.contacts.get(carl.identity.id)?.state).toBe('accepted');
    expect(carlChat.contacts.get(alice.identity.id)?.state).toBe('accepted');
  });

  it('adds someone by IP who only has an app open', async () => {
    const lan = new FakeLan();
    const alice = await hubOf('Alice', lan);
    const dana = await app('keyrace', profile('Dana').hub.dir, lan);
    const id = await alice.addByAddress('127.0.0.1', dana.network.port);
    expect(id).toBe(dana.identity.id);
    expect(alice.friend(id)).toMatchObject({ name: 'Dana', state: 'outgoing' });
    await until(() => dana.contacts.get(alice.identity.id)?.state === 'incoming', 6000, 'request in keyrace');
    await expect(alice.addByAddress('127.0.0.1', 1)).rejects.toThrow("Couldn't reach anyone");
  });
});
