import { houseBridge } from '@agentshouse/app-bridge';
import { renderRooms } from './render.js';

const runtime = await houseBridge().runtime;
const rooms = await runtime.observe('rooms');
const documents = await runtime.observe('query', { select: {}, orderBy: [{ by: 'path' }] });
const main = document.querySelector('main')!;

function render(): void {
  renderRooms(main, rooms.current(), documents.current());
}

rooms.subscribe(render);
documents.subscribe(render);
render();
