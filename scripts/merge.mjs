#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PlannerRefusal,
  plannerConfiguration,
  releaseClaims,
  ticketIdFrom,
} from './backlog-claims.mjs';
import {
  hasDirectRequest,
  issueReferences,
  partialTicketPathsIn,
  pullRequest,
  ticketPathsIn,
} from './pull-requests.mjs';

const scriptRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = realpathSync(process.env.MERGE_REPOSITORY_ROOT ?? scriptRoot);
const ghAxi = process.env.GH_AXI_COMMAND ?? 'gh-axi';
const BASE = 'refs/remotes/origin/main';
const REFUSED_EXIT = 2;
const INCOMPLETE_EXIT = 3;

function say(line) {
  process.stdout.write(`merge: ${line}\n`);
}

function refuse(lines, code = REFUSED_EXIT) {
  process.stderr.write(`${lines.map((line) => `merge: ${line}`).join('\n')}\n`);
  process.exit(code);
}

function git(args, { cwd = root } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) refuse([`git ${args.join(' ')} failed`, result.stderr.trim()]);
  return result.stdout.trim();
}

function prNumber(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    refuse([
      'usage: npm run ops -- merge <pr-number>',
      `PR number must be a positive integer, received ${value ?? 'nothing'}`,
    ]);
  }
  return parsed;
}

function headRef(number) {
  return `refs/remotes/origin/pull/${number}/head`;
}

function fetchBase() {
  git(['fetch', '--prune', 'origin', `+refs/heads/main:${BASE}`]);
}

function fetchHead(number) {
  git(['fetch', '--prune', 'origin', `+refs/pull/${number}/head:${headRef(number)}`]);
  return git(['rev-parse', headRef(number)]);
}

function viewOf(number) {
  let view;
  try {
    view = pullRequest(number, { cwd: root });
  } catch (error) {
    refuse([`PR #${number} could not be read: ${error.message}`]);
  }
  if (view.state !== 'OPEN') refuse([`PR #${number} is ${view.state}, not open`]);
  if (view.draft) refuse([`PR #${number} is still a draft`]);
  if (view.base !== 'main') refuse([`PR #${number} targets ${view.base}, not main`]);
  return view;
}

function localWorktree(branch, head) {
  const blocks = git(['worktree', 'list', '--porcelain']).split('\n\n');
  for (const block of blocks) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    const worktreeHead = block.match(/^HEAD ([0-9a-f]{40})$/m)?.[1];
    const worktreeBranch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null;
    if (path === undefined) continue;
    if (worktreeBranch !== branch && worktreeHead !== head) continue;
    if (worktreeHead !== head) {
      refuse([
        `${path} is at ${worktreeHead?.slice(0, 8) ?? 'an unreadable head'} on ${worktreeBranch ?? 'a detached head'}, not the PR head ${head.slice(0, 8)}`,
        'push or reset that worktree first',
      ]);
    }
    if (git(['status', '--porcelain'], { cwd: path }).length > 0) {
      refuse([`${path} is dirty; commit or discard its changes first`]);
    }
    return { path, branch: worktreeBranch };
  }
  return null;
}

function ticketsAt(body, head) {
  const tickets = ticketPathsIn(body);
  if (tickets.length === 0) {
    if (issueReferences(body).length === 0 && !hasDirectRequest(body)) {
      refuse(['PR body names no ticket path, GitHub Issue, or direct User request']);
    }
    return [];
  }
  const partial = partialTicketPathsIn(body);
  for (const ticket of tickets) {
    const shown = spawnSync('git', ['show', `${head}:${ticket}`], { cwd: root, encoding: 'utf8' });
    if (shown.status !== 0) refuse([`${ticket} does not exist at the PR head`]);
    const status = shown.stdout.match(/^Status:\s*(\S+)\s*$/m)?.[1];
    if (status !== 'resolved' && !partial.includes(ticket)) {
      refuse([
        `${ticket} is ${status ?? 'missing Status'}, not resolved`,
        `a delivery of part of it lists it under ## Tickets as: ${ticket} (partial: <reason>)`,
      ]);
    }
  }
  return tickets;
}

function mergeTreeOf(head) {
  const merged = spawnSync('git', ['merge-tree', '--write-tree', BASE, head], {
    cwd: root,
    encoding: 'utf8',
  });
  if (merged.error) throw merged.error;
  const tree = merged.stdout.trim().split('\n')[0];
  if (merged.status === 0 && /^[0-9a-f]{40}$/.test(tree)) return tree;
  const paths = [...merged.stdout.matchAll(/^CONFLICT \([^)]+\): Merge conflict in (.+)$/gm)].map(
    ([, path]) => path,
  );
  if (paths.length === 0)
    refuse(['the PR head does not merge into origin/main', merged.stdout.trim()]);
  refuse([
    'the PR head conflicts with origin/main in:',
    ...paths.map((path) => `  ${path}`),
    'merge origin/main, resolve those yourself, then run again',
  ]);
}

