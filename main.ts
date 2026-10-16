import { houseBridge } from '@agentshouse/app-bridge';
import { renderRooms, type Selected } from './render.js';

type Task = {
  readonly selected: Selected | null;
  readonly top: number;
};

function captured(task: unknown): task is Task {
  const held = task as Partial<Task> | null;
  return (
    typeof held?.top === 'number' &&
    (held.selected === null ||
      (typeof held.selected?.room === 'string' && typeof held.selected.path === 'string'))
  );
}

const bridge = houseBridge();
const main = document.querySelector('main')!;
const listed = Promise.withResolvers<void>();
let selected: Selected | null = null;
let restored = Promise.resolve();

bridge.cooperate({
  checkpoint: () => restored,
  persist() {},
  capture: (): Task => ({ selected, top: window.scrollY }),
  restore(task) {
    if (task === null) return;
    if (!captured(task)) throw new TypeError('mdui did not capture this task');
    restored = listed.promise.then(() => {
      selected = task.selected;
      render();
      window.scrollTo({ top: task.top });
    });
    return restored;
  },
  ready: () => listed.promise.then(() => true),
  settle() {},
});

const runtime = await bridge.runtime;
const rooms = await runtime.observe('rooms');
const documents = await runtime.observe('query', { select: {}, orderBy: [{ by: 'path' }] });

function render(): void {
  const answer = documents.current();
  renderRooms(main, rooms.current(), answer, selected, (document) => {
    selected = document;
  });
  if (!('pending' in answer)) listed.resolve();
}

rooms.subscribe(render);
documents.subscribe(render);
render();
