import { expect, test } from 'vitest';
import { ticketRefusals } from '../../scripts/pull-requests.mjs';

const resolved = 'docs/backlog/tickets/foundation/02-lay-the-runner.md';
const partial = 'docs/backlog/tickets/shipped-form/01-bundle-build.md';
const silent = 'docs/backlog/tickets/components/03-view.md';
const unstated = 'docs/backlog/tickets/components/04-status.md';
const absent = 'docs/backlog/tickets/components/05-gone.md';

const files: Record<string, string> = {
  [resolved]: '# 02 - Lay the runner\n\nStatus: resolved\n',
  [partial]: '# 01 - Bundle build\n\nStatus: blocked\n',
  [silent]: '# 03 - View\n\nStatus: blocked\n',
  [unstated]: '# 04 - Status\n\nNo status line.\n',
};
const read = (ticket: string) => files[ticket] ?? null;

function refusedUnresolved(ticket: string, status: string) {
  return [
    `${ticket} is ${status}, not resolved`,
    `a delivery of part of it lists it under ## Tickets as: ${ticket} (partial: <reason>)`,
  ];
}

test('merge admits a ## Tickets entry with a partial reason unresolved and refuses a silent one', () => {
  const body = [
    'Direct request: none',
    '',
    '## Tickets',
    '',
    `- ${resolved}`,
    `- ${partial} (partial: criterion 4 waits for agentshouse/core#2091)`,
    `- ${silent}`,
    '',
    '## Residuals',
    '',
    'None.',
  ].join('\n');

  expect(ticketRefusals(body, read)).toEqual(refusedUnresolved(silent, 'blocked'));
});

test('a partial marker without a reason or outside ## Tickets admits nothing unresolved', () => {
  const withoutReason = [
    '## Tickets',
    '',
    `- ${partial} (partial)`,
    `- ${silent} (partial: )`,
  ].join('\n');
  const withoutTickets = ['## Touched', '', `- ${partial} (partial: not delivered here)`].join(
    '\n',
  );

  expect(ticketRefusals(withoutReason, read)).toEqual([
    ...refusedUnresolved(partial, 'blocked'),
    ...refusedUnresolved(silent, 'blocked'),
  ]);
  expect(ticketRefusals(withoutTickets, read)).toEqual(refusedUnresolved(partial, 'blocked'));
});

test('a partial marker admits neither a ticket without Status nor a missing ticket', () => {
  const body = [
    '## Tickets',
    '',
    `- ${unstated} (partial: the rest waits)`,
    `- ${absent} (partial: the rest waits)`,
  ].join('\n');

  expect(ticketRefusals(body, read)).toEqual([
    `${unstated} is missing Status, not resolved`,
    `${absent} does not exist at the PR head`,
  ]);
});
