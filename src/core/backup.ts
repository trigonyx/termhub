import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { HubPaths } from 'termcore/app/paths';
import { ensureDir, readJson, writeFileAtomic, writeJsonAtomic } from 'termcore/app/storage';
import { LEGACY_APPS } from 'termcore/app/suite';
import { isIdentityFile, identityFromFile, type IdentityFile } from 'termcore/net/identity';
import { parseFriendsFile, parseLinksFile, parsePeersFile, parseProfile, parseSettings } from 'termcore/store/files';
import { withLock } from 'termcore/store/lock';

/**
 * The identity backup: everything that makes you *you* to your friends – the key, links from
 * old ids, profile, friends, known peers and settings – in one file encrypted with a passphrase.
 * No app data (chats, results, transfers).
 *
 *     -----BEGIN TERMHUB BACKUP-----
 *     base64 of: "THBK" | version 1 | log2(N) | r | p | salt (16) | nonce (12) | check (16) | ciphertext | tag (16)
 *     -----END TERMHUB BACKUP-----
 *
 * scrypt(passphrase, salt) gives 48 bytes: the ChaCha20-Poly1305 key and a check value. The
 * check tells a wrong passphrase apart from a damaged file; the header is authenticated as AAD,
 * so nothing in it can be changed either. Only Node's built-in crypto.
 */

export const MIN_PASSPHRASE = 10;

const MAGIC = Buffer.from('THBK');
const FORMAT = 1;
const HEADER_LEN = 4 + 1 + 3 + 16 + 12 + 16;
const TAG_LEN = 16;
const BEGIN = '-----BEGIN TERMHUB BACKUP-----';
const END = '-----END TERMHUB BACKUP-----';
/** scrypt cost: N = 2^17, r = 8 → 128 MiB, about half a second. */
export const DEFAULT_LOG_N = 17;
const R = 8;
const P = 1;

export type BackupErrorCode = 'not-a-backup' | 'truncated' | 'unsupported' | 'wrong-passphrase' | 'damaged' | 'invalid';

export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface BackupContent {
  v: 1;
  createdAt: number;
  from: { app: 'termhub'; version: string };
  identity: IdentityFile;
  profile: unknown;
  friends: unknown;
  peers: unknown;
  settings: unknown;
  links: unknown;
  /** the apps' old identities from before ~/.termhub (legacy/<app>/identity.json) */
  legacy: Record<string, IdentityFile>;
}

export interface BackupSummary {
  id: string;
  name: string;
  friends: number;
  createdAt: number;
}

const normalize = (passphrase: string) => passphrase.normalize('NFC');

function derive(passphrase: string, salt: Buffer, logN: number): { key: Buffer; check: Buffer } {
  const N = 2 ** logN;
  const out = crypto.scryptSync(normalize(passphrase), salt, 48, { N, r: R, p: P, maxmem: 256 * N * R + 64 * 1024 * 1024 });
  return { key: out.subarray(0, 32), check: out.subarray(32, 48) };
}

/** Reads the shared files as they are now (identity required). */
export function collect(paths: HubPaths, version: string, now = Date.now()): BackupContent {
  const identity = readJson<unknown>(paths.identity, null);
  if (!isIdentityFile(identity)) throw new BackupError('invalid', 'There is no identity to back up yet.');
  const legacy: Record<string, IdentityFile> = {};
  for (const app of LEGACY_APPS) {
    const old = readJson<unknown>(path.join(paths.legacyDir, app, 'identity.json'), null);
    if (isIdentityFile(old)) legacy[app] = old;
  }
  return {
    v: 1,
    createdAt: now,
    from: { app: 'termhub', version },
    identity,
    profile: readJson<unknown>(paths.profile, null),
    friends: parseFriendsFile(readJson<unknown>(paths.friends, null)),
    peers: parsePeersFile(readJson<unknown>(paths.peers, null)),
    settings: parseSettings(readJson<unknown>(paths.settings, null)),
    links: parseLinksFile(readJson<unknown>(paths.links, null)),
    legacy,
  };
}

