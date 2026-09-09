import type {
  AppRoom,
  HistoryResult,
  HistoryRevision,
  MdRuntime,
  QueryDocument,
} from '@agentshouse/mdruntime';
import { type FieldControl, type FieldDefinition } from './fields.js';
import { internalPath } from './links.js';
import './fields.js';
import './markdown.js';
import { viewStyles } from './theme.js';

type OpenPath = { room: string; path: string };

const ROOM_ROOT = 'room';

function roomPrefix(value: string): string | null {
  const resolved = internalPath(value, ROOM_ROOT);
  if (resolved !== undefined) return resolved.path;
  if (value.split('/').every((part) => part === '' || part === '.')) return '';
  return null;
}

function covers(prefixes: readonly string[], path: string): boolean {
  return prefixes.some((prefix) => {
    const normalized = roomPrefix(prefix);
    return (
      normalized !== null &&
      (normalized === '' || path === normalized || path.startsWith(`${normalized}/`))
    );
  });
}

function asField(value: unknown): FieldDefinition | undefined {
  if (typeof value !== 'object' || value === null) return;
  if (!('kind' in value) || typeof value.kind !== 'string') return;
  return value as FieldDefinition;
}

function fieldValue(path: string, spec: FieldDefinition, value: unknown): unknown {
  if (spec.kind === 'reference' && typeof value === 'string')
    return internalPath(value, path)?.path;
  if (spec.kind === 'list' && spec.of === 'reference' && Array.isArray(value)) {
    return value.map((entry) =>
      typeof entry === 'string' ? internalPath(entry, path)?.path : entry,
    );
  }
  return value;
}

function refusal(room: AppRoom | undefined, path: string): string {
  if (room === undefined) return '';
  if (covers(room.providerOwnedPaths, path)) return 'This Path is Provider-owned.';
  if (!covers(room.writeGrants, path)) return 'This Path has no write grant.';
  return '';
}

function isHistoryFailure(
  result: HistoryResult,
): result is Exclude<
  HistoryResult,
  { kind: 'history' } | { kind: 'revision' } | { kind: 'no-history' }
> {
  return result.kind !== 'history' && result.kind !== 'revision' && result.kind !== 'no-history';
}

export class DocumentView extends HTMLElement {
  static observedAttributes = ['room', 'path', 'label'];
  private runtime: MdRuntime | undefined;
  private current: QueryDocument | undefined;
  private roomState: AppRoom | undefined;
  private unobserve: (() => void) | undefined;
  private historyOpened = false;
  private historyOpenHandled = false;
  private historyLoading = false;
  private historyKind: 'history' | 'no-history' | undefined;
  private historyRevisions: HistoryRevision[] = [];
  private historyPageToken: string | undefined;
  private historyFailure: string | undefined;
  private historyGeneration = 0;
  private revisionGeneration = 0;
  private revisionContent: string | undefined;
  private selectedRevision: string | undefined;
  private readonly root = this.attachShadow({ mode: 'open' });

  bind(runtime: MdRuntime, room: string, path: string): void {
    this.runtime = runtime;
    this.setAttribute('room', room);
    this.setAttribute('path', path);
    this.watch();
  }

  connectedCallback(): void {
    this.addEventListener('open-path', this);
    this.watch();
  }

  disconnectedCallback(): void {
    this.removeEventListener('open-path', this);
    this.unobserve?.();
    this.unobserve = undefined;
  }

  attributeChangedCallback(name: string): void {
    if (name === 'label') {
      this.present();
      return;
    }
    if (!this.isConnected || this.runtime === undefined) return;
    this.resetHistory();
    this.watch();
  }

  handleEvent(event: Event): void {
    if (event.type !== 'open-path') return;
    const detail = (event as CustomEvent<OpenPath>).detail;
    const room = this.getAttribute('room') ?? '';
    if (detail.room !== room || detail.path === this.getAttribute('path')) return;
    this.setAttribute('path', detail.path);
  }

  private resetHistory(): void {
    this.historyGeneration += 1;
    this.revisionGeneration += 1;
    this.historyOpened = false;
    this.historyOpenHandled = false;
    this.historyLoading = false;
    this.historyKind = undefined;
    this.historyRevisions = [];
    this.historyPageToken = undefined;
    this.historyFailure = undefined;
    this.revisionContent = undefined;
    this.selectedRevision = undefined;
  }

