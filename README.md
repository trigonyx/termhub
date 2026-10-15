# termhub

The hub of [termchat](https://github.com/trigonyx/termchat), [keyrace](https://github.com/trigonyx/keyrace) and
[termdrop](https://github.com/trigonyx/termdrop): your profile and friends, who's online and in which app, the
settings all apps share – and installing, opening and updating the apps. No server, no account: like the apps,
termhub finds your friends on the local network, end-to-end encrypted.

```
 termhub  v1.0.0  Ada · GYXE-7YZD                        192.168.1.20:5056 · ● 2 friends online
──────────────────────────────────────────────────────────────────────────────────────────────────
               ████████╗███████╗██████╗ ███╗   ███╗██╗  ██╗██╗   ██╗██████╗
               ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║  ██║██║   ██║██╔══██╗
                  ██║   █████╗  ██████╔╝██╔████╔██║███████║██║   ██║██████╔╝
                  ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══██║██║   ██║██╔══██╗
                  ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║  ██║╚██████╔╝██████╔╝
                  ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝

  Friends 1    Apps ⬆1    Profile    Settings                                     tab/1-4 switch
──────────────────────────────────────────────────────────────────────────────────────────────────
 REQUESTS · 1                                           ╭──────────────────────────────────────╮
 ❯ ◆ Carl             wants to be friends · keyrace     │ Bob                                  │
                                                        │ ID        6XXD-CSKM-QERW-MHBP-JJCL   │
 FRIENDS · 2 ONLINE                                     │ State     friends                    │
   ● Bob              ● termdrop · termhub              │ Online    ● termdrop · termhub       │
   ◑ Sam              ● termchat · keyrace · busy       │ Status    ● available                │
   ○ Dana             last seen 2h ago                  │ Address   192.168.1.31               │
                                                        │ Alias     –                          │
 NEARBY                                                 │                                      │
   ● Eve              termchat · 192.168.1.40           │ Safety code                          │
                                                        │ 90404 84217 41804 22840 32172 53058  │
 BLOCKED · 1                                            │ same on both screens = no one in th… │
   ▸ show the blocked person                            ╰──────────────────────────────────────╯
 ↑↓ select · enter whois · r rename · d remove · b block · a add by IP · / commands · ? help · q quit
```

## Installation

Requires [Node.js](https://nodejs.org) 22 or newer.

```sh
npm i -g https://github.com/trigonyx/termhub/tarball/main
termhub
```

That's the only command your friends need: in termhub's **Apps** tab, `i` installs termchat, keyrace and
termdrop, `enter` opens them. (Or in a terminal: `termhub install termchat`.)

### Updating

termhub checks for a new version of itself and of every app when it starts. The header shows
`⬆ 1.1.0 available · /update`, the Apps tab `⬆ 2.1.0 → 2.2.0` next to each app.

- inside termhub: `u` on an app (or on "termhub (this app)"), `U` / `/update all` for everything – termhub
  last, then it offers to restart
- in a terminal: `termhub update` (termhub itself) or `termhub update --all` (every installed app, then
  termhub – npm's output right in the terminal)

Updates never need `sudo`: if npm's global folder belongs to root (Node from the nodejs.org installer), apps go
into their own folder (`~/.termchat/app`, `~/.termhub/app` …), and the app's command starts the newest copy it
finds. Your data stays across updates – and when you remove an app.

## Tabs and keys

Everywhere: `tab` / `shift+tab` or `1`–`4` switch tabs, `/` opens the commands, `?` the help, `q` quits. Every tab
shows its keys at the bottom. termhub works from about 60 columns; on narrow terminals the panels move below the
lists. Nothing redraws while nothing happens (apart from the logo's glint when it appears).

### Friends

| | |
|---|---|
| `↑` `↓` / `j` `k` | select |
| `enter` | accept a request · send a request to someone under Nearby · whois of a friend |
| `x` | decline a request |
| `a` | add someone by IP (`192.168.1.20` or `192.168.1.20:5050`) |
| `r` | nickname |
| `d` | remove |
| `b` | block / unblock |

- **Requests** – people who want to be friends. **Friends** – online first; for each the status (`●` available,
  `◑` busy, `⊘` do not disturb), the status message, and **in which apps they're online right now**
  (`● termchat · keyrace`), otherwise when you last saw them. **Nearby** – everyone on your network with any suite
  app open who isn't a friend yet. **Blocked** – folded away; `enter` shows them.
- The panel shows the selected person's full ID, last address, nickname, status, apps and the **safety code**:
  compare it once in person – if it's the same on both screens, nobody sits in the middle.
- Everything applies to every app at once: the friend list is shared (`~/.termhub/friends.json`).

### Apps

| | |
|---|---|
| `enter` | open the app here – quit it and you're back in termhub |
| `i` | install |
| `u` | update (on "termhub (this app)": update termhub) |
| `U` | update all installed apps, one after the other, termhub last |
| `x` | remove (after asking – your profile, friends and the app's data stay) |
| `w` | what's new: the app's CHANGELOG between your version and the newest |
| `r` | check again |

Each app shows `○ not installed`, `✓ 2.1.0` or `⬆ 2.1.0 → 2.2.0`, `● running` while it's open in another window
(it can't be opened, updated or removed from termhub then), and a quiet `new in 2.2.0` when it got newer since you
last opened termhub. Installs and updates show their progress and npm's output in the panel; if something goes
wrong, the panel says what to do about it.

### Profile

Name, profile color (the palette as color fields with a live preview of your name, `c` for your own `#rrggbb`,
`0` for the color from your ID), status (`available`, `busy`, `do not disturb`) and a status message of up to
60 characters, your ID – and the backup. Everything reaches your friends right away, through every app you
have open. **Do not disturb** in the apps: no desktop notifications or pop-ups; termchat messages arrive quietly,
keyrace invites and termdrop offers (even from trusted friends) wait under Requests.

### Settings

Shared by all apps and applied in open apps right away: the **accent color** (with a preview of an app in that
color; default `#D97757`), **animations** (`nonstop`, `brief`, `off`), **desktop notifications** (on/off) and
**reset to defaults**.

### Commands

`/add <ip>[:port]` · `/whois <friend>` · `/name <name>` · `/color <color|#rrggbb|reset>` ·
`/status <available|busy|dnd> [message]` · `/accent <color|default>` · `/animations <nonstop|brief|off>` ·
`/notifications on|off` · `/open <app>` · `/install <app>` · `/update [all|<app>]` · `/uninstall <app>` ·
`/whatsnew <app>` · `/backup` · `/restore` · `/reset` · `/id` · `/where` · `/help` · `/quit`

## Backup

**Profile → Export a backup** (or `termhub backup <file>`) writes one file with everything that makes you *you*
to your friends: your key, the links from your old IDs, profile, friends, known people and settings – no chats,
results or transfers. It's encrypted with a passphrase (at least 10 characters, asked twice, never shown):
scrypt (N = 2¹⁷) and ChaCha20-Poly1305, only Node's built-in crypto. The file is readable only by you (`0600`).

**Restore** (or `termhub restore <file>`) on another computer – or after a reinstall – makes that computer you,
with all your friends. It **replaces the identity and friends that were there**; termhub asks before it does,
needs every app closed, and keeps a copy of what was there in `~/.termhub/legacy/before-restore-<time>/`. A
wrong passphrase and a damaged or cut-off file are told apart, and nothing changes in either case.

```sh
termhub backup ~/ada.thb
termhub restore ~/ada.thb      # TERMHUB_PASSPHRASE=… for scripts
```

## Shared data in `~/.termhub`

All apps of the suite share one folder (another one: `--home <dir>` or `$TERMHUB_HOME`; termhub passes the same
`--home` to the apps it opens):

| | |
|---|---|
| `identity.json`, `profile.json` | your key, name, color, status |
| `friends.json`, `peers.json` | friends and requests, people you know |
| `settings.json` | accent, animations, notifications |
| `links.json`, `migration.json`, `legacy/` | old IDs from before the shared folder, and copies of the old files |
| `run/` | which apps are open right now (and on which port) |
| `hub/` | termhub's own: the cached app catalog, the versions it saw last time (`new in`), its log, lock and socket |
| `app/` | termhub itself, if it was updated without write access to npm's folder |

The apps keep their own data next to it (`~/.termchat`, `~/.keyrace`, `~/.termdrop`). The format is explained in
[termcore's README](https://github.com/trigonyx/termcore#termhub).

## How it works

- **First start:** if one of the apps ran before, its profile is taken over (the migration in termcore moves the
  apps' old identities and friend lists into `~/.termhub`). Otherwise you pick a name and a profile color.
- **Online in which app:** every app announces on the network which suite apps are open on that computer.
  termhub listens to all of them (UDP 5057; it asks termchat, keyrace and termdrop on their ports and gets the
  answers on its own), so a friend who only has termdrop open is still "online · termdrop". Friends who run termhub
  too are connected directly (TCP 5056) – their status and their open apps arrive live, also across subnets.
- **Friend requests to people without termhub:** if your own termchat (say) is open, it passes the request on by
  itself (shared list). If not, termhub delivers it in a short connection in termchat's protocol – the friendship
  messages are the same in every app – and leaves again. They see the request in whatever app they have open.
- **Opening an app:** termhub leaves its screen, stops reading the terminal, and runs the app in the same
  terminal. When the app quits, termhub takes the terminal back and redraws. Your friends keep seeing you
  meanwhile, and requests still arrive.
- **One termhub per data folder** (a second start says where the first one runs).

## How new apps get into the catalog

termhub reads the list of apps from [`apps.json`](apps.json) in this repo on every start (and caches it; the copy
built into termhub is the fallback). A new app appears for everyone as soon as it's in `apps.json` on `main` – no
termhub update needed:

```json
{ "id": "newapp", "name": "newapp", "description": "One line about it", "repo": "trigonyx/newapp", "bin": "newapp", "node": 22, "icon": "◇" }
```

`id` is the npm package name (and `~/.<id>`), `repo` the GitHub repo installs come from (its `main` tarball and
release tags), `bin` the command, `node` the lowest Node.js major, `icon` one character. Unknown fields are
ignored, invalid entries skipped. termhub itself isn't in the list – it has its own row.

## Command line

```sh
termhub                       # the hub
termhub update                # update termhub
termhub update --all          # every installed app, then termhub
termhub install <app>         # install an app from the catalog
termhub backup <file>         # export an encrypted backup
termhub restore <file>        # restore one (asks first; -y skips the question)
termhub --home <dir>          # another data folder: <dir> instead of ~/.termhub
termhub --port <port>         # TCP port (default 5056)
termhub --no-discovery        # don't search the network
termhub --debug               # connection log in <home>/hub/termhub.log
termhub -v | -h
```

Environment: `TERMHUB_HOME`, `TERMHUB_NO_UPDATE_CHECK=1`, `TERMHUB_PASSPHRASE` (backup/restore in scripts), and
for trying things out `TERMHUB_RAW_URL` (another "raw.githubusercontent.com"), `TERMHUB_CATALOG_URL`,
`TERMHUB_NPM` (another npm), `<APP>_APP_DIR`.

### Two people on one computer

```sh
termhub --home /tmp/alice --port 5160
termhub --home /tmp/bob --port 5161      # second terminal
```

Both find each other under Nearby. Become friends, then open termdrop from both hubs (`2`, select it, `enter`) –
they're friends there too, each with its own data folder.

## Decisions

- **Ports** 5056 (TCP) and 5057 (UDP); termhub never binds the other apps' ports (see termcore's discovery notes).
- **termhub's own files** go into `~/.termhub/hub/`, so the shared folder only holds what all apps share.
- **The catalog** is fetched on every start (5 s timeout); offline it's the cache, else the built-in copy.
  `node` may be a number or a string like `">=22"`.
- **Detection:** npm's global folder, `~/.<app>/app`, then the PATH; the version comes from `<app> --version`. A
  copy only found on the PATH (npm link, another Node) is updated with its own `<app> update` and isn't removed by
  termhub.
- **Update all** only touches apps that are installed and have a newer version; apps open in another window are
  skipped. termhub updates itself last and offers a restart.
- **"new in"** is shown when an app's version is higher than the one termhub saw last time, until its What's new
  was opened.
- **Remove** asks first and keeps every piece of data; only the program goes.
- **Backup format:** `-----BEGIN TERMHUB BACKUP-----`, base64 of `THBK` · version · log2(N) · r · p · salt · nonce
  · check · ciphertext · tag. The check value (from the same scrypt output as the key) tells a wrong passphrase
  from a damaged file; the header is authenticated; termhub refuses scrypt parameters it wouldn't write itself.
- **Friends' status** is stored in the shared friend list when an app hears it, so termhub shows it for friends
  it isn't connected to itself.

## Development

```sh
npm install        # termcore comes from ../termcore
npm run dev        # run from source
npm test           # catalog, detection, install with a fake npm, launcher, backup, two-home integration, UI
npm run typecheck
npm run release <patch|minor|major>
```

## The suite

| | |
|---|---|
| **termhub** | this app – profile, friends, settings, and the launcher for the others |
| [**termchat**](https://github.com/trigonyx/termchat) | end-to-end encrypted chat and group chats with friends on your network |
| [**keyrace**](https://github.com/trigonyx/keyrace) | typing races against your friends |
| [**termdrop**](https://github.com/trigonyx/termdrop) | AirDrop for the terminal: send files to friends, encrypted |
| [**termcore**](https://github.com/trigonyx/termcore) | the shared core they're all built on (not installed on its own) |

One identity, one name and one friend list for all of them. Install termhub, and it installs the rest:

```sh
npm i -g https://github.com/trigonyx/termhub/tarball/main
```
