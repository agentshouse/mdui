import { connectHouseBridge } from '@agentshouse/app-bridge';

const runtime = await connectHouseBridge().runtime;
const rooms = await runtime.observe('rooms');
const documents = await runtime.observe('query', { select: {}, orderBy: [{ by: 'path' }] });
const main = document.querySelector('main')!;

function render(): void {
  if (rooms.current().length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Bind a Room to this App to list its documents.';
    main.replaceChildren(empty);
    return;
  }
  main.replaceChildren(
    ...rooms.current().map((room) => {
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