  private watch(): void {
    this.unobserve?.();
    this.unobserve = undefined;
    this.current = undefined;
    this.roomState = undefined;
    if (!this.isConnected || this.runtime === undefined) return;
    const room = this.getAttribute('room') ?? '';
    const path = this.getAttribute('path') ?? '';
    const stopQuery = this.runtime.observe('query', { selector: { room, path } }, (result) => {
      this.current = result.documents[0];
      this.present();
    });
    const stopRooms = this.runtime.observe('rooms', (rooms) => {
      this.roomState = rooms.find((entry) => entry.locator === room);
      this.present();
    });
    this.unobserve = () => {
      stopQuery();
      stopRooms();
    };
  }

  private present(): void {
    const style = document.createElement('style');
    style.textContent = viewStyles;
    const heading = document.createElement('h1');
    const path = this.getAttribute('path') ?? '';
    heading.textContent = this.getAttribute('label') ?? path;
    const reason = document.createElement('p');
    reason.className = 'reason';
    reason.setAttribute('role', 'status');
    reason.textContent = refusal(this.roomState, path);
    const body = document.createElement('div');
    if (this.current !== undefined && this.runtime !== undefined)
      this.renderDocument(body, this.current);
    this.root.replaceChildren(style, heading, reason, body);
  }

  private renderDocument(body: HTMLElement, file: QueryDocument): void {
    const runtime = this.runtime!;
    const room = file.room;
    const definition = runtime.types(room).find((entry) => entry.name === file.type);
    if (file.type === 'any') {
      body.append(this.markdown('Document', file.preamble));
    } else {
      if (definition !== undefined) {
        const fields = document.createElement('div');
        fields.className = 'fields';
        fields.setAttribute('role', 'region');
        fields.setAttribute('aria-label', 'Fields');
        for (const [name, declared] of Object.entries(definition.fields)) {
          const spec = asField(declared);
          if (spec === undefined) continue;
          const control = document.createElement(`md-${spec.kind}-field`) as FieldControl;
          control.setAttribute('label', name);
          control.toggleAttribute('disabled', true);
          control.bind(runtime, room, file.type, name);
          if (file.fields[name] !== undefined)
            control.value = fieldValue(file.path, spec, file.fields[name]);
          fields.append(control);
        }
        body.append(fields);
      }
      const preamble = this.section('Preamble');
      preamble.append(this.markdown('Preamble', file.preamble));
      body.append(preamble);
      const declared = definition === undefined ? [] : Object.keys(definition.sections);
      const extra = Object.keys(file.sections).filter((name) => !declared.includes(name));
      for (const name of [...declared, ...extra]) {
        const text = file.sections[name];
        if (text === undefined) continue;
        const section = this.section(name);
        section.append(this.markdown(name, text));
        body.append(section);
      }
    }
    body.append(this.backlinks(file), this.history(file));
  }

  private section(name: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'part';
    section.setAttribute('role', 'region');
    section.setAttribute('aria-label', name);
    const heading = document.createElement('h2');
    heading.textContent = name;
    section.append(heading);
    return section;
  }

  private markdown(label: string, text: string): HTMLElement {
    const element = document.createElement('md-markdown');
    element.setAttribute('room', this.getAttribute('room') ?? '');
    element.setAttribute('path', this.getAttribute('path') ?? '');
    element.setAttribute('label', label);
    (element as HTMLElement & { text: string }).text = text;
    return element;
  }

  private backlinks(file: QueryDocument): HTMLElement {
    const panel = document.createElement('nav');
    panel.className = 'panel';
    panel.setAttribute('aria-label', 'Backlinks');
    const heading = document.createElement('h2');
    heading.textContent = 'Backlinks';
    const list = document.createElement('ul');
    list.className = 'links';
    const entries = [...file.backlinks].sort((left, right) => left.path.localeCompare(right.path));
    for (const entry of entries) {
      const item = document.createElement('li');
      const control = document.createElement('button');
      control.type = 'button';
      control.textContent = entry.path;
      control.addEventListener('click', () => {
        this.dispatchEvent(
          new CustomEvent<OpenPath>('open-path', {
            bubbles: true,
            composed: true,
            detail: { room: file.room, path: entry.path },
          }),
        );
      });
      item.append(control);
      list.append(item);
    }
    panel.append(heading, list);
    return panel;
  }