export function encryptBackup(content: BackupContent, passphrase: string, logN = DEFAULT_LOG_N): string {
  if ([...passphrase].length < MIN_PASSPHRASE) throw new BackupError('invalid', `The passphrase needs at least ${MIN_PASSPHRASE} characters.`);
  const salt = crypto.randomBytes(16);
  const nonce = crypto.randomBytes(12);
  const { key, check } = derive(passphrase, salt, logN);
  const header = Buffer.concat([MAGIC, Buffer.from([FORMAT, logN, R, P]), salt, nonce, check]);
  const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: TAG_LEN });
  const plain = Buffer.from(JSON.stringify(content), 'utf8');
  cipher.setAAD(header, { plaintextLength: plain.length });
  const body = Buffer.concat([header, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const b64 = body.toString('base64').match(/.{1,64}/g)!.join('\n');
  return `${BEGIN}\n${b64}\n${END}\n`;
}

/** Decrypts and checks a backup. Throws BackupError with a code for every kind of failure. */
export function decryptBackup(text: string, passphrase: string): BackupContent {
  const start = text.indexOf(BEGIN);
  if (start === -1) throw new BackupError('not-a-backup', "This isn't a termhub backup.");
  const end = text.indexOf(END, start);
  if (end === -1) throw new BackupError('truncated', 'The backup file is incomplete (cut off).');
  const b64 = text.slice(start + BEGIN.length, end).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new BackupError('damaged', 'The backup file is damaged.');
  const body = Buffer.from(b64, 'base64');
  if (body.length < HEADER_LEN + TAG_LEN) throw new BackupError('truncated', 'The backup file is incomplete (cut off).');
  if (!body.subarray(0, 4).equals(MAGIC)) throw new BackupError('not-a-backup', "This isn't a termhub backup.");
  const [format, logN, r, p] = body.subarray(4, 8);
  if (format !== FORMAT) throw new BackupError('unsupported', 'This backup was made by a newer termhub – update termhub first.');
  // only parameters this termhub would write (a manipulated header must not make scrypt run for hours)
  if (logN! < 10 || logN! > 20 || r !== R || p !== P) throw new BackupError('damaged', 'The backup file is damaged.');
  const header = body.subarray(0, HEADER_LEN);
  const salt = body.subarray(8, 24);
  const nonce = body.subarray(24, 36);
  const check = body.subarray(36, 52);
  const derived = derive(passphrase, salt, logN!);
  if (!crypto.timingSafeEqual(derived.check, check)) throw new BackupError('wrong-passphrase', 'Wrong passphrase.');
  const ciphertext = body.subarray(HEADER_LEN, body.length - TAG_LEN);
  const tag = body.subarray(body.length - TAG_LEN);
  let plain: Buffer;
  try {
    const decipher = crypto.createDecipheriv('chacha20-poly1305', derived.key, nonce, { authTagLength: TAG_LEN });
    decipher.setAAD(header, { plaintextLength: ciphertext.length });
    decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new BackupError('damaged', 'The backup file was changed or is damaged – it was not restored.');
  }
  let content: BackupContent;
  try {
    content = JSON.parse(plain.toString('utf8')) as BackupContent;
  } catch {
    throw new BackupError('invalid', 'The backup has an unknown format.');
  }
  if (content?.v !== 1 || !isIdentityFile(content.identity)) throw new BackupError('invalid', 'The backup has an unknown format.');
  try {
    identityFromFile(content.identity);
  } catch {
    throw new BackupError('invalid', 'The key in the backup is unusable.');
  }
  if (!parseProfile(content.profile)) throw new BackupError('invalid', 'The backup has no profile.');
  return content;
}

export function summarize(content: BackupContent): BackupSummary {
  const id = identityFromFile(content.identity).id;
  const friends = parseFriendsFile(content.friends).friends.filter((f) => f.state === 'accepted').length;
  return { id, name: parseProfile(content.profile)?.name ?? 'Unknown', friends, createdAt: content.createdAt };
}

/** Writes an encrypted backup (readable only by you). */
export function exportBackup(paths: HubPaths, file: string, passphrase: string, version: string, logN = DEFAULT_LOG_N): BackupSummary {
  const content = collect(paths, version);
  const text = encryptBackup(content, passphrase, logN);
  const target = path.resolve(file);
  ensureDir(path.dirname(target));
  writeFileAtomic(target, text);
  fs.chmodSync(target, 0o600);
  return summarize(content);
}

/** The same lock SharedFile takes for a shared file. */
const lockOf = (paths: HubPaths, file: string) => path.join(paths.locksDir, `${path.basename(file)}.lock`);

const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-');

/**
 * Replaces the identity, profile, friends, peers, settings and links on this computer with the
 * backup's. What was there is copied to `legacy/before-restore-<time>/` first. Only while no
 * suite app runs (the caller checks the locks).
 */
export function restoreBackup(paths: HubPaths, content: BackupContent): { savedTo: string | null; summary: BackupSummary } {
  const files = { identity: paths.identity, profile: paths.profile, friends: paths.friends, peers: paths.peers, settings: paths.settings, links: paths.links };
  let savedTo: string | null = null;
  const existing = Object.values(files).filter((f) => fs.existsSync(f));
  if (existing.length) {
    savedTo = path.join(paths.legacyDir, `before-restore-${stamp()}`);
    ensureDir(savedTo);
    for (const f of existing) {
      const dest = path.join(savedTo, path.basename(f));
      fs.copyFileSync(f, dest);
      fs.chmodSync(dest, 0o600);
    }
  }
  const write = (file: string, value: unknown) => withLock(lockOf(paths, file), () => writeJsonAtomic(file, value));
  write(files.profile, parseProfile(content.profile));
  write(files.friends, parseFriendsFile(content.friends));
  write(files.peers, parsePeersFile(content.peers));
  write(files.settings, parseSettings(content.settings));
  write(files.links, parseLinksFile(content.links));
  // the old identities only where there's none yet (they're copies anyway)
  for (const [app, id] of Object.entries(content.legacy ?? {})) {
    if (!(LEGACY_APPS as readonly string[]).includes(app) || !isIdentityFile(id)) continue;
    const dest = path.join(paths.legacyDir, app, 'identity.json');
    if (!fs.existsSync(dest)) writeJsonAtomic(dest, id);
  }
  // last: the identity – from now on the apps are this person
  write(files.identity, content.identity);
  return { savedTo, summary: summarize(content) };
}
