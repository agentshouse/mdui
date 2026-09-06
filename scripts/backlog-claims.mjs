#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const TICKET_ROOT = 'docs/backlog/tickets/';
const TICKET_ID = /^[A-Za-z0-9_-]+\/[\w.-]+$/;
const REQUEST_TIMEOUT_MS = 5_000;

export class PlannerRefusal extends Error {
  constructor(lines, status = null) {
    super(lines.join('\n'));
    this.lines = lines;
    this.status = status;
  }
}

export function ticketIdFrom(reference) {
  const value = reference.trim().split(sep).join('/');
  if (value.length === 0) return null;
  if (!value.endsWith('.md')) return TICKET_ID.test(value) ? value : null;
  const index = value.lastIndexOf(TICKET_ROOT);
  if (index === -1) return null;
  const id = value.slice(index + TICKET_ROOT.length, -'.md'.length);
  return TICKET_ID.test(id) ? id : null;
}

export function hostActor(name) {
  const key = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 48)
    .replaceAll(/-+$/g, '');
  return key.length === 0 ? null : key;
}

export function plannerConfiguration(environment = process.env, root = repositoryRoot) {
  const url = environment.BACKLOG_PLANNER_URL;
  let project = environment.BACKLOG_PLANNER_PROJECT;
  try {
    const fromRepo = readFileSync(join(root, 'docs/backlog/planner-project'), 'utf8').trim();
    if (fromRepo.length > 0) project = fromRepo;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const missing = [
    ...(url === undefined || url.length === 0 ? ['BACKLOG_PLANNER_URL'] : []),
    ...(project === undefined || project.length === 0
      ? ['docs/backlog/planner-project (or BACKLOG_PLANNER_PROJECT)']
      : []),
  ];
  if (missing.length > 0) {
    throw new PlannerRefusal([
      `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set`,
      'the backlog-planner board is required; an unset board is a refusal, not a skip',
    ]);
  }
  const actor = environment.BACKLOG_PLANNER_ACTOR || hostActor(hostname());
  const agent = environment.BACKLOG_PLANNER_AGENT || null;
  return { url, project, actor, agent };
}

export function claimBranch(cwd = process.cwd()) {
  let branch;
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
  return branch === 'main' || branch === 'HEAD' || branch.length === 0 ? null : branch;
}

function claimsUrl(configuration, ticket) {
  const target = new URL(`/api/projects/${configuration.project}/claims`, configuration.url);
  if (ticket !== undefined) target.searchParams.set('ticket', ticket);
  return target;
}

async function request(configuration, ticket, init) {
  let response;
  try {
    response = await fetch(claimsUrl(configuration, init === undefined ? ticket : undefined), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PlannerRefusal([
      `the backlog-planner board at ${configuration.url} did not answer: ${error.message}`,
    ]);
  }
  const text = await response.text();
  let body = null;
  try {
    body = text.length === 0 ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = body?.error?.message ?? text;
    throw new PlannerRefusal(
      [`${ticket}: the board answered ${response.status}${message ? `: ${message}` : ''}`],
      response.status,
    );
  }
  return body;
}

export function readClaim(configuration, ticket) {
  return request(configuration, ticket);
}

function post(configuration, ticket, kind) {
  const body = {
    ticket,
    kind,
    ...(configuration.actor === null ? {} : { actor: configuration.actor }),
    ...(configuration.agent === null ? {} : { agent: configuration.agent }),
    ...(kind === 'take' && configuration.branch ? { branch: configuration.branch } : {}),
  };
  return request(configuration, ticket, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function takeClaim(configuration, ticket) {
  const current = await readClaim(configuration, ticket);
  const holder = current.claim?.actor?.key ?? null;
  if (holder !== null && holder === configuration.actor) return { outcome: 'held', holder };
  if (holder !== null) {
    throw new PlannerRefusal([`${ticket} is held by ${holder}`]);
  }
  const taken = await post(configuration, ticket, 'take');
  return { outcome: 'taken', holder: taken.claim?.actor?.key ?? configuration.actor };
}

export async function releaseClaim(configuration, ticket) {
  const current = await readClaim(configuration, ticket);
  if (current.claim === null) return { outcome: 'unclaimed', holder: null };
  const holder = current.claim.actor?.key ?? null;
  await post(configuration, ticket, 'release');
  return { outcome: 'released', holder };
}

export async function releaseClaims(tickets, configuration) {
  const lines = [];
  for (const ticket of tickets) {
    const result = await releaseClaim(configuration, ticket);
    lines.push(
      result.outcome === 'released'
        ? `released ${ticket} (was held by ${result.holder ?? 'an unnamed actor'})`
        : `${ticket} has no claim`,
    );
  }
  return lines;
}

function refuse(lines) {
  process.stderr.write(`${lines.map((line) => `claim: ${line}`).join('\n')}\n`);
  process.exit(2);
}

function usage() {
  return [
    'usage: npm run ops -- backlog <claim|release> <ticket...>',
    'a ticket is a canonical id such as set/01-work or a ticket file path',
  ];
}

async function main(argv) {
  const [command, ...references] = argv;
  if (!['claim', 'release'].includes(command) || references.length === 0) refuse(usage());
  const tickets = references.map((reference) => {
    const id = ticketIdFrom(reference);
    if (id === null) refuse([`${reference} is neither a ticket id nor a ticket file path`]);
    return id;
  });
  let configuration;
  try {
    configuration = { ...plannerConfiguration(), branch: claimBranch() };
  } catch (error) {
    if (error instanceof PlannerRefusal) refuse(error.lines);
    throw error;
  }
  try {
    for (const ticket of tickets) {
      if (command === 'claim') {
        const result = await takeClaim(configuration, ticket);
        process.stdout.write(
          result.outcome === 'taken'
            ? `claim: took ${ticket} as ${result.holder}\n`
            : `claim: ${ticket} is already held by ${result.holder}\n`,
        );
      } else {
        const [line] = await releaseClaims([ticket], configuration);
        process.stdout.write(`claim: ${line}\n`);
      }
    }
  } catch (error) {
    if (error instanceof PlannerRefusal) refuse(error.lines);
    throw error;
  }
}

const invoked = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await main(process.argv.slice(2));
