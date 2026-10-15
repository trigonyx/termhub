/**
 * Reads a passphrase from the terminal without echoing it (like sudo). Without a terminal it
 * reads one line from stdin – and `TERMHUB_PASSPHRASE` skips the question (scripts, tests).
 */
export function readSecret(prompt: string, input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stderr): Promise<string | null> {
  output.write(prompt);
  return new Promise((resolve) => {
    let value = '';
    const tty = input.isTTY === true;
    const finish = (v: string | null) => {
      input.off('data', onData);
      input.off('end', onEnd);
      if (tty) input.setRawMode(false);
      input.pause();
      output.write('\n');
      resolve(v);
    };
    const onEnd = () => finish(value || null);
    const onData = (chunk: Buffer | string) => {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n') return finish(value);
        if (ch === '\u0003' || ch === '\u001b') return finish(null); // ctrl+c, esc
        if (ch === '\u007f' || ch === '\b') value = [...value].slice(0, -1).join('');
        else if (ch === '\u0015') value = ''; // ctrl+u
        else if (ch >= ' ') value += ch;
      }
    };
    if (tty) input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.on('end', onEnd);
    input.resume();
  });
}

/** One line typed by the user (a confirmation). */
export function readLine(prompt: string, input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stderr): Promise<string> {
  output.write(prompt);
  return new Promise((resolve) => {
    let value = '';
    const done = () => {
      input.off('data', onData);
      input.off('end', done);
      input.pause();
      resolve(value.trim());
    };
    const onData = (chunk: Buffer | string) => {
      const s = String(chunk);
      const nl = s.indexOf('\n');
      if (nl === -1) value += s;
      else {
        value += s.slice(0, nl);
        done();
      }
    };
    input.setEncoding('utf8');
    input.on('data', onData);
    input.on('end', done);
    input.resume();
  });
}
