import { expect, test } from 'vitest';
import { renderRooms } from './render.js';

function listed(main: Element): string[] {
  return [...main.querySelectorAll('section')].map(
    (section) =>
      `${section.querySelector('h1')?.textContent}: ${[...section.querySelectorAll('li')]
        .map((item) => item.textContent)
        .join(', ')}`,
  );
}

test('withholds Room lists for a pending Local Query until its documents arrive', () => {
  const main = document.createElement('main');
  const rooms = [
    { locator: 'notes', name: 'Notes', roomVersion: 'notes-1' },
    { locator: 'arriving', name: 'Arriving', roomVersion: 'arriving-1' },
  ];

  renderRooms(main, rooms, { pending: true });
  expect(listed(main)).toEqual([]);

  renderRooms(main, rooms, {
    documents: [
      { room: 'notes', path: 'ideas/first.md' },
      { room: 'arriving', path: 'todo.md' },
    ],
  });
  expect(listed(main)).toEqual(['Notes: ideas/first.md', 'Arriving: todo.md']);
});