  private history(file: QueryDocument): HTMLElement {
    const panel = document.createElement('details');
    panel.className = 'panel';
    panel.open = this.historyOpened;
    const summary = document.createElement('summary');
    summary.textContent = 'History';
    panel.append(summary);
    panel.addEventListener('toggle', () => {
      this.historyOpened = panel.open;
      if (panel.open) {
        if (!this.historyOpenHandled) {
          this.historyOpenHandled = true;
          if (this.historyKind === undefined) void this.loadHistory(file);
        }
        return;
      }
      this.historyOpenHandled = false;
      if (this.historyKind === undefined) this.historyFailure = undefined;
    });
    this.renderHistory(panel, file);
    return panel;
  }

  private currentFile(file: QueryDocument): boolean {
    return this.getAttribute('room') === file.room && this.getAttribute('path') === file.path;
  }

  private async loadHistory(file: QueryDocument, pageToken?: string): Promise<void> {
    if (this.runtime === undefined || this.historyLoading) return;
    const generation = ++this.historyGeneration;
    this.historyLoading = true;
    const result = await this.runtime.history(
      file.room,
      file.path,
      pageToken === undefined ? undefined : { pageToken },
    );
    if (generation !== this.historyGeneration || !this.currentFile(file)) return;
    this.historyLoading = false;
    if (result.kind === 'history') {
      this.historyFailure = undefined;
      this.historyKind = 'history';
      this.historyRevisions =
        pageToken === undefined
          ? [...result.revisions]
          : [...this.historyRevisions, ...result.revisions];
      this.historyPageToken = result.pageToken;
      this.present();
      return;
    }
    if (result.kind === 'no-history') {
      this.historyFailure = undefined;
      this.historyKind = 'no-history';
      this.historyRevisions = [];
      this.historyPageToken = undefined;
      this.present();
      return;
    }
    if (isHistoryFailure(result) && pageToken === undefined) {
      this.historyKind = undefined;
      this.historyFailure = result.kind;
      this.present();
    }
  }

  private async loadRevision(file: QueryDocument, revision: string): Promise<void> {
    if (this.runtime === undefined) return;
    const generation = ++this.revisionGeneration;
    this.selectedRevision = revision;
    this.revisionContent = undefined;
    const result = await this.runtime.history(file.room, file.path, { revision });
    if (generation !== this.revisionGeneration || !this.currentFile(file)) return;
    if (this.selectedRevision !== revision) return;
    this.revisionContent = result.kind === 'revision' ? result.content : undefined;
    this.present();
  }

  private renderHistory(panel: HTMLElement, file: QueryDocument): void {
    if (this.historyFailure !== undefined) {
      const absence = document.createElement('p');
      absence.className = 'absence';
      absence.setAttribute('role', 'status');
      absence.textContent = this.historyFailure;
      panel.append(absence);
      return;
    }
    if (this.historyKind === 'no-history') {
      const absence = document.createElement('p');
      absence.className = 'absence';
      absence.textContent = 'No history';
      panel.append(absence);
      return;
    }
    if (this.historyKind !== 'history') return;
    const list = document.createElement('ul');
    list.className = 'revisions';
    for (const revision of this.historyRevisions) {
      const item = document.createElement('li');
      const control = document.createElement('button');
      control.type = 'button';
      control.textContent = this.revisionLabel(revision);
      control.addEventListener('click', () => {
        void this.loadRevision(file, revision.revision);
      });
      item.append(control);
      list.append(item);
    }
    panel.append(list);
    if (this.historyPageToken !== undefined) {
      const more = document.createElement('button');
      more.type = 'button';
      more.textContent = 'Continue';
      more.addEventListener('click', () => {
        if (this.historyPageToken !== undefined) void this.loadHistory(file, this.historyPageToken);
      });
      panel.append(more);
    }
    if (this.revisionContent !== undefined) {
      const content = this.section(this.selectedRevision ?? 'Revision');
      content.append(this.markdown('Revision', this.revisionContent));
      panel.append(content);
    }
  }

  private revisionLabel(revision: HistoryRevision): string {
    const time = new Intl.DateTimeFormat(navigator.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(revision.time));
    return `${revision.author} · ${time}`;
  }
}

customElements.define('md-document-view', DocumentView);
