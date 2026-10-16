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

const shown = new WeakMap<Element, Selected>();

export function renderStopped(main: Element, said: string, retry: (() => void) | null): void {
  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.textContent = said;
  if (retry === null) {
    main.replaceChildren(alert);
    return;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Try again';
  button.addEventListener('click', retry);
  main.replaceChildren(alert, button);
}

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
  const focus = document.activeElement;
  const focused = focus && main.contains(focus) ? shown.get(focus) : undefined;
  let refocus: HTMLButtonElement | undefined;
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
              shown.set(button, held);
              if (held.room === focused?.room && held.path === focused.path) refocus = button;
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
  refocus?.focus({ preventScroll: true });
}
