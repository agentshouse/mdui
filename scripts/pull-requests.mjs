import { spawnSync } from 'node:child_process';

const TICKET_PATH = /docs\/backlog\/tickets\/[A-Za-z0-9_./-]+\.md/g;
const PARTIAL_TICKET = /(docs\/backlog\/tickets\/[A-Za-z0-9_./-]+\.md) \(partial: *[^)\s][^)\r\n]*\)/g;
const ISSUE_DIRECTIVE = /\b(?:Fixes|Refs) #\d+/g;
const TICKET_HEADING = /^## Tickets?\s*$/m;
const RESIDUALS_HEADING = /^## Residuals\s*$/m;
const NEXT_HEADING = /\n## /;

export function ticketPathsIn(body) {
  return [...new Set([...assignmentRegion(body).matchAll(TICKET_PATH)].map(([path]) => path))];
}

export function partialTicketPathsIn(body) {
  return [
    ...new Set([...assignmentRegion(body).matchAll(PARTIAL_TICKET)].map(([, path]) => path)),
  ];
}

function assignmentRegion(body) {
  const residuals = body.search(RESIDUALS_HEADING);
  const beforeResiduals = residuals === -1 ? body : body.slice(0, residuals);
  const heading = beforeResiduals.search(TICKET_HEADING);
  if (heading === -1) return beforeResiduals;
  const fromHeading = beforeResiduals.slice(heading);
  const next = fromHeading.search(NEXT_HEADING);
  return next === -1 ? fromHeading : fromHeading.slice(0, next);
}

export function issueReferences(body) {
  return [...body.matchAll(ISSUE_DIRECTIVE)].map(([match]) => match);
}

export function hasIssueDirective(body, directive, issue) {
  return new RegExp(`\\b${directive} #${issue}\\b`).test(body);
}

export function hasDirectRequest(body) {
  return /^Direct request:\s*\S.*$/m.test(body);
}

function gh(args, { cwd } = {}) {
  const command = process.env.GH_COMMAND ?? 'gh';
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) throw new Error(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.slice(0, 2).join(' ')} failed: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

export function openPullRequests({ cwd, limit = 200 } = {}) {
  const fields = 'number,title,headRefName,headRefOid,body';
  return gh(['pr', 'list', '--state', 'open', '--limit', String(limit), '--json', fields], {
    cwd,
  }).map((entry) => ({
    number: entry.number,
    title: entry.title,
    branch: entry.headRefName,
    head: entry.headRefOid,
    body: entry.body ?? '',
    tickets: ticketPathsIn(entry.body ?? ''),
  }));
}

export function pullRequest(number, { cwd } = {}) {
  const fields = 'number,state,isDraft,body,headRefName,headRefOid,baseRefName,isCrossRepository';
  const entry = gh(['pr', 'view', String(number), '--json', fields], { cwd });
  return {
    number: entry.number,
    state: entry.state,
    draft: entry.isDraft === true,
    body: entry.body ?? '',
    branch: entry.headRefName,
    head: entry.headRefOid,
    base: entry.baseRefName,
    fork: entry.isCrossRepository === true,
    tickets: ticketPathsIn(entry.body ?? ''),
  };
}

export function issueState(number, { cwd } = {}) {
  try {
    return gh(['issue', 'view', String(number), '--json', 'state'], { cwd }).state ?? null;
  } catch {
    return null;
  }
}
