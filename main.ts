import { houseBridge } from '@agentshouse/app-bridge';
import { renderRooms, renderStopped, type Selected } from './render.js';

type Task = {
  readonly selected: Selected | null;
  readonly top: number;
};

type Refusal = {
  readonly code: string;
  readonly retryable: boolean;
  readonly refusal: { readonly code: string; readonly retryable: boolean } | null;
};

type Stop = {
  readonly said: string;
  readonly retryable: boolean;
};

function captured(task: unknown): task is Task {
  const held = task as Partial<Task> | null;
  return (
    typeof held?.top === 'number' &&
    (held.selected === null ||
      (typeof held.selected?.room === 'string' && typeof held.selected.path === 'string'))
  );
}

function refused(refusal: Refusal): Stop {
  const codes =
    refusal.refusal === null ? refusal.code : `${refusal.code}: ${refusal.refusal.code}`;
  return {
    said: `House refused the connection (${codes}).`,
    retryable: refusal.retryable || refusal.refusal?.retryable === true,
  };
}

function failed(error: unknown): Stop {
  const held = error as { readonly code?: unknown; readonly retryable?: unknown } | null;
  return {
    said: `mdui could not start (${typeof held?.code === 'string' ? held.code : String(error)}).`,
    retryable: held?.retryable === true,
  };
}

const bridge = houseBridge();
const main = document.querySelector('main')!;
const deciding = new Set<(usable: boolean) => void>();
let usable: boolean | null = null;
let refusal: Stop | null = null;
let failure: Stop | null = null;
let list: (() => void) | null = null;
let selected: Selected | null = null;
let restored = Promise.resolve();

function decide(next: boolean | null): void {
  usable = next;
  if (next === null) return;
  for (const answer of deciding) answer(next);
  deciding.clear();
}

function decided(): Promise<boolean> {
  return usable === null ? new Promise((answer) => deciding.add(answer)) : Promise.resolve(usable);
}

function render(): void {
  const stop = refusal ?? failure;
  if (stop === null) {
    list?.();
    return;
  }
  renderStopped(main, stop.said, stop.retryable ? () => location.reload() : null);
  decide(false);
}

bridge.cooperate({
  checkpoint: () => restored,
  persist() {},
  capture: (): Task => ({ selected, top: window.scrollY }),
  restore(task) {
    if (task === null) return;
    if (!captured(task)) throw new TypeError('mdui did not capture this task');
    restored = decided().then(() => {
      selected = task.selected;
      render();
      window.scrollTo({ top: task.top });
    });
    return restored;
  },
  ready: decided,
  settle() {},
});

async function start(): Promise<void> {
  const runtime = await bridge.runtime;
  const refusals = await runtime.observe('connection-refusal');
  const follow = (held: Refusal | null) => {
    refusal = held === null ? null : refused(held);
    render();
  };
  refusals.subscribe(follow);
  follow(refusals.current());
  const rooms = await runtime.observe('rooms');
  const documents = await runtime.observe('query', { select: {}, orderBy: [{ by: 'path' }] });
  list = () => {
    const answer = documents.current();
    renderRooms(main, rooms.current(), answer, selected, (document) => {
      selected = document;
    });
    decide('pending' in answer ? null : true);
  };
  rooms.subscribe(render);
  documents.subscribe(render);
  render();
}

start().catch((error: unknown) => {
  failure = failed(error);
  render();
});
