#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PlannerRefusal,
  plannerConfiguration,
  readClaim,
  ticketIdFrom,
} from './backlog-claims.mjs';
import { compileBacklog } from './backlog-model.mjs';
import { openPullRequests } from './pull-requests.mjs';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArguments(argv) {
  const options = { json: false, dispatch: false, root: repositoryRoot };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--dispatch') options.dispatch = true;
    else if (argument === '--root') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--'))
        throw new Error('backlog frontier --root requires a value');
      options.root = resolve(value);
      index += 1;
    } else throw new Error(`unknown backlog frontier argument: ${argument}`);
  }
  return options;
}

function refuse(lines) {
  process.stderr.write(`${lines.map((line) => `frontier: ${line}`).join('\n')}\n`);
  process.exit(2);
}

export function minesOf(body) {
  const match = body.match(/^##\s+Mines\s*$\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m);
  return match === null ? '' : match[1].trim();
}

function trackView(track, ticketById) {
  const next = track.nextTicket === null ? null : ticketById.get(track.nextTicket);
  return {
    id: track.id,
    title: track.title,
    outcome: track.outcome,
    state: track.state,
    progress: track.progress,
    blockedBy: track.blockedBy,
    laterBlockedBy: track.laterBlockedBy,
    next: next === null ? null : { id: next.id, status: next.status },
  };
}

function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? '' : `${pad}${line}`))
    .join('\n');
}

async function claimsByTicket(configuration, ticketIds) {
  const found = new Map();
  for (const id of ticketIds) {
    try {
      const detail = await readClaim(configuration, id);
      if (detail.claim !== null) found.set(id, detail.claim);
    } catch (error) {
      if (error instanceof PlannerRefusal && error.status === 404) continue;
      throw error;
    }
  }
  return found;
}

async function dispatchView(root, state, tickets) {
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const trackById = new Map(state.delivery.tracks.map((track) => [track.id, track]));
  const candidates = state.delivery.readyTracks.map((trackId) => {
    const track = trackById.get(trackId);
    return { track, ticket: ticketById.get(track.nextTicket) };
  });
  let configuration;
  try {
    configuration = plannerConfiguration();
  } catch (error) {
    if (error instanceof PlannerRefusal) refuse(error.lines);
    throw error;
  }
  let pullRequests;
  try {
    pullRequests = openPullRequests({ cwd: root }).map((pullRequest) => ({
      ...pullRequest,
      ticketIds: pullRequest.tickets
        .map((path) => ticketIdFrom(path))
        .filter((id) => id !== null && ticketById.has(id)),
    }));
  } catch (error) {
    refuse([`open pull requests are unavailable: ${error.message}`]);
  }
  const ownerships = new Set(candidates.map(({ ticket }) => ticket.ownership));
  const openByOwnership = new Map(
    [...ownerships].map((ownership) => [
      ownership,
      tickets
        .filter(
          (ticket) => ticket.ownership === ownership && state.openStatuses.includes(ticket.status),
        )
        .map((ticket) => ticket.id),
    ]),
  );
  let claims;
  try {
    claims = await claimsByTicket(configuration, [
      ...new Set([...openByOwnership.values()].flat()),
    ]);
  } catch (error) {
    if (error instanceof PlannerRefusal) refuse(error.lines);
    throw error;
  }

  const lines = [`dispatch view: ${candidates.length} available Tracks`];
  for (const { track, ticket } of candidates) {
    lines.push('', `${track.title} [${track.id}]`);
    lines.push(`  next: ${ticket.status} ${ticket.id}`);
    lines.push(`  ownership: ${ticket.ownership}`);
    const mines = minesOf(ticket.body);
    lines.push('  mines:');
    lines.push(mines.length === 0 ? '    none' : indent(mines, 4));
    const sharing = pullRequests
      .map((pullRequest) => ({
        ...pullRequest,
        shared: pullRequest.ticketIds.filter(
          (id) => ticketById.get(id).ownership === ticket.ownership,
        ),
      }))
      .filter((pullRequest) => pullRequest.shared.length > 0);
    lines.push('  open PRs on this Ownership:');
    if (sharing.length === 0) lines.push('    none');
    for (const pullRequest of sharing) {
      lines.push(
        `    #${pullRequest.number} ${pullRequest.title} (${pullRequest.branch}): ${pullRequest.shared.join(', ')}`,
      );
    }
    lines.push('  claims on this Ownership:');
    const held = (openByOwnership.get(ticket.ownership) ?? []).filter((id) => claims.has(id));
    if (held.length === 0) lines.push('    none');
    for (const id of held) {
      const claim = claims.get(id);
      const where = claim.branch ? ` on ${claim.branch}` : '';
      const who = claim.agent ? `${claim.actor.key} (${claim.agent})` : claim.actor.key;
      lines.push(`    ${id}: ${who}${where} since ${claim.takenAt}`);
    }
  }
  console.log(lines.join('\n'));
}

