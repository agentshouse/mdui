import type {
  AppRoom,
  ConnectionRefusal,
  MdRuntime,
  MdType,
  QueueEntry,
} from '@agentshouse/mdruntime';
import { appStyles } from './components/theme.js';
import './components/status.js';
import './components/view.js';

type Screen = 'rooms' | 'search' | 'file' | 'work' | 'refusal' | 'storage' | 'log';

type DocumentViewElement = HTMLElement & {
  bind: (runtime: MdRuntime, room: string, path: string) => void;
};

type StatusElement = HTMLElement & { bind: (runtime: MdRuntime) => void };

type TreeNode = { name: string; path: string; children?: TreeNode[] };

const reasons: Record<ConnectionRefusal['reason'], string> = {
  'no-matching-version': 'No matching Room Contract version',
  'missing-required-guarantee': 'A required Capability is missing',
  'md-model-version-mismatch': 'The declared MD Model version cannot be loaded',
  'revoked-authorization': 'Authorization was revoked',
};

const outcomes = {
  pending: 'Pending',
  conflicted: 'Conflicted',
  rejected: 'Rejected',
  expired: 'Expired',
} as const;

let unbind = () => {};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addPath(nodes: TreeNode[], parts: readonly string[], full: string): void {
  const [head, ...rest] = parts;
  if (head === undefined) return;
  if (rest.length === 0) {
    nodes.push({ name: head, path: full });
    return;
  }
  let directory = nodes.find((node) => node.children !== undefined && node.name === head);
  if (directory === undefined) {
    directory = { name: head, path: '', children: [] };
    nodes.push(directory);
  }
  addPath(directory.children ?? [], rest, full);
}

function fileTree(paths: readonly string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const path of [...paths].sort()) addPath(root, path.split('/'), path);
  return root;
}

function renderTree(
  nodes: TreeNode[],
  labelled: boolean,
  open: (path: string) => void,
): HTMLUListElement {
  const list = document.createElement('ul');
  if (labelled) list.setAttribute('aria-label', 'Files');
  for (const node of nodes) {
    const item = document.createElement('li');
    if (node.children !== undefined) {
      item.append(node.name, renderTree(node.children, false, open));
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = node.path;
      button.addEventListener('click', () => open(node.path));
      item.append(button);
    }
    list.append(item);
  }
  return list;
}

function option(value: string, label: string): HTMLOptionElement {
  const entry = document.createElement('option');
  entry.value = value;
  entry.textContent = label;
  return entry;
}

function fillSelect(select: HTMLSelectElement, blank: string, entries: readonly string[]): void {
  const selected = select.value;
  select.replaceChildren(option('', blank));
  for (const entry of entries) select.append(option(entry, entry));
  if ([...select.options].some((entry) => entry.value === selected)) select.value = selected;
}

function searchSelector(form: HTMLFormElement): Record<string, unknown> {
  const data = new FormData(form);
  const text = String(data.get('text') ?? '');
  const room = String(data.get('room') ?? '');
  const type = String(data.get('type') ?? '');
  const field = String(data.get('field') ?? '');
  const value = String(data.get('value') ?? '');
  const clauses: Record<string, unknown>[] = [];
  if (room !== '') clauses.push({ room });
  if (type !== '') clauses.push({ type });
  if (field !== '' && value !== '') clauses.push({ [`fields.${field}`]: value });
  if (text !== '') clauses.push({ content: { $regex: escapeRegex(text) } });
  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0]!;
  return { $and: clauses };
}

