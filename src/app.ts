import type {
  AppRoom,
  ConnectionRefusal,
  DraftEntry,
  MdType,
  QueryDocument,
  QueueEntry,
} from '@agentshouse/mdruntime';
import type { MdRuntimeClient } from '@agentshouse/mdruntime/client';
import { appStyles } from './components/theme.js';
import { mdTypes, observation, refusalParts } from './components/runtime.js';
import './components/status.js';
import './components/view.js';

type Screen = 'rooms' | 'search' | 'file' | 'work' | 'refusal' | 'storage' | 'log';

type DocumentViewElement = HTMLElement & {
  bind: (runtime: MdRuntimeClient, room: string, path: string) => void;
};

type StatusElement = HTMLElement & { bind: (runtime: MdRuntimeClient) => void };

type TreeNode = { name: string; path: string; children?: TreeNode[] };

const reasons: Record<
  Exclude<ConnectionRefusal['reason'], 'client-host-protocol-mismatch'>,
  string
> = {
  'no-matching-version': 'No matching Room Contract version',
  'missing-required-guarantee': 'A required Capability is missing',
  'md-model-version-mismatch': 'The declared MD Model version cannot be loaded',
  'revoked-authorization': 'Authorization was revoked',
};

const queueKinds = {
  pending: 'Pending',
  conflicted: 'Conflicted',
  rejected: 'Rejected',
  expired: 'Expired',
  'retryable-refusal': 'Pending',
} as const;

let unbind = () => {};

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

function fieldKind(types: readonly MdType[], field: string, typeName: string): string | undefined {
  const kinds = new Set<string>();
  for (const type of types) {
    if (typeName !== '' && type.name !== typeName) continue;
    const definition = type.fields[field];
    if (definition === null || typeof definition !== 'object' || !('kind' in definition)) continue;
    const kind = (definition as { kind: unknown }).kind;
    if (typeof kind === 'string') kinds.add(kind);
  }
  return kinds.size === 1 ? [...kinds][0] : undefined;
}

function fieldEquality(raw: string, kind: string | undefined): unknown {
  if (kind === 'number' && raw !== '') {
    const count = Number(raw);
    if (Number.isFinite(count)) return count;
  }
  return raw;
}

function containsText(value: unknown, text: string): boolean {
  if (typeof value === 'string') return value.includes(text);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).includes(text);
  if (Array.isArray(value)) return value.some((item) => containsText(item, text));
  return false;
}

function matchesSearch(file: QueryDocument, text: string): boolean {
  if (text === '') return true;
  for (const section of Object.values(file.sections)) {
    if (section.includes(text)) return true;
  }
  for (const value of Object.values(file.fields)) {
    if (containsText(value, text)) return true;
  }
  return false;
}

function searchSelector(form: HTMLFormElement, types: readonly MdType[]): Record<string, unknown> {
  const data = new FormData(form);
  const room = String(data.get('room') ?? '');
  const type = String(data.get('type') ?? '');
  const field = String(data.get('field') ?? '');
  const value = String(data.get('value') ?? '');
  const clauses: Record<string, unknown>[] = [];
  if (room !== '') clauses.push({ room });
  if (type !== '') clauses.push({ type });
  if (field !== '') {
    clauses.push({ [`fields.${field}`]: fieldEquality(value, fieldKind(types, field, type)) });
  }
  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0]!;
  return { $and: clauses };
}

function connectionRefusalText(refusal: ConnectionRefusal): string {
  if (refusal.reason === 'client-host-protocol-mismatch') return refusal.reason;
  return reasons[refusal.reason];
}

