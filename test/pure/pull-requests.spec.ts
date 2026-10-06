import { expect, test } from 'vitest';
import { partialTicketPathsIn, ticketPathsIn } from '../../scripts/pull-requests.mjs';

const resolved = 'docs/backlog/tickets/foundation/02-lay-the-runner.md';
const partial = 'docs/backlog/tickets/shipped-form/01-bundle-build.md';

test('a ## Tickets entry with a partial reason is delivered and admitted unresolved', () => {
  const body = [
    'Direct request: none',
    '',
    '## Tickets',
    '',
    `- ${resolved}`,
    `- ${partial} (partial: criterion 4 waits for agentshouse/core#2091)`,
    '',
    '## Residuals',
    '',
    'None.',
  ].join('\n');

  expect(ticketPathsIn(body)).toEqual([resolved, partial]);
  expect(partialTicketPathsIn(body)).toEqual([partial]);
});

test('a partial marker without a reason or outside ## Tickets admits nothing unresolved', () => {
  const body = [
    '## Tickets',
    '',
    `- ${resolved} (partial)`,
    `- ${partial} (partial: )`,
    '',
    '## Touched',
    '',
    '- docs/backlog/tickets/components/03-view.md (partial: not delivered here)',
  ].join('\n');

  expect(ticketPathsIn(body)).toEqual([resolved, partial]);
  expect(partialTicketPathsIn(body)).toEqual([]);
});
