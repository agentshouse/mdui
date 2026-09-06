import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { compactBacklogState, compileBacklog } from './backlog-model.mjs';

const OBSOLETE_ARTIFACTS = [
  'docs/backlog/TRACKS.md',
  '.lavish/launch-tracker.html',
  '.lavish/backlog-plan.html',
  '.lavish/backlog-reservations.json',
];

function fromBacklog(path) {
  return path.startsWith('docs/backlog/') ? path.slice('docs/backlog/'.length) : `../../${path}`;
}

function statusCounts(tickets, vocabulary) {
  const counts = new Map(vocabulary.map((status) => [status, 0]));
  for (const ticket of tickets) counts.set(ticket.status, (counts.get(ticket.status) ?? 0) + 1);
  return vocabulary
    .flatMap((status) => {
      const count = counts.get(status) ?? 0;
      return count === 0 ? [] : [`${count} ${status}`];
    })
    .join('; ');
}

function linkedOwnership(ownership) {
  return `[${ownership.title}](OWNERSHIP.md#${ownership.id})`;
}

function renderIndex(state) {
  const ticketById = new Map(state.tickets.map((ticket) => [ticket.id, ticket]));
  const lines = [
    '# Backlog INDEX',
    '',
    '> Operator-local derived view. Edit ticket headers or `backlog.config.json`,',
    '> not this file.',
    '',
    `Machine-readable state: [state.json](state.json)`,
    '',
    '## Backlog summary',
    '',
    '| Measure | Value |',
    '| --- | ---: |',
    `| All tickets | ${state.summary.tickets} |`,
    `| All open tickets | ${state.summary.open} |`,
    `| Resolved tickets | ${state.summary.resolved} |`,
    `| Available Delivery Tracks | ${state.summary.readyTracks} |`,
    `| Tracks blocked by other Tracks | ${state.summary.blockedTracks} |`,
    `| Tracks needing attention | ${state.summary.attentionTracks} |`,
    `| Agent-ready next tickets | ${state.summary.frontier} |`,
    `| Open tickets waiting on dependencies | ${state.summary.waiting} |`,
    `| Unclassified open tickets | ${state.summary.unclassified} |`,
    '',
    '## Delivery Tracks',
    '',
    '| Track | State | Result | Progress | Next | Blocked by |',
    '| --- | --- | --- | ---: | --- | --- |',
  ];

  for (const track of state.delivery.tracks) {
    const next = track.nextTicket === null ? 'complete' : ticketById.get(track.nextTicket).status;
    lines.push(
      `| ${track.title} | ${track.state} | ${track.outcome} | ${track.progress.resolved}/${track.progress.total} | ${next} | ${track.blockedBy.join(', ') || 'none'} |`,
    );
  }

  lines.push(
    '',
    'Every open ticket belongs to exactly one Track. Cross-Track blockers are derived from',
    'ticket dependencies. The dispatch view lists available Tracks; the Master selects',
    'within the frontier. No ticket or Track is selected by the compiler.',
    '',
    '## Ownership',
    '',
    '| Ownership | Ticket status |',
    '| --- | --- |',
  );
  for (const ownership of state.ownerships) {
    const tickets = ownership.tickets.map((id) => ticketById.get(id));
    lines.push(
      `| ${linkedOwnership(ownership)} | ${statusCounts(tickets, state.statusVocabulary)} |`,
    );
  }

  lines.push('', '## Execution sets', '', '| Set | Status |', '| --- | --- |');
  for (const set of state.executionSets) {
    const tickets = set.tickets.map((id) => ticketById.get(id));
    lines.push(
      `| [${set.title}](${fromBacklog(set.path)}/) | ${statusCounts(tickets, state.statusVocabulary)} |`,
    );
  }

  if (state.zones.length > 0) {
    lines.push('', '## Zones', '', '| Zone | Status |', '| --- | --- |');
    for (const zone of state.zones) {
      const counts = Object.entries(zone.counts)
        .map(([status, count]) => `${count} ${status}`)
        .join('; ');
      lines.push(
        `| [${zone.title}](zones/${zone.id}.md) | ${zone.total} ${zone.total === 1 ? 'idea' : 'ideas'}: ${counts} |`,
      );
    }
  }

  if (state.unclassified.length > 0) {
    lines.push('', '## Unclassified open tickets', '');
    for (const id of state.unclassified)
      lines.push(`- [${id}](${fromBacklog(ticketById.get(id).path)})`);
  }

  if (state.danglingDependencies.length > 0 || state.dependencyCycles.length > 0) {
    lines.push('', '## Dependency errors', '');
    for (const edge of state.danglingDependencies)
      lines.push(`- Unknown dependency: \`${edge.ticket}\` -> \`${edge.dependency}\``);
    for (const cycle of state.dependencyCycles)
      lines.push(`- Cycle: ${cycle.map((id) => `\`${id}\``).join(' -> ')}`);
  }

  return `${lines.join('\n')}\n`;
}

function renderOwnerships(state) {
  const lines = [
    '# Backlog ownership',
    '',
    '> Operator-local derived view compiled from `backlog.config.json`.',
    '> Edit the configuration, not this file.',
    '',
    'Ownership is the stable capability owner for a ticket. It does not imply delivery order,',
    'readiness, or dependency. Delivery Tracks are finite ordered chains compiled separately.',
    'Existing resolved tickets and rejected proposals may remain valid historical records',
    'without ownership assignment.',
    '',
    '## Routing rules',
    '',
    ...state.routingRules.map((rule) => `- ${rule}`),
  ];

  for (const ownership of state.ownerships) {
    lines.push(
      '',
      `## ${ownership.title}`,
      '',
      `<a id="${ownership.id}"></a>`,
      '',
      ownership.description,
    );
    lines.push('', 'Includes:', '', ...ownership.includes.map((item) => `- ${item}`));
    lines.push('', 'Does not include:', '', ...ownership.excludes.map((item) => `- ${item}`));
    const pendingEvidence = ownership.pendingEvidence ?? [];
    if (pendingEvidence.length > 0)
      lines.push(
        '',
        'Owed but not yet ticketed, because the capability it certifies does not exist:',
        '',
        ...pendingEvidence.map((item) => `- ${item}`),
      );
  }

  return `${lines.join('\n')}\n`;
}

export function backlogArtifacts(root) {
  const { state } = compileBacklog(root);
  const compactState = compactBacklogState(state);
  return [
    {
      path: join(root, 'docs/backlog/state.json'),
      content: `${JSON.stringify(compactState, null, 2)}\n`,
    },
    {
      path: join(root, 'docs/backlog/INDEX.md'),
      content: renderIndex(state),
    },
    {
      path: join(root, 'docs/backlog/OWNERSHIP.md'),
      content: renderOwnerships(state),
    },
  ];
}

export function obsoleteArtifacts(root) {
  return OBSOLETE_ARTIFACTS.map((path) => join(root, path)).filter((path) => existsSync(path));
}

export function writeBacklogArtifacts(root, artifacts) {
  for (const artifact of artifacts) {
    mkdirSync(dirname(artifact.path), { recursive: true });
    writeFileSync(artifact.path, artifact.content);
  }
  for (const path of obsoleteArtifacts(root)) unlinkSync(path);
}
