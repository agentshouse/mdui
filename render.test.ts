import { expect, test } from 'vitest';
import { renderRooms, type Selected } from './render.js';

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

  renderRooms(main, rooms, { pending: true }, null, () => {});
  expect(listed(main)).toEqual([]);

  renderRooms(
    main,
    rooms,
    {
      documents: [
        { room: 'notes', path: 'ideas/first.md' },
        { room: 'arriving', path: 'todo.md' },
      ],
    },
    null,
    () => {},
  );
  expect(listed(main)).toEqual(['Notes: ideas/first.md', 'Arriving: todo.md']);
});

test('marks the selected document current and moves the mark to the one clicked', () => {
  const main = document.createElement('main');
  const chosen: Selected[] = [];
  renderRooms(
    main,
    [{ locator: 'notes', name: 'Notes', roomVersion: 'notes-1' }],
    {
      documents: [
        { room: 'notes', path: 'ideas/first.md' },
        { room: 'notes', path: 'todo.md' },
      ],
    },
    { room: 'notes', path: 'todo.md' },
    (document) => chosen.push(document),
  );
  const current = () =>
    [...main.querySelectorAll('[aria-current="true"]')].map((button) => button.textContent);
  expect(current()).toEqual(['todo.md']);

  main.querySelector('button')!.click();
  expect(current()).toEqual(['ideas/first.md']);
  expect(chosen).toEqual([{ room: 'notes', path: 'ideas/first.md' }]);
});
