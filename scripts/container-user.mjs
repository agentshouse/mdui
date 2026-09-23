import { spawn } from 'node:child_process';
import { chownSync, lchownSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const owner = statSync(process.cwd());
if (process.getuid() === 0) {
  chownSync('/checkout/node_modules', owner.uid, owner.gid);
  for (const entry of ['', ...readdirSync('node_modules', { recursive: true })]) {
    lchownSync(join('node_modules', entry), owner.uid, owner.gid);
  }
  process.setgroups([]);
  process.setgid(owner.gid);
  process.setuid(owner.uid);
}
const [command, ...args] = process.argv.slice(2);
const child = spawn(command, args, {
  stdio: 'inherit',
  env: { ...process.env, HOME: join(tmpdir(), `mdui-home-${process.getuid()}`) },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.once('close', (code, signal) => {
  process.exitCode = code ?? (signal ? 128 : 1);
});
