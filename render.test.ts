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

  renderRooms(main, rooms, { pending: true }, null, () => {}, null);
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
    null,
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
    null,
  );
  const current = () =>
    [...main.querySelectorAll('[aria-current="true"]')].map((button) => button.textContent);
  expect(current()).toEqual(['todo.md']);

  main.querySelector('button')!.click();
  expect(current()).toEqual(['ideas/first.md']);
  expect(chosen).toEqual([{ room: 'notes', path: 'ideas/first.md' }]);
});

test('keeps keyboard focus on the focused document when a change draws the list again', () => {
  const main = document.body.appendChild(document.createElement('main'));
  const draw = (paths: string[]) =>
    renderRooms(
      main,
      [{ locator: 'notes', name: 'Notes', roomVersion: 'notes-1' }],
      { documents: paths.map((path) => ({ room: 'notes', path })) },
      null,
      () => {},
      null,
    );
  draw(['ideas/first.md', 'todo.md']);
  main.querySelectorAll('button')[1]!.focus();

  draw(['arrived.md', 'ideas/first.md', 'todo.md']);
  expect(document.activeElement?.textContent).toBe('todo.md');
  main.remove();
});

test('draws no Room chosen once and keeps its button across later changes, so a tap during them lands', () => {
  const main = document.createElement('main');
  const chosen: string[] = [];
  const choose = () => chosen.push('rooms');
  const draw = () => renderRooms(main, [], { documents: [] }, null, () => {}, choose);

  draw();
  const button = main.querySelector('button');
  draw();
  draw();

  expect(main.textContent).toBe('No Room is chosen yet.Choose Rooms');
  expect(main.querySelector('button')).toBe(button);
  button!.click();
  expect(chosen).toEqual(['rooms']);
});
