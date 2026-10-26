import { houseBridge } from '@agentshouse/app-bridge';
import { renderRooms, renderStopped, type Selected } from './render.js';

type Refusal = {
  readonly code: string;
  readonly retryable: boolean;
  readonly refusal: { readonly code: string } | null;
};

type Stop = {
  readonly said: string;
  readonly retry: (() => void) | null;
};

function refused(refusal: Refusal, retry: () => void): Stop {
  const codes =
    refusal.refusal === null ? refusal.code : `${refusal.code}: ${refusal.refusal.code}`;
  return {
    said: `House refused the connection (${codes}).`,
    retry: refusal.retryable ? retry : null,
  };
}

function codeOf(error: unknown): string {
  const held = error as { readonly code?: unknown } | null;
  return typeof held?.code === 'string' ? held.code : String(error);
}

function failed(error: unknown): Stop {
  const held = error as { readonly retryable?: unknown } | null;
  return {
    said: `mdui could not start (${codeOf(error)}).`,
    retry: held?.retryable === true ? () => location.reload() : null,
  };
}

const bridge = houseBridge();
const main = document.querySelector('main')!;
let refusal: Stop | null = null;
let failure: Stop | null = null;
let list: (() => void) | null = null;
let selected: Selected | null = null;
let chooser: string | null = null;

function render(): void {
  const stop = refusal ?? failure;
  if (stop === null) {
    list?.();
    return;
  }
  renderStopped(main, stop.said, stop.retry);
}

function fail(error: unknown): void {
  failure = failed(error);
  render();
}

function choose(): void {
  if (chooser === null) return;
  bridge.ceremony(`/bind/${encodeURIComponent(chooser)}?slot=room`).catch((error: unknown) => {
    failure = { said: `House did not open the choice of Rooms (${codeOf(error)}).`, retry: null };
    render();
  });
}

bridge.onStatus((status) => {
  const next = status.credential.state === 'held' ? status.app : null;
  if (next === chooser) return;
  chooser = next;
  render();
});

async function start(): Promise<void> {
  const runtime = await bridge.runtime;
  const refusals = await runtime.observe('connection-refusal');
  const follow = (held: Refusal | null) => {
    refusal = held === null ? null : refused(held, () => void runtime.retry().catch(fail));
    render();
  };
  refusals.subscribe(follow);
  follow(refusals.current());
  const rooms = await runtime.observe('rooms');
  const documents = await runtime.observe('query', { select: {}, orderBy: [{ by: 'path' }] });
  list = () =>
    renderRooms(
      main,
      rooms.current(),
      documents.current(),
      selected,
      (document) => {
        selected = document;
      },
      chooser === null ? null : choose,
    );
  rooms.subscribe(render);
  documents.subscribe(render);
  render();
}

start().catch(fail);
