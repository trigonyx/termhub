import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackupError, collect, decryptBackup, encryptBackup, exportBackup, restoreBackup } from '../src/core/backup.js';
import { Hub } from 'termcore/store/hub';
import { profile, tmpDir } from './helpers.js';

const PASS = 'correct horse battery';
/** Fast scrypt for tests (the real one is 2^17). */
const LOG_N = 10;

function aliceWithFriends() {
  const paths = profile('Alice', '#73daca');
  const hub = new Hub(paths.hub);
  hub.friends.update((f) => {
    f.friends.push({ id: 'BOBBOBBOBBOBBOBBOBBO', publicKey: 'x', name: 'Bob', alias: 'Bobby', state: 'accepted', lastActivity: 1, createdAt: 1 });
  });
  hub.setSettings({ accent: '#7aa2f7', animations: 'off' });
  hub.setProfile({ status: 'busy', statusMsg: 'deep work' });
  return { paths, hub };
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as BackupError).code;
  }
  return 'ok';
};

describe('identity backup', () => {
  it('round trip: everything that makes you you – no app data – back on another computer', () => {
    const { paths, hub } = aliceWithFriends();
    fs.mkdirSync(path.join(paths.hub.dir, 'termchat'), { recursive: true });
    fs.writeFileSync(path.join(paths.hub.dir, 'termchat', 'history.jsonl'), 'secret chat');
    const file = path.join(tmpDir('bk'), 'alice.thb');
    const s = exportBackup(paths.hub, file, PASS, '1.0.0', LOG_N);
    expect(s).toMatchObject({ name: 'Alice', friends: 1, id: hub.identity.id });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toMatch(/^-----BEGIN TERMHUB BACKUP-----\n/);
    expect(text).not.toContain('Alice');
    expect(text).not.toContain('secret chat');

    const content = decryptBackup(text, PASS);
    expect(JSON.stringify(content)).not.toContain('secret chat');
    // a new computer: nothing there yet
    const other = profile('Someone else');
    const before = new Hub(other.hub).identity.id;
    const r = restoreBackup(other.hub, content);
    expect(r.summary).toMatchObject({ name: 'Alice', friends: 1 });
    const restored = new Hub(other.hub);
    expect(restored.identity.id).toBe(hub.identity.id);
    expect(restored.me).toMatchObject({ name: 'Alice', color: '#73daca', status: 'busy', statusMsg: 'deep work' });
    expect(restored.friends.get().friends[0]).toMatchObject({ name: 'Bob', alias: 'Bobby', state: 'accepted' });
    expect(restored.settings.get()).toMatchObject({ accent: '#7aa2f7', animations: 'off' });
    // what was there before is kept
    expect(r.savedTo).toContain(path.join(other.hub.legacyDir, 'before-restore-'));
    const old = JSON.parse(fs.readFileSync(path.join(r.savedTo!, 'identity.json'), 'utf8'));
    expect(old.publicKey).toBeTruthy();
    expect(before).not.toBe(restored.identity.id);
  });

  it('a wrong passphrase is told apart from a manipulated file', () => {
    const { paths } = aliceWithFriends();
    const text = encryptBackup(collect(paths.hub, '1.0.0'), PASS, LOG_N);
    expect(code(() => decryptBackup(text, 'wrong passphrase!'))).toBe('wrong-passphrase');

    // flip one byte of the ciphertext (base64 → binary → base64)
    const lines = text.trim().split('\n');
    const body = Buffer.from(lines.slice(1, -1).join(''), 'base64');
    const flip = (i: number) => {
      const b = Buffer.from(body);
      b[i] = b[i]! ^ 1;
      return `${lines[0]}\n${b.toString('base64')}\n${lines.at(-1)}\n`;
    };
    expect(code(() => decryptBackup(flip(body.length - 30), PASS))).toBe('damaged');
    // the header (salt, nonce …) is authenticated too
    expect(code(() => decryptBackup(flip(30), PASS))).toBe('damaged');
    // scrypt cost can't be raised to hang termhub
    const b = Buffer.from(body);
    b[5] = 30;
    expect(code(() => decryptBackup(`${lines[0]}\n${b.toString('base64')}\n${lines.at(-1)}\n`, PASS))).toBe('damaged');
    // a newer format
    const v = Buffer.from(body);
    v[4] = 2;
    expect(code(() => decryptBackup(`${lines[0]}\n${v.toString('base64')}\n${lines.at(-1)}\n`, PASS))).toBe('unsupported');
  });

  it('a cut-off file says so; other files aren’t backups', () => {
    const { paths } = aliceWithFriends();
    const text = encryptBackup(collect(paths.hub, '1.0.0'), PASS, LOG_N);
    expect(code(() => decryptBackup(text.slice(0, Math.floor(text.length / 2)), PASS))).toBe('truncated');
    const lines = text.trim().split('\n');
    expect(code(() => decryptBackup(`${lines[0]}\n${lines[1]!.slice(0, 40)}\n${lines.at(-1)}\n`, PASS))).toBe('truncated');
    // cut in the middle but the end marker survived: the tag doesn't match
    expect(code(() => decryptBackup([lines[0], ...lines.slice(1, -2), lines.at(-1)].join('\n'), PASS))).toBe('damaged');
    expect(code(() => decryptBackup('hello', PASS))).toBe('not-a-backup');
    expect(code(() => decryptBackup('-----BEGIN TERMHUB BACKUP-----\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n-----END TERMHUB BACKUP-----', PASS))).toBe('not-a-backup');
  });

  it('needs a passphrase of at least 10 characters and an identity', () => {
    const { paths } = aliceWithFriends();
    expect(code(() => encryptBackup(collect(paths.hub, '1.0.0'), 'short', LOG_N))).toBe('invalid');
    const empty = tmpDir('empty');
    expect(code(() => collect({ ...paths.hub, identity: path.join(empty, 'identity.json') }, '1.0.0'))).toBe('invalid');
  });
});

describe('restore from termhub', () => {
  it('only while no app runs; afterwards termhub starts again as the restored person', async () => {
    const { Stores } = await import('./helpers.js');
    const { startInstanceServer } = await import('termcore/app/instance');
    const stores = new Stores();
    try {
      const { paths: alicePaths } = aliceWithFriends();
      const file = path.join(tmpDir('bk'), 'alice.thb');
      exportBackup(alicePaths.hub, file, PASS, '1.0.0', LOG_N);

      const bobPaths = profile('Bob');
      const bob = stores.make(bobPaths);
      // Bob's termchat is open
      const lockDir = path.join(bobPaths.hub.dir, 'termchat');
      fs.mkdirSync(lockDir, { recursive: true });
      const sock = path.join(lockDir, 'termchat.sock');
      const server = await startInstanceServer(sock);
      fs.writeFileSync(path.join(lockDir, 'termchat.lock'), JSON.stringify({ pid: process.pid, startedAt: Date.now(), socket: sock }));
      await expect(bob.importBackup(file, PASS)).rejects.toThrow('Quit termchat first');
      server.close();
      fs.rmSync(path.join(lockDir, 'termchat.lock'));

      await expect(bob.importBackup(file, 'not the passphrase')).rejects.toThrow('Wrong passphrase');
      const r = await bob.importBackup(file, PASS);
      expect(r.summary.name).toBe('Alice');
      const again = stores.make(bobPaths);
      expect(again.profile.name).toBe('Alice');
      expect(again.identity.id).toBe(new Hub(alicePaths.hub).identity.id);
    } finally {
      await stores.stopAll();
    }
  });
});