function mergedState(number) {
  try {
    return pullRequest(number, { cwd: root }).state;
  } catch (error) {
    refuse([`PR #${number} could not be read after the merge call: ${error.message}`]);
  }
}

function deleteRemoteBranch({ branch, fork }, head) {
  if (fork) {
    say(`the PR branch ${branch} lives in another repository and was left alone`);
    return [];
  }
  const deleted = spawnSync(
    'git',
    [
      'push',
      '--quiet',
      `--force-with-lease=refs/heads/${branch}:${head}`,
      'origin',
      `:refs/heads/${branch}`,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (deleted.error) throw deleted.error;
  if (deleted.status === 0) {
    say(`deleted remote branch ${branch}`);
    return [];
  }
  if (git(['ls-remote', 'origin', `refs/heads/${branch}`]) === '') {
    say(`remote branch ${branch} was already deleted`);
    return [];
  }
  process.stderr.write(deleted.stderr);
  return [`remote branch ${branch} was not deleted and is still on origin`];
}

function squashMerge(number, head) {
  if (fetchHead(number) !== head) {
    refuse([`PR #${number} head moved; run again`]);
  }
  const merged = spawnSync(ghAxi, ['pr', 'merge', String(number), '--squash'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (merged.error) throw merged.error;
  const outcome =
    merged.signal === null ? `exited with ${merged.status}` : `died with ${merged.signal}`;
  const state = mergedState(number);
  if (state !== 'MERGED') {
    refuse(
      [`${ghAxi} pr merge ${outcome} and PR #${number} is ${state}; nothing else was done`],
      merged.status === 0 ? 1 : (merged.status ?? 1),
    );
  }
  if (merged.status !== 0) say(`${ghAxi} pr merge ${outcome} after the merge landed`);
  fetchBase();
  const landed = git(['rev-parse', BASE]);
  say(`merged PR #${number} as ${landed}`);
}

function removeWorktree(worktree) {
  if (worktree === null) return;
  if (realpathSync(worktree.path) === root) {
    say(
      `this command runs from the merged worktree ${worktree.path}; remove it yourself: git worktree remove ${worktree.path}`,
    );
    return;
  }
  const removed = spawnSync('git', ['worktree', 'remove', worktree.path], {
    cwd: root,
    encoding: 'utf8',
  });
  if (removed.status !== 0) {
    say(`could not remove worktree ${worktree.path}: ${removed.stderr.trim()}`);
    return;
  }
  say(`removed worktree ${worktree.path}`);
  if (worktree.branch === null) return;
  const deleted = spawnSync('git', ['branch', '-D', worktree.branch], {
    cwd: root,
    encoding: 'utf8',
  });
  if (deleted.status === 0) say(`deleted local branch ${worktree.branch}`);
}

async function release(tickets) {
  const ids = tickets.map((ticket) => ticketIdFrom(ticket)).filter((id) => id !== null);
  if (ids.length === 0) return [];
  try {
    const configuration = plannerConfiguration();
    for (const line of await releaseClaims(ids, configuration)) say(line);
    return [];
  } catch (error) {
    if (!(error instanceof PlannerRefusal)) throw error;
    return [`claims not released: ${error.lines.join('; ')}`];
  }
}

async function main(argv) {
  const [rawNumber, ...extra] = argv;
  if (extra.length > 0) refuse(['usage: npm run ops -- merge <pr-number>']);
  const number = prNumber(rawNumber);
  fetchBase();
  const head = fetchHead(number);
  const view = viewOf(number);
  if (view.head && view.head !== head)
    refuse([`PR #${number} head moved while checking; run again`]);
  const worktree = localWorktree(view.branch, head);
  const tickets = ticketsAt(view.body, head);
  mergeTreeOf(head);
  const whitespace = spawnSync('git', ['diff', '--check', `${BASE}...${head}`], {
    cwd: root,
    encoding: 'utf8',
  });
  if (whitespace.status !== 0) refuse(['the diff has whitespace errors', whitespace.stdout.trim()]);
  squashMerge(number, head);
  const leftovers = deleteRemoteBranch(view, head);
  removeWorktree(worktree);
  leftovers.push(...(await release(tickets)));
  if (leftovers.length > 0) {
    refuse([...leftovers, 'the merge itself is complete'], INCOMPLETE_EXIT);
  }
}

const invoked = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await main(process.argv.slice(2));
