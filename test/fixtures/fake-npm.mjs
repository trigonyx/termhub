#!/usr/bin/env node
// A stand-in for npm (TERMHUB_NPM): installs a tiny fake app into temp folders.
//   FAKE_NPM_GLOBAL      npm's global node_modules
//   FAKE_NPM_VERSION     version it "downloads" (default: from the tag in the spec, else 9.9.9)
//   FAKE_NPM_DENY_GLOBAL global installs fail with EACCES
//   FAKE_NPM_FAIL        every install fails with this text
//   FAKE_NPM_LOG         every call is appended here (one JSON array per line)
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (process.env.FAKE_NPM_LOG) fs.appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify(args) + '\n');
const global = process.env.FAKE_NPM_GLOBAL;

if (args[0] === 'root' && args.includes('-g')) {
  console.log(global);
  process.exit(0);
}
if (args[0] === 'rm' && args.includes('-g')) {
  fs.rmSync(path.join(global, args.at(-1)), { recursive: true, force: true });
  console.log(`removed 1 package`);
  process.exit(0);
}
if (args[0] === 'install') {
  if (process.env.FAKE_NPM_FAIL) {
    console.error(process.env.FAKE_NPM_FAIL);
    process.exit(1);
  }
  const spec = args.at(-1);
  const m = /github\.com\/[^/]+\/([^/]+)\/tarball\/(?:v(\d+\.\d+\.\d+)|main)/.exec(spec);
  if (!m) {
    console.error(`npm ERR! bad spec ${spec}`);
    process.exit(1);
  }
  const name = m[1];
  const version = process.env.FAKE_NPM_VERSION || m[2] || '9.9.9';
  const prefix = args.includes('--prefix') ? args[args.indexOf('--prefix') + 1] : null;
  if (!prefix && process.env.FAKE_NPM_DENY_GLOBAL) {
    console.error(`npm ERR! code EACCES\nnpm ERR! Error: EACCES: permission denied, mkdir '${global}/${name}'`);
    process.exit(243);
  }
  const root = prefix ? path.join(prefix, 'node_modules', name) : path.join(global, name);
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, version, bin: { [name]: 'dist/cli.js' } }));
  fs.writeFileSync(path.join(root, 'dist', 'cli.js'), `#!/usr/bin/env node\nconsole.log(${JSON.stringify(`${name} ${version}`)});\n`, { mode: 0o755 });
  console.log(`added 1 package in 0.1s`);
  process.exit(0);
}
console.error(`fake npm: unknown command ${args.join(' ')}`);
process.exit(1);
