import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';

export const ARCHIVE_PATH = 'docs/backlog/archive.json';

function portable(path) {
  return path.split(sep).join('/');
}

function filesBelow(directory, accept) {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...filesBelow(path, accept));
    else if (accept(entry)) found.push(path);
  }
  return found;
}

function field(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return body.match(new RegExp(`^${escaped}:\\s*(.*?)\\s*$`, 'm'))?.[1]?.trim();
}

function ticketTitle(body, ticketId) {
  const heading = body.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  if (heading === undefined) throw new Error(`${ticketId}: missing level-one title`);
  return heading.match(/^\S+\s+-\s+(.+)$/)?.[1]?.trim() ?? heading;
}

const TICKET_ID = /^[A-Za-z0-9_-]+\/[\w.-]+$/;

const RETIRED_HEADER_FIELDS = ['Ownership', 'Blocked by', 'Starts', 'Due'];

function parseTicket(path, root, ticketsRoot, config) {
  const body = readFileSync(path, 'utf8');
  const headerEnd = body.search(/^##\s/m);
  const header = headerEnd === -1 ? body : body.slice(0, headerEnd);
  const id = portable(relative(ticketsRoot, path)).replace(/\.md$/, '');
  const set = id.split('/')[0];
  const name = id.slice(set.length + 1);
  const status = field(header, 'Status') ?? 'unknown';
  const errors = [];

  if (!config.statuses.includes(status)) errors.push(`unknown Status: ${status}`);
  for (const retired of RETIRED_HEADER_FIELDS)
    if (field(header, retired) !== undefined)
      errors.push(`${retired}: is no longer a ticket header field`);
  if (/^##\s+Skills\s*$/m.test(body)) errors.push('## Skills is no longer a ticket section');
  if (errors.length > 0) throw new Error(`${id}: ${errors.join('; ')}`);

  const references = [...body.matchAll(/\(([\w-]+)\.md\)/g)].map(([, target]) =>
    portable(normalize(join(dirname(id), target))),
  );

  return {
    id,
    path: portable(relative(root, path)),
    set,
    name,
    title: ticketTitle(body, id),
    status,
    ownership: null,
    blockedBy: [],
    references,
    body,
  };
}

function archivedTicket(entry, archiveRepository, config) {
  const errors = [];
  if (typeof entry.id !== 'string' || entry.id.length === 0) errors.push('missing id');
  if (typeof entry.title !== 'string' || entry.title.length === 0) errors.push('missing title');
  if (!config.statuses.includes(entry.status)) errors.push(`unknown Status: ${entry.status}`);
  else if (!config.terminalStatuses.includes(entry.status))
    errors.push(`archived ticket is not terminal: ${entry.status}`);
  if (errors.length > 0)
    throw new Error(`${ARCHIVE_PATH}: ${entry.id ?? '?'}: ${errors.join('; ')}`);

  const set = entry.id.split('/')[0];
  return {
    id: entry.id,
    path: `${archiveRepository}/tickets/${entry.id}.md`,
    set,
    name: entry.id.slice(set.length + 1),
    title: entry.title,
    status: entry.status,
    ownership: entry.ownership ?? null,
    blockedBy: entry.blockedBy ?? [],
    references: [],
    archived: true,
    body: '',
  };
}

export function validateArchiveSnapshot(archive) {
  if (archive.schemaVersion !== 4) throw new Error(`${ARCHIVE_PATH}: schemaVersion must be 4`);
  const archiveFields = ['schemaVersion', 'generatedBy', 'archiveRepository', 'sets', 'tickets'];
  const unknownArchiveFields = Object.keys(archive).filter(
    (field) => !archiveFields.includes(field),
  );
  if (unknownArchiveFields.length > 0)
    throw new Error(`${ARCHIVE_PATH}: unknown fields: ${unknownArchiveFields.join(', ')}`);
  const archiveTicketFields = ['id', 'title', 'status', 'ownership', 'blockedBy'];
  for (const entry of archive.tickets) {
    const unknownFields = Object.keys(entry).filter(
      (field) => !archiveTicketFields.includes(field),
    );
    if (unknownFields.length > 0)
      throw new Error(
        `${ARCHIVE_PATH}: ${entry.id ?? '?'}: unknown fields: ${unknownFields.join(', ')}`,
      );
  }
}

function readArchive(root, config) {
  const path = join(root, ARCHIVE_PATH);
  if (!existsSync(path)) return { paths: [], tickets: [], setTitles: new Map() };
  const archive = JSON.parse(readFileSync(path, 'utf8'));
  validateArchiveSnapshot(archive);
  const repository = archive.archiveRepository;
  if (typeof repository !== 'string' || !repository.startsWith('../'))
    throw new Error(`${ARCHIVE_PATH}: archiveRepository must name a sibling repository`);
  const tickets = archive.tickets.map((entry) => archivedTicket(entry, repository, config));
  const duplicates = tickets
    .map((ticket) => ticket.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicates.length > 0)
    throw new Error(`${ARCHIVE_PATH}: duplicate ticket id: ${[...new Set(duplicates)].join(', ')}`);
  return {
    paths: [path],
    repository,
    tickets,
    setTitles: new Map(Object.entries(archive.sets ?? {})),
  };
}

function countBy(values, vocabulary) {
  return Object.fromEntries(
    vocabulary.map((value) => [value, values.filter((item) => item === value).length]),
  );
}

function titleFromReadme(directory) {
  const readme = join(directory, 'README.md');
  let body;
  try {
    body = readFileSync(readme, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const title = body.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  if (title === undefined) throw new Error(`${readme}: missing level-one title`);
  return title;
}

function parseZones(root) {
  const zonesRoot = join(root, 'docs/backlog/zones');
  return filesBelow(zonesRoot, (entry) => entry.endsWith('.md'))
    .map((path) => {
      const body = readFileSync(path, 'utf8');
      const id = path.slice(path.lastIndexOf(sep) + 1).replace(/\.md$/, '');
      const title = body.match(/^#\s+Zone:\s+(.+?)\s*$/m)?.[1]?.trim();
      if (title === undefined) throw new Error(`${path}: missing "# Zone:" title`);
      const ideas = [
        ...body.matchAll(/^###\s+(\S+)\s*$[\s\S]*?^Status:\s*(\S+)(?:\s+\([^\n]*\))?\s*$/gm),
      ].map(([, handle, status]) => ({ handle, status }));
      const statuses = [...new Set(ideas.map((idea) => idea.status))].sort();
      return {
        id,
        title,
        path: portable(relative(root, path)),
        total: ideas.length,
        counts: countBy(
          ideas.map((idea) => idea.status),
          statuses,
        ),
        ideas,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function applyAuthoredPlan(tickets, config) {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const live = new Set(
    tickets.filter((ticket) => ticket.archived !== true).map((ticket) => ticket.id),
  );
  const { tracks, ownership, dependencies } = config.delivery;
  const ownershipIds = new Set(config.ownerships.map((candidate) => candidate.id));
  const errors = [];

  const placement = new Map();
  for (const track of tracks)
    for (const [index, id] of track.tickets.entries())
      placement.set(id, { track: track.id, index });

  for (const [id, owner] of Object.entries(ownership)) {
    if (!live.has(id)) errors.push(`delivery.ownership names an unknown ticket: ${id}`);
    else if (!ownershipIds.has(owner)) errors.push(`${id}: unknown Ownership: ${owner}`);
    else byId.get(id).ownership = owner;
  }
  for (const id of live)
    if (config.openStatuses.includes(byId.get(id).status) && byId.get(id).ownership === null)
      errors.push(`open ticket has no Ownership in delivery.ownership: ${id}`);

  for (const track of tracks)
    for (const [index, id] of track.tickets.entries()) {
      if (index === 0 || !live.has(id)) continue;
      byId.get(id).blockedBy.push(track.tickets[index - 1]);
    }

  for (const [id, required] of Object.entries(dependencies)) {
    if (!live.has(id)) {
      errors.push(`delivery.dependencies names an unknown ticket: ${id}`);
      continue;
    }
    const here = placement.get(id);
    for (const target of required) {
      const there = placement.get(target);
      if (here === undefined || there === undefined || here.track !== there.track) continue;
      if (there.index < here.index)
        errors.push(`${id}: Track ${here.track} already orders its edge to ${target}`);
      else
        errors.push(
          `${id}: Track ${here.track} places its prerequisite ${target} later; reorder the Track`,
        );
    }
    byId.get(id).blockedBy.push(...required);
  }

  for (const ticket of tickets.filter((candidate) => live.has(candidate.id))) {
    const seen = new Set();
    for (const dependency of ticket.blockedBy) {
      if (seen.has(dependency)) errors.push(`${ticket.id}: duplicate dependency: ${dependency}`);
      seen.add(dependency);
    }
  }

  if (errors.length > 0) throw new Error(`backlog.config.json: ${errors.join('; ')}`);
}

function dependencyAnalysis(tickets, openStatuses) {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const danglingDependencies = [];
  for (const ticket of tickets.filter((candidate) => openStatuses.includes(candidate.status)))
    for (const dependency of ticket.blockedBy)
      if (!byId.has(dependency)) danglingDependencies.push({ ticket: ticket.id, dependency });

  for (const ticket of tickets)
    ticket.unmetDependencies = ticket.blockedBy.filter(
      (dependency) => byId.get(dependency)?.status !== 'resolved',
    );

  const cycles = [];
  const cycleKeys = new Set();
  function visit(id, path, visiting) {
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      const cycle = [...path.slice(start), id];
      const key = [...new Set(cycle)].sort().join('|');
      if (!cycleKeys.has(key)) {
        cycleKeys.add(key);
        cycles.push(cycle);
      }
      return;
    }
    const ticket = byId.get(id);
    if (ticket === undefined) return;
    const nextVisiting = new Set(visiting).add(id);
    for (const dependency of ticket.blockedBy) visit(dependency, [...path, id], nextVisiting);
  }
  for (const ticket of tickets) visit(ticket.id, [], new Set());

  const depthCache = new Map();
  function depth(id, seen = new Set()) {
    if (depthCache.has(id)) return depthCache.get(id);
    const ticket = byId.get(id);
    if (ticket === undefined || ticket.status === 'resolved' || seen.has(id)) return 0;
    const next = new Set(seen).add(id);
    const value =
      1 +
      ticket.blockedBy.reduce(
        (longest, dependency) => Math.max(longest, depth(dependency, next)),
        0,
      );
    depthCache.set(id, value);
    return value;
  }
  function chain(id, seen = new Set()) {
    if (seen.has(id)) return [id];
    const ticket = byId.get(id);
    if (ticket === undefined) return [];
    const next = new Set(seen).add(id);
    const dependency = ticket.blockedBy
      .filter((candidate) => byId.get(candidate)?.status !== 'resolved')
      .sort((left, right) => depth(right) - depth(left) || left.localeCompare(right))[0];
    return dependency === undefined ? [id] : [...chain(dependency, next), id];
  }

  const open = tickets.filter((ticket) => openStatuses.includes(ticket.status));
  const frontier = open.filter((ticket) => ticket.unmetDependencies.length === 0);
  const waiting = open.filter((ticket) => ticket.unmetDependencies.length > 0);
  const deepest = [...open].sort(
    (left, right) => depth(right.id) - depth(left.id) || left.id.localeCompare(right.id),
  )[0];

  return {
    danglingDependencies,
    cycles,
    frontier,
    waiting,
    longestUnresolvedChain: deepest === undefined ? [] : chain(deepest.id),
  };
}

function summarizeDefinition(definition, tickets, config) {
  return {
    ...definition,
    counts: {
      statuses: countBy(
        tickets.map((ticket) => ticket.status),
        config.statuses,
      ),
    },
    tickets: tickets.map((ticket) => ticket.id),
  };
}

function sourceDigest(root, sourcePaths) {
  const digest = createHash('sha256');
  for (const path of [...sourcePaths].sort()) {
    digest.update(portable(relative(root, path)));
    digest.update('\0');
    digest.update(readFileSync(path));
    digest.update('\0');
  }
  return digest.digest('hex');
}

export function validateBacklogConfig(config) {
  if (config.schemaVersion !== 12) throw new Error('backlog.config.json schemaVersion must be 12');
  const configFields = [
    'schemaVersion',
    'statuses',
    'openStatuses',
    'terminalStatuses',
    'historicalUnclassifiedTickets',
    'ownerships',
    'delivery',
    'ownershipGroups',
    'routingRules',
    'deliveryRules',
  ];
  const unknownConfigFields = Object.keys(config).filter((field) => !configFields.includes(field));
  if (unknownConfigFields.length > 0)
    throw new Error(`backlog.config.json has unknown fields: ${unknownConfigFields.join(', ')}`);
  if (!Array.isArray(config.ownershipGroups) || config.ownershipGroups.length === 0)
    throw new Error('backlog.config.json must define ownershipGroups');
  for (const group of config.ownershipGroups) {
    if (!['ownership', 'history'].includes(group.kind))
      throw new Error(`${group.id}: ownership group must declare ownership or history kind`);
    if (
      group.kind === 'ownership' &&
      (!Array.isArray(group.ownershipIds) || group.ownershipIds.length === 0)
    )
      throw new Error(`${group.id}: ownership group must contain at least one ownership`);
    if (group.kind === 'history' && group.ownershipIds !== undefined)
      throw new Error(`${group.id}: history ownership group cannot contain ownerships`);
    if (
      group.planned !== undefined &&
      (!Array.isArray(group.planned) ||
        group.planned.length === 0 ||
        group.planned.some((note) => typeof note !== 'string' || note.length === 0))
    )
      throw new Error(`${group.id}: planned must be a list of non-empty notes`);
  }
  const ownershipIds = config.ownerships.map((ownership) => ownership.id);
  const ownershipGroupIds = config.ownershipGroups.map((group) => group.id);
  const ownershipGroupOwnershipIds = config.ownershipGroups.flatMap(
    (group) => group.ownershipIds ?? [],
  );
  const historyGroups = config.ownershipGroups.filter((group) => group.kind === 'history');
  const statusIds = config.statuses;
  const openStatusIds = config.openStatuses;
  const terminalStatusIds = config.terminalStatuses;
  if (new Set(ownershipIds).size !== ownershipIds.length)
    throw new Error('duplicate ownership id in backlog.config.json');
  if (new Set(ownershipGroupIds).size !== ownershipGroupIds.length)
    throw new Error('duplicate ownership group id in backlog.config.json');
  if (historyGroups.length !== 1)
    throw new Error('backlog.config.json must define exactly one history ownership group');
  if (new Set(ownershipGroupOwnershipIds).size !== ownershipGroupOwnershipIds.length)
    throw new Error('an ownership belongs to more than one ownership group in backlog.config.json');
  for (const ownershipId of ownershipGroupOwnershipIds)
    if (!ownershipIds.includes(ownershipId))
      throw new Error(`ownership group has unknown ownership: ${ownershipId}`);
  for (const ownershipId of ownershipIds)
    if (!ownershipGroupOwnershipIds.includes(ownershipId))
      throw new Error(`ownership has no ownership group: ${ownershipId}`);
  if (new Set(statusIds).size !== statusIds.length)
    throw new Error('duplicate status in backlog.config.json');
  if (new Set(openStatusIds).size !== openStatusIds.length)
    throw new Error('duplicate open status in backlog.config.json');
  if (new Set(terminalStatusIds).size !== terminalStatusIds.length)
    throw new Error('duplicate terminal status in backlog.config.json');
  for (const status of [...openStatusIds, ...terminalStatusIds])
    if (!statusIds.includes(status))
      throw new Error(`status lifecycle entry is absent from statuses: ${status}`);
  for (const status of openStatusIds)
    if (terminalStatusIds.includes(status))
      throw new Error(`status cannot be both open and terminal: ${status}`);
  for (const status of statusIds)
    if (!openStatusIds.includes(status) && !terminalStatusIds.includes(status))
      throw new Error(`status is neither open nor terminal: ${status}`);
  if (typeof config.historicalUnclassifiedTickets !== 'string')
    throw new Error('historicalUnclassifiedTickets must name its manifest');
  if (config.delivery === null || typeof config.delivery !== 'object')
    throw new Error('backlog.config.json must define delivery');
  if (!Array.isArray(config.delivery.tracks) || config.delivery.tracks.length === 0)
    throw new Error('delivery.tracks must contain at least one Track');
  const deliveryTrackIds = [];
  for (const track of config.delivery.tracks) {
    deliveryTrackIds.push(track.id);
    if (
      typeof track.id !== 'string' ||
      typeof track.title !== 'string' ||
      typeof track.outcome !== 'string' ||
      track.outcome.length === 0
    )
      throw new Error('every Track must define id, title, and outcome');
    if (track.title.length > 28)
      throw new Error(`${track.id}: Track title exceeds 28 characters; put detail in outcome`);
    if (
      !Array.isArray(track.tickets) ||
      track.tickets.length === 0 ||
      track.tickets.some((ticketId) => typeof ticketId !== 'string' || ticketId.length === 0)
    )
      throw new Error(`${track.id}: Track tickets must be a non-empty list of ticket ids`);
    if (new Set(track.tickets).size !== track.tickets.length)
      throw new Error(`${track.id}: duplicate ticket in Track`);
  }
  if (new Set(deliveryTrackIds).size !== deliveryTrackIds.length)
    throw new Error('duplicate delivery Track id in backlog.config.json');
  const deliveryFields = ['tracks', 'ownership', 'dependencies'];
  const unknownDeliveryFields = Object.keys(config.delivery).filter(
    (field) => !deliveryFields.includes(field),
  );
  if (unknownDeliveryFields.length > 0)
    throw new Error(`delivery has unknown fields: ${unknownDeliveryFields.join(', ')}`);
  if (config.delivery.ownership === null || typeof config.delivery.ownership !== 'object')
    throw new Error('delivery.ownership must map every live ticket id to one Ownership');
  for (const [id, owner] of Object.entries(config.delivery.ownership)) {
    if (!TICKET_ID.test(id)) throw new Error(`delivery.ownership: not a ticket id: ${id}`);
    if (typeof owner !== 'string' || owner.length === 0)
      throw new Error(`delivery.ownership: ${id} must name one Ownership`);
  }
  if (config.delivery.dependencies === null || typeof config.delivery.dependencies !== 'object')
    throw new Error('delivery.dependencies must map a ticket id to its authored prerequisites');
  for (const [id, required] of Object.entries(config.delivery.dependencies)) {
    if (!TICKET_ID.test(id)) throw new Error(`delivery.dependencies: not a ticket id: ${id}`);
    if (!Array.isArray(required) || required.length === 0)
      throw new Error(`delivery.dependencies: ${id} must list at least one prerequisite`);
    if (new Set(required).size !== required.length)
      throw new Error(`delivery.dependencies: ${id} repeats a prerequisite`);
    for (const target of required) {
      if (typeof target !== 'string' || !TICKET_ID.test(target))
        throw new Error(`delivery.dependencies: ${id}: not a ticket id: ${target}`);
      if (target === id) throw new Error(`delivery.dependencies: ${id} depends on itself`);
    }
  }
  if (!Array.isArray(config.deliveryRules) || config.deliveryRules.length === 0)
    throw new Error('deliveryRules must contain at least one rule');
}

function historicalUnclassified(root, config, tickets) {
  const manifestPath = resolve(root, config.historicalUnclassifiedTickets);
  const manifestRelative = portable(relative(root, manifestPath));
  if (manifestRelative === '..' || manifestRelative.startsWith('../'))
    throw new Error('historicalUnclassifiedTickets leaves the repository');
  const ids = readFileSync(manifestPath, 'utf8')
    .split(/\r?\n/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (new Set(ids).size !== ids.length) throw new Error(`${manifestRelative}: duplicate ticket id`);

  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const declared = new Set(ids);
  const actual = tickets
    .filter((ticket) => ticket.ownership === null)
    .map((ticket) => ticket.id)
    .sort();
  const errors = [];
  for (const id of ids) {
    const ticket = ticketById.get(id);
    if (ticket === undefined) errors.push(`missing historical ticket: ${id}`);
    else if (ticket.ownership !== null) errors.push(`historical ticket is now classified: ${id}`);
    else if (!config.terminalStatuses.includes(ticket.status))
      errors.push(`historical ticket is no longer terminal: ${id}`);
  }
  for (const id of actual)
    if (!declared.has(id)) errors.push(`unapproved unclassified ticket: ${id}`);
  if (errors.length > 0) throw new Error(`${manifestRelative}: ${errors.join('; ')}`);
  return { path: manifestRelative, ids };
}

function compileDeliveryPlan(definition, rules, tickets, openStatuses) {
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const placement = new Map();
  const records = definition.tracks.map((track) => {
    const ticketRecords = track.tickets.map((ticketId) => {
      const ticket = ticketById.get(ticketId);
      if (ticket === undefined) throw new Error(`${track.id}: unknown Track ticket ${ticketId}`);
      const existing = placement.get(ticketId);
      if (existing !== undefined)
        throw new Error(`${ticketId}: belongs to both ${existing} and ${track.id}`);
      placement.set(ticketId, track.id);
      return ticket;
    });
    return { ...track, ticketRecords };
  });
  const unassignedOpen = tickets
    .filter((ticket) => openStatuses.includes(ticket.status) && !placement.has(ticket.id))
    .map((ticket) => ticket.id)
    .sort();
  if (unassignedOpen.length > 0)
    throw new Error(`open tickets without a Track: ${unassignedOpen.join(', ')}`);

  for (const track of records) {
    const position = new Map(track.ticketRecords.map((ticket, index) => [ticket.id, index]));
    for (const ticket of track.ticketRecords.filter((candidate) =>
      openStatuses.includes(candidate.status),
    )) {
      const laterDependencies = ticket.unmetDependencies.filter(
        (dependency) =>
          placement.get(dependency) === track.id &&
          position.get(dependency) > position.get(ticket.id),
      );
      if (laterDependencies.length > 0)
        throw new Error(
          `${track.id}: Track order puts ${ticket.id} before its unresolved prerequisite: ${laterDependencies.join(', ')}`,
        );
    }
  }

  const tracks = records.map((track) => {
    const openTickets = track.ticketRecords.filter((ticket) =>
      openStatuses.includes(ticket.status),
    );
    const dependencyTracks = [
      ...new Set(
        openTickets.flatMap((ticket) =>
          ticket.unmetDependencies.flatMap((dependency) => {
            const dependencyTrack = placement.get(dependency);
            return dependencyTrack === undefined || dependencyTrack === track.id
              ? []
              : [dependencyTrack];
          }),
        ),
      ),
    ].sort();
    const nextTicket = openTickets[0] ?? null;
    const blockedBy = [
      ...new Set(
        (nextTicket?.unmetDependencies ?? []).flatMap((dependency) => {
          const dependencyTrack = placement.get(dependency);
          return dependencyTrack === undefined || dependencyTrack === track.id
            ? []
            : [dependencyTrack];
        }),
      ),
    ].sort();
    const laterBlockedBy = dependencyTracks.filter((dependency) => !blockedBy.includes(dependency));
    const state =
      nextTicket === null
        ? 'completed'
        : blockedBy.length > 0
          ? 'blocked'
          : ['ready-for-agent', 'ready-for-human'].includes(nextTicket.status)
            ? 'ready'
            : 'attention';
    return {
      id: track.id,
      title: track.title,
      outcome: track.outcome,
      state,
      tickets: track.tickets,
      openTickets: openTickets.map((ticket) => ticket.id),
      nextTicket: nextTicket?.id ?? null,
      nextStatus: nextTicket?.status ?? null,
      blockedBy,
      laterBlockedBy,
      ownerships: [
        ...new Set(
          track.ticketRecords.flatMap((ticket) =>
            ticket.ownership === null ? [] : [ticket.ownership],
          ),
        ),
      ].sort(),
      executionSets: [...new Set(track.ticketRecords.map((ticket) => ticket.set))].sort(),
      progress: {
        total: track.ticketRecords.length,
        resolved: track.ticketRecords.filter((ticket) => ticket.status === 'resolved').length,
        open: openTickets.length,
      },
    };
  });

  const readyTracks = tracks.filter((track) => track.state === 'ready');
  const frontier = readyTracks
    .filter((track) => track.nextStatus === 'ready-for-agent')
    .map((track) => track.nextTicket);
  return {
    rules,
    tracks,
    readyTracks: readyTracks.map((track) => track.id),
    blockedTracks: tracks.filter((track) => track.state === 'blocked').map((track) => track.id),
    attentionTracks: tracks.filter((track) => track.state === 'attention').map((track) => track.id),
    completedTracks: tracks.filter((track) => track.state === 'completed').map((track) => track.id),
    frontier,
    ticketPlacement: placement,
  };
}

export function compileBacklog(root) {
  const configPath = join(root, 'docs/backlog/backlog.config.json');
  const ticketsRoot = join(root, 'docs/backlog/tickets');
  const zonesRoot = join(root, 'docs/backlog/zones');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  validateBacklogConfig(config);
  const archive = readArchive(root, config);
  const ticketPaths = filesBelow(
    ticketsRoot,
    (entry) => entry.endsWith('.md') && entry !== 'README.md',
  );
  const parsedTickets = [
    ...ticketPaths.map((path) => parseTicket(path, root, ticketsRoot, config)),
    ...archive.tickets,
  ];
  applyAuthoredPlan(parsedTickets, config);
  const history = historicalUnclassified(root, config, parsedTickets);
  const tickets = parsedTickets;
  const dependency = dependencyAnalysis(tickets, config.openStatuses);
  const zones = parseZones(root);
  const ownerships = config.ownerships.map((ownership) =>
    summarizeDefinition(
      ownership,
      tickets.filter((ticket) => ticket.ownership === ownership.id),
      config,
    ),
  );
  const ownershipGroups = config.ownershipGroups.map((group) =>
    summarizeDefinition(
      group,
      tickets.filter((ticket) =>
        group.kind === 'history'
          ? ticket.ownership === null ||
            (group.retiredOwnershipIds ?? []).includes(ticket.ownership)
          : group.ownershipIds.includes(ticket.ownership),
      ),
      config,
    ),
  );
  const ownershipGroupMembership = new Map(tickets.map((ticket) => [ticket.id, 0]));
  for (const group of ownershipGroups)
    for (const ticketId of group.tickets)
      ownershipGroupMembership.set(ticketId, ownershipGroupMembership.get(ticketId) + 1);
  const incorrectlyCovered = [...ownershipGroupMembership]
    .filter(([, membership]) => membership !== 1)
    .map(([ticketId, membership]) => `${ticketId} (${membership})`);
  if (incorrectlyCovered.length > 0)
    throw new Error(
      `ownership group ticket coverage must equal one: ${incorrectlyCovered.join(', ')}`,
    );
  const executionSets = [...new Set(tickets.map((ticket) => ticket.set))].sort().map((id) => {
    const setTickets = tickets.filter((ticket) => ticket.set === id);
    const present = setTickets.some((ticket) => ticket.archived !== true);
    return {
      id,
      title: titleFromReadme(join(ticketsRoot, id)) ?? archive.setTitles.get(id) ?? id,
      path: present ? `docs/backlog/tickets/${id}` : `${archive.repository}/tickets/${id}`,
      counts: countBy(
        setTickets.map((ticket) => ticket.status),
        config.statuses,
      ),
      tickets: setTickets.map((ticket) => ticket.id),
    };
  });

  const unclassified = tickets
    .filter(
      (ticket) => ticket.ownership === null && !config.terminalStatuses.includes(ticket.status),
    )
    .map((ticket) => ticket.id);
  const delivery = compileDeliveryPlan(
    config.delivery,
    config.deliveryRules,
    tickets,
    config.openStatuses,
  );
  const deliveryTrackByTicket = delivery.ticketPlacement;
  const assignableTickets = new Set(delivery.frontier);
  const stateTickets = tickets.map(({ body, ...ticket }) => ({
    ...ticket,
    deliveryTrack: deliveryTrackByTicket.get(ticket.id) ?? null,
    assignable: config.openStatuses.includes(ticket.status) && assignableTickets.has(ticket.id),
  }));
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const deliveryFrontier = delivery.frontier.map((id) => ticketById.get(id));
  const zonePaths = filesBelow(zonesRoot, (entry) => entry.endsWith('.md'));
  const state = {
    schemaVersion: config.schemaVersion,
    generatedBy: 'local backlog snapshot compiler',
    sourceDigest: sourceDigest(root, [
      configPath,
      join(root, history.path),
      ...ticketPaths,
      ...archive.paths,
      ...zonePaths,
    ]),
    statusVocabulary: config.statuses,
    openStatuses: config.openStatuses,
    routingRules: config.routingRules,
    summary: {
      tickets: tickets.length,
      open: tickets.filter((ticket) => config.openStatuses.includes(ticket.status)).length,
      resolved: tickets.filter((ticket) => ticket.status === 'resolved').length,
      frontier: deliveryFrontier.length,
      dependencyReady: dependency.frontier.length,
      readyTracks: delivery.readyTracks.length,
      blockedTracks: delivery.blockedTracks.length,
      attentionTracks: delivery.attentionTracks.length,
      waiting: dependency.waiting.length,
      unclassified: unclassified.length,
      longestUnresolvedChain: dependency.longestUnresolvedChain.length,
    },
    ownerships,
    ownershipGroups,
    delivery: {
      rules: delivery.rules,
      tracks: delivery.tracks,
      readyTracks: delivery.readyTracks,
      blockedTracks: delivery.blockedTracks,
      attentionTracks: delivery.attentionTracks,
      completedTracks: delivery.completedTracks,
      frontier: delivery.frontier,
    },
    tickets: stateTickets,
    frontier: delivery.frontier,
    dependencyFrontier: dependency.frontier.map((ticket) => ticket.id),
    waiting: dependency.waiting.map((ticket) => ({
      id: ticket.id,
      unmetDependencies: ticket.unmetDependencies,
    })),
    longestUnresolvedChain: dependency.longestUnresolvedChain,
    danglingDependencies: dependency.danglingDependencies,
    dependencyCycles: dependency.cycles,
    unclassified,
    historicalUnclassified: history.ids,
    executionSets,
    zones,
  };

  return { config, state, tickets };
}

function compactDefinition(definition) {
  return {
    id: definition.id,
    title: definition.title,
    counts: definition.counts,
  };
}

export function compactBacklogState(state) {
  return {
    schemaVersion: state.schemaVersion,
    generatedBy: state.generatedBy,
    sourceDigest: state.sourceDigest,
    statusVocabulary: state.statusVocabulary,
    openStatuses: state.openStatuses,
    summary: state.summary,
    ownershipGroups: state.ownershipGroups.map((front) => ({
      ...compactDefinition(front),
      kind: front.kind,
      short: front.short,
      ownershipIds: front.ownershipIds,
      planned: front.planned,
    })),
    ownerships: state.ownerships.map(compactDefinition),
    delivery: {
      rules: state.delivery.rules,
      readyTracks: state.delivery.readyTracks,
      blockedTracks: state.delivery.blockedTracks,
      attentionTracks: state.delivery.attentionTracks,
      completedTracks: state.delivery.completedTracks,
      frontier: state.delivery.frontier,
      tracks: state.delivery.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        outcome: track.outcome,
        state: track.state,
        tickets: track.tickets,
        openTickets: track.openTickets,
        nextTicket: track.nextTicket,
        nextStatus: track.nextStatus,
        blockedBy: track.blockedBy,
        laterBlockedBy: track.laterBlockedBy,
        ownerships: track.ownerships,
        executionSets: track.executionSets,
        progress: track.progress,
      })),
    },
    dependencyHealth: {
      danglingDependencies: state.danglingDependencies.length,
      cycles: state.dependencyCycles.length,
      longestUnresolvedChain: state.longestUnresolvedChain.length,
    },
    zones: state.zones.map(({ id, title, total, counts }) => ({ id, title, total, counts })),
  };
}
