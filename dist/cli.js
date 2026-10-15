#!/usr/bin/env node

// src/cli.tsx
import { spawn as spawn4 } from "child_process";
import fs14 from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";
import { render } from "ink";

// ../termcore/src/app/instance.ts
import fs2 from "fs";
import net from "net";
import path2 from "path";

// ../termcore/src/app/storage.ts
import fs from "fs";
import path from "path";
function readJson(file, fallback) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err2) {
    if (err2.code === "ENOENT") return fallback;
    throw err2;
  }
  try {
    return JSON.parse(raw);
  } catch {
    try {
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
    }
    return fallback;
  }
}
var tmpSeq = 0;
function writeJsonAtomic(file, data) {
  writeFileAtomic(file, JSON.stringify(data, null, 2));
}
function writeFileAtomic(file, content) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${++tmpSeq}.tmp`;
  try {
    fs.writeFileSync(tmp, content, { mode: 384 });
    fs.renameSync(tmp, file);
  } catch (err2) {
    fs.rmSync(tmp, { force: true });
    throw err2;
  }
}
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 448 });
}

// ../termcore/src/app/instance.ts
var STARTUP_GRACE = 1e4;
var MAX_REQUEST = 1024 * 1024;
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err2) {
    return err2.code === "EPERM";
  }
}
function probeSocket(socket, timeoutMs = 1e3) {
  return new Promise((resolve) => {
    const c2 = net.connect(socket);
    const done = (ok) => {
      clearTimeout(timer);
      c2.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    c2.once("connect", () => done(true));
    c2.once("error", () => done(false));
  });
}
function readLock(file) {
  try {
    const o = JSON.parse(fs2.readFileSync(file, "utf8"));
    return Number.isInteger(o?.pid) && typeof o.startedAt === "number" && typeof o.socket === "string" ? o : null;
  } catch {
    return null;
  }
}
async function acquireLock(lockFile, socket, opts = {}) {
  const isAlive = opts.isAlive ?? pidAlive;
  const probe = opts.probe ?? probeSocket;
  const now = opts.now ?? Date.now;
  ensureDir(path2.dirname(lockFile));
  for (let attempt = 0; attempt < 5; attempt++) {
    const info = { pid: process.pid, startedAt: now(), socket };
    try {
      fs2.writeFileSync(lockFile, JSON.stringify(info), { flag: "wx", mode: 384 });
      return {
        release: () => {
          if (readLock(lockFile)?.pid === process.pid) fs2.rmSync(lockFile, { force: true });
        }
      };
    } catch (err2) {
      if (err2.code !== "EEXIST") throw err2;
    }
    const holder = readLock(lockFile);
    const stale = !holder || holder.pid === process.pid || !isAlive(holder.pid) || !await probe(holder.socket) && now() - holder.startedAt > STARTUP_GRACE;
    if (!stale) return { holder };
    fs2.rmSync(lockFile, { force: true });
  }
  throw new Error(`Couldn't take the lock ${lockFile}`);
}
async function startInstanceServer(socket, onRequest) {
  if (process.platform !== "win32") {
    ensureDir(path2.dirname(socket));
    fs2.rmSync(socket, { force: true });
  }
  const server = net.createServer((conn) => {
    conn.on("error", () => {
    });
    if (!onRequest) {
      conn.end();
      return;
    }
    let buf = "";
    conn.setEncoding("utf8");
    conn.setTimeout(5e3, () => conn.destroy());
    conn.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > MAX_REQUEST) return void conn.destroy();
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      let reply = "";
      try {
        reply = onRequest(buf.slice(0, nl));
      } catch {
      }
      conn.end(reply + "\n");
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, () => {
      server.off("error", reject);
      resolve();
    });
  });
  if (process.platform !== "win32") fs2.chmodSync(socket, 384);
  server.on("error", () => {
  });
  server.unref();
  return server;
}
async function instanceRunning(lockFile, opts = {}) {
  const isAlive = opts.isAlive ?? pidAlive;
  const probe = opts.probe ?? probeSocket;
  const now = opts.now ?? Date.now;
  const holder = readLock(lockFile);
  if (!holder || !isAlive(holder.pid)) return null;
  if (await probe(holder.socket)) return holder;
  return now() - holder.startedAt <= STARTUP_GRACE ? holder : null;
}

// ../termcore/src/store/hub.ts
import fs6 from "fs";
import path7 from "path";

// ../termcore/src/app/sanitize.ts
var ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[PX^_][^\u001b]*(?:\u001b\\)?|[@-Z\\-_])?/g;
var CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
var BIDI = /[\u202a-\u202e\u2066-\u2069]/g;
var MAX_NAME = 32;
function sanitizeText(input) {
  return input.replace(/\r\n?/g, "\n").replace(ANSI, "").replace(CONTROL, "").replace(BIDI, "").replace(/\t/g, "    ");
}
function cleanName(input) {
  if (typeof input !== "string") return "Unknown";
  const name = sanitizeText(input).replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return name || "Unknown";
}

// ../termcore/src/friends/links.ts
import crypto2 from "crypto";

// ../termcore/src/net/identity.ts
import crypto from "crypto";
var PEER_ID_RE = /^[A-Z2-7]{20}$/;
var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buf) {
  let bits = 0;
  let value = 0;
  let out2 = "";
  for (const byte of buf) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      out2 += BASE32[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out2 += BASE32[value << 5 - bits & 31];
  return out2;
}
function fingerprint(publicRaw) {
  return base32(crypto.createHash("sha256").update(publicRaw).digest()).slice(0, 20);
}
function formatId(id, full = false) {
  const groups = (full ? id : id.slice(0, 8)).match(/.{1,4}/g) ?? [];
  return groups.join("-");
}
function safetyCode(a, b) {
  const [first, second] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  const digest = crypto.createHash("sha256").update(first).update(second).digest();
  const groups = [];
  for (let i = 0; i < 6; i++) groups.push(String(digest.readUInt32BE(i * 4) % 1e5).padStart(5, "0"));
  return groups.join(" ");
}
function publicKeyFromRaw(raw) {
  return crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
}
function isIdentityFile(o) {
  const f = o;
  return !!f && f.v === 1 && typeof f.publicKey === "string" && typeof f.privateKey === "string" && !!f.publicKey && !!f.privateKey;
}
function identityFromFile(file) {
  const publicRaw = Buffer.from(file.publicKey, "base64url");
  const privateKey = crypto.createPrivateKey({
    key: { kty: "OKP", crv: "Ed25519", x: file.publicKey, d: file.privateKey },
    format: "jwk"
  });
  return { id: fingerprint(publicRaw), publicRaw, publicKey: publicKeyFromRaw(publicRaw), privateKey };
}
function generateIdentityFile() {
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  return { v: 1, publicKey: jwk.x, privateKey: jwk.d };
}
function readIdentity(file) {
  const existing = readJson(file, null);
  if (!isIdentityFile(existing)) return null;
  try {
    return identityFromFile(existing);
  } catch {
    return null;
  }
}
function loadOrCreateIdentity(file) {
  const existing = readIdentity(file);
  if (existing) return existing;
  const created = generateIdentityFile();
  writeJsonAtomic(file, created);
  return identityFromFile(created);
}

// ../termcore/src/friends/links.ts
var B64_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
var B64_SIG_RE = /^[A-Za-z0-9_-]{86}$/;
var MAX_LINKS = 8;
function payload(old, next, ts) {
  return Buffer.from(`termhub/link/1
${old}
${next}
${ts}`);
}
function createLink(oldId, newId, ts = Date.now()) {
  const old = oldId.publicRaw.toString("base64url");
  const next = newId.publicRaw.toString("base64url");
  const p = payload(old, next, ts);
  return {
    v: 1,
    old,
    new: next,
    ts,
    so: crypto2.sign(null, p, oldId.privateKey).toString("base64url"),
    sn: crypto2.sign(null, p, newId.privateKey).toString("base64url")
  };
}
function parseLink(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || o.v !== 1) return null;
  if (typeof o.old !== "string" || !B64_KEY_RE.test(o.old) || typeof o.new !== "string" || !B64_KEY_RE.test(o.new)) return null;
  if (o.old === o.new) return null;
  if (typeof o.so !== "string" || !B64_SIG_RE.test(o.so) || typeof o.sn !== "string" || !B64_SIG_RE.test(o.sn)) return null;
  if (typeof o.ts !== "number" || !Number.isSafeInteger(o.ts) || o.ts < 0) return null;
  return { v: 1, old: o.old, new: o.new, ts: o.ts, so: o.so, sn: o.sn };
}
function verifyLink(link) {
  try {
    const p = payload(link.old, link.new, link.ts);
    const oldKey = Buffer.from(link.old, "base64url");
    const newKey = Buffer.from(link.new, "base64url");
    if (oldKey.length !== 32 || newKey.length !== 32) return false;
    return crypto2.verify(null, p, publicKeyFromRaw(oldKey), Buffer.from(link.so, "base64url")) && crypto2.verify(null, p, publicKeyFromRaw(newKey), Buffer.from(link.sn, "base64url"));
  } catch {
    return false;
  }
}
var linkOldId = (l) => fingerprint(Buffer.from(l.old, "base64url"));
var linkNewId = (l) => fingerprint(Buffer.from(l.new, "base64url"));
function resolveId(id, byOld) {
  const seen = /* @__PURE__ */ new Set();
  let cur = id;
  while (byOld.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = byOld.get(cur);
  }
  return cur;
}

// ../termcore/src/friends/profile.ts
var STATUSES = ["available", "busy", "dnd"];
var STATUS_LABEL = { available: "available", busy: "busy", dnd: "do not disturb" };
var MAX_STATUS_MSG = 60;
var PROFILE_COLORS = [
  { name: "coral", hex: "#f7768e" },
  { name: "orange", hex: "#ff9e64" },
  { name: "amber", hex: "#e0af68" },
  { name: "lime", hex: "#b9e66b" },
  { name: "green", hex: "#9ece6a" },
  { name: "teal", hex: "#73daca" },
  { name: "cyan", hex: "#7dcfff" },
  { name: "blue", hex: "#7aa2f7" },
  { name: "indigo", hex: "#8f8cf2" },
  { name: "purple", hex: "#bb9af7" },
  { name: "pink", hex: "#ff8fc7" },
  { name: "sand", hex: "#d8c4a0" }
];
function normalizeColor(input) {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  const named = PROFILE_COLORS.find((c2) => c2.name === v);
  if (named) return named.hex;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(v);
  if (!m) return null;
  return "#" + (m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join("") : m[1]);
}
var isStatus = (v) => typeof v === "string" && STATUSES.includes(v);
function cleanStatusMsg(input) {
  if (typeof input !== "string") return void 0;
  const msg = [...sanitizeText(input).replace(/\s+/g, " ").trim()].slice(0, MAX_STATUS_MSG).join("");
  return msg || void 0;
}

// ../termcore/src/app/suite.ts
import os from "os";
import path3 from "path";
var SUITE = {
  termchat: { name: "termchat", tcpPort: 5050, udpPort: 5051, envPrefix: "TERMCHAT" },
  keyrace: { name: "keyrace", tcpPort: 5052, udpPort: 5053, envPrefix: "KEYRACE" },
  termdrop: { name: "termdrop", tcpPort: 5054, udpPort: 5055, envPrefix: "TERMDROP" },
  termhub: { name: "termhub", tcpPort: 5056, udpPort: 5057, envPrefix: "TERMHUB" }
};
var LEGACY_APPS = ["termchat", "keyrace", "termdrop"];
var isSuiteApp = (v) => typeof v === "string" && Object.hasOwn(SUITE, v);
function defineApp(name, pkg, protocol = `${name}/1`) {
  const repo = /github\.com[/:]([^/]+\/[^/.]+)/.exec(pkg.repository.url)?.[1] ?? `OWNER/${name}`;
  return { ...SUITE[name], protocol, version: pkg.version, repo };
}
function resolveHomes(app, home, env = process.env) {
  const hubOverride = home ?? env.TERMHUB_HOME;
  const hub = path3.resolve(hubOverride ?? path3.join(os.homedir(), ".termhub"));
  const appOverride = home ? void 0 : env[`${SUITE[app].envPrefix}_HOME`];
  const appDir = path3.resolve(appOverride ?? (hubOverride ? path3.join(hub, app) : path3.join(os.homedir(), `.${app}`)));
  return { hub, app: app === "termhub" ? hub : appDir };
}
function legacyDirs(home, env = process.env) {
  return Object.fromEntries(LEGACY_APPS.map((a) => [a, resolveHomes(a, home, env).app]));
}

// ../termcore/src/friends/state.ts
var REL_STATES = ["accepted", "outgoing", "none"];
var CONTACT_STATES = ["accepted", "outgoing", "incoming", "declined", "blocked"];
var STATE_RANK = { blocked: 5, accepted: 4, outgoing: 3, incoming: 2, declined: 1 };
function strongerState(a, b) {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}
function reconcile(mine, theirs) {
  const peerWants = theirs === "accepted" || theirs === "outgoing";
  switch (mine) {
    case "blocked":
      return "blocked";
    case "accepted":
    case "outgoing":
      return peerWants ? "accepted" : "outgoing";
    case "incoming":
      return peerWants ? "incoming" : null;
    case "declined":
      return peerWants ? "incoming" : "declined";
    case null:
      return peerWants ? "incoming" : null;
  }
}
function relStateFor(state) {
  return state === "accepted" || state === "outgoing" ? state : "none";
}

// ../termcore/src/store/files.ts
var ANIMATIONS = ["nonstop", "brief", "off"];
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
var IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
function parsePorts(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out2 = {};
  for (const [k, p] of Object.entries(v)) {
    if (isSuiteApp(k) && Number.isInteger(p) && p > 0 && p < 65536) out2[k] = p;
  }
  return Object.keys(out2).length ? out2 : void 0;
}
function parseApps(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out2 = {};
  for (const [k, fields] of Object.entries(v)) {
    if (isSuiteApp(k) && fields && typeof fields === "object" && !Array.isArray(fields) && Object.keys(fields).length) {
      out2[k] = fields;
    }
  }
  return Object.keys(out2).length ? out2 : void 0;
}
function compact(o) {
  for (const k of Object.keys(o)) if (o[k] === void 0) delete o[k];
  return o;
}
function parseFriend(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !PEER_ID_RE.test(o.id)) return null;
  if (!CONTACT_STATES.includes(o.state)) return null;
  const now = Date.now();
  return compact({
    id: o.id,
    publicKey: typeof o.publicKey === "string" ? o.publicKey : "",
    name: cleanName(o.name),
    alias: typeof o.alias === "string" && o.alias.trim() ? cleanName(o.alias) : void 0,
    state: o.state,
    color: normalizeColor(o.color) ?? void 0,
    lastIp: typeof o.lastIp === "string" && IPV4_RE.test(o.lastIp) ? o.lastIp : void 0,
    ports: parsePorts(o.ports),
    lastSeen: num(o.lastSeen),
    lastActivity: num(o.lastActivity) ?? now,
    createdAt: num(o.createdAt) ?? now,
    status: isStatus(o.status) && o.status !== "available" ? o.status : void 0,
    statusMsg: cleanStatusMsg(o.statusMsg),
    apps: parseApps(o.apps)
  });
}
function parseKnownPeer(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !PEER_ID_RE.test(o.id)) return null;
  return compact({
    id: o.id,
    name: cleanName(o.name),
    lastIp: typeof o.lastIp === "string" && IPV4_RE.test(o.lastIp) ? o.lastIp : void 0,
    ports: parsePorts(o.ports),
    lastSeen: num(o.lastSeen)
  });
}
function uniqueById(list) {
  const seen = /* @__PURE__ */ new Set();
  const out2 = [];
  for (const e of list) {
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out2.push(e);
  }
  return out2;
}
function parseFriendsFile(raw) {
  const list = raw?.friends;
  return { v: 1, friends: Array.isArray(list) ? uniqueById(list.map(parseFriend)) : [] };
}
function parsePeersFile(raw) {
  const list = raw?.peers;
  return { v: 1, peers: Array.isArray(list) ? uniqueById(list.map(parseKnownPeer)) : [] };
}
function parseProfile(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.name !== "string" || !o.name.trim()) return null;
  return compact({
    v: 1,
    name: cleanName(o.name),
    color: normalizeColor(o.color) ?? void 0,
    status: isStatus(o.status) ? o.status : "available",
    statusMsg: cleanStatusMsg(o.statusMsg)
  });
}
var DEFAULT_SETTINGS = { v: 1, animations: "brief", notifications: true };
function parseSettings(raw) {
  const o = raw ?? {};
  return compact({
    v: 1,
    accent: normalizeColor(o.accent) ?? void 0,
    animations: ANIMATIONS.includes(o.animations) ? o.animations : DEFAULT_SETTINGS.animations,
    notifications: typeof o.notifications === "boolean" ? o.notifications : DEFAULT_SETTINGS.notifications
  });
}
function parseLinksFile(raw) {
  const o = raw ?? {};
  const links = (v) => Array.isArray(v) ? v.map(parseLink).filter((l) => l !== null) : [];
  return { v: 1, mine: links(o.mine), known: links(o.known) };
}

// ../termcore/src/store/migrate.ts
import crypto3 from "crypto";
import fs4 from "fs";
import path5 from "path";

// ../termcore/src/friends/merge.ts
var max = (a, b) => a === void 0 ? b : b === void 0 ? a : Math.max(a, b);
var min = (a, b) => Math.min(a, b);
var fresher = (a, b) => (b.lastSeen ?? 0) > (a.lastSeen ?? 0) ? b : a;
function mergeFriends(a, b, id = a.id) {
  const recent = fresher(a, b);
  const apps = { ...b.apps };
  for (const [app, fields] of Object.entries(a.apps ?? {})) {
    apps[app] = { ...apps[app], ...fields };
  }
  const ports = { ...b.ports, ...a.ports };
  const out2 = {
    id,
    publicKey: a.publicKey || b.publicKey,
    name: recent.name,
    state: strongerState(a.state, b.state),
    lastActivity: max(a.lastActivity, b.lastActivity) ?? Date.now(),
    createdAt: min(a.createdAt, b.createdAt)
  };
  const alias = a.alias ?? b.alias;
  if (alias) out2.alias = alias;
  const color = a.color ?? b.color;
  if (color) out2.color = color;
  const lastIp = recent.lastIp ?? a.lastIp ?? b.lastIp;
  if (lastIp) out2.lastIp = lastIp;
  if (Object.keys(ports).length) out2.ports = ports;
  const lastSeen2 = max(a.lastSeen, b.lastSeen);
  if (lastSeen2 !== void 0) out2.lastSeen = lastSeen2;
  if (recent.status) out2.status = recent.status;
  if (recent.statusMsg) out2.statusMsg = recent.statusMsg;
  if (Object.keys(apps).length) out2.apps = apps;
  return out2;
}
function mergePeers(a, b, id = a.id) {
  const recent = fresher(a, b);
  const out2 = { id, name: recent.name };
  const lastIp = recent.lastIp ?? a.lastIp ?? b.lastIp;
  if (lastIp) out2.lastIp = lastIp;
  const ports = { ...b.ports, ...a.ports };
  if (Object.keys(ports).length) out2.ports = ports;
  const lastSeen2 = max(a.lastSeen, b.lastSeen);
  if (lastSeen2 !== void 0) out2.lastSeen = lastSeen2;
  return out2;
}

// ../termcore/src/store/lock.ts
import fs3 from "fs";
import path4 from "path";
var sleepCell = new Int32Array(new SharedArrayBuffer(4));
var sleepSync = (ms) => void Atomics.wait(sleepCell, 0, 0, ms);
function readLock2(file) {
  try {
    const o = JSON.parse(fs3.readFileSync(file, "utf8"));
    return Number.isInteger(o?.pid) && typeof o.ts === "number" && typeof o.token === "string" ? o : null;
  } catch {
    return null;
  }
}
function withLock(lockFile, fn, timings = {}) {
  const timeoutMs = timings.timeoutMs ?? 1e4;
  const staleMs = timings.staleMs ?? 15e3;
  ensureDir(path4.dirname(lockFile));
  const mine = { pid: process.pid, ts: Date.now(), token: Math.random().toString(36).slice(2) };
  const start2 = Date.now();
  let delay = 1;
  for (; ; ) {
    mine.ts = Date.now();
    try {
      fs3.writeFileSync(lockFile, JSON.stringify(mine), { flag: "wx", mode: 384 });
      break;
    } catch (err2) {
      if (err2.code !== "EEXIST") throw err2;
    }
    const holder = readLock2(lockFile);
    const stale = holder ? holder.pid !== process.pid && !pidAlive(holder.pid) || Date.now() - holder.ts > staleMs : Date.now() - start2 > 200;
    if (stale) {
      const again = readLock2(lockFile);
      if (!holder || again && again.token === holder.token) {
        try {
          fs3.unlinkSync(lockFile);
        } catch {
        }
      }
      continue;
    }
    if (Date.now() - start2 > timeoutMs) throw new Error(`Timed out waiting for ${path4.basename(lockFile)}`);
    sleepSync(delay);
    delay = Math.min(delay * 2, 25);
  }
  try {
    return fn();
  } finally {
    if (readLock2(lockFile)?.token === mine.token) {
      try {
        fs3.unlinkSync(lockFile);
      } catch {
      }
    }
  }
}

// ../termcore/src/store/migrate.ts
var LEGACY_FILES = ["identity.json", "config.json", "contacts.json", "peers.json"];
var BASE_CONTACT_FIELDS = /* @__PURE__ */ new Set(["id", "publicKey", "name", "alias", "state", "lastIp", "lastPort", "lastSeen", "lastActivity", "createdAt"]);
var lockOf = (paths, file) => path5.join(paths.locksDir, `${path5.basename(file)}.lock`);
var hash = (s) => s === null ? void 0 : crypto3.createHash("sha256").update(s).digest("hex").slice(0, 32);
function readText(file) {
  try {
    return fs4.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
function parseArray(raw) {
  if (raw === null) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function readLegacy(app, dir) {
  const idRaw = readJson(path5.join(dir, "identity.json"), null);
  const identityFile = isIdentityFile(idRaw) ? idRaw : null;
  let identity = null;
  try {
    identity = identityFile ? identityFromFile(identityFile) : null;
  } catch {
    identity = null;
  }
  let config = null;
  try {
    const c2 = readJson(path5.join(dir, "config.json"), null);
    config = c2 && typeof c2 === "object" ? c2 : null;
  } catch {
    config = null;
  }
  return {
    app,
    dir,
    identityFile: identity ? identityFile : null,
    identity,
    config,
    contactsRaw: readText(path5.join(dir, "contacts.json")),
    peersRaw: readText(path5.join(dir, "peers.json"))
  };
}
function friendFromLegacy(app, raw) {
  const c2 = raw;
  if (!c2 || typeof c2 !== "object") return null;
  const fields = {};
  for (const [k, v] of Object.entries(c2)) {
    if (!BASE_CONTACT_FIELDS.has(k) && v !== void 0 && v !== null && v !== false && v !== 0 && v !== "") fields[k] = v;
  }
  const port = Number(c2.lastPort);
  return parseFriend({
    ...c2,
    ports: Number.isInteger(port) && port > 0 ? { [app]: port } : void 0,
    apps: Object.keys(fields).length ? { [app]: fields } : void 0
  });
}
function peerFromLegacy(app, raw) {
  const c2 = raw;
  if (!c2 || typeof c2 !== "object") return null;
  const port = Number(c2.lastPort);
  return parseKnownPeer({ ...c2, ports: Number.isInteger(port) && port > 0 ? { [app]: port } : void 0 });
}
function mergeInto(map, entries, merge, skip, mapId) {
  for (const e of entries) {
    if (!e) continue;
    const id = mapId(e.id);
    if (skip.has(id)) continue;
    const entry = id === e.id ? e : { ...e, id };
    const prev = map.get(id);
    map.set(id, prev ? merge(prev, entry) : entry);
  }
}
function backup(paths, l, suffix = "") {
  const dest = path5.join(paths.legacyDir, l.app);
  for (const f of LEGACY_FILES) {
    const src = path5.join(l.dir, f);
    if (!fs4.existsSync(src)) continue;
    ensureDir(dest);
    const target = path5.join(dest, suffix ? f.replace(/\.json$/, `.${suffix}.json`) : f);
    if (!suffix && fs4.existsSync(target)) continue;
    fs4.copyFileSync(src, target);
    fs4.chmodSync(target, 384);
  }
}
function migrate(paths) {
  return withLock(path5.join(paths.locksDir, "migration.lock"), () => fs4.existsSync(paths.identity) ? catchUp(paths) : fullMigration(paths), {
    timeoutMs: 6e4,
    staleMs: 12e4
  });
}
function fullMigration(paths) {
  const legacy = LEGACY_APPS.map((app) => readLegacy(app, paths.legacy[app]));
  const masterSrc = legacy.find((l) => l.identity);
  const nothing = { migrated: false, caughtUp: [], master: null, links: 0, friends: 0 };
  if (!masterSrc) return nothing;
  const masterFile = masterSrc.identityFile ?? generateIdentityFile();
  const master = identityFromFile(masterFile);
  const now = Date.now();
  const links = [];
  const myIds = /* @__PURE__ */ new Set([master.id]);
  for (const l of legacy) {
    if (!l.identity) continue;
    myIds.add(l.identity.id);
    if (l.identity.id !== master.id && !links.some((x) => linkOldId(x) === l.identity.id)) links.push(createLink(l.identity, master, now));
  }
  const friends = /* @__PURE__ */ new Map();
  const peers = /* @__PURE__ */ new Map();
  for (const l of legacy) {
    mergeInto(friends, parseArray(l.contactsRaw).map((c2) => friendFromLegacy(l.app, c2)), mergeFriends, myIds, (id) => id);
    mergeInto(peers, parseArray(l.peersRaw).map((p) => peerFromLegacy(l.app, p)), mergePeers, myIds, (id) => id);
  }
  const pick = (get) => {
    for (const l of legacy) {
      const v = get(l);
      if (v !== void 0) return v;
    }
    return void 0;
  };
  const nameRaw = pick((l) => typeof l.config?.name === "string" && l.config.name.trim() ? l.config.name : void 0);
  const name = nameRaw ? cleanName(nameRaw) : void 0;
  const effects = legacy[0]?.config?.effects;
  const settings = {
    v: 1,
    animations: ANIMATIONS.includes(effects) ? effects : "brief",
    notifications: pick((l) => typeof l.config?.notifications === "boolean" ? l.config.notifications : void 0) ?? true
  };
  for (const l of legacy) backup(paths, l);
  ensureDir(paths.dir);
  writeJsonAtomic(paths.friends, parseFriendsFile({ friends: [...friends.values()] }));
  writeJsonAtomic(paths.peers, parsePeersFile({ peers: [...peers.values()] }));
  if (!fs4.existsSync(paths.settings)) writeJsonAtomic(paths.settings, settings);
  writeJsonAtomic(paths.links, { v: 1, mine: links, known: [] });
  if (name) writeJsonAtomic(paths.profile, { v: 1, name, status: "available" });
  const record = {
    v: 1,
    at: now,
    master: { app: masterSrc.app, id: master.id },
    sources: Object.fromEntries(legacy.map((l) => [l.app, sourceOf(l)]))
  };
  writeJsonAtomic(paths.migration, record);
  writeJsonAtomic(paths.identity, masterFile);
  return { migrated: true, caughtUp: [], master: record.master, links: links.length, friends: friends.size, ...name ? { name } : {} };
}
var sourceOf = (l) => ({
  ...l.identity ? { id: l.identity.id } : {},
  ...l.contactsRaw !== null ? { contacts: hash(l.contactsRaw) } : {},
  ...l.peersRaw !== null ? { peers: hash(l.peersRaw) } : {}
});
function catchUp(paths) {
  const master = readIdentity(paths.identity);
  const record = readJson(paths.migration, null);
  const report = { migrated: false, caughtUp: [], master: record?.master ?? null, links: 0, friends: 0 };
  if (!master) return report;
  const sources = { ...record?.sources };
  const linksFile = parseLinksFile(readJson(paths.links, null));
  const byOld = new Map([...linksFile.mine, ...linksFile.known].map((l) => [linkOldId(l), linkNewId(l)]));
  const myIds = /* @__PURE__ */ new Set([master.id, ...linksFile.mine.map(linkOldId)]);
  let changedRecord = !record;
  let friendsTouched = false;
  for (const app of LEGACY_APPS) {
    const l = readLegacy(app, paths.legacy[app]);
    const seen = sources[app] ?? {};
    const now = sourceOf(l);
    if (l.identity && l.identity.id !== master.id && !byOld.has(l.identity.id)) {
      const link = createLink(l.identity, master);
      linksFile.mine.push(link);
      byOld.set(l.identity.id, master.id);
      myIds.add(l.identity.id);
      report.links++;
    }
    if (l.identity) myIds.add(l.identity.id);
    const contactsChanged = now.contacts !== void 0 && now.contacts !== seen.contacts;
    const peersChanged = now.peers !== void 0 && now.peers !== seen.peers;
    if (contactsChanged || peersChanged) {
      backup(paths, l, String(Date.now()));
      const mapId = (id) => resolveId(id, byOld);
      if (contactsChanged) {
        withLock(lockOf(paths, paths.friends), () => {
          const file = parseFriendsFile(readJson(paths.friends, null));
          const map = new Map(file.friends.map((f) => [f.id, f]));
          mergeInto(map, parseArray(l.contactsRaw).map((c2) => friendFromLegacy(app, c2)), mergeFriends, myIds, mapId);
          writeJsonAtomic(paths.friends, { v: 1, friends: [...map.values()] });
        });
        friendsTouched = true;
      }
      if (peersChanged) {
        withLock(lockOf(paths, paths.peers), () => {
          const file = parsePeersFile(readJson(paths.peers, null));
          const map = new Map(file.peers.map((p) => [p.id, p]));
          mergeInto(map, parseArray(l.peersRaw).map((p) => peerFromLegacy(app, p)), mergePeers, myIds, mapId);
          writeJsonAtomic(paths.peers, { v: 1, peers: [...map.values()] });
        });
      }
      report.caughtUp.push(app);
    }
    if (JSON.stringify(now) !== JSON.stringify(seen)) {
      sources[app] = now;
      changedRecord = true;
    }
  }
  if (report.links) {
    withLock(lockOf(paths, paths.links), () => {
      const current = parseLinksFile(readJson(paths.links, null));
      const mine = [...current.mine, ...linksFile.mine.filter((l) => !current.mine.some((m) => m.old === l.old))];
      writeJsonAtomic(paths.links, { ...current, mine });
    });
  }
  if (changedRecord || report.links) {
    writeJsonAtomic(paths.migration, {
      v: 1,
      at: record?.at ?? Date.now(),
      master: record?.master ?? { app: "new", id: master.id },
      sources
    });
  }
  report.friends = friendsTouched ? parseFriendsFile(readJson(paths.friends, null)).friends.length : 0;
  return report;
}

// ../termcore/src/store/shared.ts
import { EventEmitter } from "events";
import fs5 from "fs";
import path6 from "path";
var DEBOUNCE_MS = 30;
var POLL_MS = 1500;
var stampOf = (file) => {
  try {
    const s = fs5.statSync(file);
    return { mtimeMs: s.mtimeMs, size: s.size, ino: s.ino };
  } catch {
    return null;
  }
};
var sameStamp = (a, b) => a === b || !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size && a.ino === b.ino;
var SharedFile = class extends EventEmitter {
  constructor(file, opts) {
    super();
    this.file = file;
    this.opts = opts;
    this.lockFile = path6.join(opts.locksDir, `${path6.basename(file)}.lock`);
    this.stamp = stampOf(file);
    this.value = opts.parse(readJson(file, null));
    this.text = JSON.stringify(this.value);
  }
  value;
  text;
  stamp;
  watcher = null;
  poll = null;
  debounce = null;
  lockFile;
  get() {
    return this.value;
  }
  /** Reads the file again if it changed on disk. Returns whether the value changed. */
  refresh() {
    const stamp2 = stampOf(this.file);
    if (sameStamp(stamp2, this.stamp)) return false;
    this.stamp = stamp2;
    return this.adopt(this.opts.parse(readJson(this.file, null)), true);
  }
  adopt(value, external) {
    const text2 = JSON.stringify(value);
    if (text2 === this.text) return false;
    this.value = value;
    this.text = text2;
    this.emit("change", value, external);
    return true;
  }
  /**
   * Locked read-modify-write. `fn` gets a private copy of the newest value; it may change it in
   * place (return nothing) or return a replacement. Nothing is written if nothing changed.
   * Returns the new value.
   */
  update(fn) {
    return withLock(this.lockFile, () => {
      const current = this.opts.parse(readJson(this.file, null));
      const draft = structuredClone(current);
      const next = this.opts.parse(fn(draft) ?? draft);
      const text2 = JSON.stringify(next);
      if (text2 !== JSON.stringify(current)) {
        writeFileAtomic(this.file, JSON.stringify(next, null, 2));
      }
      this.stamp = stampOf(this.file);
      if (JSON.stringify(current) !== this.text) this.adopt(current, true);
      this.adopt(next, false);
      return next;
    });
  }
  /** Writes a value as is (under the lock) – for files only one process creates (migration). */
  replace(value) {
    this.update(() => value);
  }
  watch() {
    if (this.watcher || this.poll) return;
    const schedule = () => {
      if (this.debounce) return;
      this.debounce = setTimeout(() => {
        this.debounce = null;
        this.refresh();
      }, DEBOUNCE_MS);
      this.debounce.unref();
    };
    try {
      fs5.mkdirSync(path6.dirname(this.file), { recursive: true, mode: 448 });
      const name = path6.basename(this.file);
      this.watcher = fs5.watch(path6.dirname(this.file), { persistent: false }, (_ev, f) => {
        if (!f || f === name) schedule();
      });
      this.watcher.on("error", () => {
        this.watcher?.close();
        this.watcher = null;
      });
    } catch {
      this.watcher = null;
    }
    this.poll = setInterval(() => this.refresh(), POLL_MS);
    this.poll.unref();
  }
  unwatch() {
    this.watcher?.close();
    this.watcher = null;
    if (this.poll) clearInterval(this.poll);
    if (this.debounce) clearTimeout(this.debounce);
    this.poll = null;
    this.debounce = null;
  }
};

// ../termcore/src/store/hub.ts
var Hub = class {
  /** Opens an existing hub (after `prepare` and onboarding). Throws if there's no profile yet. */
  constructor(paths) {
    this.paths = paths;
    const identity = readIdentity(paths.identity);
    if (!identity) throw new Error("No profile found");
    this.identity = identity;
    const locksDir = paths.locksDir;
    this.profile = new SharedFile(paths.profile, { locksDir, parse: parseProfile });
    if (!this.profile.get()) throw new Error("No profile found");
    this.friends = new SharedFile(paths.friends, { locksDir, parse: parseFriendsFile });
    this.peers = new SharedFile(paths.peers, { locksDir, parse: parsePeersFile });
    this.settings = new SharedFile(paths.settings, { locksDir, parse: parseSettings });
    this.links = new SharedFile(paths.links, { locksDir, parse: parseLinksFile });
  }
  identity;
  profile;
  friends;
  peers;
  settings;
  links;
  /**
   * Run once at startup, before anything reads the hub: migrates the apps' old data on the
   * first start of a new version (see migrate.ts).
   */
  static prepare(paths) {
    return migrate(paths);
  }
  /** Is there a complete profile (identity + name)? Otherwise the app shows its onboarding. */
  static hasProfile(paths) {
    return readIdentity(paths.identity) !== null && parseProfile(readJson(paths.profile, null)) !== null;
  }
  /** The name, if there's a profile. */
  static profileName(paths) {
    return parseProfile(readJson(paths.profile, null))?.name ?? null;
  }
  /** Creates identity (if there's none yet) and profile on first launch (termhub also asks for a color). */
  static createProfile(paths, name, color) {
    const identity = loadOrCreateIdentity(paths.identity);
    const prev = parseProfile(readJson(paths.profile, null));
    const hex = normalizeColor(color);
    writeJsonAtomic(paths.profile, { ...prev ?? { v: 1, status: "available" }, name: cleanName(name), ...hex ? { color: hex } : {} });
    return identity;
  }
  /** Follows file changes by the other apps. */
  watch() {
    for (const f of this.files()) f.watch();
  }
  close() {
    for (const f of this.files()) {
      f.unwatch();
      f.removeAllListeners();
    }
  }
  files() {
    return [this.profile, this.friends, this.peers, this.settings, this.links];
  }
  get me() {
    return this.profile.get();
  }
  setProfile(patch) {
    return this.profile.update((p) => {
      const next = { ...p ?? { v: 1, name: "Unknown", status: "available" } };
      for (const [k, v] of Object.entries(patch)) {
        if (v === void 0) delete next[k];
        else next[k] = v;
      }
      return next;
    });
  }
  setSettings(patch) {
    return this.settings.update((s) => {
      const next = { ...s };
      for (const [k, v] of Object.entries(patch)) {
        if (v === void 0) delete next[k];
        else next[k] = v;
      }
      return next;
    });
  }
  /** My own links (sent to everyone I connect to). */
  myLinks() {
    return this.links.get().mine;
  }
  /** My old ids. */
  myOldIds() {
    return this.myLinks().map(linkOldId);
  }
  /** Remembers a verified link of someone else. */
  addKnownLink(link) {
    this.links.update((l) => {
      if (l.known.some((k) => k.old === link.old && k.new === link.new)) return;
      l.known = [...l.known.filter((k) => k.old !== link.old), link];
    });
  }
  /** old id → new id, for my links and everyone else's. */
  linkMap() {
    const { mine, known } = this.links.get();
    return new Map([...mine, ...known].map((l) => [linkOldId(l), linkNewId(l)]));
  }
};
function rekeyedFile(appHome2) {
  return path7.join(appHome2, "rekeyed.json");
}
function applyLinks(hub, appHome2, rekey) {
  const file = rekeyedFile(appHome2);
  const done = new Set(readJson(file, []).filter((x) => typeof x === "string"));
  const applied = [];
  for (const [oldId, newId] of hub.linkMap()) {
    if (done.has(`${oldId}>${newId}`)) continue;
    rekey(oldId, newId);
    done.add(`${oldId}>${newId}`);
    applied.push(oldId);
  }
  if (applied.length) {
    fs6.mkdirSync(appHome2, { recursive: true, mode: 448 });
    writeJsonAtomic(file, [...done]);
  }
  return applied;
}
function migrationNotice(friends) {
  return `Your profile and ${friends === 1 ? "1 friend" : `${friends} friends`} moved to ~/.termhub \u2013 shared by termchat, keyrace, termdrop and termhub`;
}

// ../termcore/src/ui/mouse.ts
import { EventEmitter as EventEmitter2 } from "events";
import { PassThrough } from "stream";
import { useEffect, useRef } from "react";
var MOUSE_ON = "\x1B[?1007h\x1B[?1004h\x1B[?2004h";
var MOUSE_OFF = "\x1B[?2004l\x1B[?1004l\x1B[?1007l";
var PASTE_START = "\x1B[200~";
var PASTE_END = "\x1B[201~";
var ESC = "\x1B";
var SGR = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])/;
var SGR_PARTIAL = /^\u001b\[<[\d;]*$/;
var PENDING_MS = 30;
var PASTE_PENDING_MS = 1e3;
function wheelOf(button) {
  if (!(button & 64) || button & 128) return null;
  const low = button & 3;
  return low === 0 ? -1 : low === 1 ? 1 : null;
}
function extractMouse(input, pending = "") {
  const s = pending + input;
  const events = [];
  const focus = [];
  const pastes = [];
  let text2 = "";
  let i = 0;
  const done = (rest) => finish(text2, events, rest, focus, pastes);
  while (i < s.length) {
    const esc = s.indexOf(ESC, i);
    if (esc === -1) {
      text2 += s.slice(i);
      break;
    }
    text2 += s.slice(i, esc);
    const rest = s.slice(esc);
    if (rest.startsWith(PASTE_START)) {
      const end = rest.indexOf(PASTE_END);
      if (end === -1) return done(rest);
      pastes.push(rest.slice(PASTE_START.length, end));
      i = esc + end + PASTE_END.length;
      continue;
    }
    if (rest.startsWith(PASTE_END)) {
      i = esc + PASTE_END.length;
      continue;
    }
    if (rest.startsWith(`${ESC}[I`) || rest.startsWith(`${ESC}[O`)) {
      focus.push(rest[2] === "I");
      i = esc + 3;
      continue;
    }
    const sgr = SGR.exec(rest);
    if (sgr) {
      const dir = sgr[4] === "M" ? wheelOf(Number(sgr[1])) : null;
      if (dir) events.push(dir);
      i = esc + sgr[0].length;
      continue;
    }
    if (rest.startsWith(`${ESC}[M`)) {
      if (rest.length < 6) return done(rest);
      const dir = wheelOf(rest.charCodeAt(3) - 32);
      if (dir) events.push(dir);
      i = esc + 6;
      continue;
    }
    if (rest === ESC || rest === `${ESC}[` || SGR_PARTIAL.test(rest) || rest.length < PASTE_START.length && PASTE_START.startsWith(rest)) {
      return done(rest);
    }
    text2 += ESC;
    i = esc + 1;
  }
  return done("");
}
function finish(text2, events, pending, focus, pastes) {
  return { text: text2, events, pending, ...focus.length ? { focus } : {}, ...pastes.length ? { pastes } : {} };
}
var mouse = new EventEmitter2();
var pasteHandlers = [];
function emitPaste(text2) {
  for (let i = pasteHandlers.length - 1; i >= 0; i--) if (pasteHandlers[i].cb(text2)) return true;
  return false;
}
var MouseFilterStdin = class extends PassThrough {
  constructor(source) {
    super();
    this.source = source;
    source.setEncoding("utf8");
    source.on("data", this.onData);
    source.resume();
  }
  isTTY = true;
  pending = "";
  timer = null;
  onData = (chunk) => this.feed(chunk);
  /**
   * Stops reading the terminal: the real stdin is paused and no longer fed in here. termhub
   * does this before another app takes over the terminal, so no keystroke goes to both.
   */
  detach() {
    this.source.off("data", this.onData);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = "";
    try {
      this.source.setRawMode(false);
    } catch {
    }
    this.source.pause();
  }
  feed(chunk) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const r = extractMouse(chunk, this.pending);
    this.pending = r.pending;
    for (const e of r.events) mouse.emit("wheel", e);
    for (const f of r.focus ?? []) mouse.emit("focus", f);
    if (r.text) this.write(r.text);
    for (const p of r.pastes ?? []) this.paste(p);
    if (this.pending) {
      const inPaste = this.pending.startsWith(PASTE_START);
      this.timer = setTimeout(
        () => {
          const p = this.pending;
          this.pending = "";
          if (inPaste) this.paste(p.slice(PASTE_START.length));
          else if (p) this.write(p);
        },
        inPaste ? PASTE_PENDING_MS : PENDING_MS
      );
    }
  }
  paste(text2) {
    if (!emitPaste(text2) && text2) this.write(text2);
  }
  setRawMode(mode) {
    this.source.setRawMode(mode);
    return this;
  }
  ref() {
    this.source.ref();
    return this;
  }
  unref() {
    this.source.unref();
    return this;
  }
};
function usePaste(cb, isActive = true) {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (!isActive) return;
    const h = { cb: (text2) => latest.current(text2) };
    pasteHandlers.push(h);
    return () => {
      pasteHandlers.splice(pasteHandlers.indexOf(h), 1);
    };
  }, [isActive]);
}
function useWheel(cb, isActive = true) {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (!isActive) return;
    const on = (dir) => latest.current(dir);
    mouse.on("wheel", on);
    return () => {
      mouse.off("wheel", on);
    };
  }, [isActive]);
}

// src/apps/launch.ts
import { spawn } from "child_process";
var ALT_SCREEN_ON = "\x1B[?1049h\x1B[H";
var ALT_SCREEN_OFF = "\x1B[?1049l";
var SHOW_CURSOR = "\x1B[?25h";
var RESET = "\x1B[0m\x1B[r";
var LEAVE_SCREEN = MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF;
var ENTER_SCREEN = RESET + ALT_SCREEN_ON + MOUSE_ON;
var IGNORED = ["SIGINT", "SIGQUIT", "SIGTSTP"];
function runInTerminal(command, args = [], opts = {}) {
  return new Promise((resolve) => {
    const ignore = () => {
    };
    const restore2 = () => {
      for (const sig of IGNORED) if (process.platform !== "win32" || sig === "SIGINT") process.off(sig, ignore);
    };
    for (const sig of IGNORED) if (process.platform !== "win32" || sig === "SIGINT") process.on(sig, ignore);
    const [cmd, ...pre] = command;
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      restore2();
      resolve(r);
    };
    try {
      const child = spawn(cmd, [...pre, ...args], {
        stdio: opts.stdio ?? "inherit",
        env: opts.env ?? process.env,
        shell: process.platform === "win32" && !cmd.endsWith(".js") && cmd !== process.execPath
      });
      child.on("error", (err2) => done({ code: null, signal: null, error: err2.message }));
      child.on("exit", (code, signal) => done({ code, signal }));
    } catch (err2) {
      done({ code: null, signal: null, error: err2.message });
    }
  });
}
async function handOver(term, run) {
  term.detach();
  term.write(LEAVE_SCREEN);
  try {
    return await run();
  } finally {
    term.write(ENTER_SCREEN);
  }
}

// src/cli/tasks.ts
import { spawnSync } from "child_process";
import fs10 from "fs";
import path13 from "path";

// ../termcore/src/app/paths.ts
import crypto4 from "crypto";
import os2 from "os";
import path8 from "path";
function hubPaths(dir, legacy) {
  return {
    dir,
    identity: path8.join(dir, "identity.json"),
    profile: path8.join(dir, "profile.json"),
    friends: path8.join(dir, "friends.json"),
    peers: path8.join(dir, "peers.json"),
    settings: path8.join(dir, "settings.json"),
    links: path8.join(dir, "links.json"),
    migration: path8.join(dir, "migration.json"),
    runDir: path8.join(dir, "run"),
    legacyDir: path8.join(dir, "legacy"),
    locksDir: path8.join(dir, ".locks"),
    legacy
  };
}
var MAX_SOCKET_PATH = 100;
function socketPath(root, app, platform = process.platform) {
  const tag = crypto4.createHash("sha256").update(root).digest("hex").slice(0, 12);
  if (platform === "win32") return `\\\\.\\pipe\\${app}-${tag}`;
  const inHome = path8.join(root, `${app}.sock`);
  return Buffer.byteLength(inHome) <= MAX_SOCKET_PATH ? inHome : path8.join(os2.tmpdir(), `${app}-${tag}.sock`);
}
function basePaths(app, home, env = process.env) {
  const homes = resolveHomes(app, home, env);
  return {
    home: homes.app,
    hub: hubPaths(homes.hub, legacyDirs(home, env)),
    config: path8.join(homes.app, "config.json"),
    log: path8.join(homes.app, `${app}.log`),
    lock: path8.join(homes.app, `${app}.lock`),
    socket: socketPath(homes.app, app)
  };
}
function tildify(p) {
  const home = os2.homedir();
  return p === home ? "~" : p.startsWith(home + path8.sep) ? `~${p.slice(home.length)}` : p;
}

// ../termcore/src/app/update.ts
import { execFile, spawn as spawn2 } from "child_process";
import fs7 from "fs";
import os3 from "os";
import path9 from "path";

// ../termcore/src/app/version.ts
var repoConfigured = (app) => !app.repo.startsWith("OWNER/");
var installSpec = (app) => `https://github.com/${app.repo}/tarball/main`;
var installCmd = (app) => `npm i -g ${installSpec(app)}`;

// ../termcore/src/app/update.ts
function npmCommand(env = process.env) {
  if (env.TERMHUB_NPM) return { cmd: env.TERMHUB_NPM, shell: false };
  const win = process.platform === "win32";
  return { cmd: win ? "npm.cmd" : "npm", shell: win };
}
function runNpm(args, opts = {}) {
  return new Promise((resolve) => {
    const { cmd, shell } = npmCommand();
    let output = "";
    const take = (d) => {
      const s = String(d);
      output += s;
      opts.onOutput?.(s);
    };
    try {
      const p = spawn2(cmd, args, { stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"], shell });
      p.stdout?.on("data", take);
      p.stderr?.on("data", take);
      p.on("error", (err2) => resolve({ ok: false, output: `${output}
${err2.message}` }));
      p.on("close", (code) => resolve({ ok: code === 0, output }));
    } catch (err2) {
      resolve({ ok: false, output: err2.message });
    }
  });
}
var globalRootCache = null;
function npmGlobalRoot(fresh = false) {
  if (!globalRootCache || fresh) {
    globalRootCache = runNpm(["root", "-g"]).then((r) => {
      const dir = r.output.trim().split("\n").pop()?.trim();
      return r.ok && dir ? dir : null;
    });
  }
  return globalRootCache;
}
function writableDir(dir) {
  if (!dir) return false;
  try {
    fs7.accessSync(dir, fs7.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
var VERSION_RE = /^\d+\.\d+\.\d+$/;
var PERMISSION_RE = /EACCES|EPERM|permission denied/i;
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
var realpath = (p) => {
  try {
    return fs7.realpathSync(p);
  } catch {
    return path9.resolve(p);
  }
};
var isRoot = () => process.getuid?.() === 0;
var restart = false;
var requestRestart = () => void (restart = true);
var restartRequested = () => restart;
function createUpdater(app) {
  const { name, envPrefix: P2 } = app;
  const env = (key) => process.env[`${P2}_${key}`];
  const VERSION2 = app.version;
  const INSTALL_SPEC2 = installSpec(app);
  const INSTALL_CMD2 = installCmd(app);
  const REPO_CONFIGURED2 = repoConfigured(app);
  const latestUrl = () => env("UPDATE_URL") || `https://raw.githubusercontent.com/${app.repo}/main/package.json`;
  async function fetchLatestVersion(fetchImpl = fetch, timeoutMs = 5e3) {
    if (!REPO_CONFIGURED2 && !env("UPDATE_URL")) return null;
    try {
      const res = await fetchImpl(latestUrl(), { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) return null;
      const version = (await res.json())?.version;
      return typeof version === "string" && VERSION_RE.test(version) ? version : null;
    } catch {
      return null;
    }
  }
  async function checkForUpdate(fetchImpl) {
    if (env("NO_UPDATE_CHECK") === "1") return null;
    const latest = await fetchLatestVersion(fetchImpl);
    return latest && compareVersions(latest, VERSION2) > 0 ? latest : null;
  }
  function installKind(script = process.argv[1] ?? "") {
    let real = script;
    try {
      real = fs7.realpathSync(script);
    } catch {
    }
    return real.split(path9.sep).join("/").includes(`/node_modules/${name}/`) ? "npm" : "source";
  }
  const SOURCE_HINT = `This ${name} runs from a source folder, so it doesn't update itself.
Update it there with \`git pull && npm install\`, or install the release with \`${INSTALL_CMD2}\`.`;
  const releaseSpec = (version) => `https://github.com/${app.repo}/tarball/v${version}`;
  const appDir = () => env("APP_DIR") || path9.join(os3.homedir(), `.${name}`, "app");
  const specFor = (version) => env("INSTALL_SPEC") || (version ? releaseSpec(version) : INSTALL_SPEC2);
  function localInstall(dir = appDir()) {
    const root = path9.join(dir, "node_modules", name);
    try {
      const pkg = JSON.parse(fs7.readFileSync(path9.join(root, "package.json"), "utf8"));
      const cli = path9.join(root, "dist", "cli.js");
      if (pkg?.name !== name || typeof pkg.version !== "string" || !VERSION_RE.test(pkg.version)) return null;
      return fs7.existsSync(cli) ? { version: pkg.version, cli } : null;
    } catch {
      return null;
    }
  }
  function newerLocalInstall(self2, ownVersion = VERSION2) {
    const local = localInstall();
    if (!local || compareVersions(local.version, ownVersion) <= 0) return null;
    return realpath(local.cli) === realpath(self2) ? null : local;
  }
  function installedInto(script) {
    let dir = path9.dirname(realpath(script));
    while (path9.dirname(dir) !== dir) {
      if (path9.basename(dir) === name && path9.basename(path9.dirname(dir)) === "node_modules") return path9.dirname(dir);
      dir = path9.dirname(dir);
    }
    return null;
  }
  function installTarget(script = process.argv[1] ?? "", root = isRoot()) {
    const modules = installedInto(script);
    if (!modules) return "global";
    if (realpath(modules).startsWith(realpath(appDir()) + path9.sep)) return "local";
    if (root) return "global";
    try {
      fs7.accessSync(modules, fs7.constants.W_OK);
      return "global";
    } catch {
      return "local";
    }
  }
  function npmInstall(spec, inherit, target, onOutput) {
    const dir = appDir();
    const args = target === "global" ? ["install", "-g", "--prefer-online", spec] : (
      // own cache: after `sudo npm ...`, ~/.npm often contains root-owned files
      ["install", "--prefix", dir, "--cache", path9.join(dir, ".npm-cache"), "--prefer-online", "--no-audit", "--no-fund", spec]
    );
    try {
      if (target === "local") fs7.mkdirSync(dir, { recursive: true });
    } catch (err2) {
      return Promise.resolve({ ok: false, output: err2.message });
    }
    return runNpm(args, { inherit, onOutput });
  }
  async function runInstall({
    inherit,
    version,
    target: forced,
    onOutput
  }) {
    if (!REPO_CONFIGURED2 && !env("INSTALL_SPEC")) return { ok: false, output: "The GitHub repo is not set in package.json yet." };
    const attempt = async (target2) => {
      if (version && !env("INSTALL_SPEC")) {
        const res2 = await npmInstall(specFor(version), inherit, target2, onOutput);
        if (res2.ok || PERMISSION_RE.test(res2.output)) return res2;
      }
      return npmInstall(specFor(), inherit, target2, onOutput);
    };
    const target = forced ?? installTarget();
    const res = await attempt(target);
    if (!res.ok && target === "global" && !isRoot() && PERMISSION_RE.test(res.output)) {
      onOutput?.(`
No permission for npm's global folder \u2013 installing into ${appDir()} instead.
`);
      return attempt("local");
    }
    return res;
  }
  async function runUninstall({ target, inherit = false, onOutput }) {
    if (target === "global") return runNpm(["rm", "-g", name], { inherit, onOutput });
    try {
      fs7.rmSync(appDir(), { recursive: true, force: true });
      const msg = `Removed ${appDir()}
`;
      onOutput?.(msg);
      return { ok: true, output: msg };
    } catch (err2) {
      return { ok: false, output: err2.message };
    }
  }
  function installedVersion(script = process.argv[1] ?? "") {
    return new Promise((resolve) => {
      execFile(process.execPath, [script, "--version"], { timeout: 15e3, env: { ...process.env, [`${P2}_NO_UPDATE_CHECK`]: "1" } }, (err2, stdout) => {
        const version = new RegExp(`${name} (\\d+\\.\\d+\\.\\d+)`).exec(String(stdout))?.[1];
        resolve(err2 || !version ? null : version);
      });
    });
  }
  const staleInstallHint = (installed) => `npm finished, but ${name} ${installed} is still the version that starts. Try \`${name} update\` again in a few minutes \u2013 GitHub can take a moment after a release.`;
  function installHint(output) {
    if (PERMISSION_RE.test(output)) {
      return `npm isn't allowed to write to ${appDir()}. That folder should belong to you \u2013 fix it with \`sudo chown -R "$(whoami)" ~/.${name}\`, then run /update again.`;
    }
    return null;
  }
  return {
    VERSION: VERSION2,
    INSTALL_SPEC: INSTALL_SPEC2,
    INSTALL_CMD: INSTALL_CMD2,
    REPO_CONFIGURED: REPO_CONFIGURED2,
    SOURCE_HINT,
    latestUrl,
    fetchLatestVersion,
    checkForUpdate,
    installKind,
    releaseSpec,
    appDir,
    localInstall,
    newerLocalInstall,
    installTarget,
    runInstall,
    runUninstall,
    installedVersion,
    staleInstallHint,
    installHint
  };
}

// apps.json
var apps_default = {
  v: 1,
  apps: [
    {
      id: "termchat",
      name: "termchat",
      description: "End-to-end encrypted chat with friends on your network",
      repo: "trigonyx/termchat",
      bin: "termchat",
      node: 22,
      icon: "\u25C6"
    },
    {
      id: "keyrace",
      name: "keyrace",
      description: "Typing races against your friends",
      repo: "trigonyx/keyrace",
      bin: "keyrace",
      node: 22,
      icon: "\u25B8"
    },
    {
      id: "termdrop",
      name: "termdrop",
      description: "Encrypted file sharing with friends on your network",
      repo: "trigonyx/termdrop",
      bin: "termdrop",
      node: 22,
      icon: "\u21A7"
    }
  ]
};

// package.json
var package_default = {
  name: "termhub",
  version: "1.0.0",
  description: "The hub of termchat, keyrace and termdrop: your profile and friends, who's online where, shared settings, and installing, opening and updating the apps.",
  repository: {
    type: "git",
    url: "git+https://github.com/trigonyx/termhub.git"
  },
  homepage: "https://github.com/trigonyx/termhub#readme",
  bugs: {
    url: "https://github.com/trigonyx/termhub/issues"
  },
  type: "module",
  bin: {
    termhub: "dist/cli.js"
  },
  files: [
    "dist",
    "apps.json"
  ],
  engines: {
    node: ">=22"
  },
  scripts: {
    dev: "tsx src/cli.tsx",
    build: "tsup",
    start: "node dist/cli.js",
    test: "vitest run",
    typecheck: "tsc --noEmit",
    release: "node scripts/release.mjs"
  },
  dependencies: {
    chalk: "5.6.2",
    ink: "6.8.0",
    react: "19.2.0",
    "string-width": "8.1.0",
    "wrap-ansi": "9.0.2"
  },
  devDependencies: {
    "@types/node": "24.9.1",
    "@types/react": "19.2.2",
    "ink-testing-library": "4.0.0",
    termcore: "file:../termcore",
    tsup: "8.5.0",
    tsx: "4.20.6",
    typescript: "5.9.3",
    vitest: "4.1.11"
  }
};

// src/app.ts
var APP = defineApp("termhub", package_default);

// src/core/version.ts
var VERSION = APP.version;
var REPO = APP.repo;
var REPO_CONFIGURED = repoConfigured(APP);
var INSTALL_SPEC = installSpec(APP);
var INSTALL_CMD = installCmd(APP);

// src/apps/catalog.ts
var ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
var REPO_RE = /^[A-Za-z0-9_.-]{1,64}\/[A-Za-z0-9_.-]{1,100}$/;
var MAX_APPS = 50;
var text = (v, max2) => typeof v === "string" ? [...sanitizeText(v).replace(/\s+/g, " ").trim()].slice(0, max2).join("") : "";
function parseCatalogApp(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  if (typeof o.id !== "string" || !ID_RE.test(o.id) || o.id === "termhub") return null;
  if (typeof o.repo !== "string" || !REPO_RE.test(o.repo)) return null;
  const bin = typeof o.bin === "string" ? o.bin : o.id;
  if (!ID_RE.test(bin)) return null;
  const node = typeof o.node === "number" ? o.node : typeof o.node === "string" ? Number(/^\D*(\d+)/.exec(o.node)?.[1]) : NaN;
  const icon = typeof o.icon === "string" ? text(o.icon, 1) : "";
  return {
    id: o.id,
    name: text(o.name, 32) || o.id,
    description: text(o.description, 120),
    repo: o.repo,
    bin,
    ...Number.isInteger(node) && node > 0 && node < 100 ? { node } : {},
    ...icon && /^[^\p{Cc}\p{Cf}\p{Z}]$/u.test(icon) ? { icon } : {}
  };
}
function parseCatalog(raw) {
  const list = raw?.apps;
  if (!raw || typeof raw !== "object" || !Array.isArray(list)) return null;
  const seen = /* @__PURE__ */ new Set();
  const out2 = [];
  for (const entry of list.slice(0, MAX_APPS)) {
    const app = parseCatalogApp(entry);
    if (!app || seen.has(app.id)) continue;
    seen.add(app.id);
    out2.push(app);
  }
  return out2;
}
function bundledCatalog() {
  return { apps: parseCatalog(apps_default) ?? [], source: "bundled" };
}
var rawBase = (env = process.env) => (env.TERMHUB_RAW_URL || "https://raw.githubusercontent.com").replace(/\/+$/, "");
var rawUrl = (repo, file, env) => `${rawBase(env)}/${repo}/main/${file}`;
var catalogUrl = (env = process.env) => env.TERMHUB_CATALOG_URL || rawUrl(REPO, "apps.json", env);
function cachedCatalog(cacheFile) {
  let cache = null;
  try {
    cache = readJson(cacheFile, null);
  } catch {
    cache = null;
  }
  const apps = parseCatalog(cache?.catalog);
  if (apps && apps.length) return { apps, source: "cache", fetchedAt: typeof cache?.fetchedAt === "number" ? cache.fetchedAt : void 0 };
  return bundledCatalog();
}
async function loadCatalog(opts) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(opts.url ?? catalogUrl(), { signal: AbortSignal.timeout(opts.timeoutMs ?? 5e3) });
    if (res.ok) {
      const raw = await res.json();
      const apps = parseCatalog(raw);
      if (apps && apps.length) {
        const fetchedAt = (opts.now ?? Date.now)();
        try {
          writeJsonAtomic(opts.cacheFile, { v: 1, fetchedAt, catalog: raw });
        } catch {
        }
        return { apps, source: "network", fetchedAt };
      }
    }
  } catch {
  }
  return cachedCatalog(opts.cacheFile);
}

// src/apps/detect.ts
import { execFile as execFile2 } from "child_process";
import fs8 from "fs";
import path11 from "path";

// src/core/paths.ts
import os4 from "os";
import path10 from "path";
function resolvePaths(home, env = process.env) {
  const base = basePaths("termhub", home, env);
  const own = path10.join(base.hub.dir, "hub");
  return {
    ...base,
    home: own,
    config: path10.join(own, "config.json"),
    log: path10.join(own, "termhub.log"),
    lock: path10.join(own, "termhub.lock"),
    socket: socketPath(own, "termhub"),
    catalogCache: path10.join(own, "catalog.json"),
    seen: path10.join(own, "seen.json"),
    ...home ? { homeArg: path10.resolve(home) } : {}
  };
}
function appHome(id, home, env = process.env) {
  if (home) return path10.join(path10.resolve(home), id);
  const own = env[`${envPrefix(id)}_HOME`];
  if (own) return path10.resolve(own);
  if (env.TERMHUB_HOME) return path10.join(path10.resolve(env.TERMHUB_HOME), id);
  return path10.join(os4.homedir(), `.${id}`);
}
var appLock = (id, home, env) => path10.join(appHome(id, home, env), `${id}.lock`);
var envPrefix = (id) => id.toUpperCase().replace(/[^A-Z0-9]/g, "_");

// src/apps/detect.ts
var VERSION_RE2 = /^\d+\.\d+\.\d+$/;
function readPackage(root, id) {
  try {
    const pkg = JSON.parse(fs8.readFileSync(path11.join(root, "package.json"), "utf8"));
    if (pkg?.name !== id || typeof pkg.version !== "string" || !VERSION_RE2.test(pkg.version)) return null;
    const bins = pkg.bin;
    const bin = typeof bins === "string" ? bins : typeof bins?.[id] === "string" ? bins[id] : "dist/cli.js";
    return { version: pkg.version, bin };
  } catch {
    return null;
  }
}
function packageCopy(kind, root, app) {
  if (!fs8.existsSync(root)) return null;
  const pkg = readPackage(root, app.id);
  if (!pkg) return { broken: `${root} has no valid package.json`, where: root };
  const cli = path11.resolve(root, pkg.bin);
  if (!cli.startsWith(root + path11.sep) || !fs8.existsSync(cli)) return { broken: `${app.name}'s files in ${root} are incomplete`, where: root };
  return { kind, where: root, version: pkg.version, command: [process.execPath, cli] };
}
var realpath2 = (p) => {
  try {
    return fs8.realpathSync(p);
  } catch {
    return path11.resolve(p);
  }
};
function findOnPath(bin, pathEnv = process.env.PATH ?? "") {
  const exts = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const dir of pathEnv.split(path11.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const file = path11.join(dir, bin + ext);
      try {
        const st = fs8.statSync(file);
        if (st.isFile() && (process.platform === "win32" || st.mode & 73)) return file;
      } catch {
      }
    }
  }
  return null;
}
function askVersion(copy, app, timeoutMs = 1e4) {
  return new Promise((resolve) => {
    const [cmd, ...args] = copy.command;
    try {
      execFile2(
        cmd,
        [...args, "--version"],
        { timeout: timeoutMs, env: { ...process.env, [`${envPrefix(app.id)}_NO_UPDATE_CHECK`]: "1" }, shell: process.platform === "win32" && copy.kind === "path" },
        (err2, stdout) => {
          const v = new RegExp(`${app.id.replace(/[-]/g, "\\-")} v?(\\d+\\.\\d+\\.\\d+)`).exec(String(stdout))?.[1];
          resolve(err2 || !v ? null : v);
        }
      );
    } catch {
      resolve(null);
    }
  });
}
async function detectApp(app, opts) {
  const ask = opts.ask ?? ((c2, a) => askVersion(c2, a));
  const copies = [];
  const broken = [];
  const add = (c2) => {
    if (!c2) return;
    if ("broken" in c2) broken.push(c2.broken);
    else copies.push(c2);
  };
  if (opts.globalRoot) add(packageCopy("global", path11.join(opts.globalRoot, app.id), app));
  add(packageCopy("local", path11.join(opts.appDir, "node_modules", app.id), app));
  const onPath = findOnPath(app.bin, opts.pathEnv);
  if (onPath) {
    const real = realpath2(onPath);
    const known = [opts.globalRoot ? path11.join(opts.globalRoot, app.id) : null, path11.join(opts.appDir, "node_modules", app.id)].filter((d) => !!d).map(realpath2);
    if (!known.some((d) => real.startsWith(d + path11.sep))) copies.push({ kind: "path", where: onPath, command: [onPath] });
  }
  if (!copies.length) return broken.length ? { state: "broken", reason: broken[0], copies } : { state: "missing" };
  const global = copies.find((c2) => c2.kind === "global");
  const local = copies.find((c2) => c2.kind === "local");
  const pathCopy = copies.find((c2) => c2.kind === "path");
  const main2 = global ?? local ?? pathCopy;
  const version = await ask(main2, app);
  if (!version) {
    return { state: "broken", reason: `${app.bin} --version failed \u2013 the installation looks damaged`, copies };
  }
  const runs = local && global && local.version && global.version && compareVersions(local.version, global.version) > 0 ? local : main2;
  return { state: "installed", version, main: runs, copies };
}
function statusOf(d, latest) {
  if (!d || d.state === "missing") return { kind: "missing" };
  if (d.state === "broken") return { kind: "broken", reason: d.reason };
  if (latest && compareVersions(latest, d.version) > 0) return { kind: "update", version: d.version, latest };
  return { kind: "current", version: d.version };
}
function statusLabel(s) {
  switch (s.kind) {
    case "missing":
      return "\u25CB not installed";
    case "broken":
      return "\u26A0 broken";
    case "current":
      return `\u2713 ${s.version}`;
    case "update":
      return `\u2B06 ${s.version} \u2192 ${s.latest}`;
  }
}
async function fetchLatest(url, fetchImpl = fetch, timeoutMs = 5e3) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const v = (await res.json())?.version;
    return typeof v === "string" && VERSION_RE2.test(v) ? v : null;
  } catch {
    return null;
  }
}
function nodeSupports(app, nodeVersion = process.versions.node) {
  return !app.node || Number(nodeVersion.split(".")[0]) >= app.node;
}

// src/apps/install.ts
import { spawn as spawn3 } from "child_process";
function appUpdater(app, installed = "0.0.0") {
  return createUpdater({ name: app.id, envPrefix: envPrefix(app.id), version: installed, repo: app.repo });
}
var isRoot2 = () => process.getuid?.() === 0;
function freshTarget(globalRoot) {
  return !isRoot2() && writableDir(globalRoot) ? "global" : "local";
}
var tail = (output, n = 4) => output.trim().split("\n").slice(-n).join("\n");
function failed(app, what, res) {
  const hint = appUpdater(app).installHint(res.output) ?? void 0;
  return { ok: false, message: `${what} ${app.name} failed${res.output.trim() ? `:
${tail(res.output)}` : ""}`, ...hint ? { hint } : {} };
}
async function installApp(app, opts) {
  const u = appUpdater(app);
  const target = freshTarget(opts.globalRoot);
  opts.onOutput?.(`Installing ${app.name}${opts.latest ? ` ${opts.latest}` : ""} into ${target === "global" ? "npm's global folder" : u.appDir()} \u2026
`);
  const res = await u.runInstall({ inherit: false, version: opts.latest, target, onOutput: opts.onOutput });
  return res.ok ? { ok: true, message: `${app.name} is installed` } : failed(app, "Installing", res);
}
function selfUpdate(copy, onOutput) {
  return new Promise((resolve) => {
    const [cmd, ...args] = copy.command;
    let output = "";
    try {
      const p = spawn3(cmd, [...args, "update"], { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
      const take = (d) => {
        output += String(d);
        onOutput?.(String(d));
      };
      p.stdout.on("data", take);
      p.stderr.on("data", take);
      p.on("error", (err2) => resolve({ ok: false, output: `${output}
${err2.message}` }));
      p.on("close", (code) => resolve({ ok: code === 0, output }));
    } catch (err2) {
      resolve({ ok: false, output: err2.message });
    }
  });
}
async function updateApp(app, detected, opts) {
  if (detected.state !== "installed") {
    const where = detected.state === "broken" ? detected.copies.find((c2) => c2.kind !== "path")?.kind : void 0;
    const u2 = appUpdater(app);
    const target = where ?? freshTarget(opts.globalRoot);
    const res2 = await u2.runInstall({ inherit: false, version: opts.latest, target, onOutput: opts.onOutput });
    return res2.ok ? { ok: true, message: `${app.name} is installed again` } : failed(app, "Reinstalling", res2);
  }
  const main2 = detected.main;
  if (main2.kind === "path") {
    opts.onOutput?.(`${app.name} wasn't installed by termhub (${main2.where}) \u2013 running \`${app.bin} update\` \u2026
`);
    const res2 = await selfUpdate(main2, opts.onOutput);
    return res2.ok ? { ok: true, message: `${app.name} updated itself` } : failed(app, "Updating", res2);
  }
  const u = appUpdater(app, detected.version);
  opts.onOutput?.(`Updating ${app.name} ${detected.version}${opts.latest ? ` \u2192 ${opts.latest}` : ""} \u2026
`);
  const res = await u.runInstall({ inherit: false, version: opts.latest, target: main2.kind, onOutput: opts.onOutput });
  return res.ok ? { ok: true, message: `${app.name} is updated` } : failed(app, "Updating", res);
}
async function uninstallApp(app, detected, opts = {}) {
  const copies = detected.state === "missing" ? [] : detected.copies;
  const u = appUpdater(app);
  const removable = copies.filter((c2) => c2.kind !== "path");
  const elsewhere = copies.filter((c2) => c2.kind === "path");
  if (!removable.length) {
    return {
      ok: false,
      message: elsewhere.length ? `${app.name} at ${elsewhere[0].where} wasn't installed by termhub \u2013 remove it the way it was installed (npm rm -g ${app.id}, npm unlink \u2026)` : `${app.name} isn't installed`
    };
  }
  for (const c2 of removable) {
    opts.onOutput?.(c2.kind === "global" ? `npm rm -g ${app.id}
` : `Removing ${u.appDir()}
`);
    const res = await u.runUninstall({ target: c2.kind, onOutput: opts.onOutput });
    if (!res.ok) return failed(app, "Removing", res);
  }
  const note = elsewhere.length ? ` (another copy is still at ${elsewhere[0].where})` : "";
  return { ok: true, message: `${app.name} is removed \u2013 your data and friends stay${note}` };
}

// src/apps/running.ts
async function runningApps(ids, home, env = process.env) {
  const found = await Promise.all(ids.map(async (id) => await instanceRunning(appLock(id, home, env)) ? id : null));
  return new Set(found.filter((id) => id !== null));
}

// src/core/backup.ts
import crypto5 from "crypto";
import fs9 from "fs";
import path12 from "path";
var MIN_PASSPHRASE = 10;
var MAGIC = Buffer.from("THBK");
var FORMAT = 1;
var HEADER_LEN = 4 + 1 + 3 + 16 + 12 + 16;
var TAG_LEN = 16;
var BEGIN = "-----BEGIN TERMHUB BACKUP-----";
var END = "-----END TERMHUB BACKUP-----";
var DEFAULT_LOG_N = 17;
var R = 8;
var P = 1;
var BackupError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
var normalize = (passphrase2) => passphrase2.normalize("NFC");
function derive(passphrase2, salt, logN) {
  const N = 2 ** logN;
  const out2 = crypto5.scryptSync(normalize(passphrase2), salt, 48, { N, r: R, p: P, maxmem: 256 * N * R + 64 * 1024 * 1024 });
  return { key: out2.subarray(0, 32), check: out2.subarray(32, 48) };
}
function collect(paths, version, now = Date.now()) {
  const identity = readJson(paths.identity, null);
  if (!isIdentityFile(identity)) throw new BackupError("invalid", "There is no identity to back up yet.");
  const legacy = {};
  for (const app of LEGACY_APPS) {
    const old = readJson(path12.join(paths.legacyDir, app, "identity.json"), null);
    if (isIdentityFile(old)) legacy[app] = old;
  }
  return {
    v: 1,
    createdAt: now,
    from: { app: "termhub", version },
    identity,
    profile: readJson(paths.profile, null),
    friends: parseFriendsFile(readJson(paths.friends, null)),
    peers: parsePeersFile(readJson(paths.peers, null)),
    settings: parseSettings(readJson(paths.settings, null)),
    links: parseLinksFile(readJson(paths.links, null)),
    legacy
  };
}
function encryptBackup(content, passphrase2, logN = DEFAULT_LOG_N) {
  if ([...passphrase2].length < MIN_PASSPHRASE) throw new BackupError("invalid", `The passphrase needs at least ${MIN_PASSPHRASE} characters.`);
  const salt = crypto5.randomBytes(16);
  const nonce = crypto5.randomBytes(12);
  const { key, check } = derive(passphrase2, salt, logN);
  const header = Buffer.concat([MAGIC, Buffer.from([FORMAT, logN, R, P]), salt, nonce, check]);
  const cipher = crypto5.createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: TAG_LEN });
  const plain2 = Buffer.from(JSON.stringify(content), "utf8");
  cipher.setAAD(header, { plaintextLength: plain2.length });
  const body = Buffer.concat([header, cipher.update(plain2), cipher.final(), cipher.getAuthTag()]);
  const b64 = body.toString("base64").match(/.{1,64}/g).join("\n");
  return `${BEGIN}
${b64}
${END}
`;
}
function decryptBackup(text2, passphrase2) {
  const start2 = text2.indexOf(BEGIN);
  if (start2 === -1) throw new BackupError("not-a-backup", "This isn't a termhub backup.");
  const end = text2.indexOf(END, start2);
  if (end === -1) throw new BackupError("truncated", "The backup file is incomplete (cut off).");
  const b64 = text2.slice(start2 + BEGIN.length, end).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new BackupError("damaged", "The backup file is damaged.");
  const body = Buffer.from(b64, "base64");
  if (body.length < HEADER_LEN + TAG_LEN) throw new BackupError("truncated", "The backup file is incomplete (cut off).");
  if (!body.subarray(0, 4).equals(MAGIC)) throw new BackupError("not-a-backup", "This isn't a termhub backup.");
  const [format, logN, r, p] = body.subarray(4, 8);
  if (format !== FORMAT) throw new BackupError("unsupported", "This backup was made by a newer termhub \u2013 update termhub first.");
  if (logN < 10 || logN > 20 || r !== R || p !== P) throw new BackupError("damaged", "The backup file is damaged.");
  const header = body.subarray(0, HEADER_LEN);
  const salt = body.subarray(8, 24);
  const nonce = body.subarray(24, 36);
  const check = body.subarray(36, 52);
  const derived = derive(passphrase2, salt, logN);
  if (!crypto5.timingSafeEqual(derived.check, check)) throw new BackupError("wrong-passphrase", "Wrong passphrase.");
  const ciphertext = body.subarray(HEADER_LEN, body.length - TAG_LEN);
  const tag = body.subarray(body.length - TAG_LEN);
  let plain2;
  try {
    const decipher = crypto5.createDecipheriv("chacha20-poly1305", derived.key, nonce, { authTagLength: TAG_LEN });
    decipher.setAAD(header, { plaintextLength: ciphertext.length });
    decipher.setAuthTag(tag);
    plain2 = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new BackupError("damaged", "The backup file was changed or is damaged \u2013 it was not restored.");
  }
  let content;
  try {
    content = JSON.parse(plain2.toString("utf8"));
  } catch {
    throw new BackupError("invalid", "The backup has an unknown format.");
  }
  if (content?.v !== 1 || !isIdentityFile(content.identity)) throw new BackupError("invalid", "The backup has an unknown format.");
  try {
    identityFromFile(content.identity);
  } catch {
    throw new BackupError("invalid", "The key in the backup is unusable.");
  }
  if (!parseProfile(content.profile)) throw new BackupError("invalid", "The backup has no profile.");
  return content;
}
function summarize(content) {
  const id = identityFromFile(content.identity).id;
  const friends = parseFriendsFile(content.friends).friends.filter((f) => f.state === "accepted").length;
  return { id, name: parseProfile(content.profile)?.name ?? "Unknown", friends, createdAt: content.createdAt };
}
function exportBackup(paths, file, passphrase2, version, logN = DEFAULT_LOG_N) {
  const content = collect(paths, version);
  const text2 = encryptBackup(content, passphrase2, logN);
  const target = path12.resolve(file);
  ensureDir(path12.dirname(target));
  writeFileAtomic(target, text2);
  fs9.chmodSync(target, 384);
  return summarize(content);
}
var lockOf2 = (paths, file) => path12.join(paths.locksDir, `${path12.basename(file)}.lock`);
var stamp = (d = /* @__PURE__ */ new Date()) => d.toISOString().replace(/[:.]/g, "-");
function restoreBackup(paths, content) {
  const files = { identity: paths.identity, profile: paths.profile, friends: paths.friends, peers: paths.peers, settings: paths.settings, links: paths.links };
  let savedTo = null;
  const existing = Object.values(files).filter((f) => fs9.existsSync(f));
  if (existing.length) {
    savedTo = path12.join(paths.legacyDir, `before-restore-${stamp()}`);
    ensureDir(savedTo);
    for (const f of existing) {
      const dest = path12.join(savedTo, path12.basename(f));
      fs9.copyFileSync(f, dest);
      fs9.chmodSync(dest, 384);
    }
  }
  const write = (file, value) => withLock(lockOf2(paths, file), () => writeJsonAtomic(file, value));
  write(files.profile, parseProfile(content.profile));
  write(files.friends, parseFriendsFile(content.friends));
  write(files.peers, parsePeersFile(content.peers));
  write(files.settings, parseSettings(content.settings));
  write(files.links, parseLinksFile(content.links));
  for (const [app, id] of Object.entries(content.legacy ?? {})) {
    if (!LEGACY_APPS.includes(app) || !isIdentityFile(id)) continue;
    const dest = path12.join(paths.legacyDir, app, "identity.json");
    if (!fs9.existsSync(dest)) writeJsonAtomic(dest, id);
  }
  write(files.identity, content.identity);
  return { savedTo, summary: summarize(content) };
}

// src/core/update.ts
var self = createUpdater(APP);

// src/cli/secret.ts
function readSecret(prompt, input = process.stdin, output = process.stderr) {
  output.write(prompt);
  return new Promise((resolve) => {
    let value = "";
    const tty = input.isTTY === true;
    const finish2 = (v) => {
      input.off("data", onData);
      input.off("end", onEnd);
      if (tty) input.setRawMode(false);
      input.pause();
      output.write("\n");
      resolve(v);
    };
    const onEnd = () => finish2(value || null);
    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (ch === "\r" || ch === "\n") return finish2(value);
        if (ch === "" || ch === "\x1B") return finish2(null);
        if (ch === "\x7F" || ch === "\b") value = [...value].slice(0, -1).join("");
        else if (ch === "") value = "";
        else if (ch >= " ") value += ch;
      }
    };
    if (tty) input.setRawMode(true);
    input.setEncoding("utf8");
    input.on("data", onData);
    input.on("end", onEnd);
    input.resume();
  });
}
function readLine(prompt, input = process.stdin, output = process.stderr) {
  output.write(prompt);
  return new Promise((resolve) => {
    let value = "";
    const done = () => {
      input.off("data", onData);
      input.off("end", done);
      input.pause();
      resolve(value.trim());
    };
    const onData = (chunk) => {
      const s = String(chunk);
      const nl = s.indexOf("\n");
      if (nl === -1) value += s;
      else {
        value += s.slice(0, nl);
        done();
      }
    };
    input.setEncoding("utf8");
    input.on("data", onData);
    input.on("end", done);
    input.resume();
  });
}

// src/cli/tasks.ts
var out = (s) => process.stdout.write(s);
var err = (s) => process.stderr.write(s);
var plain = (s) => s.replace(/`/g, "");
async function updateSelf() {
  if (self.installKind() === "source") {
    out(`${plain(self.SOURCE_HINT)}
`);
    return 1;
  }
  if (!REPO_CONFIGURED) {
    err("This build doesn't know its GitHub repo yet (package.json \u2192 repository).\n");
    return 1;
  }
  out("Checking for updates \u2026\n");
  const latest = await self.fetchLatestVersion();
  if (latest && compareVersions(latest, VERSION) <= 0) {
    out(`termhub ${VERSION} is up to date.
`);
    return 0;
  }
  out(latest ? `Updating termhub ${VERSION} \u2192 ${latest} \u2026
` : `Couldn't check the latest version \u2013 installing anyway \u2026
`);
  const res = await self.runInstall({ inherit: true, version: latest });
  if (res.ok) {
    const installed = await self.installedVersion();
    if (installed && latest && compareVersions(installed, latest) < 0) {
      err(`
${plain(self.staleInstallHint(installed))}
`);
      return 1;
    }
    out(`
Done${installed ? ` \u2013 termhub ${installed} is installed` : ""}. Start it with: termhub
`);
    return 0;
  }
  err(`
Update failed. ${self.installHint(res.output) ?? "See the npm output above."}
`);
  return 1;
}
async function catalog(paths) {
  const c2 = await loadCatalog({ cacheFile: paths.catalogCache, url: process.env.TERMHUB_CATALOG_URL || void 0 });
  if (c2.source !== "network") out(`(GitHub not reachable \u2013 using the ${c2.source === "cache" ? "cached" : "built-in"} app list)
`);
  return c2.apps;
}
async function updateAll(paths) {
  const apps = await catalog(paths);
  const globalRoot = await npmGlobalRoot();
  const running = await runningApps(apps.map((a) => a.id), paths.homeArg);
  let failed2 = 0;
  let any = false;
  for (const app of apps) {
    const d = await detectApp(app, { globalRoot, appDir: appUpdater(app).appDir() });
    if (d.state === "missing") continue;
    const latest = await fetchLatest(rawUrl(app.repo, "package.json"));
    const s = statusOf(d, latest);
    if (s.kind === "current") {
      out(`\u2713 ${app.name} ${s.version} is up to date
`);
      continue;
    }
    any = true;
    out(`
\u2501\u2501\u2501 ${app.name} ${s.kind === "update" ? `${s.version} \u2192 ${s.latest}` : "(broken \u2013 installing again)"} \u2501\u2501\u2501
`);
    if (running.has(app.id)) {
      err(`${app.name} is open right now \u2013 quit it, then run termhub update --all again.
`);
      failed2++;
      continue;
    }
    const main2 = d.state === "installed" ? d.main : null;
    let res;
    if (main2?.kind === "path") {
      const [cmd, ...args] = main2.command;
      const r = spawnSync(cmd, [...args, "update"], { stdio: "inherit", shell: process.platform === "win32" });
      res = { ok: r.status === 0, output: "" };
    } else {
      const target = main2 ? main2.kind : d.state === "broken" ? d.copies.find((c2) => c2.kind !== "path")?.kind ?? freshTarget(globalRoot) : freshTarget(globalRoot);
      res = await appUpdater(app, d.state === "installed" ? d.version : "0.0.0").runInstall({ inherit: true, version: latest, target });
    }
    const after = await detectApp(app, { globalRoot, appDir: appUpdater(app).appDir() });
    if (res.ok && after.state === "installed" && (!latest || compareVersions(after.version, latest) >= 0)) out(`\u2713 ${app.name} ${after.version}
`);
    else {
      failed2++;
      err(`\u2717 ${app.name} was not updated. ${appUpdater(app).installHint(res.output) ?? ""}
`);
    }
  }
  out(`
\u2501\u2501\u2501 termhub \u2501\u2501\u2501
`);
  const selfCode = self.installKind() === "source" ? (out(`${plain(self.SOURCE_HINT)}
`), 0) : await updateSelf();
  if (!any) out("All apps are up to date.\n");
  return failed2 || selfCode ? 1 : 0;
}
async function install(paths, name) {
  const apps = await catalog(paths);
  const app = apps.find((a) => a.id === name.toLowerCase() || a.name.toLowerCase() === name.toLowerCase());
  if (!app) {
    err(`No app called ${name}. Apps: ${apps.map((a) => a.id).join(", ")}
`);
    return 2;
  }
  if (!nodeSupports(app)) {
    err(`${app.name} needs Node.js ${app.node} or newer (this is ${process.versions.node}).
`);
    return 1;
  }
  const globalRoot = await npmGlobalRoot();
  const before = await detectApp(app, { globalRoot, appDir: appUpdater(app).appDir() });
  if (before.state === "installed") {
    out(`${app.name} ${before.version} is already installed. Update it with: termhub update --all
`);
    return 0;
  }
  const latest = await fetchLatest(rawUrl(app.repo, "package.json"));
  const target = freshTarget(globalRoot);
  out(`Installing ${app.name}${latest ? ` ${latest}` : ""} \u2026
`);
  const res = await appUpdater(app).runInstall({ inherit: true, version: latest, target });
  const after = await detectApp(app, { globalRoot, appDir: appUpdater(app).appDir() });
  if (res.ok && after.state === "installed") {
    out(`
Done \u2013 ${app.name} ${after.version} is installed. Start it with: ${app.bin} (or from termhub)
`);
    return 0;
  }
  err(`
Installing ${app.name} failed. ${appUpdater(app).installHint(res.output) ?? "See the npm output above."}
`);
  return 1;
}
async function passphrase(confirm) {
  const env = process.env.TERMHUB_PASSPHRASE;
  if (env) return env;
  for (; ; ) {
    const first = await readSecret("Passphrase: ");
    if (first === null) return null;
    if (!confirm) return first;
    if ([...first].length < MIN_PASSPHRASE) {
      err(`At least ${MIN_PASSPHRASE} characters, please.
`);
      continue;
    }
    const second = await readSecret("Again: ");
    if (second === null) return null;
    if (second === first) return first;
    err("They don't match \u2013 once more.\n");
  }
}
async function backup2(paths, file) {
  if (!fs10.existsSync(paths.hub.identity)) {
    err("There is no profile to back up yet \u2013 start termhub (or any app) once first.\n");
    return 1;
  }
  out("The backup holds your identity, profile, friends and settings (no chats or other app data),\nencrypted with a passphrase. Without the passphrase nobody \u2013 you neither \u2013 can open it.\n");
  const pass = await passphrase(true);
  if (!pass) return 1;
  try {
    const target = path13.resolve(file);
    const s = exportBackup(paths.hub, target, pass, VERSION);
    out(`Saved ${s.name} (${formatId(s.id)}) with ${s.friends === 1 ? "1 friend" : `${s.friends} friends`} to ${tildify(target)}
`);
    return 0;
  } catch (e) {
    err(`${e.message}
`);
    return 1;
  }
}
async function restore(paths, file, opts = {}) {
  const running = await runningApps(["termhub", "termchat", "keyrace", "termdrop"], paths.homeArg);
  if (await instanceRunning(paths.lock)) running.add("termhub");
  if (running.size) {
    err(`Quit ${[...running].join(", ")} first \u2013 a restore needs every app closed.
`);
    return 1;
  }
  let text2;
  try {
    text2 = fs10.readFileSync(file, "utf8");
  } catch (e) {
    err(`Can't read ${file}: ${e.message}
`);
    return 1;
  }
  out("This replaces your identity and friends on this computer with the ones in the backup.\n");
  if (fs10.existsSync(paths.hub.identity)) out(`(The current ones are kept as a copy in ${tildify(paths.hub.legacyDir)}.)
`);
  if (!opts.yes && !process.env.TERMHUB_PASSPHRASE) {
    const answer = await readLine('Type "yes" to go on: ');
    if (answer.toLowerCase() !== "yes") {
      out("Nothing changed.\n");
      return 1;
    }
  }
  const pass = await passphrase(false);
  if (!pass) return 1;
  try {
    const content = decryptBackup(text2, pass);
    const r = restoreBackup(paths.hub, content);
    out(`Restored ${r.summary.name} (${formatId(r.summary.id)}) with ${r.summary.friends === 1 ? "1 friend" : `${r.summary.friends} friends`}.
`);
    if (r.savedTo) out(`The previous profile is in ${tildify(r.savedTo)}.
`);
    return 0;
  } catch (e) {
    err(`${e.message}
`);
    return 1;
  }
}

// src/ui/App.tsx
import { Box as Box18, Text as Text19, useApp, useInput as useInput10 } from "ink";
import { useCallback, useEffect as useEffect5, useMemo, useRef as useRef4, useState as useState11 } from "react";

// ../termcore/src/ui/commands/useCommandInput.ts
import { useEffect as useEffect2, useState } from "react";
function useCommandInput({ registry: registry2, editor, setEditor, onSubmit, onEscape }) {
  const [selected, setSelected] = useState(0);
  const match = /^\/(\S*)$/.exec(editor.value);
  const filter = match?.[1] ?? null;
  const commands2 = filter !== null ? registry2.suggest(filter) : [];
  const items = commands2.map((c2) => ({ key: c2.name, label: `/${c2.name} ${c2.usage ?? ""}`.trimEnd(), description: c2.description }));
  const sel = Math.min(selected, Math.max(0, items.length - 1));
  useEffect2(() => setSelected(0), [filter]);
  const complete = (cmd) => {
    const value = `/${cmd.name} `;
    setEditor({ value, cursor: value.length });
  };
  const onKey = (_input, key) => {
    if (items.length) {
      const n = items.length;
      if (key.upArrow) {
        setSelected((sel - 1 + n) % n);
        return true;
      }
      if (key.downArrow) {
        setSelected((sel + 1) % n);
        return true;
      }
      if (key.tab) {
        complete(commands2[sel]);
        return true;
      }
      if (key.return && !key.meta) {
        const exact = filter ? registry2.find(filter) : void 0;
        const target = exact ?? (commands2.length === 1 ? commands2[0] : null);
        if (!target || (target.minArgs ?? 0) > 0) complete(target ?? commands2[sel]);
        else onSubmit(`/${target.name}`);
        return true;
      }
    }
    if (key.escape) {
      onEscape();
      return true;
    }
    return false;
  };
  return { items, selected: sel, onKey, submit: onSubmit };
}

// ../termcore/src/ui/components/CommandMenu.tsx
import { Box, Text } from "ink";

// ../termcore/src/ui/theme.ts
import chalk from "chalk";
var DEFAULT_ACCENT = "#D97757";
var theme = {
  accent: DEFAULT_ACCENT,
  peer: "#7AA2F7",
  dim: "#8C8C8C",
  faint: "#5A5A5A",
  border: "#4E4E4E",
  success: "#8CC08A",
  error: "#E5737B",
  warning: "#E5C07B",
  code: "#C3A6E8",
  /** text on an accent background */
  onAccent: "#1E1E1E",
  /** text still to type (keyrace) */
  text: "#D4D4D4",
  /** text typed correctly (keyrace) */
  typed: "#FFFFFF"
};
function setAccent(hex) {
  const next = normalizeColor(hex) ?? DEFAULT_ACCENT;
  if (next.toLowerCase() === theme.accent.toLowerCase()) return false;
  theme.accent = next;
  return true;
}
var c = {
  get accent() {
    return chalk.hex(theme.accent);
  },
  peer: chalk.hex(theme.peer),
  dim: chalk.hex(theme.dim),
  faint: chalk.hex(theme.faint),
  success: chalk.hex(theme.success),
  error: chalk.hex(theme.error),
  warning: chalk.hex(theme.warning),
  code: chalk.hex(theme.code),
  bold: chalk.bold,
  italic: chalk.italic
};
var icons = {
  pointer: "\u276F",
  online: "\u25CF",
  offline: "\u25CB",
  away: "\u25D0",
  busy: "\u25D1",
  dnd: "\u2298",
  send: "\u25B6",
  racing: "\u25B6",
  request: "\u25C6",
  pending: "\u25F7",
  joined: "\u2713",
  done: "\u2713",
  delivered: "\u2713",
  read: "\u2713\u2713",
  error: "\u2717",
  info: "\xB7",
  star: "\u2605",
  up: "\u2191",
  down: "\u2193",
  file: "\u25AA",
  group: "#",
  left: "\u23CF",
  flag: "\u{1F3C1}"
};
var SENDER_COLORS = ["#7AA2F7", "#9ECE6A", "#E0AF68", "#BB9AF7", "#7DCFFF", "#F7768E", "#73DACA", "#FF9E64"];
function idHex(id) {
  let h = 0;
  for (const ch of id) h = h * 31 + ch.charCodeAt(0) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}
var profileColor = null;
function setPersonColors(lookup) {
  profileColor = lookup;
}
function senderHex(id) {
  return profileColor?.(id) ?? idHex(id);
}
function personHex(id, color) {
  return color ?? senderHex(id);
}

// ../termcore/src/ui/components/CommandMenu.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var MENU_MAX = 6;
function menuHeight(count) {
  return count ? Math.min(count, MENU_MAX) : 0;
}
function CommandMenu({ items, selected, width }) {
  if (!items.length) return null;
  const start2 = Math.max(0, Math.min(selected - MENU_MAX + 1, items.length - MENU_MAX));
  const visible = items.slice(start2, start2 + MENU_MAX);
  const nameWidth = Math.min(34, Math.max(...items.map((it) => it.label.length)) + 2);
  return /* @__PURE__ */ jsx(Box, { flexDirection: "column", width, paddingX: 2, children: visible.map((item, i) => {
    const active = start2 + i === selected;
    return /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Box, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx(Text, { color: active ? theme.accent : void 0, bold: active, wrap: "truncate-end", children: item.label }) }),
      /* @__PURE__ */ jsx(Text, { color: active ? void 0 : theme.dim, wrap: "truncate-end", children: item.description })
    ] }, item.key);
  }) });
}

// ../termcore/src/ui/components/Dialog.tsx
import { Box as Box3, Text as Text3, useInput as useInput2 } from "ink";
import { useState as useState2 } from "react";

// ../termcore/src/ui/editor.ts
import stringWidth from "string-width";
var emptyEditor = { value: "", cursor: 0 };
var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function graphemes(text2) {
  return [...segmenter.segment(text2)].map((s) => ({ segment: s.segment, index: s.index }));
}
function prevBoundary(value, cursor) {
  let prev = 0;
  for (const g of graphemes(value)) {
    if (g.index >= cursor) break;
    prev = g.index;
  }
  return prev;
}
function nextBoundary(value, cursor) {
  for (const g of graphemes(value)) {
    if (g.index >= cursor) return g.index + g.segment.length;
  }
  return value.length;
}
var isWordChar = (ch) => /[\p{L}\p{N}_]/u.test(ch);
function wordLeft(value, cursor) {
  let i = cursor;
  while (i > 0 && !isWordChar(value[i - 1])) i--;
  while (i > 0 && isWordChar(value[i - 1])) i--;
  return i;
}
function wordRight(value, cursor) {
  let i = cursor;
  while (i < value.length && !isWordChar(value[i])) i++;
  while (i < value.length && isWordChar(value[i])) i++;
  return i;
}
var lineStart = (value, cursor) => value.lastIndexOf("\n", cursor - 1) + 1;
var lineEnd = (value, cursor) => {
  const i = value.indexOf("\n", cursor);
  return i === -1 ? value.length : i;
};
var edit = {
  insert(s, text2) {
    return { value: s.value.slice(0, s.cursor) + text2 + s.value.slice(s.cursor), cursor: s.cursor + text2.length };
  },
  backspace(s) {
    if (s.cursor === 0) return s;
    const p = prevBoundary(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  deleteForward(s) {
    if (s.cursor >= s.value.length) return s;
    const n = nextBoundary(s.value, s.cursor);
    return { value: s.value.slice(0, s.cursor) + s.value.slice(n), cursor: s.cursor };
  },
  deleteWordBack(s) {
    const p = wordLeft(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  killToLineStart(s) {
    const p = lineStart(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  killToLineEnd(s) {
    const e = lineEnd(s.value, s.cursor);
    return { value: s.value.slice(0, s.cursor) + s.value.slice(e), cursor: s.cursor };
  },
  left: (s) => ({ ...s, cursor: prevBoundary(s.value, s.cursor) }),
  right: (s) => ({ ...s, cursor: nextBoundary(s.value, s.cursor) }),
  wordLeft: (s) => ({ ...s, cursor: wordLeft(s.value, s.cursor) }),
  wordRight: (s) => ({ ...s, cursor: wordRight(s.value, s.cursor) }),
  home: (s) => ({ ...s, cursor: lineStart(s.value, s.cursor) }),
  end: (s) => ({ ...s, cursor: lineEnd(s.value, s.cursor) }),
  /** One line up/down; `null` if already on the first/last line. */
  vertical(s, dir) {
    const start2 = lineStart(s.value, s.cursor);
    const col = s.cursor - start2;
    if (dir === -1) {
      if (start2 === 0) return null;
      const prevStart = lineStart(s.value, start2 - 1);
      return { ...s, cursor: Math.min(prevStart + col, start2 - 1) };
    }
    const end = lineEnd(s.value, s.cursor);
    if (end === s.value.length) return null;
    const nextEnd = lineEnd(s.value, end + 1);
    return { ...s, cursor: Math.min(end + 1 + col, nextEnd) };
  }
};
function cleanPaste(text2) {
  return text2.replace(/\u001b\[20[01]~/g, "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
}
function layoutEditor(s, width) {
  const w = Math.max(1, width);
  const lines = [];
  let offset = 0;
  for (const logical of s.value.split("\n")) {
    let current = "";
    let currentWidth = 0;
    let cursorAt = null;
    for (const g of graphemes(logical)) {
      const gw = stringWidth(g.segment);
      if (currentWidth + gw > w) {
        lines.push({ text: current, cursor: cursorAt });
        current = "";
        currentWidth = 0;
        cursorAt = null;
      }
      if (offset + g.index === s.cursor) cursorAt = current.length;
      current += g.segment;
      currentWidth += gw;
    }
    if (offset + logical.length === s.cursor) {
      if (currentWidth >= w) {
        lines.push({ text: current, cursor: cursorAt });
        current = "";
        currentWidth = 0;
        cursorAt = null;
      }
      cursorAt = current.length;
    }
    lines.push({ text: current, cursor: cursorAt });
    offset += logical.length + 1;
  }
  return lines;
}

// ../termcore/src/ui/components/InputBox.tsx
import { Box as Box2, Text as Text2, useInput } from "ink";
import { useRef as useRef2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function inputBoxHeight(state, width, maxLines = 8) {
  return Math.min(layoutEditor(state, contentWidth(width)).length, maxLines) + 2;
}
var contentWidth = (width) => Math.max(
  4,
  width - 2 - 2 - 2
  /* Prompt */
);
function InputBox({
  state,
  onChange,
  onSubmit,
  isActive,
  width,
  placeholder,
  maxLines = 8,
  history = [],
  onKey,
  singleLine = false,
  borderColor = theme.border,
  maxLength,
  onPaste,
  afterType
}) {
  const histIndex = useRef2(null);
  const draft = useRef2("");
  const latest = useRef2(state);
  latest.current = state;
  const change = (next) => {
    latest.current = next;
    onChange(next);
  };
  const recall = (dir) => {
    if (!history.length) return false;
    let idx = histIndex.current;
    if (idx === null) {
      if (dir === 1) return false;
      draft.current = latest.current.value;
      idx = history.length;
    }
    idx += dir;
    if (idx < 0) return true;
    if (idx >= history.length) {
      histIndex.current = null;
      change({ value: draft.current, cursor: draft.current.length });
      return true;
    }
    histIndex.current = idx;
    const v = history[idx];
    change({ value: v, cursor: v.length });
    return true;
  };
  const insertText = (raw, typed = false) => {
    let text2 = cleanPaste(raw);
    if (singleLine) text2 = text2.replace(/\n/g, " ");
    const state2 = latest.current;
    if (!text2) return;
    if (maxLength !== void 0 && [...state2.value].length + [...text2].length > maxLength) return;
    histIndex.current = null;
    const next = edit.insert(state2, text2);
    change(typed && afterType ? afterType(next, raw) : next);
  };
  usePaste((text2) => {
    if (!onPaste?.(text2)) insertText(text2);
    return true;
  }, isActive);
  useInput(
    (input, key) => {
      if (onKey?.(input, key)) return;
      if (key.ctrl && input === "c") return;
      const state2 = latest.current;
      const set = (next) => {
        histIndex.current = null;
        change(next);
      };
      if (key.return) {
        if (!singleLine && key.meta) return set(edit.insert(state2, "\n"));
        if (!singleLine && state2.value[state2.cursor - 1] === "\\") {
          return set(edit.insert(edit.backspace(state2), "\n"));
        }
        histIndex.current = null;
        onSubmit(state2.value);
        return;
      }
      if (key.escape) return;
      if (key.tab) return;
      if ((key.backspace || key.delete) && key.meta) return set(edit.deleteWordBack(state2));
      if (key.backspace || key.delete) return set(edit.backspace(state2));
      if (key.leftArrow) return set(key.meta || key.ctrl ? edit.wordLeft(state2) : edit.left(state2));
      if (key.rightArrow) return set(key.meta || key.ctrl ? edit.wordRight(state2) : edit.right(state2));
      if (key.home) return set(edit.home(state2));
      if (key.end) return set(edit.end(state2));
      if (key.upArrow) {
        const moved = edit.vertical(state2, -1);
        if (moved) return set(moved);
        recall(-1);
        return;
      }
      if (key.downArrow) {
        const moved = edit.vertical(state2, 1);
        if (moved) return set(moved);
        recall(1);
        return;
      }
      if (key.pageUp || key.pageDown) return;
      if (key.ctrl) {
        switch (input) {
          case "a":
            return set(edit.home(state2));
          case "e":
            return set(edit.end(state2));
          case "u":
            return set(edit.killToLineStart(state2));
          case "k":
            return set(edit.killToLineEnd(state2));
          case "w":
            return set(edit.deleteWordBack(state2));
          case "d":
            return set(edit.deleteForward(state2));
          case "j":
            return singleLine ? void 0 : set(edit.insert(state2, "\n"));
          default:
            return;
        }
      }
      if (key.meta) {
        if (input === "b") return set(edit.wordLeft(state2));
        if (input === "f") return set(edit.wordRight(state2));
        return;
      }
      if (input.length > 1 && onPaste?.(input)) return;
      insertText(input, true);
    },
    { isActive }
  );
  const cw = contentWidth(width);
  const lines = layoutEditor(state, cw);
  const cursorLine = Math.max(0, lines.findIndex((l) => l.cursor !== null));
  const start2 = Math.max(0, Math.min(cursorLine - maxLines + 1, lines.length - maxLines));
  const visible = lines.slice(start2, start2 + maxLines);
  const empty = state.value.length === 0;
  return /* @__PURE__ */ jsx2(Box2, { borderStyle: "round", borderColor, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children: visible.map((line, i) => {
    const prompt = start2 + i === 0 ? `${icons.pointer} ` : "  ";
    if (empty && i === 0) {
      return /* @__PURE__ */ jsxs2(Text2, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx2(Text2, { color: theme.accent, children: prompt }),
        isActive ? /* @__PURE__ */ jsx2(Text2, { inverse: true, children: " " }) : null,
        /* @__PURE__ */ jsx2(Text2, { color: theme.faint, children: placeholder ?? "" })
      ] }, i);
    }
    const cur = isActive ? line.cursor : null;
    if (cur === null) {
      return /* @__PURE__ */ jsxs2(Text2, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx2(Text2, { color: theme.accent, children: prompt }),
        line.text
      ] }, i);
    }
    const at = [...new Intl.Segmenter().segment(line.text.slice(cur))][0]?.segment ?? " ";
    return /* @__PURE__ */ jsxs2(Text2, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx2(Text2, { color: theme.accent, children: prompt }),
      line.text.slice(0, cur),
      /* @__PURE__ */ jsx2(Text2, { inverse: true, children: at }),
      line.text.slice(cur + (at === " " && cur >= line.text.length ? 0 : at.length))
    ] }, i);
  }) });
}

// ../termcore/src/ui/components/Dialog.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var PICK_VISIBLE = 8;
function dialogHeight(d) {
  if (d.kind === "confirm") return 4;
  if (d.kind === "prompt") return 7 + (d.hint ? 1 : 0);
  if (d.kind === "custom") return d.height;
  return 4 + Math.min(d.options.length, PICK_VISIBLE);
}
function Dialog({ spec, width }) {
  if (spec.kind === "confirm") return /* @__PURE__ */ jsx3(ConfirmDialog, { spec, width });
  if (spec.kind === "prompt") return /* @__PURE__ */ jsx3(PromptDialog, { spec, width });
  if (spec.kind === "custom") return /* @__PURE__ */ jsx3(Fragment, { children: spec.render(width) });
  return /* @__PURE__ */ jsx3(PickDialog, { spec, width });
}
function DialogFrame({ width, children }) {
  return /* @__PURE__ */ jsx3(Box3, { borderStyle: "round", borderColor: theme.accent, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children });
}
function ConfirmDialog({ spec, width }) {
  useInput2((input, key) => {
    if (key.return || input === "y") spec.resolve(true);
    else if (key.escape || input === "n") spec.resolve(false);
  });
  return /* @__PURE__ */ jsxs3(DialogFrame, { width, children: [
    /* @__PURE__ */ jsx3(Text3, { bold: true, wrap: "truncate-end", children: spec.title }),
    /* @__PURE__ */ jsxs3(Text3, { color: theme.dim, children: [
      /* @__PURE__ */ jsx3(Text3, { color: theme.accent, children: "enter" }),
      "/",
      /* @__PURE__ */ jsx3(Text3, { color: theme.accent, children: "y" }),
      " yes \xB7 ",
      /* @__PURE__ */ jsx3(Text3, { color: theme.accent, children: "esc" }),
      "/",
      /* @__PURE__ */ jsx3(Text3, { color: theme.accent, children: "n" }),
      " cancel"
    ] })
  ] });
}
function PromptDialog({ spec, width }) {
  const [state, setState] = useState2(
    () => spec.initial ? { value: spec.initial, cursor: spec.initial.length } : emptyEditor
  );
  return /* @__PURE__ */ jsxs3(DialogFrame, { width, children: [
    /* @__PURE__ */ jsx3(Text3, { bold: true, wrap: "truncate-end", children: spec.title }),
    spec.hint ? /* @__PURE__ */ jsx3(Text3, { color: theme.dim, wrap: "truncate-end", children: spec.hint }) : null,
    /* @__PURE__ */ jsx3(
      InputBox,
      {
        state,
        onChange: setState,
        onSubmit: (v) => spec.resolve(v.trim()),
        onKey: (_i, key) => {
          if (key.escape) {
            spec.resolve(null);
            return true;
          }
          return false;
        },
        isActive: true,
        singleLine: true,
        width: width - 4
      }
    ),
    /* @__PURE__ */ jsx3(Text3, { color: theme.dim, wrap: "truncate-end", children: "enter confirm \xB7 esc cancel" })
  ] });
}
function PickDialog({ spec, width }) {
  const [cursor, setCursor] = useState2(() => Math.max(0, spec.options.findIndex((o) => o.id === spec.opts?.initial)));
  const [chosen, setChosen] = useState2(() => new Set(spec.opts?.preselect ?? []));
  const n = spec.options.length;
  useWheel((dir) => setCursor((c2) => Math.max(0, Math.min(n - 1, c2 + dir))));
  useInput2((input, key) => {
    if (key.escape) return spec.resolve(null);
    if (key.upArrow || input === "k") return setCursor((c2) => (c2 - 1 + n) % n);
    if (key.downArrow || input === "j") return setCursor((c2) => (c2 + 1) % n);
    const current = spec.options[cursor];
    if (input === " " && spec.multi && current) {
      setChosen((s) => {
        const next = new Set(s);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
      return;
    }
    if (key.return) {
      if (!spec.multi) return spec.resolve(current ? [current.id] : []);
      if (chosen.size) return spec.resolve(spec.options.filter((o) => chosen.has(o.id)).map((o) => o.id));
      spec.resolve(spec.opts?.emptyOk || !current ? [] : [current.id]);
    }
  });
  const start2 = Math.max(0, Math.min(cursor - PICK_VISIBLE + 1, n - PICK_VISIBLE));
  const visible = spec.options.slice(start2, start2 + PICK_VISIBLE);
  return /* @__PURE__ */ jsxs3(DialogFrame, { width, children: [
    /* @__PURE__ */ jsxs3(Text3, { bold: true, wrap: "truncate-end", children: [
      spec.title,
      spec.multi && chosen.size ? /* @__PURE__ */ jsxs3(Text3, { color: theme.dim, children: [
        " \xB7 ",
        chosen.size,
        " selected"
      ] }) : null
    ] }),
    visible.map((o, i) => {
      const active = start2 + i === cursor;
      const box = spec.multi ? chosen.has(o.id) ? "[x] " : "[ ] " : "";
      return /* @__PURE__ */ jsxs3(Text3, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx3(Text3, { color: theme.accent, children: active ? `${icons.pointer} ` : "  " }),
        /* @__PURE__ */ jsx3(Text3, { color: chosen.has(o.id) ? theme.success : theme.dim, children: box }),
        /* @__PURE__ */ jsx3(Text3, { bold: active, color: active ? theme.accent : void 0, children: o.label }),
        o.hint ? /* @__PURE__ */ jsxs3(Text3, { color: theme.faint, children: [
          " \xB7 ",
          o.hint
        ] }) : null
      ] }, o.id);
    }),
    /* @__PURE__ */ jsx3(Text3, { color: theme.dim, wrap: "truncate-end", children: spec.multi ? `\u2191\u2193 move \xB7 space select \xB7 enter confirm${spec.opts?.emptyHint ? ` (${spec.opts.emptyHint})` : ""} \xB7 esc cancel` : "\u2191\u2193 move \xB7 enter choose \xB7 esc cancel" })
  ] });
}

// ../termcore/src/ui/components/Footer.tsx
import { Box as Box4, Text as Text4 } from "ink";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var kindStyle = (kind) => kind === "success" ? { color: theme.success, icon: icons.done } : kind === "error" ? { color: theme.error, icon: icons.error } : { color: theme.accent, icon: icons.request };
function Footer({ hints, toast, width }) {
  if (toast) {
    const s = kindStyle(toast.kind);
    return /* @__PURE__ */ jsx4(Box4, { width, paddingX: 1, children: /* @__PURE__ */ jsxs4(Text4, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs4(Text4, { color: s.color, children: [
        s.icon,
        " "
      ] }),
      toast.text
    ] }) });
  }
  return /* @__PURE__ */ jsx4(Box4, { width, paddingX: 1, children: /* @__PURE__ */ jsx4(Text4, { color: theme.dim, wrap: "truncate-end", children: hints.join(" \xB7 ") }) });
}

// ../termcore/src/ui/components/Header.tsx
import { Box as Box5, Text as Text5 } from "ink";

// ../termcore/src/ui/presence.ts
function presenceDot(p) {
  if (!p.online) return { icon: icons.offline, color: theme.faint };
  if (p.status === "dnd") return { icon: icons.dnd, color: theme.error };
  if (p.status === "busy") return { icon: icons.busy, color: theme.warning };
  if (p.away) return { icon: icons.away, color: theme.dim };
  return { icon: icons.online, color: theme.success };
}
function statusText(status, msg) {
  const label = status === "busy" ? "busy" : status === "dnd" ? "do not disturb" : "";
  return [label, msg].filter(Boolean).join(" \xB7 ");
}

// ../termcore/src/ui/components/Header.tsx
import { Fragment as Fragment2, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var friendsOnline = (n, wide) => wide ? n === 1 ? "friend online" : "friends online" : "online";
function Header({ app, version, width, me, address, online, onlineLabel = friendsOnline, updateAvailable }) {
  const wide = width >= 72;
  const status = me.status && me.status !== "available" ? presenceDot({ online: true, status: me.status }) : null;
  const statusLine = wide ? statusText(me.status, me.statusMsg) : "";
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", width, children: [
    /* @__PURE__ */ jsxs5(Box5, { paddingX: 1, width, children: [
      /* @__PURE__ */ jsx5(Box5, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs5(Text5, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx5(Text5, { backgroundColor: theme.accent, color: theme.onAccent, bold: true, children: ` ${app} ` }),
        /* @__PURE__ */ jsxs5(Text5, { color: theme.faint, children: [
          " v",
          version
        ] }),
        /* @__PURE__ */ jsx5(Text5, { children: "  " }),
        /* @__PURE__ */ jsx5(Text5, { bold: true, color: me.color, children: me.name }),
        status ? /* @__PURE__ */ jsxs5(Text5, { color: status.color, children: [
          " ",
          status.icon
        ] }) : null,
        statusLine ? /* @__PURE__ */ jsxs5(Text5, { color: theme.dim, children: [
          " ",
          statusLine
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs5(Fragment2, { children: [
          /* @__PURE__ */ jsx5(Text5, { color: theme.faint, children: " \xB7 " }),
          /* @__PURE__ */ jsx5(Text5, { color: theme.dim, children: formatId(me.id) })
        ] }) : null
      ] }) }),
      /* @__PURE__ */ jsxs5(Box5, { flexShrink: 0, marginLeft: 1, children: [
        updateAvailable ? /* @__PURE__ */ jsxs5(Fragment2, { children: [
          /* @__PURE__ */ jsx5(Text5, { color: theme.accent, bold: true, children: wide ? `\u2B06 ${updateAvailable} available \xB7 /update` : "\u2B06 update" }),
          /* @__PURE__ */ jsx5(Text5, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs5(Fragment2, { children: [
          /* @__PURE__ */ jsx5(Text5, { color: theme.dim, children: address }),
          /* @__PURE__ */ jsx5(Text5, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        /* @__PURE__ */ jsx5(Text5, { color: online ? theme.success : theme.faint, children: online ? icons.online : icons.offline }),
        /* @__PURE__ */ jsxs5(Text5, { color: theme.dim, children: [
          " ",
          online,
          " ",
          onlineLabel(online, wide)
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx5(Text5, { color: theme.faint, children: "\u2500".repeat(Math.max(0, width)) })
  ] });
}

// ../termcore/src/ui/components/Onboarding.tsx
import { Box as Box7, Text as Text7, useInput as useInput3 } from "ink";
import { useState as useState3 } from "react";

// ../termcore/src/ui/components/Swatches.tsx
import { Box as Box6, Text as Text6 } from "ink";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var SWATCH_WIDTH = 4;
function swatchRows(count, width) {
  const perRow = Math.max(1, Math.floor(width / SWATCH_WIDTH));
  return Math.ceil(count / perRow);
}
function Swatches({ colors, selected, width, active = true }) {
  const perRow = Math.max(1, Math.floor(width / SWATCH_WIDTH));
  const rows = [];
  colors.forEach((c2, index) => {
    const r = Math.floor(index / perRow);
    (rows[r] ??= []).push({ hex: c2.hex, index });
  });
  return /* @__PURE__ */ jsx6(Box6, { flexDirection: "column", children: rows.map((row, r) => /* @__PURE__ */ jsx6(Text6, { children: row.map(({ hex, index }) => {
    const sel = index === selected;
    const bracket = sel ? active ? theme.accent : theme.dim : void 0;
    return /* @__PURE__ */ jsxs6(Text6, { children: [
      /* @__PURE__ */ jsx6(Text6, { color: bracket, children: sel ? "[" : " " }),
      /* @__PURE__ */ jsx6(Text6, { color: hex, children: "\u2588\u2588" }),
      /* @__PURE__ */ jsx6(Text6, { color: bracket, children: sel ? "]" : " " })
    ] }, index);
  }) }, r)) });
}

// ../termcore/src/ui/components/Onboarding.tsx
import { Fragment as Fragment3, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function Onboarding({ logo, tagline, width, create, onDone, question = "What should your friends see you as?", colors }) {
  const [editor, setEditor] = useState3(emptyEditor);
  const [name, setName] = useState3(null);
  const [colorIndex, setColorIndex] = useState3(0);
  const [created, setCreated] = useState3(null);
  const [error, setError] = useState3(null);
  useInput3((_i, key) => key.return && onDone(), { isActive: created !== null });
  const finish2 = (n, color) => {
    try {
      setCreated({ name: n, id: create(n, color), ...color ? { color } : {} });
    } catch (err2) {
      setError(`Could not create profile: ${err2.message}`);
    }
  };
  const submit = (value) => {
    const n = value.trim();
    if (!n) {
      setError("Please enter a name.");
      return;
    }
    if (colors?.length) setName(n);
    else finish2(n);
  };
  const picking = name !== null && created === null && !!colors?.length;
  useInput3(
    (input, key) => {
      const n = colors.length;
      if (key.leftArrow || input === "h") setColorIndex((i) => (i - 1 + n) % n);
      else if (key.rightArrow || input === "l" || key.tab) setColorIndex((i) => (i + 1) % n);
      else if (key.escape) setName(null);
      else if (key.return) finish2(name, colors[colorIndex].hex);
    },
    { isActive: picking }
  );
  const boxWidth = Math.min(64, width - 4);
  let body;
  if (created) {
    body = /* @__PURE__ */ jsxs7(Fragment3, { children: [
      /* @__PURE__ */ jsxs7(Text7, { children: [
        "Welcome, ",
        /* @__PURE__ */ jsx7(Text7, { bold: true, color: created.color, children: created.name }),
        "!"
      ] }),
      /* @__PURE__ */ jsx7(Text7, { children: " " }),
      /* @__PURE__ */ jsx7(Text7, { color: theme.dim, children: "Your personal ID has been created:" }),
      /* @__PURE__ */ jsxs7(Text7, { color: theme.accent, bold: true, children: [
        "  ",
        formatId(created.id, true)
      ] }),
      /* @__PURE__ */ jsx7(Text7, { children: " " }),
      /* @__PURE__ */ jsx7(Text7, { color: theme.dim, children: "It's tied to a secret key on this device. That's how your friends recognize" }),
      /* @__PURE__ */ jsx7(Text7, { color: theme.dim, children: "you \u2013 even if your name or IP address changes. termchat, keyrace, termdrop and" }),
      /* @__PURE__ */ jsx7(Text7, { color: theme.dim, children: "termhub share it, along with your friends. Every connection is end-to-end encrypted." }),
      /* @__PURE__ */ jsx7(Text7, { children: " " }),
      /* @__PURE__ */ jsxs7(Text7, { children: [
        "Press ",
        /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: "enter" }),
        " to continue"
      ] })
    ] });
  } else if (picking) {
    const current = colors[colorIndex];
    body = /* @__PURE__ */ jsxs7(Fragment3, { children: [
      /* @__PURE__ */ jsx7(Text7, { bold: true, children: "Pick your color" }),
      /* @__PURE__ */ jsx7(Text7, { color: theme.dim, children: "Friends see your name in it, in every app. You can change it later." }),
      /* @__PURE__ */ jsx7(Text7, { children: " " }),
      /* @__PURE__ */ jsx7(Swatches, { colors, selected: colorIndex, width: boxWidth }),
      /* @__PURE__ */ jsx7(Text7, { children: " " }),
      /* @__PURE__ */ jsxs7(Text7, { children: [
        "  ",
        /* @__PURE__ */ jsx7(Text7, { bold: true, color: current.hex, children: name }),
        /* @__PURE__ */ jsxs7(Text7, { color: theme.dim, children: [
          " \xB7 ",
          current.name
        ] })
      ] }),
      /* @__PURE__ */ jsx7(Text7, { children: " " }),
      /* @__PURE__ */ jsx7(Text7, { color: theme.dim, children: "\u2190\u2192 choose \xB7 enter confirm \xB7 esc back to the name" }),
      error ? /* @__PURE__ */ jsx7(Text7, { color: theme.error, children: error }) : null
    ] });
  } else {
    body = /* @__PURE__ */ jsxs7(Fragment3, { children: [
      /* @__PURE__ */ jsx7(Text7, { bold: true, children: question }),
      /* @__PURE__ */ jsxs7(Text7, { color: theme.dim, children: [
        "You can change it later",
        colors ? " in termhub" : " with /name",
        "."
      ] }),
      /* @__PURE__ */ jsx7(Text7, { children: " " }),
      /* @__PURE__ */ jsx7(
        InputBox,
        {
          state: editor,
          onChange: (s) => {
            setEditor(s);
            setError(null);
          },
          onSubmit: submit,
          isActive: true,
          singleLine: true,
          width: boxWidth,
          placeholder: "Your name",
          borderColor: theme.accent
        }
      ),
      error ? /* @__PURE__ */ jsx7(Text7, { color: theme.error, children: error }) : null
    ] });
  }
  return /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    logo.map((l, i) => /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: l }, i)),
    /* @__PURE__ */ jsx7(Text7, { color: theme.dim, children: tagline }),
    /* @__PURE__ */ jsx7(Text7, { children: " " }),
    body
  ] });
}

// ../termcore/src/ui/hooks.ts
import { useStdout } from "ink";
import { useEffect as useEffect3, useState as useState4, useSyncExternalStore } from "react";
function useTerminalSize() {
  const { stdout } = useStdout();
  const read = () => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  const [size, setSize] = useState4(read);
  useEffect3(() => {
    const onResize = () => setSize(read());
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  return size;
}
function useStoreVersion(store) {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

// src/core/store.ts
import fs13 from "fs";

// ../termcore/src/app/run.ts
import fs11 from "fs";
import path14 from "path";
function registerRun(runDir, info) {
  const file = path14.join(runDir, `${info.app}.json`);
  const entry = { ...info, pid: process.pid, startedAt: Date.now() };
  try {
    writeJsonAtomic(file, entry);
  } catch {
    return () => {
    };
  }
  return () => {
    try {
      if (readJson(file, null)?.pid === process.pid) fs11.rmSync(file, { force: true });
    } catch {
    }
  };
}
function runningApps2(runDir, isAlive = pidAlive) {
  let files = [];
  try {
    files = fs11.readdirSync(runDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out2 = [];
  for (const f of files) {
    try {
      const r = readJson(path14.join(runDir, f), null);
      if (r && isSuiteApp(r.app) && Number.isInteger(r.pid) && Number.isInteger(r.port) && isAlive(r.pid)) out2.push(r);
    } catch {
    }
  }
  return out2;
}
function runningPorts(runDir) {
  return Object.fromEntries(runningApps2(runDir).map((r) => [r.app, r.port]));
}

// ../termcore/src/app/toasts.ts
var TOAST_MS = 4e3;
var Toasts = class {
  constructor(changed, ms = TOAST_MS) {
    this.changed = changed;
    this.ms = ms;
  }
  current = null;
  timer = null;
  show(text2, kind = "info", extra) {
    this.current = { ...extra, text: text2, kind };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.current = null;
      this.changed();
    }, this.ms);
    this.timer.unref();
    this.changed();
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
  }
};

// ../termcore/src/friends/book.ts
var SHARED = /* @__PURE__ */ new Set(["publicKey", "name", "alias", "state", "color", "lastIp", "lastSeen", "lastActivity", "createdAt", "status", "statusMsg"]);
function displayName(c2) {
  return c2.alias || c2.name;
}
function viewOf(f, app) {
  const { ports, apps, ...rest } = f;
  const port = ports?.[app];
  return { ...apps?.[app], ...rest, ...port ? { lastPort: port } : {} };
}
function applyPatch(f, patch, app) {
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id") continue;
    if (SHARED.has(k)) {
      if (v === void 0) delete f[k];
      else f[k] = v;
    } else if (k === "lastPort") {
      const ports = { ...f.ports };
      if (typeof v === "number" && v > 0) ports[app] = v;
      else delete ports[app];
      if (Object.keys(ports).length) f.ports = ports;
      else delete f.ports;
    } else {
      const fields = { ...f.apps?.[app] };
      if (v === void 0) delete fields[k];
      else fields[k] = v;
      const apps = { ...f.apps };
      if (Object.keys(fields).length) apps[app] = fields;
      else delete apps[app];
      if (Object.keys(apps).length) f.apps = apps;
      else delete f.apps;
    }
  }
}
var ContactBook = class {
  constructor(file, app) {
    this.file = file;
    this.app = app;
    this.rebuild(file.get());
    file.on("change", (v) => this.rebuild(v));
  }
  views = /* @__PURE__ */ new Map();
  version = 0;
  rebuild(v) {
    this.views = new Map(v.friends.map((f) => [f.id, viewOf(f, this.app)]));
    this.version++;
  }
  get(id) {
    return this.views.get(id);
  }
  all() {
    return [...this.views.values()];
  }
  /** The entry as stored (all apps' fields). */
  raw(id) {
    return this.file.get().friends.find((f) => f.id === id);
  }
  upsert(id, patch) {
    return this.mutate(id, () => patch);
  }
  /**
   * Decides a change from the newest stored entry (read under the lock): `fn` returns a patch,
   * `null` to remove the entry, or `undefined` for no change. Returns the entry afterwards.
   */
  mutate(id, fn) {
    let result;
    this.file.update((d) => {
      const i = d.friends.findIndex((f) => f.id === id);
      const prev = i >= 0 ? d.friends[i] : void 0;
      const patch = fn(prev ? viewOf(prev, this.app) : void 0);
      if (patch === null) {
        if (i >= 0) d.friends.splice(i, 1);
        result = void 0;
        return;
      }
      if (patch === void 0) {
        result = prev;
        return;
      }
      const p = patch;
      if (!prev && (p.publicKey === void 0 || !p.name || !p.state)) {
        result = void 0;
        return;
      }
      const now = Date.now();
      const next = prev ? structuredClone(prev) : { id, publicKey: "", name: "", state: p.state, lastActivity: now, createdAt: now };
      applyPatch(next, patch, this.app);
      if (i >= 0) d.friends[i] = next;
      else d.friends.push(next);
      result = next;
    });
    return result ? viewOf(result, this.app) : void 0;
  }
  /**
   * Ports of their other apps (from their discovery announcement): another app of ours can
   * then dial them right away. Only known entries, only when something changed.
   */
  setPorts(id, ports) {
    const cur = this.raw(id);
    if (!cur || Object.entries(ports).every(([app, port]) => cur.ports?.[app] === port)) return;
    this.file.update((d) => {
      const f = d.friends.find((x) => x.id === id);
      if (f) f.ports = { ...f.ports, ...ports };
    });
  }
  remove(id) {
    if (this.views.has(id) || this.raw(id)) this.mutate(id, () => null);
  }
  /** Someone has a new id (a verified link): their entry moves there, merged with one that may exist. */
  relink(oldId, newId, newPublicKey) {
    let moved = false;
    this.file.update((d) => {
      const old = d.friends.find((f) => f.id === oldId);
      if (!old) return;
      const existing = d.friends.find((f) => f.id === newId);
      const merged = existing ? mergeFriends(existing, old, newId) : { ...old, id: newId };
      merged.publicKey = newPublicKey;
      d.friends = [...d.friends.filter((f) => f.id !== oldId && f.id !== newId), merged];
      moved = true;
    });
    return moved;
  }
};
var PeerBook = class {
  constructor(file, app) {
    this.file = file;
    this.app = app;
  }
  view(p) {
    const { ports, ...rest } = p;
    const port = ports?.[this.app];
    return { ...rest, ...port ? { lastPort: port } : {} };
  }
  get(id) {
    const p = this.file.get().peers.find((x) => x.id === id);
    return p ? this.view(p) : void 0;
  }
  update(id, patch) {
    const prev = this.file.get().peers.find((x) => x.id === id);
    const port = patch.lastPort;
    const unchanged = prev && (patch.name === void 0 || patch.name === prev.name) && (patch.lastIp === void 0 || patch.lastIp === prev.lastIp) && (patch.lastSeen === void 0 || patch.lastSeen === prev.lastSeen) && (port === void 0 || port === prev.ports?.[this.app]);
    if (unchanged) return;
    this.file.update((d) => {
      let p = d.peers.find((x) => x.id === id);
      if (!p) {
        p = { id, name: patch.name ?? "Unknown" };
        d.peers.push(p);
      }
      if (patch.name !== void 0) p.name = patch.name;
      if (patch.lastIp !== void 0) p.lastIp = patch.lastIp;
      if (patch.lastSeen !== void 0) p.lastSeen = patch.lastSeen;
      if (port) p.ports = { ...p.ports, [this.app]: port };
    });
  }
  relink(oldId, newId) {
    let moved = false;
    this.file.update((d) => {
      const old = d.peers.find((p) => p.id === oldId);
      if (!old) return;
      const existing = d.peers.find((p) => p.id === newId);
      const merged = existing ? mergePeers(existing, old, newId) : { ...old, id: newId };
      d.peers = [...d.peers.filter((p) => p.id !== oldId && p.id !== newId), merged];
      moved = true;
    });
    return moved;
  }
};

// ../termcore/src/friends/net.ts
import fs12 from "fs";

// ../termcore/src/app/notify.ts
import { execFile as execFile3 } from "child_process";
var MAC_SCRIPT = "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run";
function notify(title, body, app = "termhub") {
  const cmd = process.platform === "darwin" ? ["osascript", ["-e", MAC_SCRIPT, title, body]] : process.platform === "linux" ? ["notify-send", [`--app-name=${app}`, "--", title, body]] : null;
  if (!cmd) return;
  try {
    execFile3(cmd[0], [...cmd[1]], () => {
    }).on("error", () => {
    });
  } catch {
  }
}

// ../termcore/src/net/dialer.ts
var MAX_BACKOFF = 3e4;
var MAX_BACKOFF_NEARBY = 5e3;
var CALLBACK_TTL = 15e3;
var MAX_CALLBACKS_PER_MINUTE = 10;
var Dialer = class {
  constructor(d) {
    this.d = d;
  }
  states = /* @__PURE__ */ new Map();
  /** Peers that asked us to connect to them (id → when). */
  callbacks = /* @__PURE__ */ new Map();
  callbackTimes = [];
  /** Friends we already told that they can't be reached. */
  warned = /* @__PURE__ */ new Set();
  /** We dialed this id and someone else answered – that session waits for their link. */
  relinking = /* @__PURE__ */ new Map();
  timer = null;
  start(intervalMs = 1500) {
    this.timer = setInterval(() => this.loop(), intervalMs);
    this.timer.unref();
    this.loop();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
  /** A session came up: forget backoff and callbacks for that peer. */
  connected(id) {
    this.states.delete(id);
    this.callbacks.delete(id);
    this.warned.delete(id);
    this.relinking.delete(id);
  }
  /** A connection turned out to be useless (e.g. someone else answered): back off as after a failed dial. */
  failed(id) {
    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    ds.backoff = Math.min(ds.backoff * 2, MAX_BACKOFF);
    ds.next = Date.now() + ds.backoff;
    this.states.set(id, ds);
  }
  /** Discovery saw peers (maybe at a new address) – retry them right away. */
  discovered(ids) {
    for (const id of ids) {
      const ds = this.states.get(id);
      if (ds && !ds.inFlight) ds.next = 0;
    }
  }
  wanted(id) {
    const state = this.d.stateOf(id);
    return state === "accepted" || state === "outgoing" || state !== "blocked" && (this.d.alsoWants?.(id) ?? false);
  }
  wantsConnection(id) {
    return !this.d.network.isOnline(id) && this.wanted(id);
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.tryDial(id);
    this.d.discovery()?.callMe(id);
  }
  /** A peer asked us to connect to them, e.g. because they sent us a request but can't reach us. */
  onCallback(id) {
    if (this.d.network.isOnline(id) || this.d.stateOf(id) === "blocked") return;
    const now = Date.now();
    if (!this.callbacks.has(id)) {
      this.callbackTimes = this.callbackTimes.filter((t) => now - t < 6e4);
      if (this.callbackTimes.length >= MAX_CALLBACKS_PER_MINUTE) return;
      this.callbackTimes.push(now);
    }
    this.callbacks.set(id, now);
    this.tryDial(id);
  }
  loop() {
    for (const id of this.d.candidates()) this.tryDial(id);
    const now = Date.now();
    for (const [id, at] of this.callbacks) {
      if (now - at >= CALLBACK_TTL) this.callbacks.delete(id);
      else this.tryDial(id);
    }
  }
  target(id) {
    const p = this.d.discovery()?.find(id);
    const port = p && (this.d.portOf ? this.d.portOf(p) : p.port);
    if (p && port) return { ip: p.ip, port, discovered: true };
    const last = this.d.lastAddress(id);
    return last ? { ...last, discovered: false } : null;
  }
  tryDial(id) {
    const { network } = this.d;
    if (network.isOnline(id) || this.relinking.get(id)?.isOpen) return;
    const state = this.d.stateOf(id);
    const now = Date.now();
    const calledBack = state !== "blocked" && now - (this.callbacks.get(id) ?? -Infinity) < CALLBACK_TTL;
    if (!this.wanted(id) && !calledBack) return;
    const t = this.target(id);
    if (!t) return;
    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    this.states.set(id, ds);
    if (ds.inFlight || now < ds.next) return;
    if (t.discovered && !calledBack && state !== "outgoing" && this.d.myId > id) {
      ds.deferredSince ??= now;
      if (now - ds.deferredSince < 4e3) return;
    }
    ds.inFlight = true;
    network.dial(t.ip, t.port, id).then((s) => {
      this.states.delete(id);
      if (s.peerId !== id) this.relinking.set(id, s);
    }).catch((err2) => {
      this.d.log(`Connection to ${id} (${t.ip}:${t.port}) failed: ${err2.message}`);
      ds.backoff = Math.min(ds.backoff * 2, t.discovered ? MAX_BACKOFF_NEARBY : MAX_BACKOFF);
      ds.next = Date.now() + ds.backoff;
      ds.failures = (ds.failures ?? 0) + 1;
      const s = this.d.stateOf(id);
      const waiting = s === "outgoing" || s === "accepted";
      if (waiting && t.discovered && ds.failures >= 3 && !network.isOnline(id) && !this.warned.has(id)) {
        this.warned.add(id);
        this.d.unreachable(id, { ip: t.ip, port: t.port, error: err2.message });
      }
    }).finally(() => {
      ds.inFlight = false;
    });
  }
};

// ../termcore/src/net/discovery.ts
import dgram from "dgram";
import os5 from "os";
import { EventEmitter as EventEmitter3 } from "events";
var ANNOUNCE_INTERVAL = 3e3;
var EXPIRE_AFTER = 1e4;
var IPV4_RE2 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
var MAX_PACKET = 2048;
var HINT_INTERVAL = 15e3;
var REPROBE_AFTER = 3e4;
var MAX_GOSSIP = 32;
var MAX_WAS = 4;
var SCAN_BATCH = 5;
var SCAN_TICK = 50;
var MIN_SCAN_PREFIX = 16;
var RESCAN_ALONE = 10 * 6e4;
function localIPv4s() {
  const out2 = [];
  for (const addrs of Object.values(os5.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const ip = a.address.split(".").map(Number);
      const mask = a.netmask.split(".").map(Number);
      const broadcast = ip.map((b, i) => (b | ~mask[i] & 255) & 255).join(".");
      out2.push({ address: a.address, netmask: a.netmask, broadcast });
    }
  }
  return out2;
}
var toInt = (ip) => ip.split(".").reduce((n, b) => n * 256 + Number(b), 0);
var toIp = (n) => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255].join(".");
function prefixLength(netmask) {
  let n = toInt(netmask);
  let bits = 0;
  while (n & 2147483648) {
    bits++;
    n = n << 1 >>> 0;
  }
  return bits;
}
function isPrivate(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 172 && b >= 16 && b < 32 || a === 192 && b === 168 || a === 100 && b >= 64 && b < 128;
}
function* scanOrder(ifaces) {
  const ranges = ifaces.flatMap((i) => {
    const prefix = prefixLength(i.netmask);
    if (prefix > 30 || i.address.startsWith("169.254.")) return [];
    const mask = prefix < MIN_SCAN_PREFIX ? 4294901760 : toInt(i.netmask);
    const ip = toInt(i.address);
    const net3 = (ip & mask) >>> 0;
    const broadcast = (net3 | ~mask >>> 0) >>> 0;
    return [{ ip, net: net3, broadcast }];
  });
  const gens = ranges.map(function* ({ ip, net: net3, broadcast }) {
    for (let d = 1; ip + d < broadcast || ip - d > net3; d++) {
      if (ip + d < broadcast) yield toIp(ip + d);
      if (ip - d > net3) yield toIp(ip - d);
    }
  });
  const seen = /* @__PURE__ */ new Set();
  while (gens.length) {
    for (let i = 0; i < gens.length; i++) {
      const r = gens[i].next();
      if (r.done) gens.splice(i--, 1);
      else if (!seen.has(r.value)) {
        seen.add(r.value);
        yield r.value;
      }
    }
  }
}
function udpTransport(port) {
  return ({ onMessage, onError, onReady }) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let bound = false;
    socket.on("error", (err2) => {
      if (!bound) onError(err2);
    });
    socket.on("message", (buf, rinfo) => onMessage(buf, rinfo.address));
    socket.bind(port, () => {
      bound = true;
      try {
        socket.setBroadcast(true);
      } catch {
      }
      onReady();
    });
    return {
      send(buf, address, to = port) {
        try {
          socket.send(buf, to, address, () => {
          });
        } catch {
        }
      },
      close() {
        try {
          socket.close();
        } catch {
        }
      }
    };
  };
}
function parseApps2(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out2 = {};
  for (const [k, p] of Object.entries(v)) {
    if (isSuiteApp(k) && Number.isInteger(p) && p > 0 && p < 65536) out2[k] = p;
  }
  return Object.keys(out2).length ? out2 : void 0;
}
function parseWas(v, own) {
  if (!Array.isArray(v)) return void 0;
  const out2 = v.slice(0, MAX_WAS).filter((x) => typeof x === "string" && PEER_ID_RE.test(x) && x !== own);
  return out2.length ? out2 : void 0;
}
var sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var Discovery = class extends EventEmitter3 {
  constructor(myId, getName, getPort, opts) {
    super();
    this.myId = myId;
    this.getName = getName;
    this.getPort = getPort;
    this.opts = opts;
    this.listApps = new Set(opts.listApps ?? [opts.app]);
    this.udpPort = opts.udpPort ?? SUITE[opts.app].udpPort;
  }
  transport = null;
  timer = null;
  scanTimer = null;
  scanQueue = null;
  lastScanEnd = 0;
  lastHints = 0;
  netSignature = "";
  /** address → when we last asked it directly */
  probed = /* @__PURE__ */ new Map();
  peers = /* @__PURE__ */ new Map();
  listApps;
  udpPort;
  /** True while the own subnet is being scanned. */
  get scanning() {
    return this.scanQueue !== null;
  }
  start() {
    const open = this.opts.transport ?? udpTransport(this.udpPort);
    this.transport = open({
      onMessage: (buf, address) => this.onMessage(buf, address),
      onError: (err2) => {
        this.emit("log", `Discovery unavailable: ${err2.message}`);
        this.stop();
      },
      onReady: () => {
        this.netSignature = this.signature();
        this.announce(true);
        this.probeHints();
        this.startScan();
        this.timer = setInterval(() => this.tick(), ANNOUNCE_INTERVAL);
        this.timer.unref();
      }
    });
  }
  /** The peer that is (or used to be, see `was`) `id`. */
  find(id) {
    const direct = this.peers.get(id);
    if (direct) return direct;
    for (const p of this.peers.values()) if (p.was?.includes(id)) return p;
    return void 0;
  }
  /** Re-announce immediately, e.g. after a name change. */
  announce(query) {
    const msg = this.message(query);
    for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) this.sendTo(msg, target);
    for (const p of this.peers.values()) {
      const m = p.app === this.opts.app ? msg : { ...msg, q: 1 };
      this.sendTo(this.opts.wants?.(p.id) ? { ...m, c: 1 } : m, p.ip, p.app);
    }
  }
  /** Asks a peer right away to connect to us (e.g. after sending them a request). */
  callMe(id) {
    const p = this.find(id);
    if (p) this.sendTo({ ...this.message(false), c: 1 }, p.ip, p.app);
  }
  tick() {
    const now = Date.now();
    const signature = this.signature();
    if (signature !== this.netSignature) {
      this.netSignature = signature;
      this.emit("log", "Network changed \u2013 searching again");
      this.probed.clear();
      this.announce(true);
      this.probeHints();
      this.startScan();
    } else {
      this.announce(false);
      if (now - this.lastHints >= HINT_INTERVAL) this.probeHints();
      if (!this.scanQueue && this.peers.size === 0 && now - this.lastScanEnd >= RESCAN_ALONE) this.startScan();
    }
    for (const [ip, at] of this.probed) if (now - at >= REPROBE_AFTER) this.probed.delete(ip);
    this.expire();
  }
  message(query) {
    const msg = { app: this.opts.app, v: 1, id: this.myId, name: this.getName(), port: this.getPort() };
    if (query) msg.q = 1;
    const ips = [...new Set([...this.peers.values()].map((p) => p.ip))].slice(0, MAX_GOSSIP);
    if (ips.length) msg.ips = ips;
    const apps = this.opts.apps?.();
    if (apps && Object.keys(apps).length) msg.apps = apps;
    const was = this.opts.was?.().slice(0, MAX_WAS);
    if (was?.length) msg.was = was;
    return msg;
  }
  /**
   * Sends to `address` on the port of `app` (default: ours). Queries to other apps' ports ask
   * for the answer on ours (`rp`).
   */
  sendTo(msg, address, app = this.opts.app, port) {
    const to = port ?? (app === this.opts.app ? this.udpPort : SUITE[app].udpPort);
    const out2 = to === this.udpPort ? msg : { ...msg, rp: this.udpPort };
    this.transport?.send(Buffer.from(JSON.stringify(out2)), address, to);
  }
  /** Sends a query to `address` on our port and on every port in `alsoAsk`. */
  query(address) {
    const msg = this.message(true);
    this.sendTo(msg, address);
    for (const other of this.opts.alsoAsk ?? []) this.sendTo(msg, address, other.app, other.udpPort);
  }
  interfaces() {
    return this.opts.interfaces?.() ?? localIPv4s();
  }
  signature() {
    return this.interfaces().map((i) => `${i.address}/${i.netmask}`).sort().join(",");
  }
  /** Asks one address directly whether the app runs there (at most every 30 s). */
  probe(ip) {
    if (!IPV4_RE2.test(ip) || this.interfaces().some((i) => i.address === ip)) return;
    for (const p of this.peers.values()) if (p.ip === ip) return;
    const last = this.probed.get(ip);
    if (last !== void 0 && Date.now() - last < REPROBE_AFTER) return;
    this.probed.set(ip, Date.now());
    this.query(ip);
  }
  probeHints() {
    this.lastHints = Date.now();
    for (const ip of this.opts.hints?.() ?? []) this.probe(ip);
    if (this.opts.alsoAsk?.length) {
      const msg = this.message(true);
      for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) {
        for (const other of this.opts.alsoAsk) this.sendTo(msg, target, other.app, other.udpPort);
      }
    }
  }
  startScan() {
    this.scanQueue = scanOrder(this.interfaces());
    if (!this.scanTimer) {
      this.scanTimer = setInterval(() => this.scanStep(), SCAN_TICK);
      this.scanTimer.unref();
    }
    this.emit("change");
  }
  scanStep() {
    const known = new Set([...this.peers.values()].map((p) => p.ip));
    for (let sent = 0; sent < SCAN_BATCH; ) {
      const next = this.scanQueue?.next();
      if (!next || next.done) {
        this.scanQueue = null;
        this.lastScanEnd = Date.now();
        if (this.scanTimer) clearInterval(this.scanTimer);
        this.scanTimer = null;
        this.emit("change");
        return;
      }
      if (known.has(next.value)) continue;
      this.query(next.value);
      sent++;
    }
  }
  onMessage(buf, address) {
    if (buf.length > MAX_PACKET) return;
    let msg;
    try {
      msg = JSON.parse(buf.toString("utf8"));
    } catch {
      return;
    }
    if (!msg || !isSuiteApp(msg.app) || msg.v !== 1 || typeof msg.id !== "string" || !PEER_ID_RE.test(msg.id)) return;
    if (msg.id === this.myId) return;
    const port = Number(msg.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
    const rp = Number.isInteger(msg.rp) && msg.rp >= 1024 && msg.rp <= 65535 ? msg.rp : void 0;
    if (!this.listApps.has(msg.app)) {
      if (msg.q && rp) this.sendTo(this.message(false), address, this.opts.app, rp);
      return;
    }
    const prev = this.peers.get(msg.id);
    const apps = parseApps2(msg.apps);
    const was = parseWas(msg.was, msg.id);
    const peer = {
      id: msg.id,
      name: cleanName(msg.name),
      ip: address,
      port,
      lastSeen: Date.now(),
      app: msg.app,
      ...apps ? { apps } : {},
      ...was ? { was } : {}
    };
    this.peers.set(msg.id, peer);
    if (!prev || prev.ip !== peer.ip || prev.port !== peer.port || prev.name !== peer.name || prev.app !== peer.app || !sameJson(prev.apps, peer.apps) || !sameJson(prev.was, peer.was)) {
      this.emit("change");
    }
    if (msg.q) this.sendTo(this.message(false), address, msg.app, rp);
    if (msg.c === 1) this.emit("callback", msg.id);
    if (Array.isArray(msg.ips)) {
      const subnets = this.interfaces().map((i) => ({ net: toInt(i.address) & toInt(i.netmask), mask: toInt(i.netmask) }));
      const nearby = (ip) => isPrivate(ip) || subnets.some((s) => (toInt(ip) & s.mask) === s.net);
      for (const ip of msg.ips.slice(0, MAX_GOSSIP)) {
        if (typeof ip === "string" && IPV4_RE2.test(ip) && nearby(ip)) this.probe(ip);
      }
    }
  }
  expire() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > EXPIRE_AFTER) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit("change");
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.timer = null;
    this.scanTimer = null;
    this.scanQueue = null;
    this.transport?.close();
    this.transport = null;
  }
};

// ../termcore/src/net/network.ts
import net2 from "net";
import { EventEmitter as EventEmitter6 } from "events";

// ../termcore/src/net/framing.ts
import { EventEmitter as EventEmitter4 } from "events";
var MAX_FRAME = 64 * 1024;
var FrameTooLargeError = class extends Error {
  constructor(size) {
    super(`Frame too large (${size} bytes)`);
  }
};
function encodeFrame(payload2) {
  if (payload2.length > MAX_FRAME) throw new FrameTooLargeError(payload2.length);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload2.length, 0);
  return Buffer.concat([header, payload2]);
}
var FrameDecoder = class {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames = [];
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (len > MAX_FRAME) throw new FrameTooLargeError(len);
      if (this.buffer.length < 4 + len) break;
      frames.push(Buffer.from(this.buffer.subarray(4, 4 + len)));
      this.buffer = this.buffer.subarray(4 + len);
    }
    return frames;
  }
};
var FrameSocket = class extends EventEmitter4 {
  constructor(socket) {
    super();
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on("data", (chunk) => {
      let frames;
      try {
        frames = this.decoder.push(chunk);
      } catch (err2) {
        this.destroy(err2);
        return;
      }
      for (const f of frames) this.deliver(f);
    });
    socket.on("error", (err2) => this.finish(err2));
    socket.on("close", () => this.finish(void 0));
  }
  decoder = new FrameDecoder();
  queue = [];
  waiter = null;
  streaming = false;
  closed = false;
  closeError;
  get isClosed() {
    return this.closed;
  }
  get remoteAddress() {
    return (this.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  }
  deliver(frame) {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve(frame);
    } else if (this.streaming) {
      this.emit("frame", frame);
    } else {
      this.queue.push(frame);
    }
  }
  read(timeoutMs) {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(this.closeError ?? new Error("Connection closed"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error("Handshake timed out"));
      }, timeoutMs);
      this.waiter = {
        resolve: (f) => {
          clearTimeout(timer);
          resolve(f);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        }
      };
    });
  }
  /** From now on, frames are delivered as events (including already buffered ones). */
  startStreaming() {
    this.streaming = true;
    const pending = this.queue;
    this.queue = [];
    for (const f of pending) this.emit("frame", f);
  }
  send(payload2) {
    if (this.closed) return false;
    this.socket.write(encodeFrame(payload2));
    return true;
  }
  /**
   * Like send(), for bulk data: header and payload go out without being copied together, and
   * the result is the socket's backpressure signal – `false` means wait for drained().
   */
  write(payload2) {
    if (this.closed) return false;
    if (payload2.length > MAX_FRAME) throw new FrameTooLargeError(payload2.length);
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(payload2.length, 0);
    this.socket.cork();
    this.socket.write(header);
    const ok = this.socket.write(payload2);
    this.socket.uncork();
    return ok;
  }
  /** Resolves once the socket's send buffer has room again (or the connection is gone). */
  drained() {
    if (this.closed || !this.socket.writableNeedDrain) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.socket.off("drain", done);
        this.off("close", done);
        resolve();
      };
      this.socket.on("drain", done);
      this.on("close", done);
    });
  }
  /** Stops reading from the socket (the receiver's disk can't keep up). */
  pause() {
    this.socket.pause();
  }
  resume() {
    if (!this.closed) this.socket.resume();
  }
  /** Graceful close: buffered data is still sent. */
  end() {
    if (!this.closed) this.socket.end();
  }
  destroy(err2) {
    this.socket.destroy();
    this.finish(err2);
  }
  finish(err2) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closeError = err2;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.reject(err2 ?? new Error("Connection closed"));
    }
    this.emit("close", err2);
  }
};

// ../termcore/src/net/handshake.ts
import crypto7 from "crypto";

// ../termcore/src/net/channel.ts
import crypto6 from "crypto";
var TAG_LEN2 = 16;
var CipherState = class {
  constructor(key) {
    this.key = key;
    if (key.length !== 32) throw new Error("Key must be 32 bytes");
  }
  counter = 0n;
  nextNonce() {
    const nonce = Buffer.alloc(12);
    nonce.writeBigUInt64BE(this.counter, 4);
    this.counter++;
    return nonce;
  }
  encrypt(plain2) {
    const cipher = crypto6.createCipheriv("chacha20-poly1305", this.key, this.nextNonce(), { authTagLength: TAG_LEN2 });
    const body = Buffer.concat([cipher.update(plain2), cipher.final()]);
    return Buffer.concat([body, cipher.getAuthTag()]);
  }
  /** Throws if the frame is not authentic. */
  decrypt(frame) {
    if (frame.length < TAG_LEN2) throw new Error("Frame too short");
    const decipher = crypto6.createDecipheriv("chacha20-poly1305", this.key, this.nextNonce(), {
      authTagLength: TAG_LEN2
    });
    decipher.setAuthTag(frame.subarray(frame.length - TAG_LEN2));
    return Buffer.concat([decipher.update(frame.subarray(0, frame.length - TAG_LEN2)), decipher.final()]);
  }
};

// ../termcore/src/net/handshake.ts
var HANDSHAKE_TIMEOUT = 5e3;
var XID_RE = /^[A-Za-z0-9_-]{12,32}$/;
var HandshakeError = class extends Error {
};
function parseHello(frame, protocol) {
  let obj;
  try {
    obj = JSON.parse(frame.toString("utf8"));
  } catch {
    throw new HandshakeError("Invalid handshake");
  }
  const o = obj;
  if (o?.t !== "hello" || o.p !== protocol || typeof o.eph !== "string" || typeof o.nonce !== "string") {
    throw new HandshakeError(`Not a ${protocol.split("/")[0]} peer or incompatible version`);
  }
  const eph = Buffer.from(o.eph, "base64url");
  const nonce = Buffer.from(o.nonce, "base64url");
  if (eph.length !== 32 || nonce.length !== 16) throw new HandshakeError("Invalid handshake");
  return { eph, nonce };
}
function authPayload(protocol, role, transcript) {
  return Buffer.concat([Buffer.from(`${protocol} auth ${role}`), transcript]);
}
async function performHandshake(fs15, opts) {
  const { protocol, me, myName, initiator, xid } = opts;
  const timeoutMs = opts.timeoutMs ?? HANDSHAKE_TIMEOUT;
  const { privateKey: ephPriv, publicKey: ephPub } = crypto7.generateKeyPairSync("x25519");
  const ephRaw = Buffer.from(ephPub.export({ format: "jwk" }).x, "base64url");
  const nonce = crypto7.randomBytes(16);
  fs15.send(
    Buffer.from(
      JSON.stringify({ t: "hello", p: protocol, eph: ephRaw.toString("base64url"), nonce: nonce.toString("base64url") })
    )
  );
  const peer = parseHello(await fs15.read(timeoutMs), protocol);
  if (peer.eph.equals(ephRaw)) throw new HandshakeError("Reflected handshake");
  const [i, r] = initiator ? [{ eph: ephRaw, nonce }, peer] : [peer, { eph: ephRaw, nonce }];
  const transcript = crypto7.createHash("sha256").update(protocol).update(i.eph).update(i.nonce).update(r.eph).update(r.nonce).digest();
  let shared;
  try {
    const peerEphKey = crypto7.createPublicKey({
      key: { kty: "OKP", crv: "X25519", x: peer.eph.toString("base64url") },
      format: "jwk"
    });
    shared = crypto7.diffieHellman({ privateKey: ephPriv, publicKey: peerEphKey });
  } catch {
    throw new HandshakeError("Invalid key");
  }
  if (shared.every((b) => b === 0)) throw new HandshakeError("Invalid key");
  const okm = Buffer.from(crypto7.hkdfSync("sha256", shared, transcript, `${protocol} keys`, 64));
  const i2r = okm.subarray(0, 32);
  const r2i = okm.subarray(32, 64);
  const send = new CipherState(initiator ? i2r : r2i);
  const recv = new CipherState(initiator ? r2i : i2r);
  const myRole = initiator ? "I" : "R";
  const peerRole = initiator ? "R" : "I";
  const sig = crypto7.sign(null, authPayload(protocol, myRole, transcript), me.privateKey);
  fs15.send(
    send.encrypt(
      Buffer.from(
        JSON.stringify({
          pub: me.publicRaw.toString("base64url"),
          name: myName,
          sig: sig.toString("base64url"),
          ...initiator && xid ? { x: xid } : {}
        })
      )
    )
  );
  let auth;
  try {
    auth = JSON.parse(recv.decrypt(await fs15.read(timeoutMs)).toString("utf8"));
  } catch (err2) {
    if (err2 instanceof Error && /timed out|closed/.test(err2.message)) throw err2;
    throw new HandshakeError("Authentication failed");
  }
  if (typeof auth.pub !== "string" || typeof auth.sig !== "string") {
    throw new HandshakeError("Authentication failed");
  }
  const peerPublicRaw = Buffer.from(auth.pub, "base64url");
  if (peerPublicRaw.length !== 32) throw new HandshakeError("Invalid identity key");
  let valid = false;
  try {
    valid = crypto7.verify(
      null,
      authPayload(protocol, peerRole, transcript),
      publicKeyFromRaw(peerPublicRaw),
      Buffer.from(auth.sig, "base64url")
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new HandshakeError("Invalid signature");
  const peerId = fingerprint(peerPublicRaw);
  if (peerId === me.id) throw new HandshakeError("Cannot connect to yourself");
  let peerXid;
  if (auth.x !== void 0) {
    if (initiator || typeof auth.x !== "string" || !XID_RE.test(auth.x)) throw new HandshakeError("Invalid transfer id");
    peerXid = auth.x;
  }
  return { peerId, peerPublicRaw, peerName: cleanName(auth.name), send, recv, ...peerXid ? { xid: peerXid } : {} };
}

// ../termcore/src/net/peer.ts
import { EventEmitter as EventEmitter5 } from "events";
var PING_INTERVAL = 15e3;
var IDLE_TIMEOUT = 45e3;
var RATE_WINDOW = 1e3;
var RATE_MAX = 200;
var Session = class extends EventEmitter5 {
  constructor(fs15, hs, initiator, parse, tag, expected) {
    super();
    this.fs = fs15;
    this.hs = hs;
    this.initiator = initiator;
    this.parse = parse;
    this.tag = tag;
    this.expected = expected;
    this.peerId = hs.peerId;
    this.peerPublicRaw = hs.peerPublicRaw;
    this.peerName = hs.peerName;
    fs15.on("frame", (frame) => this.onFrame(frame));
    fs15.on("close", (err2) => this.finish(err2 ? err2.message : "Connection closed"));
    this.timer = setInterval(() => this.tick(), PING_INTERVAL / 3);
    this.timer.unref();
  }
  peerId;
  peerPublicRaw;
  peerName;
  openedAt = Date.now();
  lastActivity = Date.now();
  rateCount = 0;
  rateStart = Date.now();
  timer;
  closed = false;
  /** Call only once all listeners are attached – otherwise early frames are lost. */
  start() {
    this.fs.startStreaming();
  }
  get remoteAddress() {
    return this.fs.remoteAddress;
  }
  /** The other side's port – for a connection we opened, the port they listen on. */
  get remotePort() {
    return this.fs.socket.remotePort ?? 0;
  }
  get isOpen() {
    return !this.closed;
  }
  send(msg) {
    if (this.closed) return false;
    return this.fs.send(this.hs.send.encrypt(Buffer.from(JSON.stringify(msg), "utf8")));
  }
  close(reason = "Connection closed", graceful = true) {
    if (this.closed) return;
    if (graceful) {
      this.send({ t: "bye" });
      this.fs.end();
      setTimeout(() => this.fs.destroy(), 1e3).unref();
    } else {
      this.fs.destroy();
    }
    this.finish(reason);
  }
  onFrame(frame) {
    if (this.closed) return;
    const now = Date.now();
    if (now - this.rateStart > RATE_WINDOW) {
      this.rateStart = now;
      this.rateCount = 0;
    }
    if (++this.rateCount > RATE_MAX) {
      this.close("Peer is sending too much data", false);
      return;
    }
    let plain2;
    try {
      plain2 = this.hs.recv.decrypt(frame);
    } catch {
      this.close("Received tampered data", false);
      return;
    }
    this.lastActivity = now;
    const msg = this.parse(plain2);
    if (!msg) return;
    if (msg.t === "ping") {
      this.send({ t: "pong" });
      return;
    }
    if (msg.t === "pong") return;
    if (msg.t === "bye") {
      this.close("Peer closed the connection", false);
      return;
    }
    this.emit("message", msg);
  }
  tick() {
    const idle = Date.now() - this.lastActivity;
    if (idle > IDLE_TIMEOUT) this.close("Timed out", false);
    else if (idle > PING_INTERVAL) this.send({ t: "ping" });
  }
  finish(reason) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    this.emit("close", reason);
  }
};

// ../termcore/src/net/network.ts
var MAX_PENDING_HANDSHAKES = 32;
var DIAL_TIMEOUT = 4e3;
var Network = class extends EventEmitter6 {
  constructor(opts) {
    super();
    this.opts = opts;
  }
  server = null;
  pendingHandshakes = 0;
  sessions = /* @__PURE__ */ new Map();
  port = 0;
  get me() {
    return this.opts.me;
  }
  /** Listens on the preferred port, or on a free one if it's taken. */
  async start(preferredPort) {
    const tryListen = (port) => new Promise((resolve, reject) => {
      const server = net2.createServer((socket) => this.onIncoming(socket));
      server.once("error", reject);
      server.listen(port, "0.0.0.0", () => {
        server.off("error", reject);
        resolve(server);
      });
    });
    try {
      this.server = await tryListen(preferredPort);
    } catch (err2) {
      if (err2.code !== "EADDRINUSE") throw err2;
      this.emit("log", `Port ${preferredPort} in use, using a free port`);
      this.server = await tryListen(0);
    }
    this.server.on("error", (err2) => this.emit("log", `Server error: ${err2.message}`));
    this.port = this.server.address().port;
    return this.port;
  }
  isOnline(id) {
    return this.sessions.get(id)?.isOpen ?? false;
  }
  get(id) {
    return this.sessions.get(id);
  }
  handshake(fs15, initiator, xid) {
    return performHandshake(fs15, { protocol: this.opts.protocol, me: this.opts.me, myName: this.opts.getName(), initiator, xid });
  }
  /**
   * Opens a connection. With `expectedId`, verifies that this exact peer is on the
   * other end – otherwise disconnects immediately (unless acceptMismatch says otherwise).
   */
  async dial(host, port, expectedId, tag) {
    const fs15 = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await this.handshake(fs15, true);
      let expected;
      if (expectedId && hs.peerId !== expectedId) {
        if (!this.opts.acceptMismatch?.(expectedId, hs.peerId)) throw new HandshakeError("Someone else is now reachable at this address");
        expected = expectedId;
      }
      return this.register(new Session(fs15, hs, true, this.opts.parse, tag, expected));
    } catch (err2) {
      fs15.destroy();
      throw err2;
    }
  }
  /** Opens a connection for one purpose (`xid`) to exactly this peer. */
  async dialPurpose(host, port, expectedId, xid) {
    const fs15 = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await this.handshake(fs15, true, xid);
      if (hs.peerId !== expectedId) throw new HandshakeError("Someone else is now reachable at this address");
      return { fs: fs15, hs, xid };
    } catch (err2) {
      fs15.destroy();
      throw err2;
    }
  }
  connect(host, port) {
    return new Promise((resolve, reject) => {
      const s = net2.connect({ host, port });
      const timer = setTimeout(() => {
        s.destroy();
        reject(new Error("Connection timed out"));
      }, DIAL_TIMEOUT);
      s.once("connect", () => {
        clearTimeout(timer);
        s.removeAllListeners("error");
        resolve(s);
      });
      s.once("error", (err2) => {
        clearTimeout(timer);
        reject(err2);
      });
    });
  }
  async onIncoming(socket) {
    if (this.pendingHandshakes >= MAX_PENDING_HANDSHAKES) {
      socket.destroy();
      return;
    }
    this.pendingHandshakes++;
    const fs15 = new FrameSocket(socket);
    try {
      const hs = await this.handshake(fs15, false);
      if (hs.xid) {
        if (!this.emit("purpose", { fs: fs15, hs, xid: hs.xid })) fs15.destroy();
      } else {
        this.register(new Session(fs15, hs, false, this.opts.parse));
      }
    } catch (err2) {
      this.emit("log", `Rejected incoming connection from ${fs15.remoteAddress}: ${err2.message}`);
      fs15.destroy();
    } finally {
      this.pendingHandshakes--;
    }
  }
  /**
   * If both sides connect at the same time, the connection opened by the peer with
   * the smaller ID wins. Both sides independently reach the same result.
   */
  register(session) {
    const me = this.opts.me.id;
    const existing = this.sessions.get(session.peerId);
    if (existing?.isOpen) {
      const winner = me < session.peerId ? me : session.peerId;
      const initiatorOf = (s) => s.initiator ? me : s.peerId;
      const keepExisting = initiatorOf(existing) === winner && initiatorOf(session) !== winner;
      if (keepExisting) {
        session.close("Duplicate connection", false);
        return existing;
      }
      this.sessions.set(session.peerId, session);
      existing.close("Duplicate connection", false);
    } else {
      this.sessions.set(session.peerId, session);
    }
    session.on("close", (reason) => {
      if (this.sessions.get(session.peerId) === session) {
        this.sessions.delete(session.peerId);
        this.emit("offline", session.peerId, reason);
      }
    });
    this.emit("session", session);
    session.start();
    return session;
  }
  disconnect(id) {
    this.sessions.get(id)?.close();
  }
  async stop() {
    for (const s of this.sessions.values()) s.close("App closed");
    await new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      setTimeout(resolve, 1500).unref();
    });
    this.server = null;
  }
};

// ../termcore/src/friends/wire.ts
var NO_EXTENSION = { parse: () => null };
function parseJsonObject(buf) {
  let o;
  try {
    o = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  return o && typeof o === "object" && !Array.isArray(o) ? o : null;
}
function parseWire(buf, ext = NO_EXTENSION) {
  const o = parseJsonObject(buf);
  if (!o || typeof o.t !== "string") return null;
  switch (o.t) {
    case "state": {
      const port = Number(o.port);
      if (!REL_STATES.includes(o.state)) return null;
      const color = normalizeColor(o.color);
      return {
        t: "state",
        name: cleanName(o.name),
        state: o.state,
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 0,
        ...color ? { color } : {}
      };
    }
    case "presence": {
      if (typeof o.away !== "boolean") return null;
      const msg = cleanStatusMsg(o.msg);
      return {
        ...ext.presence?.(o) ?? {},
        t: "presence",
        away: o.away,
        ...isStatus(o.status) ? { status: o.status } : {},
        ...msg ? { msg } : {}
      };
    }
    case "links": {
      if (!Array.isArray(o.links) || o.links.length > MAX_LINKS) return null;
      const links = o.links.map(parseLink).filter((l) => l !== null);
      return { t: "links", links };
    }
    case "decline":
    case "ping":
    case "pong":
    case "bye":
      return { t: o.t };
    default:
      return ext.parse(o);
  }
}

// ../termcore/src/friends/net.ts
var UNKNOWN_PEER_TIMEOUT = 15e3;
var RELINK_TIMEOUT = 5e3;
var FIRST_MESSAGE_WAIT = 1e3;
var FriendNet = class {
  constructor(opts) {
    this.opts = opts;
    const { hub, app } = opts;
    this.hub = hub;
    this.app = app;
    this.identity = hub.identity;
    this.contacts = new ContactBook(hub.friends, app.name);
    this.peerBook = new PeerBook(hub.peers, app.name);
    this.lastStates = statesOf(hub.friends.get());
    this.network = new Network({
      protocol: app.protocol,
      me: this.identity,
      getName: () => this.name,
      parse: (plain2) => parseWire(plain2, opts.wire),
      acceptMismatch: (expected, actual) => (!!this.contacts.get(expected) || !!this.peerBook.get(expected)) && this.contacts.get(actual)?.state !== "blocked"
    });
    this.dialer = new Dialer({
      myId: this.identity.id,
      network: this.network,
      discovery: () => this.discoveryRef,
      stateOf: (id) => this.contacts.get(id)?.state,
      lastAddress: (id) => {
        const c2 = this.contacts.get(id);
        if (c2?.lastIp && c2.lastPort) return { ip: c2.lastIp, port: c2.lastPort };
        const p = this.peerBook.get(id);
        return p?.lastIp && p.lastPort ? { ip: p.lastIp, port: p.lastPort } : null;
      },
      candidates: () => {
        const ids = this.contacts.all().filter((c2) => c2.state === "accepted" || c2.state === "outgoing").map((c2) => c2.id);
        return [...ids, ...opts.hooks.extraDialIds?.() ?? []];
      },
      alsoWants: (id) => opts.hooks.alsoWants?.(id) ?? false,
      log: (l) => this.log(l),
      unreachable: (id, info) => this.event({ kind: "unreachable", id, who: this.peerName(id), ...info }),
      portOf: (p) => this.ownPort(p)
    });
    this.network.on("session", (s) => this.onSession(s));
    this.network.on("purpose", (c2) => opts.hooks.purpose ? opts.hooks.purpose(c2) : c2.fs.destroy());
    this.network.on("offline", (id) => this.onOffline(id));
    this.network.on("log", (l) => this.log(l));
    hub.friends.on("change", (v, external) => {
      const prev = this.lastStates;
      this.lastStates = statesOf(v);
      if (external && this.started) this.syncFromOthers(prev, this.lastStates);
      this.changed();
    });
    hub.peers.on("change", () => this.changed());
    hub.profile.on("change", () => this.onProfileChanged());
    hub.settings.on("change", (s) => {
      opts.hooks.settings?.(s);
      this.changed();
    });
    hub.links.on("change", () => this.runRekey());
  }
  identity;
  contacts;
  peerBook;
  network;
  dialer;
  hub;
  app;
  discoveryRef = null;
  focused = true;
  presenceMap = /* @__PURE__ */ new Map();
  lastStates;
  unregisterRun = null;
  started = false;
  /** Sessions with peers we don't know yet: our state waits for their first message. */
  awaitingFirst = /* @__PURE__ */ new WeakSet();
  // ───────────── Lifecycle ─────────────
  async start() {
    const { opts } = this;
    await this.network.start(opts.port ?? this.app.tcpPort);
    this.started = true;
    const udpPort = opts.discoveryPort ?? this.app.udpPort;
    this.unregisterRun = registerRun(this.hub.paths.runDir, { app: this.app.name, port: this.network.port, udp: udpPort, version: this.app.version });
    this.hub.watch();
    this.runRekey();
    if (opts.discovery !== false) {
      const d = new Discovery(this.identity.id, () => this.name, () => this.network.port, {
        ...opts.discoveryOptions,
        app: this.app.name,
        udpPort,
        apps: () => runningPorts(this.hub.paths.runDir),
        was: () => this.hub.myOldIds(),
        hints: () => this.lastKnownIps(),
        wants: (id) => this.dialer.wantsConnection(id)
      });
      this.discoveryRef = d;
      d.on("change", () => this.onDiscovered());
      d.on("log", (l) => this.log(l));
      d.on("callback", (id) => this.dialer.onCallback(id));
      d.start();
    }
    this.dialer.start(opts.dialIntervalMs ?? 1500);
    this.changed();
  }
  async stop() {
    this.started = false;
    this.dialer.stop();
    this.discoveryRef?.stop();
    await this.network.stop();
    this.hub.close();
    this.unregisterRun?.();
    this.unregisterRun = null;
  }
  get discovery() {
    return this.discoveryRef;
  }
  // ───────────── Me ─────────────
  get profile() {
    return this.hub.me;
  }
  get name() {
    return this.profile.name;
  }
  get me() {
    const p = this.profile;
    return {
      id: this.identity.id,
      name: p.name,
      color: p.color,
      status: p.status,
      statusMsg: p.statusMsg,
      port: this.network.port,
      ips: localIPv4s().map((i) => i.address),
      discovery: this.discoveryRef !== null,
      scanning: this.discoveryRef?.scanning ?? false
    };
  }
  get settings() {
    return this.hub.settings.get();
  }
  /** Do not disturb: no desktop notifications, invites and offers wait quietly. */
  get dnd() {
    return this.profile.status === "dnd";
  }
  get animations() {
    return this.settings.animations;
  }
  notificationsEnabled() {
    return this.settings.notifications;
  }
  setNotifications(on) {
    this.hub.setSettings({ notifications: on });
  }
  setAnimations(mode) {
    this.hub.setSettings({ animations: mode });
  }
  setName(name) {
    const clean = cleanName(name);
    this.hub.setProfile({ name: clean });
    return clean;
  }
  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused) {
    if (this.focused === focused) return;
    this.focused = focused;
    this.broadcastPresence();
    this.changed();
  }
  get isFocused() {
    return this.focused;
  }
  /** Desktop banner – only while the terminal is in the background, notifications are on and we're not in dnd. */
  notify(title, body) {
    if (this.focused || !this.notificationsEnabled() || this.dnd) return;
    if (this.opts.notify) this.opts.notify(title, body);
    else notify(title, body, this.app.name);
  }
  // ───────────── Queries ─────────────
  isOnline(id) {
    return this.network.isOnline(id);
  }
  presenceOf(id) {
    return this.isOnline(id) ? this.presenceMap.get(id) : void 0;
  }
  /** Best name for any peer: own nickname/friend name, else what we remember. */
  peerName(id) {
    if (id === this.identity.id) return this.name;
    const c2 = this.contacts.get(id);
    if (c2) return displayName(c2);
    return this.peerBook.get(id)?.name ?? "Unknown";
  }
  /**
   * Our app's TCP port on a discovered peer's computer: the one it announced if it is our app,
   * else from the list of apps running there (`apps`). termhub sees people through every app.
   */
  ownPort(p) {
    return p.app === this.app.name ? p.port : p.apps?.[this.app.name];
  }
  /** The discovered peer that is (or was, see links) `id`. */
  discovered(id) {
    return this.discoveryRef?.find(id);
  }
  /** People on the network running this app who aren't friends (an old id they announce counts). */
  nearby() {
    return [...this.discoveryRef?.peers.values() ?? []].filter((p) => !this.contacts.get(p.id) && !(p.was ?? []).some((w) => this.contacts.get(w))).sort((a, b) => a.name.localeCompare(b.name));
  }
  /** Number of accepted friends online. */
  onlineCount() {
    let n = 0;
    for (const id of this.network.sessions.keys()) if (this.contacts.get(id)?.state === "accepted") n++;
    return n;
  }
  safetyCodeWith(id) {
    const c2 = this.contacts.get(id);
    if (!c2?.publicKey) return null;
    return safetyCode(this.identity.publicRaw, Buffer.from(c2.publicKey, "base64url"));
  }
  send(id, msg) {
    return this.network.get(id)?.send(msg) ?? false;
  }
  // ───────────── Friends ─────────────
  /** Request to a peer from "Nearby". */
  requestNearby(id) {
    const p = this.discoveryRef?.peers.get(id);
    const existing = this.contacts.get(id);
    if (existing) {
      let result = "pending";
      if (existing.state === "incoming") {
        this.accept(id);
        result = "accepted";
      } else if (existing.state === "declined" || existing.state === "blocked") {
        this.setState(id, "outgoing");
        result = "again";
      }
      this.connect(id);
      return result;
    }
    if (!p) throw new Error("They are no longer nearby");
    const port = this.ownPort(p);
    this.contacts.upsert(id, { publicKey: "", name: p.name, state: "outgoing", lastIp: p.ip, ...port ? { lastPort: port } : {} });
    this.contacts.setPorts(id, { ...p.apps, [p.app]: p.port });
    this.connect(id);
    this.changed();
    return "sent";
  }
  /** Ask again (after a decline). */
  request(id) {
    this.setState(id, "outgoing");
    this.connect(id);
  }
  /** Add a friend by IP – for networks that block broadcast. */
  async addByAddress(host, port = this.app.tcpPort) {
    const session = await this.network.dial(host, port, void 0, "request");
    return session.peerId;
  }
  /** Accepts a request. False if there's none from them. */
  accept(id) {
    const c2 = this.contacts.get(id);
    if (!c2 || c2.state !== "incoming") return false;
    this.setState(id, "accepted");
    this.connect(id);
    return true;
  }
  /** Declines a request (or ends a friendship without a word): they're told, the entry is removed. */
  decline(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "decline" });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Declined");
    }
    this.contacts.remove(id);
    this.changed();
    return c2;
  }
  block(id, patch = {}) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    this.contacts.upsert(id, { ...patch, state: "blocked" });
    this.network.get(id)?.close("Blocked");
    this.changed();
    return c2;
  }
  unblock(id) {
    const c2 = this.contacts.get(id);
    if (c2?.state !== "blocked") return void 0;
    this.setState(id, "outgoing");
    this.connect(id);
    return c2;
  }
  /** Removes a friend; they see it as "removed you". */
  remove(id) {
    this.contacts.remove(id);
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Friend removed");
    }
    this.changed();
  }
  rename(id, alias) {
    const clean = alias.trim() ? cleanName(alias) : void 0;
    this.contacts.upsert(id, { alias: clean });
    this.changed();
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.dialer.connect(id);
  }
  tryDial(id) {
    this.dialer.tryDial(id);
  }
  setState(id, state) {
    this.contacts.upsert(id, { state, lastActivity: Date.now() });
    this.sendState(id);
    this.changed();
  }
  sendState(id) {
    const s = this.network.get(id);
    if (!s) return;
    const c2 = this.contacts.get(id);
    const color = this.profile.color;
    s.send({ t: "state", name: this.name, state: relStateFor(c2?.state ?? null), port: this.network.port, ...color ? { color } : {} });
  }
  // ───────────── Presence ─────────────
  ownPresence() {
    const p = this.profile;
    return {
      ...this.opts.hooks.presenceExtra?.() ?? {},
      t: "presence",
      away: !this.focused,
      ...p.status !== "available" ? { status: p.status } : {},
      ...p.statusMsg ? { msg: p.statusMsg } : {}
    };
  }
  sendPresence(id) {
    this.network.get(id)?.send(this.ownPresence());
  }
  broadcastPresence() {
    for (const id of this.network.sessions.keys()) this.sendPresence(id);
  }
  // ───────────── Internals ─────────────
  changed() {
    this.opts.hooks.changed();
  }
  log(line) {
    this.opts.hooks.log?.(line);
  }
  event(e) {
    this.opts.hooks.event?.(e);
  }
  lastKnownIps() {
    const ips = /* @__PURE__ */ new Set();
    for (const c2 of this.contacts.all()) if (c2.lastIp && c2.state !== "blocked") ips.add(c2.lastIp);
    for (const ip of this.opts.hooks.extraHints?.() ?? []) ips.add(ip);
    return [...ips];
  }
  onDiscovered() {
    const d = this.discoveryRef;
    if (!d) return;
    const seen = [];
    for (const p of d.peers.values()) {
      const port = this.ownPort(p);
      for (const id of [p.id, ...p.was ?? []]) {
        const c2 = this.contacts.get(id);
        if (c2 && (c2.lastIp !== p.ip || port && c2.lastPort !== port)) {
          this.contacts.upsert(id, { lastIp: p.ip, ...port ? { lastPort: port } : {} });
        }
        if (c2 && (p.apps || p.app !== this.app.name)) this.contacts.setPorts(id, { ...p.apps, [p.app]: p.port });
        const known = this.peerBook.get(id);
        if (known && (known.lastIp !== p.ip || port && known.lastPort !== port)) this.peerBook.update(id, { lastIp: p.ip, ...port ? { lastPort: port } : {} });
        seen.push(id);
      }
    }
    this.dialer.discovered(seen);
    this.changed();
  }
  onProfileChanged() {
    if (!this.started) return this.changed();
    for (const id of this.network.sessions.keys()) {
      this.sendState(id);
      this.sendPresence(id);
    }
    this.discoveryRef?.announce(false);
    this.changed();
  }
  /** Another app changed the friend list: tell our peers what changed for them. */
  syncFromOthers(prev, next) {
    for (const id of /* @__PURE__ */ new Set([...prev.keys(), ...next.keys()])) {
      const before = prev.get(id);
      const after = next.get(id);
      if (before === after) continue;
      const s = this.network.get(id);
      if (after === void 0) {
        if (s) {
          s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
          if (!this.opts.hooks.keepUnknown?.(id)) s.close("Friend removed");
        }
        continue;
      }
      if (after === "blocked") {
        s?.close("Blocked");
        continue;
      }
      if (relStateFor(before ?? null) !== relStateFor(after)) this.sendState(id);
      if (after === "accepted" || after === "outgoing") this.dialer.connect(id);
    }
  }
  runRekey() {
    const rekey = this.opts.hooks.rekey;
    if (!rekey) return;
    try {
      if (applyLinks(this.hub, this.opts.paths.home, rekey).length) this.changed();
    } catch (err2) {
      this.log(`Couldn't update data for new ids: ${err2.message}`);
    }
  }
  onSession(s) {
    const id = s.peerId;
    let c2 = this.contacts.get(id);
    if (c2?.state === "blocked") {
      s.close("Blocked", false);
      return;
    }
    this.dialer.connected(id);
    if (s.tag === "request") {
      if (!c2) {
        c2 = this.contacts.upsert(id, { publicKey: "", name: s.peerName, state: "outgoing" });
        this.event({ kind: "requestSent", id, who: s.peerName });
      } else if (c2.state === "incoming") {
        this.accept(id);
      } else if (c2.state === "declined") {
        this.contacts.upsert(id, { state: "outgoing" });
      }
    }
    if (c2) {
      this.contacts.upsert(id, {
        publicKey: s.peerPublicRaw.toString("base64url"),
        name: s.peerName,
        lastIp: s.remoteAddress,
        lastSeen: Date.now()
      });
    }
    s.on("message", (m) => this.onWire(s, m));
    if (s.expected) {
      const expected = s.expected;
      setTimeout(() => {
        if (s.isOpen && this.contacts.get(expected) && !this.contacts.get(id)) s.close("Someone else is now reachable at this address");
      }, this.opts.relinkTimeoutMs ?? RELINK_TIMEOUT).unref();
      s.on("close", () => {
        if (this.contacts.get(expected)) this.dialer.failed(expected);
      });
    } else if (!c2 && !this.opts.hooks.keepUnknown?.(id)) {
      setTimeout(() => {
        if (s.isOpen && !this.contacts.get(id) && !this.opts.hooks.keepUnknown?.(id)) s.close("No request received");
      }, UNKNOWN_PEER_TIMEOUT).unref();
    }
    const links = this.hub.myLinks();
    if (links.length) s.send({ t: "links", links });
    if (c2) this.sendState(id);
    else {
      this.awaitingFirst.add(s);
      setTimeout(() => this.flushInitialState(s), FIRST_MESSAGE_WAIT).unref();
    }
    const own = this.ownPresence();
    if (Object.keys(own).length > 2 || own.away) this.sendPresence(id);
    this.opts.hooks.session?.(s);
    this.log(`Connected to ${s.peerName} (${id}) via ${s.remoteAddress}`);
    this.changed();
  }
  onOffline(id) {
    this.presenceMap.delete(id);
    this.opts.hooks.offline?.(id);
    if (this.contacts.get(id)) this.contacts.upsert(id, { lastSeen: Date.now() });
    this.changed();
  }
  flushInitialState(s) {
    if (!this.awaitingFirst.has(s)) return;
    this.awaitingFirst.delete(s);
    if (s.isOpen && this.network.get(s.peerId) === s) this.sendState(s.peerId);
  }
  onWire(s, m) {
    try {
      this.handleWire(s, m);
    } finally {
      this.flushInitialState(s);
    }
  }
  handleWire(s, m) {
    if (this.network.get(s.peerId) !== s) return;
    const id = s.peerId;
    const base = m;
    switch (base.t) {
      case "links":
        return this.onLinks(s, base.links);
      case "state":
        return this.onState(s, base);
      case "decline": {
        let declined = false;
        const c2 = this.contacts.mutate(id, (cur) => {
          if (cur?.state !== "outgoing") return void 0;
          declined = true;
          return { state: "declined" };
        });
        if (declined && c2) {
          this.event({ kind: "declinedUs", id, who: displayName(c2) });
          this.changed();
        }
        return;
      }
      case "presence": {
        if (!this.contacts.get(id) && !this.opts.hooks.keepUnknown?.(id)) return;
        const { t: _t, away, status, msg, ...extra } = base;
        const next = { away, status: status ?? "available", ...msg ? { msg } : {}, extra };
        if (JSON.stringify(next) === JSON.stringify(this.presenceMap.get(id))) return;
        this.presenceMap.set(id, next);
        this.rememberStatus(id, next);
        this.opts.hooks.presence?.(id, next);
        this.changed();
        return;
      }
      case "ping":
      case "pong":
      case "bye":
        return;
      default:
        if (this.contacts.get(id)?.state === "blocked") return;
        this.opts.hooks.message(s, m);
    }
  }
  /** Keeps a friend's status in friends.json, so termhub and our other apps know it without a session. */
  rememberStatus(id, p) {
    const c2 = this.contacts.get(id);
    if (!c2) return;
    const status = p.status === "available" ? void 0 : p.status;
    if ((c2.status ?? void 0) === status && c2.statusMsg === p.msg) return;
    this.contacts.upsert(id, { status, statusMsg: p.msg });
  }
  /** Their links: an old id we know is them now. Only links to the session's own key count. */
  onLinks(s, links) {
    let changed = false;
    for (const link of links) {
      if (linkNewId(link) !== s.peerId || !verifyLink(link)) continue;
      const oldId = linkOldId(link);
      if (oldId === s.peerId || oldId === this.identity.id) continue;
      const friend = this.contacts.get(oldId);
      const known = this.peerBook.get(oldId);
      if (!friend && !known && s.expected !== oldId && !this.opts.hooks.knowsId?.(oldId)) continue;
      this.hub.addKnownLink(link);
      if (friend) this.contacts.relink(oldId, s.peerId, link.new);
      if (known) this.peerBook.relink(oldId, s.peerId);
      this.dialer.connected(oldId);
      this.event({ kind: "linked", oldId, id: s.peerId, who: this.peerName(s.peerId) });
      this.log(`${oldId} is now ${s.peerId}`);
      changed = true;
    }
    if (changed) {
      this.runRekey();
      if (!this.awaitingFirst.has(s)) this.sendState(s.peerId);
      this.changed();
    }
  }
  onState(s, m) {
    const id = s.peerId;
    this.opts.hooks.stateMessage?.(s, m);
    let prev = null;
    let before;
    const now = Date.now();
    const updated = this.contacts.mutate(id, (cur) => {
      before = cur;
      prev = cur?.state ?? null;
      const next2 = reconcile(prev, m.state);
      if (next2 === null) return cur ? null : void 0;
      return {
        publicKey: s.peerPublicRaw.toString("base64url"),
        name: m.name,
        state: next2,
        color: m.color,
        lastIp: s.remoteAddress,
        lastPort: m.port || cur?.lastPort,
        lastSeen: now,
        ...prev !== next2 ? { lastActivity: now } : {},
        ...this.opts.hooks.statePatch?.(prev, next2) ?? {}
      };
    });
    const next = updated?.state ?? null;
    if (next === null) {
      if (before) this.event({ kind: "withdrawn", id, who: displayName(before) });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Not a friend");
      this.changed();
      return;
    }
    const who = displayName(updated);
    if (next === "accepted" && prev !== "accepted") {
      this.event({ kind: "accepted", id, who, byThem: prev === "outgoing" });
    } else if (next === "incoming" && prev !== "incoming") {
      this.event({ kind: "incoming", id, who });
    } else if (prev === "accepted" && next === "outgoing") {
      this.event({ kind: "removedUs", id, who });
    }
    if (relStateFor(prev) !== relStateFor(next)) this.sendState(id);
    this.opts.hooks.stateChanged?.(id, prev, next);
    this.changed();
  }
};
function statesOf(v) {
  return new Map(v.friends.map((f) => [f.id, f.state]));
}
function appendLog(file, line) {
  try {
    fs12.appendFileSync(file, `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
  } catch {
  }
}

// src/apps/changelog.ts
var HEADING = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?(?:\s*[–—-]\s*(.+?))?\s*$/;
var MAX_TEXT = 2e5;
var MAX_SECTIONS = 200;
function parseChangelog(text2) {
  const clean = sanitizeText(text2.slice(0, MAX_TEXT));
  const out2 = [];
  let current = null;
  const flush = () => {
    if (current) out2.push({ version: current.version, ...current.date ? { date: current.date } : {}, body: current.lines.join("\n").trim() });
  };
  for (const line of clean.split("\n")) {
    const h = HEADING.exec(line);
    if (h) {
      flush();
      if (out2.length >= MAX_SECTIONS) return out2;
      current = { version: h[1], ...h[2] ? { date: h[2].trim() } : {}, lines: [] };
    } else if (/^#\s/.test(line)) {
      continue;
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return out2;
}
function sectionsBetween(sections, from, to) {
  const seen = /* @__PURE__ */ new Set();
  const unique = sections.filter((s) => seen.has(s.version) ? false : (seen.add(s.version), true));
  const picked = from ? unique.filter((s) => compareVersions(s.version, from) > 0 && compareVersions(s.version, to) <= 0) : unique.filter((s) => s.version === to);
  return picked.sort((a, b) => compareVersions(b.version, a.version));
}
function whatsNewText(name, sections) {
  return sections.map((s) => `### ${name} ${s.version}${s.date ? ` _${s.date}_` : ""}

${s.body || "- Maintenance release"}`).join("\n\n");
}
async function fetchChangelog(url, fetchImpl = fetch, timeoutMs = 5e3) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return parseChangelog(await res.text());
  } catch {
    return null;
  }
}

// src/apps/seen.ts
var VERSION_RE3 = /^\d+\.\d+\.\d+$/;
var Seen = class {
  constructor(file) {
    this.file = file;
    let raw = null;
    try {
      raw = readJson(file, null);
    } catch {
      raw = null;
    }
    this.versions = {};
    for (const [id, v] of Object.entries(raw?.versions ?? {})) if (typeof v === "string" && VERSION_RE3.test(v)) this.versions[id] = v;
  }
  versions;
  get(id) {
    return this.versions[id];
  }
  /**
   * The version an app had last time if it's newer now (→ "new in"), else null. The very first
   * sighting is no news.
   */
  newerThanSeen(id, installed) {
    const before = this.versions[id];
    return before && compareVersions(installed, before) > 0 ? before : null;
  }
  /** Remembers what's installed now. */
  mark(id, version) {
    if (version === null) {
      if (!(id in this.versions)) return;
      delete this.versions[id];
    } else {
      if (this.versions[id] === version) return;
      this.versions[id] = version;
    }
    try {
      writeJsonAtomic(this.file, { v: 1, versions: this.versions });
    } catch {
    }
  }
};

// src/core/courier.ts
var WAIT_MS = 1500;
async function deliver(d) {
  const network = new Network({
    protocol: d.protocol,
    me: d.me,
    getName: () => d.name,
    parse: (plain2) => parseWire(plain2)
  });
  let session = null;
  try {
    session = await network.dial(d.ip, d.port, d.peerId ?? void 0);
    const s = session;
    if (d.peerId && s.peerId !== d.peerId) throw new Error("Someone else is now reachable at this address");
    const answer = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), d.waitMs ?? WAIT_MS);
      timer.unref();
      s.on("message", (m) => {
        if (m.t === "state") {
          clearTimeout(timer);
          resolve({ state: m.state, ...m.color ? { color: m.color } : {} });
        }
      });
      s.on("close", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
    if (d.links.length) s.send({ t: "links", links: d.links });
    if (d.send.t === "state") s.send({ t: "state", name: d.name, state: d.send.state, port: 0, ...d.color ? { color: d.color } : {} });
    else s.send({ t: "decline" });
    const their = await answer;
    return {
      peerId: s.peerId,
      peerName: s.peerName,
      publicKey: s.peerPublicRaw.toString("base64url"),
      remoteAddress: s.remoteAddress,
      theirState: their?.state ?? null,
      ...their?.color ? { color: their.color } : {}
    };
  } finally {
    session?.close("termhub delivered a change", true);
    await network.stop();
  }
}

// src/core/store.ts
var APP_ORDER = ["termchat", "keyrace", "termdrop", "termhub"];
var OTHER_APPS = ["termchat", "keyrace", "termdrop"].map((app) => ({ app, udpPort: SUITE[app].udpPort }));
var POLL_MS2 = 2500;
var RETRY_MS = 6e4;
var LOG_LINES = 400;
var byApp = (a, b) => (APP_ORDER.indexOf(a) === -1 ? 99 : APP_ORDER.indexOf(a)) - (APP_ORDER.indexOf(b) === -1 ? 99 : APP_ORDER.indexOf(b)) || a.localeCompare(b);
function parseAppPorts(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out2 = {};
  for (const [k, p] of Object.entries(v)) if (isSuiteApp(k) && Number.isInteger(p) && p > 0 && p < 65536) out2[k] = p;
  return Object.keys(out2).length ? out2 : void 0;
}
var HubStore = class {
  constructor(opts) {
    this.opts = opts;
    this.paths = opts.paths;
    this.env = opts.env ?? process.env;
    this.hub = new Hub(opts.paths.hub);
    this.toasts = new Toasts(() => this.changed());
    this.seen = new Seen(opts.paths.seen);
    this.catalog = cachedCatalog(opts.paths.catalogCache);
    this.self = { version: VERSION, kind: self.installKind(), newIn: null };
    const before = this.seen.newerThanSeen("termhub", VERSION);
    if (before) this.self.newIn = { from: before, to: VERSION };
    this.seen.mark("termhub", VERSION);
    this.syncCatalog();
    this.net = new FriendNet({
      app: APP,
      paths: opts.paths,
      hub: this.hub,
      port: opts.port,
      discovery: opts.discovery,
      discoveryPort: opts.discoveryPort,
      discoveryOptions: { ...opts.discoveryOptions, listApps: ["termhub", "termchat", "keyrace", "termdrop"], alsoAsk: OTHER_APPS },
      dialIntervalMs: opts.dialIntervalMs,
      notify: opts.notify,
      wire: { parse: () => null, presence: (o) => parseAppPorts(o.apps) ? { apps: parseAppPorts(o.apps) } : {} },
      hooks: {
        changed: () => this.onNetChanged(),
        log: (l) => this.log(l),
        event: (e) => this.onEvent(e),
        message: () => {
        },
        // which apps we have open: friends who connect to our termhub see it right away
        presenceExtra: () => ({ apps: runningPorts(this.paths.hub.runDir) }),
        settings: (s) => this.applySettings(s)
      }
    });
    this.applySettings(this.hub.settings.get());
    setPersonColors((id) => this.contacts.get(id)?.color);
  }
  net;
  hub;
  paths;
  toasts;
  seen;
  env;
  listeners = /* @__PURE__ */ new Set();
  notifyQueued = false;
  version = 0;
  catalog;
  apps = /* @__PURE__ */ new Map();
  self;
  task = null;
  /** an app is open in this terminal right now (termhub is in the background) */
  childRunning = false;
  /** the app to open next (the UI quits Ink, cli.tsx runs it and comes back) */
  launch = null;
  globalRoot = null;
  localRun = /* @__PURE__ */ new Set();
  pollTimer = null;
  retryTimer = null;
  stopped = false;
  /** friends whose last change still has to reach them (no app of theirs was reachable) */
  pending = /* @__PURE__ */ new Set();
  lastRetry = /* @__PURE__ */ new Map();
  delivering = /* @__PURE__ */ new Set();
  wasOnline = /* @__PURE__ */ new Map();
  refreshing = null;
  static createProfile(paths, name, color) {
    return Hub.createProfile(paths.hub, name, color).id;
  }
  static hasProfile(paths) {
    return Hub.hasProfile(paths.hub);
  }
  get identity() {
    return this.net.identity;
  }
  get contacts() {
    return this.net.contacts;
  }
  // ───────────── Lifecycle ─────────────
  async start() {
    await this.net.start();
    this.pollRunning();
    this.pollTimer = setInterval(() => this.pollRunning(), this.opts.pollMs ?? POLL_MS2);
    this.pollTimer.unref();
    this.retryTimer = setInterval(() => this.retryPending(), Math.min(this.retryMs, 1e4));
    this.retryTimer.unref();
    void this.refreshApps({ catalog: true, latest: true });
    this.changed();
  }
  async stop() {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.toasts.stop();
    await this.net.stop();
  }
  // ───────────── Subscription for React ─────────────
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  changed() {
    this.version++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const fn of this.listeners) fn();
    });
  }
  onNetChanged() {
    this.noteLastSeen();
    this.changed();
  }
  applySettings(s) {
    if (setAccent(s.accent)) this.changed();
  }
  log(line) {
    if (this.opts.debug) appendLog(this.paths.log, line);
  }
  // ───────────── Me ─────────────
  get me() {
    return this.net.me;
  }
  get profile() {
    return this.hub.me;
  }
  get settings() {
    return this.net.settings;
  }
  get toast() {
    return this.toasts.current;
  }
  showToast(text2, kind = "info") {
    this.toasts.show(text2, kind);
  }
  get isFocused() {
    return this.net.isFocused;
  }
  setFocused(focused) {
    this.net.setFocused(focused);
  }
  /** Desktop banner – not while an app runs in front (it notifies about its own things). */
  notify(body) {
    if (!this.childRunning) this.net.notify("termhub", body);
  }
  // ───────────── Friends: views ─────────────
  /** Apps someone runs on their computer right now, as far as we can tell. */
  appsOf(id) {
    const apps = /* @__PURE__ */ new Set();
    const p = this.net.discovered(id);
    if (p) {
      apps.add(p.app);
      for (const a of Object.keys(p.apps ?? {})) apps.add(a);
    }
    if (this.net.isOnline(id)) {
      apps.add("termhub");
      const extra = this.net.presenceOf(id)?.extra.apps;
      for (const a of Object.keys(extra ?? {})) apps.add(a);
    }
    return [...apps].sort(byApp);
  }
  friend(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    const hub = this.net.isOnline(id);
    const apps = c2.state === "blocked" ? [] : this.appsOf(id);
    const presence = this.net.presenceOf(id);
    const status = presence?.status ?? c2.status ?? "available";
    const statusMsg = presence ? presence.msg : c2.statusMsg;
    return {
      ...c2,
      display: displayName(c2),
      hub,
      apps,
      online: apps.length > 0,
      away: hub && (presence?.away ?? false),
      status,
      ...statusMsg ? { statusMsg } : { statusMsg: void 0 },
      ip: this.net.discovered(id)?.ip ?? c2.lastIp
    };
  }
  friendsData() {
    const all = this.contacts.all().map((c2) => this.friend(c2.id));
    const order = { accepted: 0, outgoing: 1, declined: 2, incoming: 3, blocked: 4 };
    const friends = all.filter((f) => f.state === "accepted" || f.state === "outgoing" || f.state === "declined").sort((a, b) => order[a.state] - order[b.state] || Number(b.online) - Number(a.online) || a.display.localeCompare(b.display));
    return {
      requests: all.filter((f) => f.state === "incoming").sort((a, b) => b.lastActivity - a.lastActivity),
      friends,
      nearby: this.net.nearby().map((p) => ({ id: p.id, name: p.name, ip: p.ip, apps: [.../* @__PURE__ */ new Set([p.app, ...Object.keys(p.apps ?? {})])].sort(byApp) })),
      blocked: all.filter((f) => f.state === "blocked").sort((a, b) => a.display.localeCompare(b.display))
    };
  }
  /** Accepted friends online in any app (the header's count). */
  onlineCount() {
    return this.contacts.all().filter((c2) => c2.state === "accepted" && this.appsOf(c2.id).length > 0).length;
  }
  safetyCodeWith(id) {
    return this.net.safetyCodeWith(id);
  }
  peerName(id) {
    return this.net.peerName(id);
  }
  /** Friends who were online and aren't anymore: remember when we last saw them. */
  noteLastSeen() {
    const now = Date.now();
    const online = /* @__PURE__ */ new Map();
    for (const c2 of this.contacts.all()) {
      if (c2.state !== "accepted") continue;
      const p = this.net.discovered(c2.id);
      if (p || this.net.isOnline(c2.id)) online.set(c2.id, p?.lastSeen ?? now);
    }
    for (const [id, at] of this.wasOnline) {
      if (!online.has(id) && this.contacts.get(id) && (this.contacts.get(id).lastSeen ?? 0) < at) {
        this.contacts.upsert(id, { lastSeen: at });
      }
    }
    this.wasOnline = online;
  }
  // ───────────── Friends: actions ─────────────
  onEvent(e) {
    switch (e.kind) {
      case "accepted":
        return this.showToast(e.byThem ? `${e.who} accepted your friend request` : `You and ${e.who} are now friends`, "success");
      case "incoming":
        this.showToast(`${e.who} wants to be friends`, "info");
        return this.notify(`${e.who} wants to be friends`);
      case "removedUs":
        return this.showToast(`${e.who} removed you as a friend \u2013 your request is waiting to be accepted`, "error");
      case "declinedUs":
        return this.showToast(`${e.who} declined your friend request`, "error");
      case "withdrawn":
        return this.showToast(`${e.who} withdrew their friend request`);
      case "requestSent":
        return this.showToast(`Friend request sent to ${e.who} \u2013 waiting for them to accept`);
      case "unreachable":
      case "linked":
        return;
    }
  }
  /** Request to someone under Nearby. */
  async requestNearby(id) {
    const name = this.net.discovered(id)?.name ?? this.peerName(id);
    const r = this.net.requestNearby(id);
    if (r === "accepted") this.showToast(`You and ${this.peerName(id)} are now friends`, "success");
    else this.showToast(`Friend request sent to ${name}`);
    await this.pass(id, { t: "state", state: relStateFor(this.contacts.get(id)?.state ?? null) });
  }
  accept(id) {
    const c2 = this.contacts.get(id);
    if (!c2 || !this.net.accept(id)) return;
    this.showToast(`You and ${displayName(c2)} are now friends`, "success");
    void this.pass(id, { t: "state", state: "accepted" });
  }
  decline(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return;
    const online = this.net.isOnline(id);
    this.net.decline(id);
    this.showToast(`Declined ${displayName(c2)}'s request`);
    if (!online) void this.pass(id, { t: "decline" }, c2);
  }
  removeFriend(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return;
    const online = this.net.isOnline(id);
    this.net.peerBook.update(id, { name: displayName(c2) });
    this.net.remove(id);
    this.showToast(`Removed ${displayName(c2)}`);
    if (!online) void this.pass(id, { t: "state", state: "none" }, c2);
  }
  block(id) {
    const c2 = this.net.block(id);
    if (c2) this.showToast(`${displayName(c2)} is blocked \u2013 in every app. No more connections are accepted.`, "error");
  }
  unblock(id) {
    const c2 = this.net.unblock(id);
    if (!c2) return;
    this.showToast(`Unblocked ${displayName(c2)} \u2013 friend request sent`, "success");
    void this.pass(id, { t: "state", state: "outgoing" });
  }
  /** Ask again after a decline. */
  request(id) {
    this.net.request(id);
    this.showToast("Friend request sent again");
    void this.pass(id, { t: "state", state: "outgoing" });
  }
  rename(id, alias) {
    this.net.rename(id, alias);
  }
  /**
   * Adds someone by IP – for networks that block discovery. Tries their termhub first, then
   * each app on its usual port (or the protocol that answers on `port`).
   */
  async addByAddress(host, port) {
    const tries = port ? ["termhub", "termchat", "keyrace", "termdrop"].map((app) => ({ app, port })) : ["termhub", "termchat", "keyrace", "termdrop"].map((app) => ({ app, port: SUITE[app].tcpPort }));
    let lastError = "nobody answered";
    for (const t of tries) {
      try {
        if (t.app === "termhub") return await this.net.addByAddress(host, t.port);
        const r = await this.courier(t.app, host, t.port, null, { t: "state", state: "outgoing" });
        const existing = this.contacts.get(r.peerId);
        if (!existing) {
          this.contacts.upsert(r.peerId, { publicKey: r.publicKey, name: r.peerName, state: "outgoing", lastIp: r.remoteAddress, ...r.color ? { color: r.color } : {} });
          this.contacts.setPorts(r.peerId, { [t.app]: t.port });
          this.showToast(`Friend request sent to ${r.peerName} (they have ${t.app} open)`);
        } else if (existing.state === "incoming") {
          this.net.setState(r.peerId, "accepted");
        }
        this.applyAnswer(r.peerId, r);
        return r.peerId;
      } catch (err2) {
        lastError = err2.message;
      }
    }
    throw new Error(`Couldn't reach anyone at ${host}${port ? `:${port}` : ""} (${lastError})`);
  }
  /** Where someone's apps listen right now (discovery), else where they did last time. */
  targets(id) {
    const out2 = [];
    const p = this.net.discovered(id);
    if (p) {
      const ports = { ...p.apps, [p.app]: p.port };
      for (const [app, port] of Object.entries(ports)) if (app !== "termhub" && port) out2.push({ app, ip: p.ip, port });
    } else {
      const raw = this.contacts.raw(id);
      if (raw?.lastIp) {
        for (const [app, port] of Object.entries(raw.ports ?? {})) if (app !== "termhub" && port) out2.push({ app, ip: raw.lastIp, port });
      }
    }
    return out2.sort((a, b) => byApp(a.app, b.app));
  }
  courier(app, ip, port, peerId, send) {
    return deliver({
      protocol: `${app}/1`,
      ip,
      port,
      peerId,
      me: this.identity,
      name: this.profile.name,
      ...this.profile.color ? { color: this.profile.color } : {},
      links: this.hub.myLinks(),
      send,
      waitMs: this.opts.courierWaitMs
    });
  }
  /**
   * Gets a friendship change to someone who isn't connected to our termhub: our own app that
   * they run passes it on by itself (shared list); otherwise termhub delivers it in that app's
   * protocol. If nothing reaches them, it's offered again later – and every app sends it anyway
   * the next time it connects to them.
   */
  async pass(id, send, removed) {
    if (this.net.isOnline(id)) return "hub";
    const targets = this.targets(id);
    if (!targets.length && removed?.lastIp) {
      const raw = { lastIp: removed.lastIp };
      for (const app of ["termchat", "keyrace", "termdrop"]) targets.push({ app, ip: raw.lastIp, port: SUITE[app].tcpPort });
    }
    const local = this.localApps();
    if (targets.some((t) => local.has(t.app))) return "app";
    if (this.delivering.has(id)) {
      this.pending.add(id);
      return "later";
    }
    this.delivering.add(id);
    try {
      for (const t of targets) {
        if (local.has(t.app)) continue;
        try {
          const r = await this.courier(t.app, t.ip, t.port, id, send);
          this.pending.delete(id);
          if (!removed) this.applyAnswer(id, r);
          this.log(`Delivered ${send.t === "state" ? send.state : "decline"} to ${id} through ${t.app}`);
          return "courier";
        } catch (err2) {
          this.log(`Couldn't deliver to ${id} through ${t.app} (${t.ip}:${t.port}): ${err2.message}`);
        }
      }
    } finally {
      this.delivering.delete(id);
    }
    if (!removed) this.pending.add(id);
    return "later";
  }
  /** Their answer in a courier session: the same rules as a `state` in a session. */
  applyAnswer(id, r) {
    let prev = null;
    const now = Date.now();
    const updated = this.contacts.mutate(id, (cur) => {
      if (!cur) return void 0;
      prev = cur.state;
      const next2 = r.theirState ? reconcile(cur.state, r.theirState) : cur.state;
      if (next2 === null) return null;
      return {
        publicKey: r.publicKey,
        name: r.peerName,
        state: next2,
        lastIp: r.remoteAddress,
        lastSeen: now,
        ...r.color ? { color: r.color } : {},
        ...next2 !== cur.state ? { lastActivity: now } : {}
      };
    });
    const next = updated?.state ?? null;
    if (prev === "outgoing" && next === "accepted") this.showToast(`${displayName(updated)} accepted your friend request`, "success");
    if (prev === "accepted" && next === "outgoing") this.showToast(`${displayName(updated)} removed you as a friend`, "error");
    this.changed();
  }
  /** Requests that couldn't be delivered, and our open requests to people who only run other apps. */
  retryPending() {
    if (this.stopped) return;
    const now = Date.now();
    for (const c2 of this.contacts.all()) {
      const due = this.pending.has(c2.id) || c2.state === "outgoing";
      if (!due || this.net.isOnline(c2.id) || !this.net.discovered(c2.id)) continue;
      if (now - (this.lastRetry.get(c2.id) ?? 0) < this.retryMs && !this.pending.has(c2.id)) continue;
      this.lastRetry.set(c2.id, now);
      void this.pass(c2.id, { t: "state", state: relStateFor(c2.state) });
    }
  }
  get retryMs() {
    return this.opts.retryMs ?? RETRY_MS;
  }
  /** Suite apps running on this computer (their run files; termhub itself excluded). */
  localApps() {
    return new Set(runningApps2(this.paths.hub.runDir, pidAlive).filter((r) => r.app !== "termhub").map((r) => r.app));
  }
  // ───────────── Profile and settings ─────────────
  setName(name) {
    const clean = this.net.setName(name);
    this.showToast(`You're ${clean} now \u2013 in every app`, "success");
    return clean;
  }
  setColor(color) {
    const hex = color === void 0 ? void 0 : normalizeColor(color);
    if (color !== void 0 && !hex) throw new Error("Use a color from the palette or #rrggbb");
    this.hub.setProfile({ color: hex ?? void 0 });
  }
  setStatus(status, msg) {
    const patch = { status };
    if (msg !== void 0) patch.statusMsg = msg === null ? void 0 : cleanStatusMsg(msg);
    this.hub.setProfile(patch);
  }
  setStatusMsg(msg) {
    this.hub.setProfile({ statusMsg: cleanStatusMsg(msg) });
  }
  setAccent(color) {
    const hex = color === void 0 ? void 0 : normalizeColor(color);
    if (color !== void 0 && !hex) throw new Error("Use a color from the palette or #rrggbb");
    this.hub.setSettings({ accent: hex ?? void 0 });
  }
  setAnimations(mode) {
    this.net.setAnimations(mode);
  }
  setNotifications(on) {
    this.net.setNotifications(on);
  }
  resetSettings() {
    this.hub.settings.update(() => ({ ...DEFAULT_SETTINGS }));
    this.showToast("Settings are back to their defaults \u2013 in every app", "success");
  }
  // ───────────── Backup ─────────────
  exportBackup(file, passphrase2) {
    return exportBackup(this.paths.hub, file, passphrase2, VERSION);
  }
  /** The other suite apps that run right now (a restore has to wait for them). */
  async appsInTheWay() {
    const ids = [.../* @__PURE__ */ new Set([...this.catalog.apps.map((a) => a.id), "termchat", "keyrace", "termdrop"])];
    return [...await runningApps(ids, this.paths.homeArg, this.env)];
  }
  /**
   * Replaces identity and friends with the backup's. Afterwards the store must be recreated
   * (the identity changed) – the UI does that.
   */
  async importBackup(file, passphrase2) {
    const busy = await this.appsInTheWay();
    if (busy.length) throw new Error(`Quit ${busy.join(", ")} first \u2013 a restore needs all apps closed`);
    const content = decryptBackup(fs13.readFileSync(file, "utf8"), passphrase2);
    return restoreBackup(this.paths.hub, content);
  }
  // ───────────── Apps ─────────────
  syncCatalog() {
    const ids = new Set(this.catalog.apps.map((a) => a.id));
    for (const id of this.apps.keys()) if (!ids.has(id)) this.apps.delete(id);
    for (const app of this.catalog.apps) {
      const prev = this.apps.get(app.id);
      if (prev) prev.app = app;
      else this.apps.set(app.id, { app, running: false, newIn: null, status: { kind: "missing" } });
    }
  }
  appList() {
    return this.catalog.apps.map((a) => this.apps.get(a.id)).filter(Boolean);
  }
  async globalFolder() {
    this.globalRoot = await (this.opts.globalRoot ?? (() => npmGlobalRoot()))();
    return this.globalRoot;
  }
  /** Detects every app again (and loads catalog and newest versions if asked). */
  refreshApps(what = {}) {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        if (what.catalog && !this.opts.offline) {
          this.catalog = await loadCatalog({ cacheFile: this.paths.catalogCache, fetchImpl: this.opts.fetchImpl, url: this.env.TERMHUB_CATALOG_URL || void 0 });
          this.syncCatalog();
          this.changed();
        }
        const globalRoot = await this.globalFolder();
        await Promise.all(this.appList().map((e) => this.detect(e, globalRoot)));
        await this.pollRunning();
        if (what.latest) await this.fetchVersions();
      } finally {
        this.refreshing = null;
        this.changed();
      }
    })();
    return this.refreshing;
  }
  async detect(e, globalRoot) {
    const before = e.detected?.state === "installed" ? e.detected.version : null;
    e.detected = await detectApp(e.app, { globalRoot, appDir: appUpdater(e.app).appDir(), pathEnv: this.opts.pathEnv, ask: this.opts.ask });
    const now = e.detected.state === "installed" ? e.detected.version : null;
    if (now) {
      const from = before && compareVersions(now, before) > 0 ? before : this.seen.newerThanSeen(e.app.id, now);
      if (from) e.newIn = { from, to: now };
      this.seen.mark(e.app.id, now);
    }
    e.status = statusOf(e.detected, e.latest);
  }
  async fetchVersions() {
    if (this.opts.offline) return;
    const fetchImpl = this.opts.fetchImpl;
    await Promise.all([
      ...this.appList().map(async (e) => {
        e.latest = await fetchLatest(rawUrl(e.app.repo, "package.json", this.env), fetchImpl);
        e.status = statusOf(e.detected, e.latest);
      }),
      (async () => {
        this.self.latest = this.env.TERMHUB_NO_UPDATE_CHECK === "1" ? null : await fetchLatest(this.env.TERMHUB_UPDATE_URL || rawUrl(REPO, "package.json", this.env), fetchImpl);
      })()
    ]);
    this.changed();
  }
  /** termhub's own update, if there is one (the header shows it). */
  get updateAvailable() {
    const l = this.self.latest;
    return l && compareVersions(l, VERSION) > 0 ? l : null;
  }
  /** Which apps run (their instance locks) – and tells termhub friends when that changes. */
  async pollRunning() {
    if (this.stopped) return;
    const ids = this.appList().map((e) => e.app.id);
    const running = await runningApps(ids, this.paths.homeArg, this.env);
    let changed = false;
    for (const e of this.appList()) {
      const r = running.has(e.app.id);
      if (e.running !== r) {
        e.running = r;
        changed = true;
      }
    }
    const local = this.localApps();
    if ([...local].sort().join() !== [...this.localRun].sort().join()) {
      this.localRun = local;
      this.net.broadcastPresence();
      changed = true;
    }
    if (changed) this.changed();
  }
  entry(id) {
    return this.apps.get(id);
  }
  /** What `enter` opens – or why it can't. */
  launchRequest(id) {
    const e = this.apps.get(id);
    if (!e) throw new Error(`There's no app called ${id}`);
    const d = e.detected;
    if (!d || d.state === "missing") throw new Error(`${e.app.name} isn't installed yet \u2013 press i to install it`);
    if (d.state === "broken") throw new Error(`${e.app.name} doesn't start (${d.reason}) \u2013 press u to install it again`);
    if (e.running) throw new Error(`${e.app.name} is already open in another window \u2013 switch there, or quit it first`);
    const args = this.paths.homeArg ? ["--home", this.paths.homeArg] : [];
    const main2 = d.copies.find((c2) => c2.kind === "global") ?? d.main;
    return { id, name: e.app.name, command: main2.command, args };
  }
  /** Back from an app: it may have updated itself, and it isn't running anymore. */
  async afterLaunch(id) {
    const e = this.apps.get(id);
    if (e) await this.detect(e, this.globalRoot);
    await this.pollRunning();
    this.changed();
  }
  // ───────────── Tasks: install, update, remove ─────────────
  startTask(title, steps) {
    if (this.task?.running) throw new Error("Wait until the current task is done");
    this.task = { title, steps: steps.map((s) => ({ ...s, status: "waiting" })), log: [], running: true };
    this.changed();
    return this.task;
  }
  output(task, chunk) {
    const lines = chunk.replace(/\r/g, "").split("\n");
    if (task.log.length && lines.length) task.log[task.log.length - 1] += lines.shift();
    task.log.push(...lines);
    if (task.log.length > LOG_LINES) task.log.splice(0, task.log.length - LOG_LINES);
    this.changed();
  }
  finishTask(task, r) {
    task.running = false;
    task.ok = r.ok;
    task.message = r.message;
    if (r.hint) task.hint = r.hint;
    this.changed();
  }
  /** Closes the panel of a finished task. */
  dismissTask() {
    if (this.task && !this.task.running) {
      this.task = null;
      this.changed();
    }
  }
  step(task, id, status, note) {
    const s = task.steps.find((x) => x.id === id);
    if (s) {
      s.status = status;
      if (note !== void 0) s.note = note;
    }
    this.changed();
  }
  async install(id) {
    const e = this.apps.get(id);
    if (!e) throw new Error(`There's no app called ${id}`);
    if (e.detected?.state === "installed") throw new Error(`${e.app.name} is installed already${e.status.kind === "update" ? " \u2013 press u to update it" : ""}`);
    if (!nodeSupports(e.app)) throw new Error(`${e.app.name} needs Node.js ${e.app.node} or newer (this is ${process.versions.node})`);
    const task = this.startTask(`Installing ${e.app.name}`, [{ id, label: e.app.name }]);
    this.step(task, id, "running");
    const globalRoot = await this.globalFolder();
    const r = await installApp(e.app, { latest: e.latest ?? null, globalRoot, onOutput: (s) => this.output(task, s) });
    await this.detect(e, globalRoot);
    const d = e.detected;
    const version = d?.state === "installed" ? d.version : null;
    const ok = r.ok && version !== null;
    const result = ok ? { ...r, message: `${e.app.name} ${version} is installed \u2013 press enter to open it` } : r.ok ? { ok: false, message: `npm finished, but ${e.app.name} doesn't start` } : r;
    this.step(task, id, ok ? "done" : "failed", version ?? void 0);
    this.finishTask(task, result);
    return result;
  }
  async update(id) {
    const e = this.apps.get(id);
    if (!e) throw new Error(`There's no app called ${id}`);
    if (!e.detected || e.detected.state === "missing") throw new Error(`${e.app.name} isn't installed \u2013 press i to install it`);
    if (e.running) throw new Error(`${e.app.name} is open right now \u2013 quit it first, then update`);
    const task = this.startTask(`Updating ${e.app.name}`, [{ id, label: e.app.name }]);
    const r = await this.updateOne(task, e);
    this.finishTask(task, r);
    return r;
  }
  async updateOne(task, e) {
    this.step(task, e.app.id, "running");
    const globalRoot = await this.globalFolder();
    const before = e.detected?.state === "installed" ? e.detected.version : null;
    const r = await updateApp(e.app, e.detected, { latest: e.latest ?? null, globalRoot, onOutput: (s) => this.output(task, s) });
    await this.detect(e, globalRoot);
    if (!r.ok) {
      this.step(task, e.app.id, "failed");
      return r;
    }
    const now = e.detected?.state === "installed" ? e.detected.version : null;
    if (!now) {
      this.step(task, e.app.id, "failed");
      return { ok: false, message: `npm finished, but ${e.app.name} doesn't start` };
    }
    if (e.latest && compareVersions(now, e.latest) < 0) {
      this.step(task, e.app.id, "failed", now);
      return { ok: false, message: appUpdater(e.app).staleInstallHint(now).replace(`${e.app.name} update`, "u") };
    }
    this.step(task, e.app.id, "done", before && before !== now ? `${before} \u2192 ${now}` : now);
    return { ok: true, message: before && before !== now ? `${e.app.name} ${now} is installed (was ${before}) \u2013 w shows what's new` : `${e.app.name} ${now} is up to date` };
  }
  /** termhub itself (the restart comes afterwards, see Task.restart). */
  async updateSelf(task) {
    this.step(task, "termhub", "running");
    if (this.self.kind === "source") {
      this.step(task, "termhub", "skipped", "source folder");
      return { ok: true, message: self.SOURCE_HINT.replace(/`/g, "") };
    }
    const latest = this.self.latest ?? null;
    this.output(task, `Updating termhub ${VERSION}${latest ? ` \u2192 ${latest}` : ""} \u2026
`);
    const res = await self.runInstall({ inherit: false, version: latest, onOutput: (s) => this.output(task, s) });
    if (!res.ok) {
      this.step(task, "termhub", "failed");
      const hint = self.installHint(res.output);
      return { ok: false, message: `Updating termhub failed`, ...hint ? { hint } : {} };
    }
    const installed = await self.installedVersion();
    if (installed && latest && compareVersions(installed, latest) < 0) {
      this.step(task, "termhub", "failed", installed);
      return { ok: false, message: self.staleInstallHint(installed) };
    }
    this.step(task, "termhub", "done", `${VERSION} \u2192 ${installed ?? latest ?? "latest"}`);
    task.restart = true;
    return { ok: true, message: `termhub ${installed ?? latest} is installed \u2013 restart termhub to use it` };
  }
  async updateTermhub() {
    if (!this.updateAvailable && this.self.latest !== null) {
      const r2 = { ok: true, message: `termhub ${VERSION} is up to date` };
      this.showToast(r2.message, "success");
      return r2;
    }
    const task = this.startTask("Updating termhub", [{ id: "termhub", label: "termhub (this app)" }]);
    const r = await this.updateSelf(task);
    this.finishTask(task, r);
    return r;
  }
  /**
   * Updates every installed app that has a newer version, one after the other, and termhub
   * last (then the UI offers a restart).
   */
  async updateAll() {
    const due = this.appList().filter((e) => e.detected?.state === "installed" && e.status.kind === "update");
    const selfDue = !!this.updateAvailable;
    if (!due.length && !selfDue) {
      const r2 = { ok: true, message: "Everything is up to date" };
      this.showToast(r2.message, "success");
      return r2;
    }
    const task = this.startTask("Updating all apps", [
      ...due.map((e) => ({ id: e.app.id, label: e.app.name })),
      ...selfDue ? [{ id: "termhub", label: "termhub (this app)" }] : []
    ]);
    const failed2 = [];
    for (const e of due) {
      if (e.running) {
        this.step(task, e.app.id, "skipped", "open right now \u2013 quit it first");
        failed2.push(e.app.name);
        continue;
      }
      const r2 = await this.updateOne(task, e);
      if (!r2.ok) {
        failed2.push(e.app.name);
        if (r2.hint) task.hint = r2.hint;
      }
    }
    if (selfDue) {
      const r2 = await this.updateSelf(task);
      if (!r2.ok) failed2.push("termhub");
    }
    const r = failed2.length ? { ok: false, message: `Not updated: ${failed2.join(", ")} \u2013 see above`, ...task.hint ? { hint: task.hint } : {} } : { ok: true, message: task.restart ? "All updated \u2013 restart termhub to use the new version" : "All apps are up to date" };
    this.finishTask(task, r);
    return r;
  }
  async uninstall(id) {
    const e = this.apps.get(id);
    if (!e) throw new Error(`There's no app called ${id}`);
    if (!e.detected || e.detected.state === "missing") throw new Error(`${e.app.name} isn't installed`);
    if (e.running) throw new Error(`${e.app.name} is open right now \u2013 quit it first`);
    const task = this.startTask(`Removing ${e.app.name}`, [{ id, label: e.app.name }]);
    this.step(task, id, "running");
    const r = await uninstallApp(e.app, e.detected, { onOutput: (s) => this.output(task, s) });
    await this.detect(e, this.globalRoot);
    if (r.ok) {
      e.newIn = null;
      this.seen.mark(id, null);
    }
    this.step(task, id, r.ok ? "done" : "failed");
    this.finishTask(task, r);
    return r;
  }
  /** Asks for a restart after termhub updated itself (cli.tsx starts the new version). */
  restart() {
    requestRestart();
  }
  // ───────────── What's new ─────────────
  /** The CHANGELOG sections of an app (or termhub: id 'termhub') that are new to you. */
  async whatsNew(id) {
    const isSelf = id === "termhub";
    const e = isSelf ? null : this.apps.get(id);
    if (!isSelf && !e) throw new Error(`There's no app called ${id}`);
    const name = isSelf ? "termhub" : e.app.name;
    const repo = isSelf ? REPO : e.app.repo;
    const installed = isSelf ? VERSION : e.detected?.state === "installed" ? e.detected.version : null;
    const latest = isSelf ? this.self.latest ?? null : e.latest ?? null;
    const newIn = isSelf ? this.self.newIn : e.newIn;
    if (this.opts.offline) throw new Error("Can't load the changelog offline");
    const sections = await fetchChangelog(rawUrl(repo, "CHANGELOG.md", this.env), this.opts.fetchImpl);
    if (!sections) throw new Error(`Couldn't load ${name}'s changelog \u2013 are you online?`);
    let picked;
    let title;
    if (installed && latest && compareVersions(latest, installed) > 0) {
      picked = sectionsBetween(sections, installed, latest);
      title = `What's new in ${name} ${latest} (you have ${installed})`;
    } else if (installed && newIn) {
      picked = sectionsBetween(sections, newIn.from, newIn.to);
      title = `What's new in ${name} ${newIn.to} (since ${newIn.from})`;
    } else {
      const v = installed ?? latest;
      picked = v ? sectionsBetween(sections, null, v) : sections.slice(0, 1);
      title = `${name} ${v ?? ""}`.trim();
    }
    if (!picked.length) picked = sections.slice(0, 1);
    if (isSelf) this.self.newIn = null;
    else e.newIn = null;
    this.changed();
    return { title, text: picked.length ? whatsNewText(name, picked) : `${name} has no changelog yet.` };
  }
};

// ../termcore/src/ui/commands/parse.ts
function parseCommand(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const match = /^\/(\S*)\s*([\s\S]*)$/.exec(trimmed);
  if (!match) return null;
  const name = (match[1] ?? "").toLowerCase();
  const rest = (match[2] ?? "").trim();
  return { name, args: tokenize(rest), rest };
}
function tokenize(text2) {
  const args = [];
  let current = "";
  let quote = null;
  let inToken = false;
  for (const ch of text2) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
    } else if (/\s/.test(ch)) {
      if (inToken) args.push(current);
      current = "";
      inToken = false;
    } else {
      current += ch;
      inToken = true;
    }
  }
  if (inToken) args.push(current);
  return args;
}

// ../termcore/src/ui/commands/registry.ts
var CommandRegistry = class {
  constructor(commands2, rules) {
    this.commands = commands2;
    this.rules = rules;
  }
  find(name) {
    const n = name.toLowerCase();
    return this.commands.find((c2) => c2.name === n || c2.aliases?.includes(n));
  }
  fits(c2, where) {
    return c2.scope === "global" || !this.rules || where === void 0 || this.rules.inScope(c2.scope, where);
  }
  /** Commands available here (all of them without a place). */
  available(where) {
    return this.commands.filter((c2) => this.fits(c2, where));
  }
  /** Commands available here, filtered by prefix. */
  suggest(prefix, where) {
    const p = prefix.toLowerCase();
    return this.available(where).filter((c2) => c2.name.startsWith(p) || c2.aliases?.some((a) => a.startsWith(p)));
  }
  /**
   * Runs an input as a command. Returns `false` if it isn't a command.
   * Errors always end up as a message in the UI – never as a crash.
   */
  async execute(input, ctx) {
    const parsed = parseCommand(input);
    if (!parsed) return false;
    const { ui } = ctx;
    if (!parsed.name) {
      ui.print("Type a command, e.g. /help", "error");
      return true;
    }
    const where = this.rules?.where(ctx);
    const cmd = this.available(where).find((c2) => c2.name === parsed.name || c2.aliases?.includes(parsed.name)) ?? this.find(parsed.name);
    if (!cmd) {
      ui.print(`Unknown command /${parsed.name} \u2013 all commands: /help`, "error");
      return true;
    }
    if (!this.fits(cmd, where)) {
      ui.print(this.rules.outOfScope(cmd.name, cmd.scope, where), "error");
      return true;
    }
    if (parsed.args.length < (cmd.minArgs ?? 0)) {
      ui.print(`Usage: /${cmd.name} ${cmd.usage ?? ""}`.trim(), "error");
      return true;
    }
    try {
      await cmd.run(ctx, parsed.args, parsed.rest);
    } catch (err2) {
      ui.print(`/${cmd.name} failed: ${err2.message}`, "error");
    }
    return true;
  }
};

// src/ui/tabs/FriendsTab.tsx
import { Box as Box9, Text as Text9, useInput as useInput4 } from "ink";
import { useState as useState5 } from "react";

// ../termcore/src/ui/format.ts
var pad = (n) => String(n).padStart(2, "0");
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function clock(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var daysAgo = (ts, now) => Math.round((startOfDay(now) - startOfDay(ts)) / 864e5);
function shortTime(ts, now = Date.now()) {
  const days = daysAgo(ts, now);
  const d = new Date(ts);
  if (days <= 0) return clock(ts);
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[d.getDay()];
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? date : `${date}, ${d.getFullYear()}`;
}
function lastSeen(ts, now = Date.now()) {
  if (!ts) return "offline";
  const min2 = Math.floor((now - ts) / 6e4);
  if (min2 < 1) return "last seen just now";
  if (min2 < 60) return `last seen ${min2} min ago`;
  const days = daysAgo(ts, now);
  if (days <= 0) return `last seen at ${clock(ts)}`;
  return `last seen ${shortTime(ts, now)}`;
}

// src/ui/components/List.tsx
import { Box as Box8, Text as Text8 } from "ink";
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
function visibleLines(lines, selected, height) {
  const selLine = lines.findIndex((l) => l.kind === "entry" && l.index === selected);
  const start2 = Math.max(0, Math.min(selLine - Math.floor(height / 2), lines.length - height));
  return lines.slice(start2, start2 + height);
}
function buildLines(sections, all) {
  const lines = [];
  for (const s of sections) {
    if (!s.entries.length && !s.empty && !s.show) continue;
    if (lines.length) lines.push({ kind: "gap" });
    lines.push({ kind: "section", title: s.title });
    for (const e of s.entries) lines.push({ kind: "entry", entry: e, index: all.indexOf(e) });
    if (!s.entries.length && s.empty) lines.push({ kind: "note", text: s.empty });
  }
  return lines;
}
function SectionTitle({ title }) {
  return /* @__PURE__ */ jsx8(Text8, { color: theme.dim, bold: true, wrap: "truncate-end", children: title.toUpperCase() });
}
function Note({ text: text2 }) {
  return /* @__PURE__ */ jsx8(Box8, { paddingLeft: 2, children: /* @__PURE__ */ jsx8(Text8, { color: theme.faint, wrap: "truncate-end", children: text2 }) });
}
function Pointer({ selected }) {
  return /* @__PURE__ */ jsx8(Box8, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx8(Text8, { color: theme.accent, children: selected ? icons.pointer : " " }) });
}
function Dot({ icon, color }) {
  return /* @__PURE__ */ jsx8(Box8, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx8(Text8, { color, children: icon }) });
}
function Card({ title, width, height, children, accent = false }) {
  return /* @__PURE__ */ jsx8(Box8, { flexDirection: "column", borderStyle: "round", borderColor: accent ? theme.accent : theme.border, paddingX: 1, width, height, overflow: "hidden", flexShrink: 0, children: /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", flexShrink: 0, children: [
    /* @__PURE__ */ jsx8(Text8, { bold: true, wrap: "truncate-end", children: title }),
    children
  ] }) });
}
function Field({ label, children, width = 10 }) {
  return /* @__PURE__ */ jsxs8(Box8, { children: [
    /* @__PURE__ */ jsx8(Box8, { width, flexShrink: 0, children: /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: label }) }),
    /* @__PURE__ */ jsx8(Box8, { flexShrink: 1, minWidth: 0, children: typeof children === "string" ? /* @__PURE__ */ jsx8(Text8, { wrap: "truncate-end", children }) : children })
  ] });
}
var SIDE_BY_SIDE = 84;
var PANEL_WIDTH = 40;
function splitLayout(width, height, panelRows) {
  const side = width >= SIDE_BY_SIDE;
  const panelHeight = side ? height : Math.min(panelRows, Math.max(0, height - 5));
  const showPanel = side || panelHeight >= 4;
  return {
    side,
    showPanel,
    listWidth: side ? width - PANEL_WIDTH - 1 : width,
    listHeight: side ? height : height - (showPanel ? panelHeight : 0),
    panelWidth: side ? PANEL_WIDTH : width,
    panelHeight
  };
}

// src/ui/format.ts
var appsLabel = (apps) => apps.join(" \xB7 ");
function presenceLine(f, now = Date.now()) {
  switch (f.state) {
    case "outgoing":
      return "request sent";
    case "declined":
      return "declined your request";
    case "blocked":
      return "blocked";
    case "incoming":
      return "wants to be friends";
    default:
      return f.online ? appsLabel(f.apps) : lastSeen(f.lastSeen, now);
  }
}

// src/ui/tabs/FriendsTab.tsx
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
function friendsHints(e) {
  const base = ["\u2191\u2193 select"];
  if (e?.type === "request") base.push("enter accept", "x decline", "b block");
  else if (e?.type === "nearby") base.push("enter add friend");
  else if (e?.type === "toggle") base.push("enter show/hide");
  else if (e?.type === "blocked") base.push("b unblock", "r rename", "d remove");
  else if (e?.type === "friend") {
    if (e.f.state === "accepted") base.push("enter whois");
    if (e.f.state === "declined") base.push("enter ask again");
    base.push("r rename", "d remove", "b block");
  }
  return [...base, "a add by IP"];
}
function whoisText(store, f) {
  const code = store.safetyCodeWith(f.id);
  const lines = [
    `### ${f.display}${f.alias ? ` _(${f.name})_` : ""}`,
    "",
    `- ID: \`${formatId(f.id, true)}\``,
    `- Your ID: \`${formatId(store.identity.id, true)}\``,
    `- ${f.online ? `Online in ${appsLabel(f.apps)}` : lastSeen(f.lastSeen)}`,
    ...f.ip ? [`- Address: ${f.ip}`] : [],
    ...statusText(f.status, f.statusMsg) ? [`- Status: ${statusText(f.status, f.statusMsg)}`] : [],
    "",
    "### Safety code",
    "",
    code ? `\`${code}\`

Compare it with ${f.display} in person or on the phone. If it's the same on both screens, nobody sits in the middle of your connections \u2013 in any app.` : `Not known yet \u2013 it appears once one of your apps has been connected to ${f.display}.`
  ];
  return lines.join("\n");
}
function FriendsTab({ store, width, height: full, actions, active, selectedKey, onSelect, footer, bottomRows }) {
  const height = Math.max(2, full - 1 - bottomRows);
  const data = store.friendsData();
  const [showBlocked, setShowBlocked] = useState5(false);
  const sections = {
    requests: data.requests.map((f) => ({ type: "request", key: `r:${f.id}`, f })),
    friends: data.friends.map((f) => ({ type: "friend", key: `f:${f.id}`, f })),
    nearby: data.nearby.map((p) => ({ type: "nearby", key: `n:${p.id}`, p })),
    blocked: data.blocked.length ? [{ type: "toggle", key: "toggle", count: data.blocked.length }, ...showBlocked ? data.blocked.map((f) => ({ type: "blocked", key: `b:${f.id}`, f })) : []] : []
  };
  const entries = [...sections.requests, ...sections.friends, ...sections.nearby, ...sections.blocked];
  let selected = entries.findIndex((e) => e.key === selectedKey);
  if (selected === -1) selected = 0;
  const current = entries[selected];
  const attempt = (fn) => {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((err2) => store.showToast(err2.message, "error"));
    } catch (err2) {
      store.showToast(err2.message, "error");
    }
  };
  const move = (d) => {
    const next = Math.max(0, Math.min(entries.length - 1, selected + d));
    if (entries[next]) onSelect(entries[next].key);
  };
  useWheel((dir) => move(dir), active);
  useInput4(
    (input, key) => {
      if (key.upArrow || input === "k") return move(-1);
      if (key.downArrow || input === "j") return move(1);
      if (key.pageUp) return move(-10);
      if (key.pageDown) return move(10);
      if (input === "a") {
        void actions.prompt("Add a friend by IP", { hint: "e.g. 192.168.1.20 \u2013 or with a port: 192.168.1.20:5050" }).then((v) => {
          if (v) void actions.runCommand(`/add ${v}`);
        });
        return;
      }
      if (!current) return;
      const f = current.type === "nearby" || current.type === "toggle" ? null : current.f;
      if (key.return) {
        if (current.type === "request") {
          attempt(() => store.accept(current.f.id));
          return onSelect(`f:${current.f.id}`);
        }
        if (current.type === "nearby") return attempt(() => store.requestNearby(current.p.id));
        if (current.type === "toggle") return setShowBlocked((s) => !s);
        if (current.type === "blocked") return store.showToast(`${current.f.display} is blocked \u2013 b unblocks`, "info");
        if (f?.state === "declined") return attempt(() => store.request(f.id));
        if (f?.state === "outgoing") return store.showToast(`Waiting for ${f.display} to accept your friend request`, "info");
        if (f) return actions.panel(`whois ${f.display}`, whoisText(store, f));
        return;
      }
      if (input === "x" && current.type === "request") return attempt(() => store.decline(current.f.id));
      if (!f) return;
      if (input === "r") {
        void actions.prompt(`Nickname for ${f.name}`, { hint: "Leave it empty to use their own name \u2013 it's the same in every app", initial: f.alias }).then((v) => {
          if (v !== null) attempt(() => store.rename(f.id, v));
        });
        return;
      }
      if (input === "d") {
        void actions.confirm(f.state === "incoming" ? `Decline ${f.display}'s request?` : `Remove ${f.display}? (in every app)`).then((ok) => {
          if (ok) attempt(() => f.state === "incoming" ? store.decline(f.id) : store.removeFriend(f.id));
        });
        return;
      }
      if (input === "b") {
        if (f.state === "blocked") return attempt(() => store.unblock(f.id));
        void actions.confirm(`Block ${f.display}? No app will accept a connection from them.`).then((ok) => {
          if (ok) attempt(() => store.block(f.id));
        });
      }
    },
    { isActive: active }
  );
  const panelRows = 13;
  const L = splitLayout(width, height, panelRows);
  const inner = L.listWidth - 2;
  const online = data.friends.filter((f) => f.state === "accepted" && f.online).length;
  const scanning = store.me.scanning;
  const lines = buildLines(
    [
      { title: `Requests \xB7 ${data.requests.length}`, entries: sections.requests },
      {
        title: data.friends.length ? `Friends \xB7 ${online} online` : "Friends",
        entries: sections.friends,
        empty: "No friends yet \u2013 add someone from Nearby, or press a"
      },
      { title: scanning ? "Nearby \xB7 searching the network \u2026" : "Nearby", entries: sections.nearby, empty: "Nobody else here has a suite app open right now" },
      { title: `Blocked \xB7 ${data.blocked.length}`, entries: sections.blocked }
    ],
    entries
  );
  const visible = visibleLines(lines, selected, L.listHeight);
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", width, height: full, children: [
    /* @__PURE__ */ jsxs9(Box9, { flexDirection: L.side ? "row" : "column", width, height, overflow: "hidden", children: [
      /* @__PURE__ */ jsx9(Box9, { flexDirection: "column", width: L.listWidth, height: L.listHeight, paddingX: 1, overflow: "hidden", flexShrink: 0, children: visible.map((l, i) => {
        if (l.kind === "gap") return /* @__PURE__ */ jsx9(Text9, { children: " " }, `g${i}`);
        if (l.kind === "section") return /* @__PURE__ */ jsx9(SectionTitle, { title: l.title }, `s${i}`);
        if (l.kind === "note") return /* @__PURE__ */ jsx9(Note, { text: l.text }, `n${i}`);
        return /* @__PURE__ */ jsx9(Row, { entry: l.entry, selected: l.index === selected, width: inner, open: showBlocked }, l.entry.key);
      }) }),
      L.showPanel ? /* @__PURE__ */ jsx9(Box9, { marginLeft: L.side ? 1 : 0, flexShrink: 0, height: L.panelHeight, overflow: "hidden", children: /* @__PURE__ */ jsx9(Detail, { store, entry: current, width: L.panelWidth, height: L.panelHeight }) }) : null
    ] }),
    footer(friendsHints(current))
  ] });
}
function Row({ entry, selected, width, open }) {
  const nameWidth = Math.min(20, Math.max(10, Math.floor(width * 0.32)));
  const nameCell = (text2, color) => /* @__PURE__ */ jsx9(Box9, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { bold: selected, color: selected ? theme.accent : color, wrap: "truncate-end", children: text2 }) });
  if (entry.type === "toggle") {
    return /* @__PURE__ */ jsxs9(Box9, { children: [
      /* @__PURE__ */ jsx9(Pointer, { selected }),
      /* @__PURE__ */ jsx9(Text9, { color: theme.dim, wrap: "truncate-end", children: open ? "\u25BE hide" : `\u25B8 show ${entry.count === 1 ? "the blocked person" : `${entry.count} blocked people`}` })
    ] });
  }
  if (entry.type === "nearby") {
    const p = entry.p;
    return /* @__PURE__ */ jsxs9(Box9, { children: [
      /* @__PURE__ */ jsx9(Pointer, { selected }),
      /* @__PURE__ */ jsx9(Dot, { icon: icons.online, color: theme.success }),
      nameCell(p.name),
      /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, wrap: "truncate-end", children: [
        appsLabel(p.apps),
        " \xB7 ",
        p.ip
      ] })
    ] });
  }
  const f = entry.f;
  if (entry.type === "request") {
    return /* @__PURE__ */ jsxs9(Box9, { children: [
      /* @__PURE__ */ jsx9(Pointer, { selected }),
      /* @__PURE__ */ jsx9(Dot, { icon: icons.request, color: theme.accent }),
      nameCell(f.display, personHex(f.id, f.color)),
      /* @__PURE__ */ jsx9(Text9, { wrap: "truncate-end", children: "wants to be friends" }),
      f.online ? /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, children: [
        " \xB7 ",
        appsLabel(f.apps)
      ] }) : null
    ] });
  }
  const accepted = f.state === "accepted";
  const dot = !accepted ? { icon: f.state === "blocked" ? icons.error : f.state === "declined" ? icons.error : icons.pending, color: f.state === "blocked" ? theme.error : theme.faint } : presenceDot({ online: f.online, away: f.away, status: f.status });
  const status = accepted && f.online ? statusText(f.status === "available" ? void 0 : f.status, f.statusMsg) : "";
  return /* @__PURE__ */ jsxs9(Box9, { children: [
    /* @__PURE__ */ jsx9(Pointer, { selected }),
    /* @__PURE__ */ jsx9(Dot, { icon: dot.icon, color: dot.color }),
    nameCell(f.display, accepted ? personHex(f.id, f.color) : void 0),
    /* @__PURE__ */ jsx9(Box9, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs9(Text9, { wrap: "truncate-end", children: [
      accepted && f.online ? /* @__PURE__ */ jsxs9(Text9, { color: theme.success, children: [
        icons.online,
        " "
      ] }) : null,
      /* @__PURE__ */ jsx9(Text9, { color: accepted && f.online ? void 0 : theme.dim, italic: !accepted, children: presenceLine(f) }),
      status ? /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, children: [
        " \xB7 ",
        status
      ] }) : null
    ] }) })
  ] });
}
function Detail({ store, entry, width, height }) {
  if (!entry || entry.type === "toggle") {
    const me = store.me;
    return /* @__PURE__ */ jsxs9(Card, { title: "Friends", width, height, children: [
      /* @__PURE__ */ jsx9(Text9, { color: theme.dim, wrap: "wrap", children: "Your friends are the same in termchat, keyrace, termdrop and here. Whatever you change in this tab \u2013 accepting, renaming, blocking \u2013 applies to every app right away." }),
      /* @__PURE__ */ jsx9(Text9, { children: " " }),
      /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, wrap: "wrap", children: [
        "Others on your network show up under Nearby. Not there? Press ",
        /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: "a" }),
        " and enter their IP."
      ] }),
      /* @__PURE__ */ jsx9(Text9, { children: " " }),
      /* @__PURE__ */ jsx9(Field, { label: "Yours", children: me.ips.length ? me.ips.join(", ") : "no network" })
    ] });
  }
  if (entry.type === "nearby") {
    const p = entry.p;
    return /* @__PURE__ */ jsxs9(Card, { title: p.name, width, height, children: [
      /* @__PURE__ */ jsx9(Field, { label: "ID", children: formatId(p.id) }),
      /* @__PURE__ */ jsx9(Field, { label: "Address", children: p.ip }),
      /* @__PURE__ */ jsx9(Field, { label: "Open", children: appsLabel(p.apps) }),
      /* @__PURE__ */ jsx9(Text9, { children: " " }),
      /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, wrap: "wrap", children: [
        "On your network, not a friend yet. ",
        /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: "enter" }),
        " sends a friend request \u2013 they see it in whichever app they have open."
      ] })
    ] });
  }
  const f = entry.f;
  const code = store.safetyCodeWith(f.id);
  const accepted = f.state === "accepted";
  const dot = presenceDot({ online: f.online, away: f.away, status: f.status });
  const state = {
    accepted: "friends",
    outgoing: "your request is waiting",
    incoming: "wants to be friends",
    declined: "declined your request",
    blocked: "blocked by you"
  };
  return /* @__PURE__ */ jsxs9(Card, { title: f.display, width, height, children: [
    f.alias ? /* @__PURE__ */ jsx9(Field, { label: "Name", children: f.name }) : null,
    /* @__PURE__ */ jsx9(Field, { label: "ID", children: formatId(f.id, true) }),
    /* @__PURE__ */ jsx9(Field, { label: "State", children: state[f.state] ?? f.state }),
    accepted || f.state === "incoming" ? /* @__PURE__ */ jsx9(Field, { label: "Online", children: f.online ? /* @__PURE__ */ jsxs9(Text9, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs9(Text9, { color: theme.success, children: [
        icons.online,
        " "
      ] }),
      appsLabel(f.apps)
    ] }) : /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: lastSeen(f.lastSeen) }) }) : null,
    accepted ? /* @__PURE__ */ jsx9(Field, { label: "Status", children: /* @__PURE__ */ jsxs9(Text9, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs9(Text9, { color: dot.color, children: [
        f.status === "available" ? icons.online : dot.icon,
        " "
      ] }),
      f.status === "dnd" ? "do not disturb" : f.status,
      f.statusMsg ? /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, children: [
        " \xB7 ",
        f.statusMsg
      ] }) : null
    ] }) }) : null,
    /* @__PURE__ */ jsx9(Field, { label: "Address", children: f.ip ?? "\u2013" }),
    /* @__PURE__ */ jsx9(Field, { label: "Alias", children: f.alias ?? "\u2013" }),
    /* @__PURE__ */ jsx9(Text9, { children: " " }),
    /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: "Safety code" }),
    /* @__PURE__ */ jsx9(Text9, { color: code ? theme.accent : theme.faint, wrap: "truncate-end", children: code ?? "once you were connected" }),
    /* @__PURE__ */ jsx9(Text9, { color: theme.faint, wrap: "truncate-end", children: "same on both screens = no one in the middle" })
  ] });
}

// src/ui/tabs/ProfileTab.tsx
import os6 from "os";
import path15 from "path";
import { Box as Box10, Text as Text10, useInput as useInput5 } from "ink";
import { useState as useState6 } from "react";
import { jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
var ROWS = [
  { id: "name", label: "Name", section: "Profile" },
  { id: "color", label: "Color", section: "Profile" },
  { id: "status", label: "Status", section: "Profile" },
  { id: "message", label: "Status message", section: "Profile" },
  { id: "id", label: "Your ID", section: "Identity" },
  { id: "export", label: "Export a backup \u2026", section: "Backup" },
  { id: "import", label: "Restore a backup \u2026", section: "Backup" }
];
var expandHome = (p) => path15.resolve(p.replace(/^~(?=$|[/\\])/, os6.homedir()));
var defaultBackupFile = (name, now = /* @__PURE__ */ new Date()) => path15.join(os6.homedir(), `termhub-backup-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "me"}-${now.toISOString().slice(0, 10)}.thb`);
async function newPassphrase(actions, store) {
  for (; ; ) {
    const first = await actions.secret("Passphrase for the backup", `At least ${MIN_PASSPHRASE} characters \u2013 without it the backup can't be opened`);
    if (first === null) return null;
    if ([...first].length < MIN_PASSPHRASE) {
      store.showToast(`The passphrase needs at least ${MIN_PASSPHRASE} characters`, "error");
      continue;
    }
    const second = await actions.secret("The same passphrase again");
    if (second === null) return null;
    if (second === first) return first;
    store.showToast("The two passphrases don't match \u2013 try again", "error");
  }
}
async function exportFlow(actions, store) {
  const file = await actions.prompt("Save the backup as", { hint: "Your identity, profile, friends and settings \u2013 no chats or other app data", initial: tildify(defaultBackupFile(store.profile.name)) });
  if (!file) return;
  const pass = await newPassphrase(actions, store);
  if (!pass) return;
  store.showToast("Encrypting \u2026");
  const target = expandHome(file);
  const s = store.exportBackup(target, pass);
  store.showToast(`Backup of ${s.name} with ${s.friends === 1 ? "1 friend" : `${s.friends} friends`} saved to ${tildify(target)}`, "success");
}
async function importFlow(actions, store) {
  const busy = await store.appsInTheWay();
  if (busy.length) {
    store.showToast(`Quit ${busy.join(", ")} first \u2013 a restore needs all apps closed`, "error");
    return;
  }
  const file = await actions.prompt("Restore which backup?", { hint: "The .thb file you exported (in any termhub)" });
  if (!file) return;
  const ok = await actions.confirm("This replaces your identity and friends on this computer. Go on?");
  if (!ok) return;
  const pass = await actions.secret("Passphrase of the backup");
  if (pass === null) return;
  store.showToast("Decrypting \u2026");
  const r = await store.importBackup(expandHome(file), pass);
  actions.print(
    `Restored ${r.summary.name} (${formatId(r.summary.id)}) with ${r.summary.friends === 1 ? "1 friend" : `${r.summary.friends} friends`}${r.savedTo ? ` \u2013 the previous profile is in ${tildify(r.savedTo)}` : ""}`,
    "success"
  );
  actions.reload();
}
var COLOR_OPTIONS = PROFILE_COLORS;
function ProfileTab({ store, width, height: full, actions, active, selectedKey, onSelect, footer, bottomRows }) {
  const height = Math.max(2, full - 1 - bottomRows);
  const profile = store.profile;
  const me = store.identity;
  let selected = ROWS.findIndex((r) => r.id === selectedKey);
  if (selected === -1) selected = 0;
  const current = ROWS[selected];
  const [picking, setPicking] = useState6(null);
  const myColor = profile.color ?? idHex(me.id);
  const run = (fn) => {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((err2) => store.showToast(err2.message, "error"));
    } catch (err2) {
      store.showToast(err2.message, "error");
    }
  };
  const stopPicking = () => {
    setPicking(null);
    actions.capture(false);
  };
  const move = (d) => onSelect(ROWS[Math.max(0, Math.min(ROWS.length - 1, selected + d))].id);
  useWheel((dir) => picking === null ? move(dir) : setPicking((p) => Math.max(0, Math.min(COLOR_OPTIONS.length - 1, (p ?? 0) + dir))), active);
  const activate = () => {
    switch (current.id) {
      case "name":
        return void actions.prompt("Your name", { hint: "Friends see it in every app", initial: profile.name }).then((v) => {
          if (v) run(() => void store.setName(v));
        });
      case "color": {
        const i = COLOR_OPTIONS.findIndex((c2) => c2.hex === profile.color);
        setPicking(i === -1 ? 0 : i);
        return actions.capture(true);
      }
      case "status":
        return void actions.pick(
          "Your status",
          ["available", "busy", "dnd"].map((s) => ({ id: s, label: STATUS_LABEL[s], hint: s === "dnd" ? "no pop-ups or notifications in any app" : void 0 })),
          profile.status
        ).then((v) => {
          if (v) run(() => store.setStatus(v));
        });
      case "message":
        return void actions.prompt("Status message", { hint: `Up to ${MAX_STATUS_MSG} characters, shown next to your name \u2013 empty clears it`, initial: profile.statusMsg }).then((v) => {
          if (v !== null) run(() => store.setStatusMsg(v));
        });
      case "id":
        return actions.panel("Your ID", idText(me.id));
      case "export":
        return run(() => exportFlow(actions, store));
      case "import":
        return run(() => importFlow(actions, store));
    }
  };
  useInput5(
    (input, key) => {
      if (picking !== null) {
        const n = COLOR_OPTIONS.length;
        if (key.leftArrow || input === "h" || key.upArrow) return setPicking((p) => ((p ?? 0) - 1 + n) % n);
        if (key.rightArrow || input === "l" || key.downArrow || key.tab) return setPicking((p) => ((p ?? 0) + 1) % n);
        if (key.escape) return stopPicking();
        if (key.return) {
          const c2 = COLOR_OPTIONS[picking];
          run(() => store.setColor(c2.hex));
          store.showToast(`Your color is ${c2.name} now \u2013 in every app`, "success");
          return stopPicking();
        }
        if (input === "c") {
          stopPicking();
          return void actions.prompt("Your color as #rrggbb", { hint: "e.g. #ff8800", initial: profile.color }).then((v) => {
            if (v) run(() => store.setColor(v));
          });
        }
        if (input === "0") {
          run(() => store.setColor(void 0));
          store.showToast("Your color comes from your ID again", "success");
          return stopPicking();
        }
        return;
      }
      if (key.upArrow || input === "k") return move(-1);
      if (key.downArrow || input === "j") return move(1);
      if (key.return) return activate();
      if (input === "e") return run(() => exportFlow(actions, store));
    },
    { isActive: active }
  );
  const previewColor = picking !== null ? COLOR_OPTIONS[picking].hex : myColor;
  const L = splitLayout(width, height, 12);
  const inner = L.listWidth - 2;
  const entries = ROWS;
  const lines = buildLines(
    ["Profile", "Identity", "Backup"].map((section) => ({ title: section, entries: ROWS.filter((r) => r.section === section) })),
    entries
  );
  const pickerRows = picking !== null ? swatchRows(COLOR_OPTIONS.length, inner - 4) + 1 : 0;
  const visible = visibleLines(lines, selected, L.listHeight - pickerRows);
  const dot = presenceDot({ online: true, status: profile.status });
  const value = (id) => {
    switch (id) {
      case "name":
        return /* @__PURE__ */ jsx10(Text10, { bold: true, color: previewColor, children: profile.name });
      case "color": {
        const named = PROFILE_COLORS.find((c2) => c2.hex === (picking !== null ? previewColor : profile.color));
        return /* @__PURE__ */ jsxs10(Text10, { children: [
          /* @__PURE__ */ jsx10(Text10, { color: previewColor, children: "\u2588\u2588 " }),
          /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: named ? named.name : profile.color && picking === null ? profile.color : picking !== null ? previewColor : "from your ID" })
        ] });
      }
      case "status":
        return /* @__PURE__ */ jsxs10(Text10, { children: [
          /* @__PURE__ */ jsxs10(Text10, { color: dot.color, children: [
            profile.status === "available" ? "\u25CF" : dot.icon,
            " "
          ] }),
          STATUS_LABEL[profile.status]
        ] });
      case "message":
        return profile.statusMsg ? /* @__PURE__ */ jsx10(Text10, { children: profile.statusMsg }) : /* @__PURE__ */ jsx10(Text10, { color: theme.faint, children: "\u2013" });
      case "id":
        return /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: formatId(me.id, true) });
      default:
        return null;
    }
  };
  const hints = picking !== null ? ["\u2190\u2192 choose", "enter apply", "c custom #rrggbb", "0 from my ID", "esc cancel"] : ["\u2191\u2193 select", current.id === "id" ? "enter details" : current.id.startsWith("ex") || current.id.startsWith("im") ? "enter start" : "enter change", "e export backup"];
  return /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", width, height: full, children: [
    /* @__PURE__ */ jsxs10(Box10, { flexDirection: L.side ? "row" : "column", width, height, overflow: "hidden", children: [
      /* @__PURE__ */ jsx10(Box10, { flexDirection: "column", width: L.listWidth, height: L.listHeight, paddingX: 1, overflow: "hidden", flexShrink: 0, children: visible.map((l, i) => {
        if (l.kind === "gap") return /* @__PURE__ */ jsx10(Text10, { children: " " }, `g${i}`);
        if (l.kind === "section") return /* @__PURE__ */ jsx10(SectionTitle, { title: l.title }, `s${i}`);
        if (l.kind === "note") return /* @__PURE__ */ jsx10(Note, { text: l.text }, `n${i}`);
        const r = l.entry;
        const sel = l.index === selected;
        return /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", children: [
          /* @__PURE__ */ jsxs10(Box10, { children: [
            /* @__PURE__ */ jsx10(Pointer, { selected: sel }),
            /* @__PURE__ */ jsx10(Box10, { width: 20, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { bold: sel, color: sel ? theme.accent : void 0, wrap: "truncate-end", children: r.label }) }),
            /* @__PURE__ */ jsx10(Box10, { flexShrink: 1, minWidth: 0, children: value(r.id) })
          ] }),
          r.id === "color" && picking !== null ? /* @__PURE__ */ jsxs10(Box10, { paddingLeft: 4, flexDirection: "column", children: [
            /* @__PURE__ */ jsx10(Swatches, { colors: COLOR_OPTIONS, selected: picking, width: inner - 4 }),
            /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: COLOR_OPTIONS[picking].name })
          ] }) : null
        ] }, r.id);
      }) }),
      L.showPanel ? /* @__PURE__ */ jsx10(Box10, { marginLeft: L.side ? 1 : 0, flexShrink: 0, height: L.panelHeight, overflow: "hidden", children: /* @__PURE__ */ jsx10(Explain, { row: current.id, store, width: L.panelWidth, height: L.panelHeight, color: previewColor }) }) : null
    ] }),
    footer(hints)
  ] });
}
function idText(id) {
  return [
    "### Your ID",
    "",
    `\`${formatId(id, true)}\``,
    "",
    "It comes from a secret key that never leaves this computer (and your encrypted backups). That's how friends recognize you in every app \u2013 even when your name or address changes.",
    "",
    "### Safety codes",
    "",
    "For every friend there is a safety code (Friends tab, or /whois). It is made from both of your keys: if the code is the same on both screens, nobody can sit in the middle of your connections. Compare it once in person or on the phone."
  ].join("\n");
}
function Explain({ row, store, width, height, color }) {
  const profile = store.profile;
  switch (row) {
    case "name":
    case "color":
      return /* @__PURE__ */ jsxs10(Card, { title: "How friends see you", width, height, children: [
        /* @__PURE__ */ jsx10(Text10, { children: " " }),
        /* @__PURE__ */ jsxs10(Text10, { children: [
          "  ",
          /* @__PURE__ */ jsx10(Text10, { bold: true, color, children: profile.name }),
          profile.status !== "available" ? /* @__PURE__ */ jsxs10(Text10, { color: theme.dim, children: [
            " \xB7 ",
            STATUS_LABEL[profile.status]
          ] }) : null
        ] }),
        /* @__PURE__ */ jsx10(Text10, { children: " " }),
        /* @__PURE__ */ jsx10(Text10, { color: theme.dim, wrap: "wrap", children: "Name and color are the same in termchat, keyrace and termdrop. Changes reach your friends right away \u2013 through every app you have open." })
      ] });
    case "status":
    case "message":
      return /* @__PURE__ */ jsxs10(Card, { title: "Status", width, height, children: [
        /* @__PURE__ */ jsxs10(Text10, { wrap: "wrap", children: [
          /* @__PURE__ */ jsx10(Text10, { color: theme.success, children: "\u25CF available" }),
          " ",
          /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: "\u2013 as usual" })
        ] }),
        /* @__PURE__ */ jsxs10(Text10, { wrap: "wrap", children: [
          /* @__PURE__ */ jsx10(Text10, { color: theme.warning, children: "\u25D1 busy" }),
          " ",
          /* @__PURE__ */ jsx10(Text10, { color: theme.dim, children: "\u2013 friends see it, nothing else changes" })
        ] }),
        /* @__PURE__ */ jsx10(Text10, { wrap: "wrap", children: /* @__PURE__ */ jsx10(Text10, { color: theme.error, children: "\u2298 do not disturb" }) }),
        /* @__PURE__ */ jsxs10(Text10, { color: theme.dim, wrap: "wrap", children: [
          "  ",
          "no desktop notifications or pop-ups in any app: termchat messages arrive quietly, keyrace invites and termdrop offers (even from trusted friends) wait under Requests."
        ] }),
        /* @__PURE__ */ jsx10(Text10, { children: " " }),
        /* @__PURE__ */ jsxs10(Text10, { color: theme.dim, wrap: "wrap", children: [
          "The message (up to ",
          MAX_STATUS_MSG,
          " characters) appears next to your name."
        ] })
      ] });
    case "id":
      return /* @__PURE__ */ jsxs10(Card, { title: "Your ID", width, height, children: [
        /* @__PURE__ */ jsx10(Text10, { color: theme.accent, wrap: "wrap", children: formatId(store.identity.id, true) }),
        /* @__PURE__ */ jsx10(Text10, { children: " " }),
        /* @__PURE__ */ jsx10(Text10, { color: theme.dim, wrap: "wrap", children: "Made from a secret key on this computer. Friends recognize you by it, in every app, whatever your name or address." }),
        /* @__PURE__ */ jsx10(Text10, { children: " " }),
        /* @__PURE__ */ jsx10(Text10, { color: theme.dim, wrap: "wrap", children: "Safety code: made from both your keys \u2013 the same on both screens means nobody is in the middle. See it per friend under Friends." })
      ] });
    case "export":
    case "import":
      return /* @__PURE__ */ jsxs10(Card, { title: "Backup", width, height, children: [
        /* @__PURE__ */ jsx10(Text10, { color: theme.dim, wrap: "wrap", children: "One file with your key, profile, friends and settings, encrypted with a passphrase (scrypt + ChaCha20-Poly1305). Chats, results and transfers aren't in it." }),
        /* @__PURE__ */ jsx10(Text10, { children: " " }),
        /* @__PURE__ */ jsx10(Text10, { color: theme.dim, wrap: "wrap", children: "Restoring it on another computer makes that computer you \u2013 with all your friends. It replaces the identity that was there (a copy goes to ~/.termhub/legacy). All apps have to be closed for it." }),
        /* @__PURE__ */ jsx10(Text10, { children: " " }),
        /* @__PURE__ */ jsx10(Field, { label: "CLI", children: /* @__PURE__ */ jsx10(Text10, { color: theme.accent, children: "termhub backup|restore <file>" }) })
      ] });
  }
}

// src/ui/commands.ts
function parseAddress(input) {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3}|[a-zA-Z0-9.-]+)(?::(\d{1,5}))?$/.exec(input.trim());
  if (!m) return null;
  const port = m[2] ? Number(m[2]) : void 0;
  if (port !== void 0 && (port < 1 || port > 65535)) return null;
  return { host: m[1], ...port ? { port } : {} };
}
function findApp(store, query) {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) throw new Error("Which app? e.g. termchat");
  const apps = store.appList();
  const exact = apps.find((e) => e.app.id === q || e.app.name.toLowerCase() === q);
  if (exact) return exact.app.id;
  const prefix = apps.filter((e) => e.app.id.startsWith(q));
  if (prefix.length === 1) return prefix[0].app.id;
  throw new Error(`No app called ${query} \u2013 there's ${apps.map((e) => e.app.id).join(", ")}`);
}
function findFriend(store, query) {
  const q = query.trim().toLowerCase().replace(/-/g, "");
  const all = store.contacts.all();
  const hit = all.find((c2) => (c2.alias ?? "").toLowerCase() === q || c2.name.toLowerCase() === q || c2.id.toLowerCase() === q) ?? all.filter((c2) => (c2.alias ?? c2.name).toLowerCase().startsWith(q) || c2.id.toLowerCase().startsWith(q))[0];
  if (!hit) throw new Error(`No friend called ${query}`);
  return store.friend(hit.id);
}
var HELP = `### termhub

The hub of termchat, keyrace and termdrop: profile, friends, shared settings and the apps.

### Everywhere

- \`tab\` / \`shift+tab\` or \`1\`\u2013\`4\` switch tabs \xB7 \`/\` commands \xB7 \`?\` this help \xB7 \`q\` quit

### Friends

- \`enter\` accept a request / add someone from Nearby / whois \xB7 \`x\` decline
- \`a\` add by IP \xB7 \`r\` nickname \xB7 \`d\` remove \xB7 \`b\` block or unblock

### Apps

- \`enter\` open the app here \u2013 quit it to come back \xB7 \`i\` install \xB7 \`u\` update \xB7 \`U\` update everything
- \`x\` remove (your data stays) \xB7 \`w\` what's new \xB7 \`r\` check again

### Profile and Settings

- \`enter\` change the selected line \xB7 \`e\` export a backup
- Everything here is shared: open apps take it right away.

### Commands

- \`/add <ip>[:port]\` \xB7 \`/whois <friend>\` \xB7 \`/name <name>\` \xB7 \`/color <color|#rrggbb|reset>\`
- \`/status <available|busy|dnd> [message]\` \xB7 \`/accent <color|default>\` \xB7 \`/animations <nonstop|brief|off>\`
- \`/notifications on|off\` \xB7 \`/open <app>\` \xB7 \`/install <app>\` \xB7 \`/update [all|<app>]\` \xB7 \`/uninstall <app>\`
- \`/whatsnew <app>\` \xB7 \`/backup\` \xB7 \`/restore\` \xB7 \`/reset\` \xB7 \`/id\` \xB7 \`/quit\``;
var commands = [
  { name: "help", aliases: ["?"], description: "Keys and commands", scope: "global", run: (ctx) => ctx.ui.panel("Help", HELP) },
  { name: "friends", description: "Friends tab", scope: "global", run: (ctx) => ctx.ui.tab("friends") },
  { name: "apps", description: "Apps tab", scope: "global", run: (ctx) => ctx.ui.tab("apps") },
  { name: "profile", description: "Profile tab", scope: "global", run: (ctx) => ctx.ui.tab("profile") },
  { name: "settings", description: "Settings tab", scope: "global", run: (ctx) => ctx.ui.tab("settings") },
  {
    name: "add",
    usage: "<ip>[:port]",
    description: "Add a friend by IP address",
    scope: "global",
    minArgs: 1,
    async run(ctx, args) {
      const a = parseAddress(args[0]);
      if (!a) throw new Error("Use an address like 192.168.1.20 or 192.168.1.20:5050");
      ctx.ui.print(`Connecting to ${a.host} \u2026`);
      await ctx.store.addByAddress(a.host, a.port);
    }
  },
  {
    name: "whois",
    usage: "<friend>",
    description: "ID, safety code and where a friend is online",
    scope: "global",
    minArgs: 1,
    run(ctx, _args, rest) {
      const f = findFriend(ctx.store, rest);
      ctx.ui.panel(`whois ${f.display}`, whoisText(ctx.store, f));
    }
  },
  { name: "id", description: "Your ID and what safety codes are", scope: "global", run: (ctx) => ctx.ui.panel("Your ID", idText(ctx.store.identity.id)) },
  {
    name: "name",
    usage: "<name>",
    description: "Change your name (every app)",
    scope: "global",
    minArgs: 1,
    run: (ctx, _a, rest) => void ctx.store.setName(rest)
  },
  {
    name: "color",
    usage: "<color|#rrggbb|reset>",
    description: "Your profile color",
    scope: "global",
    minArgs: 1,
    run(ctx, args) {
      if (args[0] === "reset") ctx.store.setColor(void 0);
      else ctx.store.setColor(args[0]);
      ctx.ui.print(args[0] === "reset" ? "Your color comes from your ID again" : `Your color is ${normalizeColor(args[0])} now`, "success");
    }
  },
  {
    name: "status",
    usage: "<available|busy|dnd> [message]",
    description: "Your status (and message)",
    scope: "global",
    minArgs: 1,
    run(ctx, args, rest) {
      const s = args[0].toLowerCase();
      if (!STATUSES.includes(s)) throw new Error("Status is available, busy or dnd");
      const msg = rest.slice(args[0].length).trim();
      ctx.store.setStatus(s, msg ? msg : void 0);
      ctx.ui.print(`You're ${s === "dnd" ? "in do not disturb" : s}${msg ? ` \xB7 ${msg}` : ""}`, "success");
    }
  },
  {
    name: "accent",
    usage: "<color|#rrggbb|default>",
    description: "Accent color of every app",
    scope: "global",
    minArgs: 1,
    run(ctx, args) {
      ctx.store.setAccent(args[0] === "default" ? void 0 : args[0]);
      ctx.ui.print("Accent changed \u2013 every open app takes it right away", "success");
    }
  },
  {
    name: "animations",
    usage: "<nonstop|brief|off>",
    description: "How much moves, in every app",
    scope: "global",
    minArgs: 1,
    run(ctx, args) {
      const m = args[0];
      if (!ANIMATIONS.includes(m)) throw new Error("Animations are nonstop, brief or off");
      ctx.store.setAnimations(m);
      ctx.ui.print(`Animations: ${m}`, "success");
    }
  },
  {
    name: "notifications",
    usage: "<on|off>",
    description: "Desktop notifications in every app",
    scope: "global",
    minArgs: 1,
    run(ctx, args) {
      if (args[0] !== "on" && args[0] !== "off") throw new Error("Use /notifications on or off");
      ctx.store.setNotifications(args[0] === "on");
      ctx.ui.print(`Desktop notifications ${args[0]}`, "success");
    }
  },
  {
    name: "reset",
    description: "Shared settings back to their defaults",
    scope: "global",
    async run(ctx) {
      if (await ctx.ui.confirm("Reset accent, animations and notifications for every app?")) ctx.store.resetSettings();
    }
  },
  {
    name: "open",
    usage: "<app>",
    description: "Open an app in this terminal",
    scope: "global",
    minArgs: 1,
    run(ctx, args) {
      const id = findApp(ctx.store, args[0]);
      ctx.store.launchRequest(id);
      ctx.ui.launch(id);
    }
  },
  {
    name: "install",
    usage: "<app>",
    description: "Install an app",
    scope: "global",
    minArgs: 1,
    async run(ctx, args) {
      const id = findApp(ctx.store, args[0]);
      ctx.ui.tab("apps");
      await ctx.store.install(id);
    }
  },
  {
    name: "update",
    usage: "[all|<app>]",
    description: "Update termhub, an app, or everything",
    scope: "global",
    async run(ctx, args) {
      ctx.ui.tab("apps");
      if (!args[0] || args[0] === "termhub") await ctx.store.updateTermhub();
      else if (args[0] === "all") await ctx.store.updateAll();
      else await ctx.store.update(findApp(ctx.store, args[0]));
    }
  },
  {
    name: "uninstall",
    aliases: ["remove"],
    usage: "<app>",
    description: "Remove an app (its data stays)",
    scope: "global",
    minArgs: 1,
    async run(ctx, args) {
      const id = findApp(ctx.store, args[0]);
      if (await ctx.ui.confirm(`Remove ${id}? Your profile, friends and its data stay.`)) {
        ctx.ui.tab("apps");
        await ctx.store.uninstall(id);
      }
    }
  },
  {
    name: "whatsnew",
    usage: "<app>",
    description: "What's new in an app (or termhub)",
    scope: "global",
    async run(ctx, args) {
      const id = !args[0] || args[0] === "termhub" ? "termhub" : findApp(ctx.store, args[0]);
      const w = await ctx.store.whatsNew(id);
      ctx.ui.panel(w.title, w.text);
    }
  },
  { name: "backup", description: "Export an encrypted backup of your identity", scope: "global", run: (ctx) => exportFlow(ctx.ui, ctx.store) },
  { name: "restore", description: "Restore a backup (replaces identity and friends)", scope: "global", run: (ctx) => importFlow(ctx.ui, ctx.store) },
  {
    name: "where",
    description: "Where termhub keeps its data",
    scope: "global",
    run(ctx) {
      const p = ctx.store.paths;
      ctx.ui.panel(
        "Data",
        `- Shared by all apps: \`${tildify(p.hub.dir)}\`
- termhub's own (catalog cache, log): \`${tildify(p.home)}\`
- Your ID: \`${formatId(ctx.store.identity.id, true)}\``
      );
    }
  },
  { name: "quit", aliases: ["exit", "q"], description: "Quit termhub", scope: "global", run: (ctx) => ctx.ui.quit() }
];
var registry = new CommandRegistry(commands);

// src/ui/components/Banner.tsx
import { Box as Box11, Text as Text11 } from "ink";
import chalk3 from "chalk";
import stringWidth2 from "string-width";

// ../termcore/src/ui/effects.ts
import chalk2 from "chalk";
import { useEffect as useEffect4, useState as useState7 } from "react";
var mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
var WHITE = [255, 255, 255];
var hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
var SHINE_SWEEP = 900;
var SHINE_HALF = 4;
var SHINE_EVERY = 6e3;
function shineColor(base, col, row, width, t) {
  const u = t / SHINE_SWEEP;
  if (u < 0 || u >= 1) return base;
  const center = (width + 2 * SHINE_HALF + 6) * u - SHINE_HALF - 6 + row;
  const strength = Math.max(0, 1 - Math.abs(col + 0.5 - center) / SHINE_HALF);
  return mix(base, WHITE, strength * 0.85);
}
var BRIEF_GLINTS = 2;
function useShine(active, mode = "brief", delay = 250) {
  const [t, setT] = useState7(-1);
  useEffect4(() => {
    if (!active || mode === "off") {
      setT(-1);
      return;
    }
    let sweep = null;
    let next = null;
    let played = 0;
    const play = () => {
      const t0 = Date.now();
      played++;
      sweep = setInterval(() => {
        const dt = Date.now() - t0;
        if (dt < SHINE_SWEEP) return setT(dt);
        if (sweep) clearInterval(sweep);
        sweep = null;
        setT(-1);
        if (mode === "nonstop" || played < BRIEF_GLINTS) next = setTimeout(play, SHINE_EVERY - SHINE_SWEEP);
      }, 33);
    };
    next = setTimeout(play, delay);
    return () => {
      if (next) clearTimeout(next);
      if (sweep) clearInterval(sweep);
    };
  }, [active, mode, delay]);
  return t;
}

// src/ui/components/Banner.tsx
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
var LOGO = [
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 ",
  "\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557",
  "   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D",
  "   \u2588\u2588\u2551   \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557",
  "   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D",
  "   \u255A\u2550\u255D   \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D     \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D "
];
var LOGO_SMALL = ["\u2580\u2588\u2580 \u2588\u2580\u2580 \u2588\u2580\u2588 \u2588\u2580\u2584\u2580\u2588 \u2588 \u2588 \u2588 \u2588 \u2588\u2584\u2584", " \u2588  \u2588\u2588\u2584 \u2588\u2580\u2584 \u2588 \u2580 \u2588 \u2588\u2580\u2588 \u2588\u2584\u2588 \u2588\u2584\u2588"];
var SMALL_HUB = 18;
var LOGO_WIDTH = stringWidth2(LOGO[0]);
function bannerCompact(width, rows) {
  return width < 80 || rows < 34;
}
function bannerHeight(compact2) {
  return (compact2 ? LOGO_SMALL.length : LOGO.length) + 1;
}
function paintLine(line, row, width, accent, mine, t, compact2) {
  let out2 = "";
  let col = 0;
  const shining = t >= 0 && t < SHINE_SWEEP;
  for (const ch of line) {
    if (ch === " ") {
      out2 += ch;
      col++;
      continue;
    }
    const isShadow = !compact2 && ch !== "\u2588";
    const hex = (compact2 ? col >= SMALL_HUB : isShadow) ? mine : accent;
    if (shining) {
      const [r, g, b] = shineColor(hexToRgb(hex), col, row, width, t);
      out2 += chalk3.rgb(Math.round(r), Math.round(g), Math.round(b))(ch);
    } else out2 += chalk3.hex(hex)(ch);
    col++;
  }
  return out2;
}
function Banner({ width, compact: compact2, color, animate = true, mode = "brief" }) {
  const t = useShine(animate, mode);
  const lines = compact2 ? LOGO_SMALL : LOGO;
  const w = Math.max(...lines.map((l) => stringWidth2(l)));
  return /* @__PURE__ */ jsxs11(Box11, { flexDirection: "column", width, alignItems: "center", flexShrink: 0, children: [
    lines.map((l, i) => /* @__PURE__ */ jsx11(Text11, { children: paintLine(l, i, w, theme.accent, color, t, compact2) }, i)),
    /* @__PURE__ */ jsx11(Text11, { children: " " })
  ] });
}

// src/ui/components/SecretPrompt.tsx
import { Text as Text12, useInput as useInput6 } from "ink";
import { useRef as useRef3, useState as useState8 } from "react";
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
var SECRET_HEIGHT = 6;
function SecretPrompt({ title, hint, width, onDone }) {
  const [value, setValue] = useState8("");
  const latest = useRef3("");
  const set = (v) => {
    latest.current = v;
    setValue(v);
  };
  useInput6((input, key) => {
    if (key.escape) return onDone(null);
    if (key.return) return onDone(latest.current);
    if (key.backspace || key.delete) return set([...latest.current].slice(0, -1).join(""));
    if (key.ctrl && input === "u") return set("");
    if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
    const clean = input.replace(/[\r\n\u0000-\u001f\u007f]/g, "");
    if (clean) set(latest.current + clean);
  });
  const n = [...value].length;
  return /* @__PURE__ */ jsxs12(DialogFrame, { width, children: [
    /* @__PURE__ */ jsx12(Text12, { bold: true, wrap: "truncate-end", children: title }),
    /* @__PURE__ */ jsx12(Text12, { color: theme.dim, wrap: "truncate-end", children: hint ?? " " }),
    /* @__PURE__ */ jsxs12(Text12, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx12(Text12, { color: theme.accent, children: "\u276F " }),
      "\u25CF".repeat(Math.min(n, Math.max(0, width - 8))),
      /* @__PURE__ */ jsx12(Text12, { inverse: true, children: " " })
    ] }),
    /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "enter confirm \xB7 esc cancel" })
  ] });
}

// src/ui/components/Tabs.tsx
import { Box as Box12, Text as Text13 } from "ink";
import { jsx as jsx13, jsxs as jsxs13 } from "react/jsx-runtime";
var TABS = ["friends", "apps", "profile", "settings"];
var TAB_LABEL = { friends: "Friends", apps: "Apps", profile: "Profile", settings: "Settings" };
var TABS_HEIGHT = 2;
function Tabs({ active, width, badges = {} }) {
  return /* @__PURE__ */ jsxs13(Box12, { flexDirection: "column", width, flexShrink: 0, children: [
    /* @__PURE__ */ jsxs13(Box12, { paddingX: 1, children: [
      TABS.map((id, i) => {
        const on = id === active;
        return /* @__PURE__ */ jsxs13(Box12, { marginRight: 1, children: [
          /* @__PURE__ */ jsx13(Text13, { backgroundColor: on ? theme.accent : void 0, color: on ? theme.onAccent : theme.dim, bold: on, children: ` ${TAB_LABEL[id]} ` }),
          badges[id] ? /* @__PURE__ */ jsxs13(Text13, { color: theme.accent, children: [
            badges[id],
            " "
          ] }) : null,
          i < TABS.length - 1 ? /* @__PURE__ */ jsx13(Text13, { color: theme.faint, children: " " }) : null
        ] }, id);
      }),
      /* @__PURE__ */ jsx13(Box12, { flexGrow: 1 }),
      width >= 72 ? /* @__PURE__ */ jsx13(Text13, { color: theme.faint, children: "tab/1-4 switch" }) : null
    ] }),
    /* @__PURE__ */ jsx13(Text13, { color: theme.faint, children: "\u2500".repeat(Math.max(0, width)) })
  ] });
}

// src/ui/components/TextPanel.tsx
import { Box as Box13, Text as Text14, useInput as useInput7 } from "ink";
import { useState as useState9 } from "react";

// ../termcore/src/ui/text.ts
import chalk4 from "chalk";
import wrapAnsi from "wrap-ansi";
function inline(text2) {
  return text2.replace(/`([^`]+)`/g, (_m, s) => chalk4.hex(theme.accent)(s)).replace(/\*\*([^*]+)\*\*/g, (_m, s) => chalk4.bold(s)).replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, (_m, pre, s) => pre + chalk4.hex(theme.dim)(s));
}
function renderText(text2, width) {
  const out2 = [];
  for (const raw of text2.split("\n")) {
    const h = /^#{1,6}\s+(.*)$/.exec(raw);
    if (h) {
      out2.push(chalk4.bold(inline(h[1])));
      continue;
    }
    const li = /^(\s*)[-*]\s+(.*)$/.exec(raw);
    if (li) {
      const indent = li[1].length;
      const body = wrapAnsi(inline(li[2]), Math.max(10, width - indent - 2), { hard: true }).split("\n");
      body.forEach((l, i) => out2.push(" ".repeat(indent) + (i === 0 ? chalk4.hex(theme.dim)("\u2022 ") : "  ") + l));
      continue;
    }
    if (!raw.trim()) {
      out2.push("");
      continue;
    }
    out2.push(...wrapAnsi(inline(raw), Math.max(10, width), { hard: true }).split("\n"));
  }
  return out2;
}

// src/ui/components/TextPanel.tsx
import { jsx as jsx14, jsxs as jsxs14 } from "react/jsx-runtime";
function TextPanel({ title, text: text2, width, height, onClose }) {
  const lines = renderText(text2, width - 6);
  const inner = Math.max(1, height - 4);
  const max2 = Math.max(0, lines.length - inner);
  const [top, setTop] = useState9(0);
  const scroll = (d) => setTop((t) => Math.max(0, Math.min(max2, t + d)));
  useWheel((dir) => scroll(dir * 3));
  useInput7((input, key) => {
    if (key.upArrow || input === "k") return scroll(-1);
    if (key.downArrow || input === "j") return scroll(1);
    if (key.pageUp) return scroll(-inner);
    if (key.pageDown || input === " ") return scroll(inner);
    if (key.escape || key.return || input === "q" || input === "w" || input === "?") onClose();
  });
  const shown = lines.slice(top, top + inner);
  return /* @__PURE__ */ jsxs14(Box13, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsxs14(Box13, { flexDirection: "column", borderStyle: "round", borderColor: theme.accent, paddingX: 2, width, height: height - 1, overflow: "hidden", children: [
      /* @__PURE__ */ jsx14(Text14, { bold: true, wrap: "truncate-end", children: title }),
      shown.map((l, i) => /* @__PURE__ */ jsx14(Text14, { wrap: "truncate-end", children: l || " " }, i))
    ] }),
    /* @__PURE__ */ jsx14(Box13, { paddingX: 1, children: /* @__PURE__ */ jsxs14(Text14, { color: theme.dim, wrap: "truncate-end", children: [
      max2 > 0 ? `\u2191\u2193 scroll (${Math.round(top / max2 * 100)}%) \xB7 ` : "",
      "esc close"
    ] }) })
  ] });
}

// src/ui/tabs/AppsTab.tsx
import { Box as Box15, Text as Text16, useInput as useInput8 } from "ink";

// src/ui/components/TaskPanel.tsx
import { Box as Box14, Text as Text15 } from "ink";
import { Fragment as Fragment4, jsx as jsx15, jsxs as jsxs15 } from "react/jsx-runtime";
var STEP = {
  waiting: { icon: "\xB7", color: theme.faint },
  running: { icon: "\u25D0", color: theme.accent },
  done: { icon: icons.done, color: theme.success },
  failed: { icon: icons.error, color: theme.error },
  skipped: { icon: "\u2013", color: theme.dim }
};
function taskPanelRows(task) {
  return 2 + 1 + task.steps.length + 1 + 6 + (task.running ? 0 : 2 + (task.hint ? 2 : 0));
}
function TaskPanel({ task, width, height }) {
  const inner = width - 4;
  const result = task.running ? 0 : 1 + (task.message ? task.message.split("\n").length : 0) + (task.hint ? 2 : 0);
  const logRows = Math.max(0, height - 2 - 1 - task.steps.length - 1 - result);
  const log = task.log.map((l) => sanitizeText(l).replace(/\t/g, " ")).filter((l, i, all) => l.trim() || i < all.length - 1).slice(-logRows);
  const done = !task.running;
  return /* @__PURE__ */ jsxs15(Box14, { flexDirection: "column", borderStyle: "round", borderColor: done ? task.ok ? theme.success : theme.error : theme.accent, paddingX: 1, width, height, overflow: "hidden", flexShrink: 0, children: [
    /* @__PURE__ */ jsxs15(Text15, { bold: true, wrap: "truncate-end", children: [
      task.title,
      task.running ? /* @__PURE__ */ jsx15(Text15, { color: theme.dim, children: " \u2026" }) : null
    ] }),
    task.steps.map((s) => /* @__PURE__ */ jsxs15(Box14, { children: [
      /* @__PURE__ */ jsx15(Box14, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx15(Text15, { color: STEP[s.status].color, children: STEP[s.status].icon }) }),
      /* @__PURE__ */ jsxs15(Text15, { wrap: "truncate-end", children: [
        s.label,
        s.note ? /* @__PURE__ */ jsxs15(Text15, { color: theme.dim, children: [
          " \xB7 ",
          s.note
        ] }) : null
      ] })
    ] }, s.id)),
    /* @__PURE__ */ jsx15(Text15, { color: theme.faint, children: "\u2500".repeat(Math.max(0, inner)) }),
    log.map((l, i) => /* @__PURE__ */ jsx15(Text15, { color: theme.dim, wrap: "truncate-end", children: l || " " }, i)),
    done ? /* @__PURE__ */ jsxs15(Fragment4, { children: [
      /* @__PURE__ */ jsx15(Box14, { flexGrow: 1 }),
      task.message?.split("\n").map((l, i) => /* @__PURE__ */ jsxs15(Text15, { color: i === 0 ? task.ok ? theme.success : theme.error : theme.dim, wrap: "truncate-end", children: [
        i === 0 ? `${task.ok ? icons.done : icons.error} ` : "  ",
        l
      ] }, i)),
      task.hint ? /* @__PURE__ */ jsx15(Text15, { color: theme.warning, wrap: "wrap", children: task.hint }) : null,
      /* @__PURE__ */ jsx15(Text15, { color: theme.dim, children: "esc close" })
    ] }) : null
  ] });
}

// src/ui/tabs/AppsTab.tsx
import { jsx as jsx16, jsxs as jsxs16 } from "react/jsx-runtime";
var statusColor = (s) => s.kind === "update" ? theme.accent : s.kind === "current" ? theme.success : s.kind === "broken" ? theme.error : theme.faint;
function appsHints(row, store) {
  const task = store.task;
  if (task && !task.running) return ["esc close", ...task.restart ? ["enter restart termhub"] : []];
  if (task?.running) return [`${task.title} \u2026`];
  const base = ["\u2191\u2193 select"];
  if (row?.type === "self") {
    base.push(store.updateAvailable ? "u update" : "u check", "w what\u2019s new");
  } else if (row) {
    const s = row.e.status;
    if (s.kind === "missing") base.push("i install");
    else {
      if (s.kind !== "broken") base.push("enter open");
      base.push(s.kind === "update" || s.kind === "broken" ? "u update" : "u check", "x remove");
    }
    base.push("w what\u2019s new");
  }
  return [...base, "U update all", "r refresh"];
}
function AppsTab({ store, width, height: full, actions, active, selectedKey, onSelect, footer, bottomRows }) {
  const height = Math.max(2, full - 1 - bottomRows);
  const entries = store.appList();
  const rows = [...entries.map((e) => ({ type: "app", key: e.app.id, e })), { type: "self", key: "termhub" }];
  let selected = rows.findIndex((r) => r.key === selectedKey);
  if (selected === -1) selected = 0;
  const current = rows[selected];
  const task = store.task;
  const run = (fn) => {
    fn().catch((err2) => store.showToast(err2.message, "error"));
  };
  const move = (d) => {
    const next = Math.max(0, Math.min(rows.length - 1, selected + d));
    onSelect(rows[next].key);
  };
  useWheel((dir) => move(dir), active && !task);
  const whatsNew = (id) => run(async () => {
    store.showToast("Loading the changelog \u2026");
    const w = await store.whatsNew(id);
    actions.panel(w.title, w.text);
  });
  useInput8(
    (input, key) => {
      if (task) {
        if (task.running) return;
        if (key.return && task.restart) {
          store.restart();
          return actions.quit();
        }
        if (key.escape || key.return) store.dismissTask();
        return;
      }
      if (key.upArrow || input === "k") return move(-1);
      if (key.downArrow || input === "j") return move(1);
      if (input === "U") return run(() => store.updateAll());
      if (input === "r") {
        store.showToast("Checking installed apps and versions \u2026");
        return run(() => store.refreshApps({ catalog: true, latest: true }));
      }
      if (!current) return;
      if (current.type === "self") {
        if (key.return) return store.showToast("That's this app \u2013 you're in it", "info");
        if (input === "u") return run(() => store.updateTermhub());
        if (input === "w") return whatsNew("termhub");
        return;
      }
      const e = current.e;
      const id = e.app.id;
      if (key.return) {
        try {
          store.launchRequest(id);
          actions.launch(id);
        } catch (err2) {
          store.showToast(err2.message, "error");
        }
        return;
      }
      if (input === "i") return run(() => store.install(id));
      if (input === "u") {
        if (e.status.kind === "current" && e.latest !== void 0) return store.showToast(`${e.app.name} ${e.status.version} is the newest version`, "success");
        return run(() => store.update(id));
      }
      if (input === "x") {
        if (e.status.kind === "missing") return store.showToast(`${e.app.name} isn't installed`, "info");
        void actions.confirm(`Remove ${e.app.name}? Your profile, friends and ${e.app.name}'s data stay.`).then((ok) => {
          if (ok) run(() => store.uninstall(id));
        });
        return;
      }
      if (input === "w") return whatsNew(id);
    },
    { isActive: active }
  );
  const panelRows = task ? Math.max(taskPanelRows(task), 12) : 12;
  const L = splitLayout(width, height, panelRows);
  const inner = L.listWidth - 2;
  const avail = entries.filter((e) => e.status.kind === "update").length;
  const source = store.catalog.source === "network" ? "" : store.catalog.source === "cache" ? " \xB7 offline, from the cache" : " \xB7 offline, built-in list";
  return /* @__PURE__ */ jsxs16(Box15, { flexDirection: "column", width, height: full, children: [
    /* @__PURE__ */ jsxs16(Box15, { flexDirection: L.side ? "row" : "column", width, height, overflow: "hidden", children: [
      /* @__PURE__ */ jsxs16(Box15, { flexDirection: "column", width: L.listWidth, height: L.listHeight, paddingX: 1, overflow: "hidden", flexShrink: 0, children: [
        /* @__PURE__ */ jsx16(SectionTitle, { title: `Apps${avail ? ` \xB7 ${avail} update${avail === 1 ? "" : "s"}` : ""}${source}` }),
        windowRows(rows, selected, L.listHeight - 1).map((r) => /* @__PURE__ */ jsx16(AppRow, { row: r, store, selected: r.key === rows[selected]?.key, width: inner, gap: L.listHeight - 1 > rows.length }, r.key)),
        L.listHeight - rows.length - 2 >= 2 ? /* @__PURE__ */ jsx16(Box15, { marginTop: 1, paddingLeft: 2, children: /* @__PURE__ */ jsx16(Text16, { color: theme.faint, wrap: "truncate-end", children: "enter opens an app right here \u2013 quit it to come back" }) }) : null
      ] }),
      L.showPanel ? /* @__PURE__ */ jsx16(Box15, { marginLeft: L.side ? 1 : 0, flexShrink: 0, height: L.panelHeight, overflow: "hidden", children: task ? /* @__PURE__ */ jsx16(TaskPanel, { task, width: L.panelWidth, height: L.panelHeight }) : /* @__PURE__ */ jsx16(Detail2, { store, row: current, width: L.panelWidth, height: L.panelHeight }) }) : null
    ] }),
    footer(appsHints(current, store))
  ] });
}
function windowRows(rows, selected, height) {
  if (rows.length <= height) return rows;
  const start2 = Math.max(0, Math.min(selected - Math.floor(height / 2), rows.length - height));
  return rows.slice(start2, start2 + height);
}
function AppRow({ row, store, selected, width, gap }) {
  const nameWidth = 12;
  if (row.type === "self") {
    const up = store.updateAvailable;
    return /* @__PURE__ */ jsxs16(Box15, { marginTop: gap ? 1 : 0, children: [
      /* @__PURE__ */ jsx16(Pointer, { selected }),
      /* @__PURE__ */ jsx16(Box15, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx16(Text16, { color: theme.accent, children: "\u2302" }) }),
      /* @__PURE__ */ jsx16(Box15, { width: nameWidth + 7, flexShrink: 0, children: /* @__PURE__ */ jsxs16(Text16, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: [
        "termhub ",
        /* @__PURE__ */ jsx16(Text16, { color: theme.dim, children: "(this app)" })
      ] }) }),
      /* @__PURE__ */ jsxs16(Text16, { color: up ? theme.accent : theme.success, wrap: "truncate-end", children: [
        up ? `\u2B06 ${VERSION} \u2192 ${up}` : `\u2713 ${VERSION}`,
        store.self.newIn ? /* @__PURE__ */ jsxs16(Text16, { color: theme.dim, children: [
          " \xB7 new in ",
          store.self.newIn.to
        ] }) : null
      ] })
    ] });
  }
  const e = row.e;
  const checking = e.detected === void 0;
  const label = checking ? "checking \u2026" : statusLabel(e.status);
  const statusWidth = Math.min(22, Math.max(12, label.length + 1));
  return /* @__PURE__ */ jsxs16(Box15, { children: [
    /* @__PURE__ */ jsx16(Pointer, { selected }),
    /* @__PURE__ */ jsx16(Box15, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx16(Text16, { color: theme.accent, children: e.app.icon ?? "\xB7" }) }),
    /* @__PURE__ */ jsx16(Box15, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx16(Text16, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: e.app.name }) }),
    /* @__PURE__ */ jsx16(Box15, { width: statusWidth, flexShrink: 0, children: /* @__PURE__ */ jsx16(Text16, { color: checking ? theme.faint : statusColor(e.status), wrap: "truncate-end", children: label }) }),
    /* @__PURE__ */ jsx16(Box15, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs16(Text16, { wrap: "truncate-end", children: [
      e.running ? /* @__PURE__ */ jsxs16(Text16, { color: theme.success, children: [
        icons.online,
        " running "
      ] }) : null,
      e.newIn ? /* @__PURE__ */ jsxs16(Text16, { color: theme.accent, children: [
        "new in ",
        e.newIn.to,
        " "
      ] }) : null,
      width >= 70 ? /* @__PURE__ */ jsx16(Text16, { color: theme.dim, children: e.app.description }) : null
    ] }) })
  ] });
}
function Detail2({ store, row, width, height }) {
  if (!row) return null;
  if (row.type === "self") {
    const up = store.updateAvailable;
    return /* @__PURE__ */ jsxs16(Card, { title: "termhub", width, height, children: [
      /* @__PURE__ */ jsx16(Text16, { color: theme.dim, wrap: "wrap", children: "This app: your profile, friends and settings for the whole suite, and the launcher." }),
      /* @__PURE__ */ jsx16(Text16, { children: " " }),
      /* @__PURE__ */ jsx16(Field, { label: "Installed", children: VERSION }),
      /* @__PURE__ */ jsx16(Field, { label: "Newest", children: store.self.latest === void 0 ? "checking \u2026" : store.self.latest ?? "unknown (offline?)" }),
      /* @__PURE__ */ jsx16(Field, { label: "Runs from", children: store.self.kind === "npm" ? "npm install" : "a source folder" }),
      /* @__PURE__ */ jsx16(Text16, { children: " " }),
      up ? /* @__PURE__ */ jsxs16(Text16, { color: theme.accent, wrap: "wrap", children: [
        VERSION,
        " \u2192 ",
        up,
        ": u updates termhub (then restart it). U updates every app and termhub last."
      ] }) : /* @__PURE__ */ jsx16(Text16, { color: theme.dim, children: "Up to date." })
    ] });
  }
  const e = row.e;
  const d = e.detected;
  const main2 = d?.state === "installed" ? d.main : null;
  const where = main2 ? main2.kind === "global" ? "npm's global folder" : main2.kind === "local" ? tildify(main2.where.replace(/[/\\]node_modules[/\\][^/\\]+$/, "")) : tildify(main2.where) : "\u2013";
  const node = e.app.node ? `Node.js ${e.app.node}+` : "any";
  return /* @__PURE__ */ jsxs16(Card, { title: `${e.app.icon ? `${e.app.icon} ` : ""}${e.app.name}`, width, height, children: [
    /* @__PURE__ */ jsx16(Text16, { color: theme.dim, wrap: "wrap", children: e.app.description || " " }),
    /* @__PURE__ */ jsx16(Text16, { children: " " }),
    /* @__PURE__ */ jsx16(Field, { label: "Installed", children: d === void 0 ? "checking \u2026" : d.state === "installed" ? d.version : d.state === "broken" ? "broken" : "no" }),
    /* @__PURE__ */ jsx16(Field, { label: "Newest", children: e.latest === void 0 ? "checking \u2026" : e.latest ?? "unknown (offline?)" }),
    /* @__PURE__ */ jsx16(Field, { label: "Where", children: where }),
    /* @__PURE__ */ jsx16(Field, { label: "Needs", children: node }),
    /* @__PURE__ */ jsx16(Field, { label: "Repo", children: e.app.repo }),
    /* @__PURE__ */ jsx16(Text16, { children: " " }),
    d?.state === "broken" ? /* @__PURE__ */ jsxs16(Text16, { color: theme.error, wrap: "wrap", children: [
      d.reason,
      ". u installs it again."
    ] }) : e.running ? /* @__PURE__ */ jsxs16(Text16, { color: theme.success, wrap: "wrap", children: [
      icons.online,
      " Open in another window right now \u2013 it can't be opened, updated or removed here until you quit it."
    ] }) : e.newIn ? /* @__PURE__ */ jsxs16(Text16, { color: theme.accent, wrap: "wrap", children: [
      "New in ",
      e.newIn.to,
      " (you had ",
      e.newIn.from,
      ") \u2013 w shows what changed."
    ] }) : e.status.kind === "update" ? /* @__PURE__ */ jsxs16(Text16, { color: theme.accent, wrap: "wrap", children: [
      e.status.version,
      " \u2192 ",
      e.status.latest,
      ": u updates it, w shows what's new."
    ] }) : e.status.kind === "missing" ? /* @__PURE__ */ jsx16(Text16, { color: theme.dim, wrap: "wrap", children: "i installs it from GitHub \u2013 no sudo needed." }) : /* @__PURE__ */ jsx16(Text16, { color: theme.dim, wrap: "wrap", children: "enter opens it in this terminal." })
  ] });
}

// src/ui/tabs/SettingsTab.tsx
import { Box as Box17, Text as Text18, useInput as useInput9 } from "ink";
import { useState as useState10 } from "react";

// src/ui/components/ThemePreview.tsx
import { Box as Box16, Text as Text17 } from "ink";
import { jsx as jsx17, jsxs as jsxs17 } from "react/jsx-runtime";
var PREVIEW_ROWS = 9;
function ThemePreview({ accent, width, name, nameColor }) {
  const inner = Math.max(10, width - 4);
  const bar = Math.max(4, inner - 12);
  const filled = Math.round(bar * 0.62);
  return /* @__PURE__ */ jsxs17(Box16, { flexDirection: "column", borderStyle: "round", borderColor: theme.border, paddingX: 1, width, flexShrink: 0, children: [
    /* @__PURE__ */ jsxs17(Text17, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx17(Text17, { backgroundColor: accent, color: theme.onAccent, bold: true, children: " termchat " }),
      /* @__PURE__ */ jsx17(Text17, { color: theme.faint, children: " v2.1.0 " }),
      /* @__PURE__ */ jsx17(Text17, { bold: true, color: nameColor, children: name })
    ] }),
    /* @__PURE__ */ jsx17(Text17, { color: theme.faint, children: "\u2500".repeat(inner) }),
    /* @__PURE__ */ jsxs17(Text17, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs17(Text17, { color: accent, children: [
        icons.pointer,
        " "
      ] }),
      /* @__PURE__ */ jsxs17(Text17, { color: theme.success, children: [
        icons.online,
        " "
      ] }),
      /* @__PURE__ */ jsx17(Text17, { color: accent, bold: true, children: "Sam" }),
      /* @__PURE__ */ jsx17(Text17, { color: theme.dim, children: " \xB7 see you at 4?" })
    ] }),
    /* @__PURE__ */ jsxs17(Text17, { wrap: "truncate-end", children: [
      "  ",
      /* @__PURE__ */ jsxs17(Text17, { color: theme.faint, children: [
        icons.offline,
        " "
      ] }),
      "Robin",
      /* @__PURE__ */ jsx17(Text17, { color: theme.dim, children: " \xB7 last seen 2h ago" })
    ] }),
    /* @__PURE__ */ jsx17(Text17, { children: " " }),
    /* @__PURE__ */ jsxs17(Text17, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx17(Text17, { color: accent, children: "\u2588".repeat(filled) }),
      /* @__PURE__ */ jsx17(Text17, { color: theme.faint, children: "\u2591".repeat(bar - filled) }),
      /* @__PURE__ */ jsx17(Text17, { color: theme.dim, children: " 62% " }),
      /* @__PURE__ */ jsx17(Text17, { color: accent, children: "/help" })
    ] }),
    /* @__PURE__ */ jsxs17(Text17, { color: theme.dim, wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx17(Text17, { color: accent, children: "enter" }),
      " open \xB7 ",
      /* @__PURE__ */ jsx17(Text17, { color: accent, children: "/" }),
      " commands"
    ] })
  ] });
}

// src/ui/tabs/SettingsTab.tsx
import { Fragment as Fragment5, jsx as jsx18, jsxs as jsxs18 } from "react/jsx-runtime";
var ROWS2 = [
  { id: "accent", label: "Accent color", section: "Look" },
  { id: "animations", label: "Animations", section: "Look" },
  { id: "notifications", label: "Desktop notifications", section: "Notifications" },
  { id: "reset", label: "Reset to defaults", section: "All settings" }
];
var ACCENTS = [{ name: "claude orange (default)", hex: DEFAULT_ACCENT.toLowerCase() }, ...PROFILE_COLORS];
var ANIMATION_HINT = {
  nonstop: "the logo glints every few seconds, termchat's <rgb>/<shine> keep moving",
  brief: "a glint when a screen appears, then everything rests",
  off: "nothing moves"
};
function SettingsTab({ store, width, height: full, actions, active, selectedKey, onSelect, footer, bottomRows }) {
  const height = Math.max(2, full - 1 - bottomRows);
  const settings = store.settings;
  let selected = ROWS2.findIndex((r) => r.id === selectedKey);
  if (selected === -1) selected = 0;
  const current = ROWS2[selected];
  const [picking, setPicking] = useState10(null);
  const accent = (settings.accent ?? DEFAULT_ACCENT).toLowerCase();
  const run = (fn) => {
    try {
      fn();
    } catch (err2) {
      store.showToast(err2.message, "error");
    }
  };
  const stop = () => {
    setPicking(null);
    actions.capture(false);
  };
  const move = (d) => onSelect(ROWS2[Math.max(0, Math.min(ROWS2.length - 1, selected + d))].id);
  useWheel((dir) => picking === null ? move(dir) : setPicking((p) => Math.max(0, Math.min(ACCENTS.length - 1, (p ?? 0) + dir))), active);
  const activate = () => {
    switch (current.id) {
      case "accent": {
        const i = ACCENTS.findIndex((c2) => c2.hex === accent);
        setPicking(i === -1 ? 0 : i);
        return actions.capture(true);
      }
      case "animations":
        return void actions.pick(
          "Animations",
          ["nonstop", "brief", "off"].map((m) => ({ id: m, label: m, hint: ANIMATION_HINT[m] })),
          settings.animations
        ).then((v) => {
          if (v) run(() => store.setAnimations(v));
        });
      case "notifications":
        run(() => store.setNotifications(!settings.notifications));
        return store.showToast(`Desktop notifications ${settings.notifications ? "off" : "on"} \u2013 in every app`, "success");
      case "reset":
        return void actions.confirm("Reset accent, animations and notifications to their defaults (for every app)?").then((ok) => {
          if (ok) run(() => store.resetSettings());
        });
    }
  };
  useInput9(
    (input, key) => {
      if (picking !== null) {
        const n = ACCENTS.length;
        if (key.leftArrow || input === "h" || key.upArrow) return setPicking((p) => ((p ?? 0) - 1 + n) % n);
        if (key.rightArrow || input === "l" || key.downArrow || key.tab) return setPicking((p) => ((p ?? 0) + 1) % n);
        if (key.escape) return stop();
        if (key.return) {
          const c2 = ACCENTS[picking];
          run(() => store.setAccent(picking === 0 ? void 0 : c2.hex));
          store.showToast(`Accent: ${c2.name} \u2013 every open app takes it right away`, "success");
          return stop();
        }
        if (input === "c") {
          stop();
          return void actions.prompt("Accent color as #rrggbb", { hint: "e.g. #ff8800", initial: settings.accent }).then((v) => {
            if (v) run(() => store.setAccent(v));
          });
        }
        return;
      }
      if (key.upArrow || input === "k") return move(-1);
      if (key.downArrow || input === "j") return move(1);
      if (key.return || input === " " && current.id === "notifications") return activate();
    },
    { isActive: active }
  );
  const previewAccent = picking !== null ? ACCENTS[picking].hex : accent;
  const L = splitLayout(width, height, PREVIEW_ROWS + 4);
  const inner = L.listWidth - 2;
  const lines = buildLines(
    ["Look", "Notifications", "All settings"].map((section) => ({ title: section, entries: ROWS2.filter((r) => r.section === section) })),
    ROWS2
  );
  const pickerRows = picking !== null ? swatchRows(ACCENTS.length, inner - 4) + 1 : 0;
  const visible = visibleLines(lines, selected, L.listHeight - pickerRows);
  const value = (id) => {
    switch (id) {
      case "accent": {
        const named = ACCENTS.find((c2) => c2.hex === previewAccent);
        return /* @__PURE__ */ jsxs18(Text18, { children: [
          /* @__PURE__ */ jsx18(Text18, { color: previewAccent, children: "\u2588\u2588 " }),
          /* @__PURE__ */ jsx18(Text18, { color: theme.dim, children: named?.name ?? previewAccent })
        ] });
      }
      case "animations":
        return /* @__PURE__ */ jsx18(Text18, { children: settings.animations });
      case "notifications":
        return /* @__PURE__ */ jsx18(Text18, { color: settings.notifications ? theme.success : theme.dim, children: settings.notifications ? "on" : "off" });
      default:
        return null;
    }
  };
  const hints = picking !== null ? ["\u2190\u2192 choose", "enter apply", "c custom #rrggbb", "esc cancel"] : ["\u2191\u2193 select", current.id === "notifications" ? "enter toggle" : current.id === "reset" ? "enter reset" : "enter change"];
  return /* @__PURE__ */ jsxs18(Box17, { flexDirection: "column", width, height: full, children: [
    /* @__PURE__ */ jsxs18(Box17, { flexDirection: L.side ? "row" : "column", width, height, overflow: "hidden", children: [
      /* @__PURE__ */ jsx18(Box17, { flexDirection: "column", width: L.listWidth, height: L.listHeight, paddingX: 1, overflow: "hidden", flexShrink: 0, children: visible.map((l, i) => {
        if (l.kind === "gap") return /* @__PURE__ */ jsx18(Text18, { children: " " }, `g${i}`);
        if (l.kind === "section") return /* @__PURE__ */ jsx18(SectionTitle, { title: l.title }, `s${i}`);
        if (l.kind === "note") return /* @__PURE__ */ jsx18(Note, { text: l.text }, `n${i}`);
        const r = l.entry;
        const sel = l.index === selected;
        return /* @__PURE__ */ jsxs18(Box17, { flexDirection: "column", children: [
          /* @__PURE__ */ jsxs18(Box17, { children: [
            /* @__PURE__ */ jsx18(Pointer, { selected: sel }),
            /* @__PURE__ */ jsx18(Box17, { width: 24, flexShrink: 0, children: /* @__PURE__ */ jsx18(Text18, { bold: sel, color: sel ? theme.accent : void 0, wrap: "truncate-end", children: r.label }) }),
            /* @__PURE__ */ jsx18(Box17, { flexShrink: 1, minWidth: 0, children: value(r.id) })
          ] }),
          r.id === "accent" && picking !== null ? /* @__PURE__ */ jsxs18(Box17, { paddingLeft: 4, flexDirection: "column", children: [
            /* @__PURE__ */ jsx18(Swatches, { colors: ACCENTS, selected: picking, width: inner - 4 }),
            /* @__PURE__ */ jsx18(Text18, { color: theme.dim, children: ACCENTS[picking].name })
          ] }) : null
        ] }, r.id);
      }) }),
      L.showPanel ? /* @__PURE__ */ jsx18(Box17, { marginLeft: L.side ? 1 : 0, flexShrink: 0, flexDirection: "column", height: L.panelHeight, overflow: "hidden", children: current.id === "accent" || picking !== null ? /* @__PURE__ */ jsxs18(Fragment5, { children: [
        /* @__PURE__ */ jsx18(Text18, { color: theme.dim, children: picking !== null ? " Preview" : " Every app, in this color" }),
        /* @__PURE__ */ jsx18(ThemePreview, { accent: previewAccent, width: L.panelWidth, name: store.profile.name, nameColor: store.profile.color ?? idHex(store.identity.id) })
      ] }) : /* @__PURE__ */ jsx18(Explain2, { row: current.id, width: L.panelWidth, height: L.panelHeight }) }) : null
    ] }),
    footer(hints)
  ] });
}
function Explain2({ row, width, height }) {
  const text2 = {
    accent: "",
    animations: `nonstop \u2013 ${ANIMATION_HINT.nonstop}

brief \u2013 ${ANIMATION_HINT.brief} (default)

off \u2013 ${ANIMATION_HINT.off}`,
    notifications: "A desktop banner when something happens while the terminal is in the background: a message, a race invite, a file, a friend request. Never in do not disturb.",
    reset: "Accent back to the orange, animations brief, notifications on. Profile and friends stay as they are."
  };
  return /* @__PURE__ */ jsxs18(Card, { title: "Shared by all apps", width, height, children: [
    text2[row].split("\n").map((l, i) => /* @__PURE__ */ jsx18(Text18, { color: theme.dim, wrap: "wrap", children: l || " " }, i)),
    /* @__PURE__ */ jsx18(Text18, { children: " " }),
    /* @__PURE__ */ jsx18(Text18, { color: theme.faint, wrap: "wrap", children: "Saved in ~/.termhub/settings.json \u2013 open apps change right away." })
  ] });
}

// src/ui/App.tsx
import { Fragment as Fragment6, jsx as jsx19, jsxs as jsxs19 } from "react/jsx-runtime";
function newSession(tab = "friends") {
  return { store: null, tab, selected: {}, launch: null };
}
function Root({ paths, options, session, notice }) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState11(
    () => session.store ? { name: "ready", store: session.store } : HubStore.hasProfile(paths) ? { name: "starting" } : { name: "onboarding" }
  );
  const quitting = useRef4(false);
  const quit = useCallback(() => {
    if (quitting.current) return;
    quitting.current = true;
    const store = session.store;
    session.store = null;
    void (store ? store.stop() : Promise.resolve()).finally(() => exit());
  }, [exit, session]);
  const launch = useCallback(
    (req) => {
      session.launch = req;
      exit();
    },
    [exit, session]
  );
  const reload = useCallback(() => {
    const store = session.store;
    session.store = null;
    setPhase({ name: "starting" });
    void store?.stop();
  }, [session]);
  useInput10((input, key) => {
    if (key.ctrl && input === "c") quit();
  });
  useEffect5(() => {
    if (phase.name !== "starting") return;
    let cancelled = false;
    (async () => {
      try {
        const store = new HubStore({ paths, ...options });
        await store.start();
        if (cancelled) return void store.stop();
        if (notice) store.showToast(notice, "success");
        session.store = store;
        setPhase({ name: "ready", store });
      } catch (err2) {
        setPhase({ name: "error", message: err2.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.name]);
  const height = Math.max(10, rows - 1);
  if (phase.name === "onboarding") {
    return /* @__PURE__ */ jsx19(
      Onboarding,
      {
        logo: LOGO_SMALL,
        tagline: "the hub of termchat, keyrace and termdrop",
        width: columns,
        colors: PROFILE_COLORS,
        create: (name, color) => HubStore.createProfile(paths, name, color),
        onDone: () => setPhase({ name: "starting" })
      }
    );
  }
  if (phase.name === "starting") {
    return /* @__PURE__ */ jsx19(Box18, { paddingX: 2, paddingY: 1, children: /* @__PURE__ */ jsx19(Text19, { color: theme.dim, children: "Starting termhub \u2026" }) });
  }
  if (phase.name === "error") {
    return /* @__PURE__ */ jsxs19(Box18, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx19(Text19, { color: theme.error, bold: true, children: "termhub could not start" }),
      /* @__PURE__ */ jsx19(Text19, { children: phase.message }),
      /* @__PURE__ */ jsx19(Text19, { color: theme.dim, children: "ctrl+c to quit" })
    ] });
  }
  return /* @__PURE__ */ jsx19(Main, { store: phase.store, session, width: columns, height, rows, quit, launch, reload });
}
var bottomSeq = 0;
function Main({
  store,
  session,
  width,
  height,
  rows,
  quit,
  launch,
  reload
}) {
  useStoreVersion(store);
  const [tab, setTabState] = useState11(session.tab);
  const [selected, setSelected] = useState11(session.selected);
  const [overlay, setOverlay] = useState11(null);
  const [bottom, setBottom] = useState11(null);
  const [capture, setCapture] = useState11(false);
  const [commandMode, setCommandMode] = useState11(false);
  const commandRef = useRef4(false);
  const [editor, setEditor] = useState11(emptyEditor);
  const [history, setHistory] = useState11([]);
  const setTab = (t) => {
    session.tab = t;
    setCapture(false);
    setTabState(t);
  };
  const select = (t) => (key) => {
    session.selected = { ...session.selected, [t]: key };
    setSelected(session.selected);
  };
  useEffect5(() => {
    mouse.on("focus", (f) => store.setFocused(f));
    return () => void mouse.removeAllListeners("focus");
  }, [store]);
  useEffect5(() => {
    if (session.notice) {
      store.showToast(session.notice.text, session.notice.kind);
      session.notice = void 0;
    }
  }, [store, session]);
  const actions = useMemo(() => {
    const ask = (make) => new Promise(
      (resolve) => setBottom({
        kind: "dialog",
        seq: ++bottomSeq,
        spec: make((v) => {
          setBottom(null);
          resolve(v);
        })
      })
    );
    const a = {
      quit,
      confirm: (title) => ask((resolve) => ({ kind: "confirm", title, resolve })),
      prompt: (title, opts) => ask((resolve) => ({ kind: "prompt", title, hint: opts?.hint, initial: opts?.initial, resolve })),
      pick: (title, options, preselect) => ask((resolve) => ({ kind: "pick", title, options, multi: false, opts: { initial: preselect }, resolve })).then((ids) => ids?.[0] ?? null),
      secret: (title, hint) => new Promise(
        (resolve) => setBottom({
          kind: "secret",
          seq: ++bottomSeq,
          title,
          hint,
          resolve: (v) => {
            setBottom(null);
            resolve(v);
          }
        })
      ),
      panel: (title, text2) => setOverlay({ kind: "panel", title, text: text2 }),
      print: (text2, kind = "info") => {
        if (text2.includes("\n")) setOverlay({ kind: "panel", title: "termhub", text: text2 });
        else store.showToast(text2.replace(/[`*]/g, ""), kind);
      },
      runCommand: async (input) => {
        await registry.execute(input, { store, ui: { ...a, tab: setTab } });
        setHistory((h) => h[h.length - 1] === input ? h : [...h.slice(-99), input]);
      },
      launch: (id) => {
        try {
          launch(store.launchRequest(id));
        } catch (err2) {
          store.showToast(err2.message, "error");
        }
      },
      reload,
      capture: (on) => setCapture(on)
    };
    return a;
  }, [store, quit, launch, reload]);
  const closeCommand = () => {
    commandRef.current = false;
    setCommandMode(false);
    setEditor(emptyEditor);
  };
  const cmd = useCommandInput({
    registry,
    editor,
    setEditor,
    onSubmit: async (value) => {
      closeCommand();
      if (value.trim()) await actions.runCommand(value.trim());
    },
    onEscape: closeCommand
  });
  const idle = !overlay && !bottom && !commandMode;
  useInput10(
    (input, key) => {
      if (commandRef.current) {
        const text2 = cleanPaste(input);
        if (text2 && !key.ctrl && !key.meta) setEditor((e) => edit.insert(e, text2));
        return;
      }
      if (key.tab) {
        const i = TABS.indexOf(tab);
        return setTab(TABS[(i + (key.shift ? TABS.length - 1 : 1)) % TABS.length]);
      }
      if (/^[1-4]$/.test(input)) return setTab(TABS[Number(input) - 1]);
      if (input.startsWith("/")) {
        commandRef.current = true;
        setCommandMode(true);
        setEditor({ value: input, cursor: input.length });
        return;
      }
      if (input === "?") return actions.panel("Help", HELP);
      if (input === "q") {
        if (store.task?.running) return store.showToast(`${store.task.title} is still running \u2013 quit when it's done (or ctrl+c)`, "error");
        quit();
      }
    },
    { isActive: idle && !capture }
  );
  const compact2 = bannerCompact(width, rows);
  const showBanner = height >= (width >= 84 ? 20 : 30);
  const banner = showBanner ? bannerHeight(compact2) : 0;
  const bottomHeight = bottom?.kind === "dialog" ? dialogHeight(bottom.spec) : bottom?.kind === "secret" ? SECRET_HEIGHT : commandMode ? inputBoxHeight(editor, width) + menuHeight(cmd.items.length) : 0;
  const bodyHeight = Math.max(4, height - 2 - banner - TABS_HEIGHT);
  const profileColor2 = store.profile.color ?? idHex(store.identity.id);
  const tabActive = idle;
  const footer = (hints) => /* @__PURE__ */ jsxs19(Fragment6, { children: [
    bottom?.kind === "dialog" ? /* @__PURE__ */ jsx19(Dialog, { spec: bottom.spec, width }, bottom.seq) : bottom?.kind === "secret" ? /* @__PURE__ */ jsx19(SecretPrompt, { title: bottom.title, hint: bottom.hint, width, onDone: bottom.resolve }, bottom.seq) : commandMode ? /* @__PURE__ */ jsxs19(Fragment6, { children: [
      /* @__PURE__ */ jsx19(InputBox, { state: editor, onChange: setEditor, onSubmit: cmd.submit, onKey: cmd.onKey, isActive: true, width, history, borderColor: theme.accent, singleLine: true }),
      /* @__PURE__ */ jsx19(CommandMenu, { items: cmd.items, selected: cmd.selected, width })
    ] }) : null,
    /* @__PURE__ */ jsx19(
      Footer,
      {
        hints: commandMode ? ["enter run", "tab complete", "esc cancel"] : bottom ? [] : capture ? hints : [...hints, "/ commands", "? help", "q quit"],
        toast: store.toast,
        width
      }
    )
  ] });
  const props = { store, width, actions, footer, height: bodyHeight, bottomRows: bottomHeight, active: tabActive, selectedKey: selected[tab] ?? null, onSelect: select(tab) };
  let body;
  if (overlay) body = /* @__PURE__ */ jsx19(TextPanel, { title: overlay.title, text: overlay.text, width, height: bodyHeight, onClose: () => setOverlay(null) });
  else if (tab === "friends") body = /* @__PURE__ */ jsx19(FriendsTab, { ...props });
  else if (tab === "apps") body = /* @__PURE__ */ jsx19(AppsTab, { ...props });
  else if (tab === "profile") body = /* @__PURE__ */ jsx19(ProfileTab, { ...props });
  else body = /* @__PURE__ */ jsx19(SettingsTab, { ...props });
  const requests = store.friendsData().requests.length;
  const updates = store.appList().filter((e) => e.status.kind === "update").length + (store.updateAvailable ? 1 : 0);
  return /* @__PURE__ */ jsxs19(Box18, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsx19(
      Header,
      {
        app: "termhub",
        version: VERSION,
        width,
        me: { ...store.me, color: profileColor2 },
        address: store.me.ips[0] ? `${store.me.ips[0]}:${store.me.port}` : "no network",
        online: store.onlineCount(),
        updateAvailable: store.updateAvailable
      }
    ),
    showBanner ? /* @__PURE__ */ jsx19(Banner, { width, compact: compact2, color: profileColor2, animate: store.isFocused && idle, mode: store.settings.animations }) : null,
    /* @__PURE__ */ jsx19(Tabs, { active: tab, width, badges: { ...requests ? { friends: `${requests}` } : {}, ...updates ? { apps: `\u2B06${updates}` } : {} } }),
    body
  ] });
}

// src/cli.tsx
import { jsx as jsx20 } from "react/jsx-runtime";
var HELP2 = `termhub \u2013 the hub of termchat, keyrace and termdrop: your profile and friends,
who's online where, shared settings, and installing, opening and updating the apps

Usage: termhub [options]
       termhub update            Update termhub
       termhub update --all      Update every installed app, then termhub
       termhub install <app>     Install an app (termchat, keyrace, termdrop \u2026)
       termhub backup <file>     Export an encrypted backup of your identity and friends
       termhub restore <file>    Restore one (replaces identity and friends on this computer)

  --home <dir>      Data directory (default: ~/.termhub, shared by all apps; or $TERMHUB_HOME).
                    Apps opened from termhub get the same --home.
  --port <port>     TCP port (default: 5056, falls back if taken)
  --no-discovery    Don't search the network automatically
  --debug           Write a connection log to <home>/hub/termhub.log
  -h, --help        Show this help
  -v, --version     Show the version
`;
async function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        home: { type: "string" },
        port: { type: "string" },
        "no-discovery": { type: "boolean" },
        debug: { type: "boolean" },
        all: { type: "boolean" },
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" }
      },
      strict: true
    }));
  } catch (err2) {
    process.stderr.write(`${err2.message}

${HELP2}`);
    process.exit(2);
  }
  if (values.help) {
    process.stdout.write(HELP2);
    return;
  }
  if (values.version) {
    process.stdout.write(`termhub ${VERSION}
`);
    return;
  }
  const paths = resolvePaths(values.home);
  const [cmd, arg, ...extra] = positionals;
  if (cmd) {
    const usage = (u) => {
      process.stderr.write(`Usage: ${u}
`);
      process.exit(2);
    };
    if (extra.length) usage(`termhub ${cmd} \u2026`);
    switch (cmd) {
      case "update":
        if (arg) usage("termhub update [--all]");
        process.exit(values.all ? await updateAll(paths) : await updateSelf());
      case "install":
        process.exit(await install(paths, arg ?? usage("termhub install <app>")));
      case "backup":
        process.exit(await backup2(paths, arg ?? usage("termhub backup <file>")));
      case "restore":
        process.exit(await restore(paths, arg ?? usage("termhub restore <file>"), { yes: values.yes }));
      default:
        process.stderr.write(`Unknown command: ${cmd}

${HELP2}`);
        process.exit(2);
    }
  }
  let port;
  if (values.port !== void 0) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`Invalid port: ${values.port}
`);
      process.exit(2);
    }
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("termhub needs an interactive terminal.\n");
    process.exit(1);
  }
  let lock;
  try {
    const got = await acquireLock(paths.lock, paths.socket);
    if (!("release" in got)) {
      process.stderr.write(`termhub is already open in another window (pid ${got.holder.pid}).
`);
      process.exit(1);
    }
    lock = got;
  } catch (err2) {
    process.stderr.write(`Couldn't start termhub: ${err2.message}
`);
    process.exit(1);
  }
  let notice;
  try {
    const report = Hub.prepare(paths.hub);
    if (report.migrated) notice = migrationNotice(report.friends);
  } catch (err2) {
    lock.release();
    process.stderr.write(`Couldn't read your profile in ${paths.hub.dir}: ${err2.message}
`);
    process.exit(1);
  }
  try {
    await startInstanceServer(paths.socket);
  } catch {
  }
  let restored = false;
  const restore2 = () => {
    if (restored) return;
    restored = true;
    lock.release();
    if (process.platform !== "win32") fs14.rmSync(paths.socket, { force: true });
    process.stdout.write(MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
  };
  process.stdout.write(ENTER_SCREEN);
  process.on("exit", restore2);
  const crash = (err2) => {
    restore2();
    process.stderr.write(`
termhub crashed: ${err2 instanceof Error ? err2.stack ?? err2.message : String(err2)}
`);
    process.exit(1);
  };
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
  for (const sig of ["SIGTERM", "SIGHUP"]) process.on(sig, () => process.exit(0));
  const options = { port, discovery: !values["no-discovery"], debug: values.debug };
  const session = newSession();
  for (let first = true; ; first = false) {
    const stdin = new MouseFilterStdin(process.stdin);
    const app = render(/* @__PURE__ */ jsx20(Root, { paths, options, session, notice: first ? notice : void 0 }), {
      exitOnCtrlC: false,
      patchConsole: true,
      stdin
    });
    try {
      await app.waitUntilExit();
    } catch (err2) {
      crash(err2);
    }
    const launch = session.launch;
    session.launch = null;
    if (!launch || !session.store) {
      stdin.detach();
      break;
    }
    const store = session.store;
    store.childRunning = true;
    const r = await handOver({ write: (s) => process.stdout.write(s), detach: () => stdin.detach() }, () => runInTerminal(launch.command, launch.args));
    store.childRunning = false;
    session.notice = r.error ? { text: `${launch.name} didn't start: ${r.error}`, kind: "error" } : r.code ? { text: `${launch.name} ended with an error (exit code ${r.code})`, kind: "error" } : { text: `Back from ${launch.name}`, kind: "info" };
    await store.afterLaunch(launch.id);
  }
  restore2();
  if (!restartRequested()) process.exit(0);
  const child = spawn4(process.execPath, process.argv.slice(1), { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", () => process.exit(0));
}
async function start() {
  const local = self.installKind() === "npm" ? self.newerLocalInstall(fileURLToPath(import.meta.url)) : null;
  if (local) {
    try {
      await import(pathToFileURL(local.cli).href);
      return;
    } catch (err2) {
      process.stderr.write(`Couldn't start termhub ${local.version} (${err2.message}) \u2013 starting ${VERSION} instead.
`);
    }
  }
  await main();
}
void start();