export async function bindApp(runtime: MdRuntimeClient): Promise<() => void> {
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
  const draftsState = app.querySelector('[data-part="drafts-state"]') as HTMLElement;
  const retryDrafts = app.querySelector('[data-part="retry-drafts"]') as HTMLButtonElement;
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
  let draftRead = 0;
  let renderedRooms: string | undefined;
  let visibleRooms: readonly AppRoom[] = [];
  let closed = false;
  let searchRead = 0;

  function cleanup(): void {
    closed = true;
    draftRead += 1;
    searchRead += 1;
    for (const stop of queueStops) stop();
    queueStops = [];
    for (const stop of stops) stop();
    stops.length = 0;
    app.remove();
  }
  unbind = cleanup;

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
    if (screen === 'work') {
      void refreshDrafts();
      presentQueues();
    }
    if (screen === 'log') void presentLog();
  }

  function openFile(room: string, path: string): void {
    view.bind(runtime, room, path);
    show('file');
  }

  async function presentRooms(rooms: readonly AppRoom[]): Promise<void> {
    visibleRooms = rooms;
    const content = await Promise.all(
      rooms.map(async (room) => ({
        room,
        types: mdTypes(room.model),
        paths: (await runtime.query({ selector: { room: room.locator } })).documents.map(
          (file) => file.path,
        ),
      })),
    );
    if (closed) return;
    const snapshot = JSON.stringify(content);
    if (snapshot === renderedRooms) return;
    renderedRooms = snapshot;
    roomsPart.replaceChildren();
    for (const { room, types: definitions, paths } of content) {
      const article = document.createElement('article');
      article.setAttribute('aria-label', room.name);
      const heading = document.createElement('h2');
      heading.textContent = room.name;
      const typesHeading = document.createElement('h3');
      typesHeading.textContent = 'MD Types';
      const types = document.createElement('ul');
      types.setAttribute('aria-label', 'MD Types');
      for (const type of definitions) {
        const item = document.createElement('li');
        item.textContent = type.name;
        types.append(item);
      }
      const filesHeading = document.createElement('h3');
      filesHeading.textContent = 'Files';
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
    for (const { types: definitions } of content) {
      for (const type of definitions) {
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

  function presentDrafts(drafts: readonly DraftEntry[]): void {
    draftsPart.replaceChildren();
    for (const draft of drafts) {
      const item = document.createElement('li');
      item.textContent = `${draft.locator} ${draft.path}`;
      draftsPart.append(item);
    }
    draftsState.textContent = drafts.length === 0 ? 'No Drafts.' : '';
    retryDrafts.hidden = true;
  }

  async function refreshDrafts(): Promise<void> {
    const requested = ++draftRead;
    draftsState.textContent = 'Loading Drafts…';
    retryDrafts.hidden = true;
    try {
      const drafts = await runtime.draft.list();
      if (requested !== draftRead) return;
      presentDrafts(drafts);
    } catch (error) {
      if (requested !== draftRead) return;
      const reason = error instanceof Error ? error.message : String(error);
      draftsState.textContent = `Drafts could not be read: ${reason}`;
      retryDrafts.hidden = false;
    }
  }

  function presentQueues(): void {
    queuesPart.replaceChildren();
    for (const room of visibleRooms) {
      const article = document.createElement('article');
      article.setAttribute('aria-label', `${room.name} Pending Changes`);
      const heading = document.createElement('h3');
      heading.textContent = room.name;
      const list = document.createElement('ul');
      for (const entry of queues.get(room.locator) ?? []) {
        const item = document.createElement('li');
        const kind = document.createElement('p');
        kind.textContent = queueKinds[entry.outcome.kind];
        item.append(kind);
        if (entry.outcome.kind === 'retryable-refusal' && entry.outcome.reset !== undefined) {
          const reset = document.createElement('p');
          reset.textContent = entry.outcome.reset;
          item.append(reset);
        }
        if ('code' in entry.outcome) {
          for (const part of refusalParts(entry.outcome)) {
            const text = document.createElement('p');
            text.textContent = part;
            item.append(text);
          }
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
        observation(
          runtime.observe('queue', room.locator, (entries) => {
            queues.set(room.locator, entries);
            if (current === 'work') presentQueues();
          }),
        ),
      );
    }
  }

  function presentRefusal(refusal: ConnectionRefusal | null): void {
    if (refusal === null) {
      refusalPart.textContent = 'No Connection Refusal';
      reauthorize.hidden = true;
      return;
    }
    refusalPart.textContent = connectionRefusalText(refusal);
    reauthorize.hidden = !refusal.reauthorizationOffered;
    show('refusal');
  }

  async function presentStorage(statement: string | null): Promise<void> {
    const persistence = await runtime.persistence();
    if (closed) return;
    storagePart.textContent = `${statement ?? 'No storage loss.'} ${String(persistence)}`;
  }

  async function presentLog(): Promise<string> {
    const text = await runtime.log();
    if (!closed) logPart.textContent = text;
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
    const requested = ++searchRead;
    resultsPart.replaceChildren();
    void (async () => {
      const types: MdType[] = [];
      for (const room of visibleRooms) types.push(...mdTypes(room.model));
      const text = String(new FormData(form).get('text') ?? '');
      const result = await runtime.query({ selector: searchSelector(form, types) });
      if (closed || requested !== searchRead) return;
      resultsPart.replaceChildren();
      for (const file of result.documents) {
        if (!matchesSearch(file, text)) continue;
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${file.room} ${file.path}`;
        button.addEventListener('click', () => openFile(file.room, file.path));
        item.append(button);
        resultsPart.append(item);
      }
    })();
  });
  reauthorize.addEventListener('click', () => {
    void runtime.reauthorize();
  });
  retryDrafts.addEventListener('click', () => {
    void refreshDrafts();
  });
  app.querySelector('[data-part="export"]')?.addEventListener('click', () => {
    void presentLog().then((text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'synchronization-log.txt';
      link.click();
      URL.revokeObjectURL(url);
    });
  });
  app.addEventListener('open-path', (event) => {
    const detail = (event as CustomEvent<{ room: string; path: string }>).detail;
    openFile(detail.room, detail.path);
  });

  async function hold(start: Promise<() => void>): Promise<void> {
    const end = await start;
    if (closed) {
      end();
      return;
    }
    stops.push(end);
  }

  await Promise.all([
    hold(
      runtime.observe('rooms', (rooms) => {
        void presentRooms(rooms);
        watchQueues(rooms);
        if (current === 'work') presentQueues();
      }),
    ),
    hold(
      runtime.observe('query', {}, () => {
        void presentRooms(visibleRooms);
      }),
    ),
    hold(
      runtime.observe('drafts', (drafts) => {
        draftRead += 1;
        presentDrafts(drafts);
      }),
    ),
    hold(runtime.observe('connection-refusal', presentRefusal)),
    hold(runtime.observe('storage-loss', (statement) => void presentStorage(statement))),
    hold(
      runtime.observe('sync-status', () => {
        if (current === 'log') void presentLog();
      }),
    ),
  ]);

  return cleanup;
}