function printFrontier(state, ticketById, trackById) {
  console.log(`available Tracks: ${state.delivery.readyTracks.length}`);
  for (const trackId of state.delivery.readyTracks) {
    const track = trackById.get(trackId);
    const next = ticketById.get(track.nextTicket);
    console.log(`\n  ${track.title} [${track.id}]`);
    console.log(`    outcome: ${track.outcome}`);
    console.log(`    progress: ${track.progress.resolved}/${track.progress.total} resolved`);
    console.log(`    next: ${next.status} ${next.id}`);
    if (track.laterBlockedBy.length > 0)
      console.log(`    later waits on: ${track.laterBlockedBy.join(', ')}`);
  }

  console.log(`\nblocked at the next ticket: ${state.delivery.blockedTracks.length}`);
  for (const trackId of state.delivery.blockedTracks) {
    const track = trackById.get(trackId);
    console.log(`  ${track.title} [${track.id}]`);
    console.log(`    blocked by: ${track.blockedBy.join(', ')}`);
  }

  console.log(
    `\nTracks needing attention at their next ticket: ${state.delivery.attentionTracks.length}`,
  );
  for (const trackId of state.delivery.attentionTracks) {
    const track = trackById.get(trackId);
    const next = ticketById.get(track.nextTicket);
    console.log(`  ${track.title} [${track.id}]`);
    console.log(`    next: ${next.status} ${next.id}`);
  }

  console.log(`\ncompleted Tracks: ${state.delivery.completedTracks.length}`);

  if (state.longestUnresolvedChain.length > 0) {
    console.log(`\nlongest unresolved ticket chain: ${state.longestUnresolvedChain.length}`);
    for (const id of state.longestUnresolvedChain) console.log(`    ${id}`);
  }

  if (state.danglingDependencies.length > 0) {
    console.log(`\nunknown dependency references: ${state.danglingDependencies.length}`);
    for (const { ticket, dependency } of state.danglingDependencies)
      console.log(`    ${ticket} -> ${dependency}`);
  }

  if (state.dependencyCycles.length > 0) {
    console.log(`\ndependency cycles: ${state.dependencyCycles.length}`);
    for (const cycle of state.dependencyCycles) console.log(`    ${cycle.join(' -> ')}`);
  }
}

async function main(argv) {
  const options = parseArguments(argv);
  const { state, tickets } = compileBacklog(options.root);
  const ticketById = new Map(state.tickets.map((ticket) => [ticket.id, ticket]));
  const trackById = new Map(state.delivery.tracks.map((track) => [track.id, track]));
  const broken = state.danglingDependencies.length > 0 || state.dependencyCycles.length > 0;

  if (options.dispatch) {
    if (broken) refuse(['the backlog does not compile; run backlog frontier first']);
    await dispatchView(options.root, state, tickets);
    return 0;
  }
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          readyTracks: state.delivery.readyTracks.map((id) =>
            trackView(trackById.get(id), ticketById),
          ),
          blockedTracks: state.delivery.blockedTracks.map((id) =>
            trackView(trackById.get(id), ticketById),
          ),
          attentionTracks: state.delivery.attentionTracks.map((id) =>
            trackView(trackById.get(id), ticketById),
          ),
          completedTracks: state.delivery.completedTracks.map((id) =>
            trackView(trackById.get(id), ticketById),
          ),
          longestTicketChain: state.longestUnresolvedChain,
          dangling: state.danglingDependencies.map(
            ({ ticket, dependency }) => `${ticket} -> ${dependency}`,
          ),
          cycles: state.dependencyCycles,
        },
        null,
        2,
      ),
    );
  } else printFrontier(state, ticketById, trackById);
  return broken ? 1 : 0;
}

const invoked = process.argv[1]?.endsWith('backlog-frontier.mjs');
if (invoked) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`backlog frontier: ${error.message ?? error}\n`);
    process.exit(1);
  }
}
