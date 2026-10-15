#!/usr/bin/env node
// A stand-in for an app the launcher opens: `--version` answers, otherwise it either ends right
// away (FAKE_APP_MODE=exit, exit code FAKE_APP_CODE) or waits for a line on stdin and echoes it.
const name = process.env.FAKE_APP_NAME || 'fakeapp';
if (process.argv.includes('--version')) {
  console.log(`${name} ${process.env.FAKE_APP_VERSION || '1.0.0'}`);
  process.exit(0);
}
const args = process.argv.slice(2).join(' ');
if ((process.env.FAKE_APP_MODE || 'exit') === 'exit') {
  console.log(`ran ${name} ${args}`.trim());
  process.exit(Number(process.env.FAKE_APP_CODE || 0));
}
process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  const nl = buf.indexOf('\n');
  if (nl !== -1) {
    console.log(`got ${buf.slice(0, nl)}`);
    process.exit(0);
  }
});