export function bindApp(runtime: MdRuntime): () => void {
  unbind();
  const template = document.getElementById('md-app');
  if (!(template instanceof HTMLTemplateElement))
    throw new TypeError('The App template is missing.');
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const root = fragment.querySelector('#app');
  if (!(root instanceof HTMLElement)) throw new TypeError('The App root is missing.');
  const app: HTMLElement = root;
  const style = document.createElement('style');
  style.textContent = appStyles;
  app.prepend(style);
  document.body.append(fragment);

  const status = app.querySelector('md-sync-status') as StatusElement;
  const view = app.querySelector('md-document-view') as DocumentViewElement;
  const roomsPart = app.querySelector('[data-part="rooms"]') as HTMLElement;
  const resultsPart = app.querySelector('[data-part="results"]') as HTMLElement;
  const draftsPart = app.querySelector('[data-part="drafts"]') as HTMLElement;
  const queuesPart = app.querySelector('[data-part="queues"]') as HTMLElement;
  const refusalPart = app.querySelector('[data-part="refusal"]') as HTMLElement;
  const reauthorize = app.querySelector('[data-part="reauthorize"]') as HTMLButtonElement;
  const storagePart = app.querySelector('[data-part="storage"]') as HTMLElement;
  const logPart = app.querySelector('[data-part="log"]') as HTMLElement;
  const form = app.querySelector('form') as HTMLFormElement;
  const roomSelect = form.elements.namedItem('room') as HTMLSelectElement;
  const typeSelect = form.elements.namedItem('type') as HTMLSelectElement;
  const fieldSelect = form.elements.namedItem('field') as HTMLSelectElement;
  const queues = new Map<string, readonly QueueEntry[]>();
  const stops: Array<() => void> = [];
  let queueStops: Array<() => void> = [];
  let current: Screen = 'rooms';

  function show(screen: Screen): void {
    current = screen;
    for (const section of app.querySelectorAll<HTMLElement>('section[data-screen]')) {
      section.hidden = section.dataset.screen !== screen;
    }
    for (const button of app.querySelectorAll<HTMLButtonElement>(
      'nav[aria-label="Screens"] button',
    )) {
      if (button.dataset.screen === screen) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    if (screen === 'work') presentWork();
    if (screen === 'log') presentLog();
  }

  function openFile(room: string, path: string): void {
    view.bind(runtime, room, path);
    show('file');
  }

  function presentRooms(rooms: readonly AppRoom[]): void {
    roomsPart.replaceChildren();
    for (const room of rooms) {
      const article = document.createElement('article');
      article.setAttribute('aria-label', room.name);
      const heading = document.createElement('h2');
      heading.textContent = room.name;
      const typesHeading = document.createElement('h3');
      typesHeading.textContent = 'MD Types';
      const types = document.createElement('ul');
      types.setAttribute('aria-label', 'MD Types');
      for (const type of runtime.types(room.locator)) {
        const item = document.createElement('li');
        item.textContent = type.name;
        types.append(item);
      }
      const filesHeading = document.createElement('h3');
      filesHeading.textContent = 'Files';
      const paths = runtime
        .query({ selector: { room: room.locator } })
        .documents.map((document) => document.path);
      article.append(
        heading,
        typesHeading,
        types,
        filesHeading,
        renderTree(fileTree(paths), true, (path) => openFile(room.locator, path)),
      );
      roomsPart.append(article);
    }
    const types = new Map<string, MdType>();
    const fields = new Set<string>();
    for (const room of rooms) {
      for (const type of runtime.types(room.locator)) {
        types.set(type.name, type);
        for (const field of Object.keys(type.fields)) fields.add(field);
      }
    }
    fillSelect(
      roomSelect,
      'All Rooms',
      rooms.map((room) => room.locator),
    );
    for (const entry of [...roomSelect.options]) {
      if (entry.value === '') continue;
      const room = rooms.find((item) => item.locator === entry.value);
      if (room !== undefined) entry.textContent = room.name;
    }
    fillSelect(typeSelect, 'All MD Types', [...types.keys()].sort());
    fillSelect(fieldSelect, 'Any field', [...fields].sort());
  }

  function presentWork(): void {
    draftsPart.replaceChildren();
    const listed = new Set<string>();
    for (const room of runtime.rooms()) {
      for (const file of runtime.query({ selector: { room: room.locator } }).documents) {
        if (runtime.draft.read(room.locator, file.path) === null) continue;
        const name = `${room.locator} ${file.path}`;
        listed.add(name);
        const item = document.createElement('li');
        item.textContent = name;
        draftsPart.append(item);
      }
    }
    const boundRoom = view.getAttribute('room');
    const boundPath = view.getAttribute('path');
    if (
      boundRoom !== null &&
      boundPath !== null &&
      runtime.draft.read(boundRoom, boundPath) !== null
    ) {
      const name = `${boundRoom} ${boundPath}`;
      if (!listed.has(name)) {
        const item = document.createElement('li');
        item.textContent = name;
        draftsPart.append(item);
      }
    }
    queuesPart.replaceChildren();
    for (const room of runtime.rooms()) {
      const article = document.createElement('article');
      article.setAttribute('aria-label', `${room.name} Pending Changes`);
      const heading = document.createElement('h3');
      heading.textContent = room.name;
      const list = document.createElement('ul');
      for (const entry of queues.get(room.locator) ?? []) {
        const item = document.createElement('li');
        const kind = document.createElement('p');
        kind.textContent = outcomes[entry.outcome.kind];
        item.append(kind);
        if ('text' in entry.outcome) {
          const text = document.createElement('p');
          text.textContent = entry.outcome.text;
          item.append(text);
        }
        list.append(item);
      }
      article.append(heading, list);
      queuesPart.append(article);
    }
  }

  function watchQueues(rooms: readonly AppRoom[]): void {
    for (const stop of queueStops) stop();
    queueStops = [];
    queues.clear();
    for (const room of rooms) {
      queueStops.push(
        runtime.observe('queue', room.locator, (entries) => {
          queues.set(room.locator, entries);
          if (current === 'work') presentWork();
        }),
      );
    }
  }

  function presentRefusal(refusal: ConnectionRefusal | null): void {
    if (refusal === null) {
      refusalPart.textContent = 'No Connection Refusal';
      reauthorize.hidden = true;
      return;
    }
    refusalPart.textContent = reasons[refusal.reason];
    reauthorize.hidden = !refusal.reauthorizationOffered;
    show('refusal');
  }

  function presentStorage(statement: string | null): void {
    storagePart.textContent = statement ?? 'No storage loss.';
  }

  function presentLog(): string {
    const text = runtime.log();
    logPart.textContent = text;
    return text;
  }

  status.bind(runtime);
  app.querySelector('nav[aria-label="Screens"]')?.addEventListener('click', (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement)) return;
    const screen = button.dataset.screen;
    if (screen === undefined) return;
    show(screen as Screen);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    resultsPart.replaceChildren();
    for (const file of runtime.query({ selector: searchSelector(form) }).documents) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${file.room} ${file.path}`;
      button.addEventListener('click', () => openFile(file.room, file.path));
      item.append(button);
      resultsPart.append(item);
    }
  });
  reauthorize.addEventListener('click', () => {
    void runtime.reauthorize();
  });
  app.querySelector('[data-part="export"]')?.addEventListener('click', () => {
    const text = presentLog();
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'synchronization-log.txt';
    link.click();
    URL.revokeObjectURL(url);
  });
  app.addEventListener('open-path', (event) => {
    const detail = (event as CustomEvent<{ room: string; path: string }>).detail;
    openFile(detail.room, detail.path);
  });

  stops.push(
    runtime.observe('rooms', (rooms) => {
      presentRooms(rooms);
      watchQueues(rooms);
      if (current === 'work') presentWork();
    }),
  );
  stops.push(runtime.observe('connection-refusal', presentRefusal));
  stops.push(runtime.observe('storage-loss', presentStorage));
  stops.push(
    runtime.observe('sync-status', () => {
      if (current === 'log') presentLog();
    }),
  );

  unbind = () => {
    for (const stop of queueStops) stop();
    queueStops = [];
    for (const stop of stops) stop();
    stops.length = 0;
    app.remove();
  };
  return unbind;
}
