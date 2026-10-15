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

export function renderRooms(
  main: Element,
  rooms: readonly ListedRoom[],
  query: LocalQuery,
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
