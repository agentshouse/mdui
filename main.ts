import { houseBridge } from '@agentshouse/app-bridge';

const runtime = await houseBridge().runtime;
const rooms = await runtime.observe('rooms');
const documents = await runtime.observe('query', { select: {}, orderBy: [{ by: 'path' }] });
const main = document.querySelector('main')!;

function render(): void {
  main.replaceChildren(
    ...rooms
      .current()
      .filter((room) => room.roomVersion !== null)
      .map((room) => {
        const heading = document.createElement('h1');
        heading.textContent = room.name;
        const list = document.createElement('ul');
        list.append(
          ...documents
            .current()
            .documents.filter((held) => held.room === room.locator)
            .map((held) => {
              const item = document.createElement('li');
              item.textContent = held.path;
              return item;
            }),
        );
        const section = document.createElement('section');
        section.append(heading, list);
        return section;
      }),
  );
}

rooms.subscribe(render);
documents.subscribe(render);
render();
