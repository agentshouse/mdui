import type {
  AppRoom,
  HistoryResult,
  HistoryRevision,
  MdRuntime,
  QueryDocument,
} from '@agentshouse/mdruntime';
import { type FieldControl } from './fields.js';
import './fields.js';
import './markdown.js';
import { viewStyles } from './theme.js';

type FieldSpec = {
  kind: string;
  required?: boolean;
  values?: readonly string[];
  to?: string;
  of?: string;
};
type SectionSpec = { kind?: string };

type OpenPath = { room: string; path: string };

function covers(prefixes: readonly string[], path: string): boolean {
  return prefixes.some((prefix) => {
    const normalized = prefix.replaceAll(/^\/+|\/+$/g, '');
    return normalized === '' || path === normalized || path.startsWith(`${normalized}/`);
  });
}

function resolvePath(from: string, reference: string): string {
  const base = from.includes('/') ? from.slice(0, from.lastIndexOf('/')).split('/') : [];
  const parts = [...base];
  for (const part of reference.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return reference;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function fieldValue(path: string, spec: FieldSpec, value: unknown): unknown {
  if (spec.kind === 'reference' && typeof value === 'string') return resolvePath(path, value);
  if (spec.kind === 'list' && spec.of === 'reference' && Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? resolvePath(path, entry) : entry));
  }
  return value;
}

function refusal(room: AppRoom | undefined, path: string): string {
  if (room === undefined) return '';
  if (covers(room.providerOwnedPaths, path)) return 'This Path is Provider-owned.';
  if (!covers(room.writeGrants, path)) return 'This Path has no write grant.';
  return '';
}

export class DocumentView extends HTMLElement {
  static observedAttributes = ['room', 'path', 'label'];
  private runtime: MdRuntime | undefined;
  private current: QueryDocument | undefined;
  private roomState: AppRoom | undefined;
  private unobserve: (() => void) | undefined;
  private historyOpened = false;
  private historyResult: HistoryResult | undefined;
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
    this.historyOpened = false;
    this.historyResult = undefined;
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
    if (definition === undefined || file.type === 'any') {
      body.append(this.markdown('Document', file.preamble));
    } else {
      const fields = document.createElement('div');
      fields.className = 'fields';
      fields.setAttribute('role', 'region');
      fields.setAttribute('aria-label', 'Fields');
      const declaredFields = definition.fields as Readonly<Record<string, FieldSpec>>;
      for (const [name, spec] of Object.entries(declaredFields)) {
        const control = document.createElement(`md-${spec.kind}-field`) as FieldControl;
        control.setAttribute('label', name);
        control.toggleAttribute('disabled', true);
        control.bind(runtime, room, file.type, name);
        if (file.fields[name] !== undefined)
          control.value = fieldValue(file.path, spec, file.fields[name]);
        fields.append(control);
      }
      body.append(fields);
      const preamble = this.section('Preamble');
      preamble.append(this.markdown('Preamble', file.preamble));
      body.append(preamble);
      const declared = Object.keys(definition.sections as Readonly<Record<string, SectionSpec>>);
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
      if (panel.open && this.historyResult === undefined) void this.loadHistory(file);
    });
    this.renderHistory(panel, file);
    return panel;
  }

  private async loadHistory(file: QueryDocument): Promise<void> {
    if (this.runtime === undefined) return;
    this.historyResult = await this.runtime.history(file.room, file.path);
    this.present();
  }

  private async loadRevision(file: QueryDocument, revision: string): Promise<void> {
    if (this.runtime === undefined) return;
    const result = await this.runtime.history(file.room, file.path, { revision });
    this.selectedRevision = revision;
    this.revisionContent = result.kind === 'revision' ? result.content : undefined;
    this.present();
  }

  private renderHistory(panel: HTMLElement, file: QueryDocument): void {
    const result = this.historyResult;
    if (result === undefined) return;
    if (result.kind === 'no-history') {
      const absence = document.createElement('p');
      absence.className = 'absence';
      absence.textContent = 'No history';
      panel.append(absence);
      return;
    }
    if (result.kind !== 'history') return;
    const list = document.createElement('ul');
    list.className = 'revisions';
    for (const revision of result.revisions) {
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
