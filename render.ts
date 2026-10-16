type ListedRoom = {
  readonly locator: string;
  readonly name: string;
  readonly roomVersion: string | null;
};

type ListedDocument = {
  readonly path: string;
  readonly room: string;
};

type LocalQuery =
  | { readonly pending: unknown }
  | { readonly documents: readonly ListedDocument[] };

export type Selected = {
  readonly room: string;
  readonly path: string;
};

export function renderRooms(
  main: Element,
  rooms: readonly ListedRoom[],
  query: LocalQuery,
  selected: Selected | null,
  select: (document: Selected) => void,
): void {
  if ('pending' in query) {
    main.replaceChildren();
    return;
  }
  const documents = query.documents;
  main.replaceChildren(
    ...rooms
      .filter((room) => room.roomVersion !== null)
      .map((room) => {
        const heading = document.createElement('h1');
        heading.textContent = room.name;
        const list = document.createElement('ul');
        list.append(
          ...documents
            .filter((document) => document.room === room.locator)
            .map((held) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.textContent = held.path;
              if (held.room === selected?.room && held.path === selected.path) {
                button.setAttribute('aria-current', 'true');
              }
              button.addEventListener('click', () => {
                main.querySelector('[aria-current]')?.removeAttribute('aria-current');
                button.setAttribute('aria-current', 'true');
                select({ room: held.room, path: held.path });
              });
              const item = document.createElement('li');
              item.append(button);
              return item;
            }),
        );
        const section = document.createElement('section');
        section.append(heading, list);
        return section;
      }),
  );
}
