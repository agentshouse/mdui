import { spawnSync } from 'node:child_process';

const commands = {
  typecheck: [['tsc', '--noEmit']],
  format: [['npm', 'run', 'ops', '--', 'format', '--check']],
  compile: [['node', '--', 'scripts/compile.mjs']],
  pure: [['vitest', 'run', '--project', 'pure']],
  browser: [['playwright', 'test']],
  static: [
    ['depcruise', 'src', '--config', '.dependency-cruiser.cjs'],
    ['vitest', 'run', '--project', 'static'],
  ],
};

const [lane, ...args] = process.argv.slice(2);
if (
  (lane !== undefined && !Object.hasOwn(commands, lane)) ||
  (args.length > 0 && lane !== 'pure' && lane !== 'browser')
) {
  process.stderr.write(
    `usage: npm run ops -- check [${Object.keys(commands).join('|')}] [spec arguments for pure or browser]\n`,
  );
  process.exit(2);
}

for (const name of lane === undefined ? Object.keys(commands) : [lane]) {
  process.stdout.write(`check: ${name}\n`);
  for (const [command, ...fixed] of commands[name]) {
    const result = spawnSync(command, [...fixed, ...args], { stdio: 'inherit' });
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
