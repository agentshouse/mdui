#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plannerConfiguration, PlannerRefusal } from './backlog-claims.mjs';
import { compileBacklog } from './backlog-model.mjs';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const TICKET_ROOT = 'docs/backlog/tickets';

const COMMANDS = [
  {
    key: 'implement',
    label: 'Implement this ticket',
    template: '/h-implement {ticket}',
  },
  {
    key: 'merge',
    label: 'Merge the pull request',
    template: 'npm run ops -- merge {pullRequest}',
  },
];

function git(...args) {
  const run = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });
  if (run.error !== undefined)
    throw new Error(`git ${args.join(' ')} could not run: ${run.error.message}`);
  if (run.status !== 0)
    throw new Error(`git ${args.join(' ')} failed: ${(run.stderr || run.stdout || '').trim()}`);
  return run.stdout.trim();
}

function fileUrl() {
  const remote = git('remote', 'get-url', 'origin');
  const https = remote
    .replace(/^git@github.com:/, 'https://github.com/')
    .replace(/\.git$/, '');
  const head = git('rev-parse', 'HEAD');
  return `${https}/blob/${head}/{path}`;
}

function pullRequests(limit) {
  if (limit === 0) return [];
  const run = spawnSync(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      String(limit),
      '--json',
      'number,title,url,state,headRefName,author,body',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  if (run.error !== undefined || run.status !== 0) {
    const reason = run.error?.message ?? (run.stderr || '').trim();
    process.stderr.write(`backlog push: pull requests unavailable: ${reason}\n`);
    return [];
  }
  return JSON.parse(run.stdout).map((entry) => ({
    number: entry.number,
    title: entry.title,
    url: entry.url,
    state: entry.state.toLowerCase(),
    ...(entry.headRefName ? { branch: entry.headRefName } : {}),
    ...(entry.author?.login ? { author: entry.author.login } : {}),
    body: entry.body ?? '',
  }));
}

function snapshotOf(config, state, records, options) {
  const known = new Set(records.map((ticket) => ticket.id));

  const tracks = state.delivery.tracks.map((track) => ({
    kind: 'track',
    id: track.id,
    title: track.title,
    summary: track.outcome,
    ordered: true,
    members: track.tickets.filter((id) => known.has(id)),
  }));

  const ownerships = state.ownerships
    .map((ownership) => ({
      kind: 'ownership',
      id: ownership.id,
      title: ownership.title,
      summary: ownership.description,
      ordered: false,
      members: ownership.tickets.filter((id) => known.has(id)),
    }))
    .filter((grouping) => grouping.members.length > 0);

  const dependencies = Object.entries(config.delivery.dependencies).flatMap(([id, required_]) =>
    known.has(id)
      ? required_
          .filter((target) => known.has(target))
          .map((target) => ({
            dependent: id,
            required: target,
          }))
      : [],
  );

  return {
    project: {
      title: options.title,
      statusVocabulary: config.statuses,
      openStatuses: config.openStatuses,
      closedStatuses: config.terminalStatuses.filter((status) => status !== 'resolved'),
      source: { ticketRoot: TICKET_ROOT, fileUrl: options.fileUrl },
      commands: COMMANDS,
    },
    tickets: records.map((ticket) => ({
      path: ticket.id,
      title: ticket.title,
      status: ticket.status,
      body: ticket.body,
    })),
    groupings: [...tracks.filter((track) => track.members.length > 0), ...ownerships],
    dependencies,
    pullRequests: options.pullRequests,
  };
}

async function send(url, project, payload) {
  const target = new URL(`/api/projects/${project}/snapshot`, url);
  const response = await fetch(target, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${target} answered ${response.status}: ${text}`);
  return text;
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const unknown = argv.filter((value) => value !== '--dry-run');
  if (unknown.length > 0) throw new Error(`unknown backlog push arguments: ${unknown.join(', ')}`);

  const configuration = plannerConfiguration();
  const config = JSON.parse(readFileSync(join(repositoryRoot, 'docs/backlog/backlog.config.json'), 'utf8'));
  const { state, tickets } = compileBacklog(repositoryRoot);
  const payload = snapshotOf(config, state, tickets, {
    title: process.env.BACKLOG_PUSH_TITLE ?? 'mdui',
    fileUrl: fileUrl(),
    pullRequests: pullRequests(Number(process.env.BACKLOG_PUSH_PULL_REQUESTS ?? '200')),
  });

  process.stdout.write(
    `backlog push: ${payload.tickets.length} tickets, ` +
      `${payload.groupings.length} groupings, ${payload.dependencies.length} dependencies, ` +
      `${payload.pullRequests.length} pull requests\n`,
  );
  if (dryRun) {
    process.stdout.write('dry run: nothing sent\n');
    return 0;
  }
  const result = await send(configuration.url, configuration.project, payload);
  process.stdout.write(`accepted: ${result}\n`);
  return 0;
}

try {
  process.exit(await main(process.argv.slice(2)));
} catch (error) {
  if (error instanceof PlannerRefusal)
    process.stderr.write(`backlog push: ${error.lines.join('; ')}\n`);
  else process.stderr.write(`backlog push: ${error.message ?? error}\n`);
  process.exit(1);
}
