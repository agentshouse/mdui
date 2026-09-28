import { internalPath, relativePath } from './links.js';
import { mdTypes, observation, refusalParts } from './runtime.js';
import './fields.js';
import './markdown.js';
import { adopt, viewStyles } from './theme.js';
const ROOM_ROOT = 'room';
function roomPrefix(value) {
    const resolved = internalPath(value, ROOM_ROOT);
    if (resolved !== undefined) return resolved.path;
    if (value.split('/').every((part)=>part === '' || part === '.')) return '';
    return null;
}
function covers(prefixes, path) {
    return prefixes.some((prefix)=>{
        const normalized = roomPrefix(prefix);
        return normalized !== null && (normalized === '' || path === normalized || path.startsWith(`${normalized}/`));
    });
}
function asField(value) {
    if (typeof value !== 'object' || value === null) return;
    if (!('kind' in value) || typeof value.kind !== 'string') return;
    return value;
}
function fieldValue(path, spec, value) {
    if (spec.kind === 'reference' && typeof value === 'string') return internalPath(value, path)?.path;
    if (spec.kind === 'list' && spec.of?.kind === 'reference' && Array.isArray(value)) {
        return value.map((entry)=>typeof entry === 'string' ? internalPath(entry, path)?.path : entry);
    }
    return value;
}
function storedField(path, spec, value) {
    if (spec.kind === 'reference' && typeof value === 'string') return relativePath(path, value);
    if (spec.kind === 'list' && spec.of?.kind === 'reference' && Array.isArray(value)) {
        return value.map((entry)=>typeof entry === 'string' ? relativePath(path, entry) : entry);
    }
    return value;
}
function draftEmpty(parts) {
    return Object.keys(parts).length === 0;
}
function editorText(opened, live) {
    if (live === opened) return opened;
    const normalize = (value)=>value.replace(/\r\n|\r/g, '\n');
    if (normalize(live) === normalize(opened)) return opened;
    const openedBreak = opened.includes('\r\n') ? '\r\n' : opened.includes('\r') ? '\r' : '\n';
    if (openedBreak === '\n' || live.includes('\r')) return live;
    return live.replace(/\n/g, openedBreak);
}
function refusal(room, path) {
    if (room === undefined) return '';
    if (covers(room.providerOwnedPaths, path)) return 'This Path is Provider-owned.';
    if (!covers(room.operations.write, path)) return 'This Path has no write grant.';
    return '';
}
function isHistoryFailure(result) {
    return result.kind !== 'history' && result.kind !== 'revision' && result.kind !== 'no-history';
}
function equal(left, right) {
    if (left === right) return true;
    return JSON.stringify(left) === JSON.stringify(right);
}
function cloneParts(draft) {
    return structuredClone(draft?.parts ?? {});
}
function currentText(value) {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return '';
    return JSON.stringify(value);
}
function button(label, name = label) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    if (name !== label) control.setAttribute('aria-label', name);
    return control;
}
function message(kind, text) {
    const node = document.createElement('p');
    node.className = kind;
    node.setAttribute('role', 'status');
    node.textContent = text;
    return node;
}
export class DocumentView extends HTMLElement {
    static observedAttributes = [
        'room',
        'path',
        'label'
    ];
    runtime;
    watchGeneration = 0;
    current;
    roomState;
    unobserve;
    historyOpened = false;
    historyOpenHandled = false;
    historyLoading = false;
    historyKind;
    historyRevisions = [];
    historyPageToken;
    historyFailure;
    historyGeneration = 0;
    revisionGeneration = 0;
    revisionContent;
    selectedRevision;
    draft = null;
    pendingParts;
    writeEpoch = 0;
    editor;
    localRefusal;
    writeChain = Promise.resolve();
    root = this.attachShadow({
        mode: 'open'
    });
    bind(runtime, room, path) {
        this.runtime = runtime;
        this.setAttribute('room', room);
        this.setAttribute('path', path);
        this.watch();
    }
    async create(runtime, room, path, type) {
        this.runtime = runtime;
        this.setAttribute('room', room);
        this.setAttribute('path', path);
        await runtime.roomDraft.write(room, path, null, {
            creation: {
                type,
                fields: {},
                sections: {}
            }
        });
        this.watch();
    }
    connectedCallback() {
        this.addEventListener('open-path', this);
        this.watch();
    }
    disconnectedCallback() {
        this.removeEventListener('open-path', this);
        this.unobserve?.();
        this.unobserve = undefined;
    }
    attributeChangedCallback(name) {
        if (name === 'label') {
            this.present();
            return;
        }
        if (!this.isConnected || this.runtime === undefined) return;
        this.resetHistory();
        this.resetEdit();
        this.watch();
    }
    handleEvent(event) {
        if (event.type !== 'open-path') return;
        const detail = event.detail;
        const room = this.getAttribute('room') ?? '';
        if (detail.room !== room || detail.path === this.getAttribute('path')) return;
        this.setAttribute('path', detail.path);
    }
    resetHistory() {
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
    resetEdit() {
        this.writeEpoch += 1;
        this.pendingParts = undefined;
        this.editor = undefined;
        this.localRefusal = undefined;
    }
    intendedParts() {
        return this.pendingParts === undefined ? cloneParts(this.draft) : structuredClone(this.pendingParts ?? {});
    }
    intendedDraft() {
        if (this.pendingParts !== undefined) return structuredClone(this.pendingParts);
        return this.draft === null ? null : cloneParts(this.draft);
    }
    roomName() {
        return this.getAttribute('room') ?? '';
    }
    filePath() {
        return this.getAttribute('path') ?? '';
    }
    writable() {
        return refusal(this.roomState, this.filePath()) === '';
    }
    definition() {
        const creation = this.draft?.parts.creation;
        const type = this.current?.type ?? (creation !== undefined && 'type' in creation ? creation.type : undefined);
        if (type === undefined) return;
        return mdTypes(this.roomState?.model).find((entry)=>entry.name === type);
    }
    watch() {
        this.unobserve?.();
        this.unobserve = undefined;
        this.current = undefined;
        this.roomState = undefined;
        const generation = this.watchGeneration += 1;
        this.unobserve = ()=>{
            this.watchGeneration += 1;
        };
        if (!this.isConnected || this.runtime === undefined) return;
        const runtime = this.runtime;
        const room = this.roomName();
        const path = this.filePath();
        void (async ()=>{
            let queried = false;
            const stops = [
                observation(runtime.observe('query', {
                    rooms: [
                        room
                    ],
                    select: 'all'
                }), (result)=>{
                    if (generation !== this.watchGeneration) return;
                    const current = result.documents.find((document1)=>document1.path === path);
                    if (queried && equal(this.current, current)) return;
                    queried = true;
                    this.current = current;
                    this.present();
                }),
                observation(runtime.observe('rooms'), (rooms)=>{
                    if (generation !== this.watchGeneration) return;
                    const state = rooms.find((entry)=>entry.locator === room);
                    if (equal(this.roomState, state)) return;
                    this.roomState = state;
                    this.present();
                }),
                observation(runtime.observe('room-drafts'), (drafts)=>{
                    if (generation !== this.watchGeneration) return;
                    const draft = drafts.find((entry)=>entry.room === room && entry.path === path) ?? null;
                    if (equal(this.draft, draft)) return;
                    this.draft = draft;
                    this.present();
                })
            ];
            if (generation !== this.watchGeneration) {
                for (const stop of stops)stop();
                return;
            }
            this.unobserve = ()=>{
                this.watchGeneration += 1;
                for (const stop of stops)stop();
            };
        })();
    }
    runWrite(work) {
        const next = this.writeChain.then(work, work);
        this.writeChain = next.catch(()=>undefined);
        return next;
    }
    async keepDraft(next) {
        if (this.runtime === undefined) return false;
        const room = this.roomName();
        const path = this.filePath();
        const epoch = this.writeEpoch;
        this.pendingParts = next;
        let written = true;
        await this.runWrite(async ()=>{
            if (this.runtime === undefined) return;
            if (epoch !== this.writeEpoch) {
                written = false;
                return;
            }
            if (next === null) {
                if (this.draft === null) {
                    if (this.pendingParts === next) this.pendingParts = undefined;
                    return;
                }
                const result = await this.runtime.roomDraft.discard(room, path, this.draft.revision);
                if (result.outcome === 'written') {
                    this.draft = null;
                    if (this.pendingParts === next) this.pendingParts = undefined;
                    this.localRefusal = undefined;
                    return;
                }
                written = false;
                this.writeEpoch += 1;
                this.pendingParts = undefined;
                this.draft = result.current;
                this.editor = undefined;
                this.localRefusal = {
                    rule: 'stale',
                    file: path
                };
                this.present();
                return;
            }
            const result = await this.runtime.roomDraft.write(room, path, this.draft?.revision ?? null, next);
            if (result.outcome === 'written') {
                this.draft = result.roomDraft;
                if (this.pendingParts === next) this.pendingParts = undefined;
                this.localRefusal = undefined;
                return;
            }
            written = false;
            this.writeEpoch += 1;
            this.pendingParts = undefined;
            this.draft = result.current;
            this.editor = undefined;
            this.localRefusal = {
                rule: 'stale',
                file: path
            };
            this.present();
        });
        return written;
    }
    displayedField(name, spec) {
        const creation = this.draft?.parts.creation;
        if (creation !== undefined && 'type' in creation && Object.hasOwn(creation.fields, name)) return fieldValue(this.filePath(), spec, creation.fields[name]);
        const drafted = this.draft?.parts.fields?.[name];
        if (drafted !== undefined) return fieldValue(this.filePath(), spec, drafted.value);
        const value = this.current?.fields?.[name];
        return value === undefined ? undefined : fieldValue(this.filePath(), spec, value);
    }
    displayedSection(name) {
        const creation = this.draft?.parts.creation;
        if (creation !== undefined && 'type' in creation && Object.hasOwn(creation.sections, name)) return creation.sections[name];
        const drafted = this.draft?.parts.sections?.[name];
        if (drafted !== undefined) return drafted.value;
        return this.current?.sections?.[name];
    }
    refusalAt(part) {
        if (this.localRefusal === undefined) return false;
        if (this.localRefusal.location === part) return true;
        if (this.localRefusal.location !== undefined) return false;
        if (part === 'preamble') return this.draft?.parts.preamble !== undefined;
        return this.draft?.parts.fields !== undefined && part in this.draft.parts.fields ? true : this.draft?.parts.sections !== undefined && part in this.draft.parts.sections;
    }
    displayedPreamble() {
        return this.draft?.parts.preamble?.value ?? this.current?.preamble ?? '';
    }
    displayedWhole() {
        const creation = this.draft?.parts.creation;
        if (creation !== undefined && 'markdown' in creation) return creation.markdown;
        return this.draft?.parts.markdown?.value ?? this.current?.markdown;
    }
    refusalUnplaced() {
        if (this.localRefusal === undefined) return false;
        const location = this.localRefusal.location;
        if (location === undefined) return true;
        if (location === 'preamble') return false;
        if (this.definition()?.fields[location] !== undefined) return false;
        if (this.current?.sections?.[location] !== undefined) return false;
        if (this.draft?.parts.sections !== undefined && location in this.draft.parts.sections) return false;
        return true;
    }
    marks() {
        const marks = new Map();
        const changed = this.draft?.changedUnderneath;
        if (changed === undefined) return marks;
        for (const [name, value] of Object.entries(changed.fields ?? {}))marks.set(`field:${name}`, value === null ? undefined : value.value);
        for (const [name, value] of Object.entries(changed.sections ?? {}))marks.set(`section:${name}`, value);
        if (changed.preamble !== undefined) marks.set('preamble', changed.preamble);
        if (changed.markdown !== undefined) marks.set('whole', changed.markdown);
        return marks;
    }
    present() {
        if (!this.writable() && this.editor !== undefined) {
            const next = this.applyEditor(this.intendedParts(), this.editor, editorText(this.editor.opened, this.editor.live));
            this.editor = undefined;
            void this.keepDraft(draftEmpty(next) ? null : next);
        }
        adopt(this.root, viewStyles);
        const heading = document.createElement('h1');
        const path = this.filePath();
        heading.textContent = this.getAttribute('label') ?? path;
        const reason = document.createElement('p');
        reason.className = 'reason';
        reason.setAttribute('role', 'status');
        reason.textContent = refusal(this.roomState, path);
        const body = document.createElement('div');
        if (this.writable()) body.append(this.documentControls());
        if (this.current !== undefined && this.runtime !== undefined) this.renderDocument(body, this.current);
        else if (this.draft?.parts.creation !== undefined && this.runtime !== undefined) this.renderCreation(body);
        this.root.replaceChildren(heading, reason, body);
    }
    documentControls() {
        const panel = document.createElement('div');
        panel.className = 'structure';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Document');
        const returned = this.draft?.returned;
        if (returned !== null && returned !== undefined) {
            panel.append(message('refusal', returned.kind));
            if ('code' in returned) for (const part of refusalParts(returned))panel.append(message('refusal', part));
        }
        if (this.localRefusal !== undefined && this.refusalUnplaced()) {
            panel.append(message('error', this.localRefusal.rule));
            if (this.localRefusal.referrers !== undefined) panel.append(this.referrers(this.localRefusal.referrers));
        }
        const rename = document.createElement('input');
        rename.id = 'rename';
        const renameLabel = document.createElement('label');
        renameLabel.htmlFor = 'rename';
        renameLabel.textContent = 'Rename';
        rename.value = this.draft?.parts.move?.to ?? this.filePath();
        rename.addEventListener('change', ()=>{
            const held = this.intendedParts();
            const { move: _move, ...withoutMove } = held;
            const next = rename.value === this.filePath() ? withoutMove : {
                ...held,
                move: {
                    to: rename.value,
                    base: this.current?.markdown ?? null
                }
            };
            void this.keepDraft(draftEmpty(next) ? null : next);
        });
        panel.append(renameLabel, rename);
        const actions = document.createElement('div');
        actions.className = 'actions';
        const save = button('Save');
        save.addEventListener('click', ()=>{
            void this.fileSave();
        });
        actions.append(save);
        if (this.current !== undefined) {
            const remove = button('Remove');
            remove.addEventListener('click', ()=>{
                void this.removeFile();
            });
            actions.append(remove);
        }
        if (this.draft !== null) {
            const discard = button('Discard');
            discard.addEventListener('click', ()=>{
                void this.discardDraft();
            });
            actions.append(discard);
        }
        if (this.current !== undefined && this.current.type !== 'any') {
            const whole = button('Edit whole text');
            whole.addEventListener('click', ()=>{
                const text = this.displayedWhole();
                if (text === undefined) return;
                this.openEditor('whole', 'Whole text', text);
            });
            actions.append(whole);
        }
        panel.append(actions);
        return panel;
    }
    referrers(paths) {
        const panel = document.createElement('nav');
        panel.className = 'panel';
        panel.setAttribute('aria-label', 'Referring locations');
        const list = document.createElement('ul');
        list.className = 'links';
        for (const path of paths){
            const item = document.createElement('li');
            const control = button(path);
            control.addEventListener('click', ()=>{
                this.dispatchEvent(new CustomEvent('open-path', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        room: this.roomName(),
                        path
                    }
                }));
            });
            item.append(control);
            list.append(item);
        }
        panel.append(list);
        return panel;
    }
    renderCreation(body) {
        const definition = this.definition();
        if (definition === undefined || this.runtime === undefined) return;
        body.append(this.fields(definition));
        for (const name of Object.keys(definition.sections)){
            body.append(this.textPart(name, this.displayedSection(name) ?? '', true));
        }
    }
    renderDocument(body, file) {
        const definition = mdTypes(this.roomState?.model).find((entry)=>entry.name === file.type);
        if (this.editor?.part === 'whole') {
            body.append(this.textPart(this.editor.name, this.editor.live, true, 'whole'));
            return;
        }
        if (file.type === 'any') {
            const text = this.displayedWhole();
            if (text !== undefined) {
                if (this.writable()) body.append(this.textPart('Document', text, true, 'whole'));
                else body.append(this.markdown('Document', text));
            }
        } else {
            if (definition !== undefined) body.append(this.fields(definition));
            body.append(this.textPart('Preamble', this.displayedPreamble(), this.writable(), 'preamble'));
            const declared = definition === undefined ? [] : Object.keys(definition.sections);
            const extra = Object.keys(file.sections ?? {}).filter((name)=>!declared.includes(name));
            const names = this.draft?.parts.creation === undefined ? [
                ...declared,
                ...extra
            ] : [
                ...new Set([
                    ...declared,
                    ...extra,
                    ...Object.keys(this.draft.parts.sections ?? {})
                ])
            ];
            for (const name of names){
                const text = this.displayedSection(name);
                if (text === undefined && this.draft?.parts.creation === undefined) continue;
                body.append(this.textPart(name, text ?? '', this.writable()));
            }
        }
        body.append(this.backlinks(file), this.history(file));
    }
    fields(definition) {
        const fields = document.createElement('div');
        fields.className = 'fields';
        fields.setAttribute('role', 'region');
        fields.setAttribute('aria-label', 'Fields');
        const runtime = this.runtime;
        const room = this.roomName();
        const enabled = this.writable();
        const marks = this.marks();
        for (const [name, declared] of Object.entries(definition.fields)){
            const spec = asField(declared);
            if (spec === undefined) continue;
            const wrap = document.createElement('div');
            const control = document.createElement(`md-${spec.kind}-field`);
            control.setAttribute('label', name);
            control.toggleAttribute('disabled', !enabled);
            control.bindDefinition(runtime, room, name, spec);
            const value = this.displayedField(name, spec);
            if (value !== undefined) control.value = value;
            if (enabled) {
                const commit = ()=>{
                    void this.changeField(name, control.value);
                };
                control.addEventListener('change', commit);
                control.addEventListener('input', commit);
            }
            wrap.append(control);
            const marked = marks.get(`field:${name}`);
            if (marked !== undefined) wrap.append(message('current', `Current value: ${currentText(marked)}`));
            if (this.refusalAt(name)) wrap.append(message('error', this.localRefusal.rule));
            fields.append(wrap);
        }
        return fields;
    }
    textPart(name, text, editable, kind = 'section') {
        const section = this.section(name);
        const editing = this.editor !== undefined && this.editor.part === kind && (kind === 'section' ? this.editor.name === name : true);
        if (editing) {
            const area = document.createElement('textarea');
            area.setAttribute('aria-label', name);
            area.value = this.editor.live;
            area.addEventListener('input', ()=>{
                if (this.editor === undefined) return;
                this.editor.live = area.value;
                void this.persistEditor();
            });
            const actions = document.createElement('div');
            actions.className = 'actions';
            const save = button('Save', `Save ${name}`);
            save.addEventListener('click', ()=>{
                void this.commitEditor(area.value);
            });
            const cancel = button('Cancel', `Cancel ${name}`);
            cancel.addEventListener('click', ()=>{
                void this.cancelEditor();
            });
            actions.append(save, cancel);
            section.append(area, actions);
        } else {
            section.append(this.markdown(name, text));
            if (editable) {
                const edit = button('Edit', `Edit ${name}`);
                edit.addEventListener('click', ()=>{
                    this.openEditor(kind, name, text);
                });
                section.append(edit);
            }
        }
        const mark = kind === 'preamble' ? 'preamble' : kind === 'whole' ? 'whole' : `section:${name}`;
        const marked = this.marks().get(mark);
        if (marked !== undefined) section.append(message('current', `Current value: ${currentText(marked)}`));
        if (this.refusalAt(kind === 'preamble' ? 'preamble' : name)) section.append(message('error', this.localRefusal.rule));
        return section;
    }
    applyEditor(parts, editor, text) {
        const creation = parts.creation;
        if (creation !== undefined && 'markdown' in creation) {
            return {
                ...parts,
                creation: {
                    markdown: text
                }
            };
        }
        if (creation !== undefined && 'type' in creation && editor.part === 'section') {
            return {
                ...parts,
                creation: {
                    ...creation,
                    sections: {
                        ...creation.sections,
                        [editor.name]: text
                    }
                }
            };
        }
        if (editor.part === 'whole') {
            const { fields: _fields, sections: _sections, preamble: _preamble, ...withoutStructuredText } = parts;
            return {
                ...withoutStructuredText,
                markdown: {
                    value: text,
                    base: this.current?.markdown ?? ''
                }
            };
        }
        if (editor.part === 'preamble') {
            return {
                ...parts,
                preamble: {
                    value: text,
                    base: this.current?.preamble ?? ''
                }
            };
        }
        return {
            ...parts,
            sections: {
                ...parts.sections,
                [editor.name]: {
                    value: text,
                    base: this.current?.sections?.[editor.name] ?? ''
                }
            }
        };
    }
    openEditor(part, name, opened) {
        if (this.editor !== undefined) {
            const previous = this.editor;
            const retained = this.applyEditor(this.intendedParts(), previous, editorText(previous.opened, previous.live));
            void this.keepDraft(retained);
        }
        this.editor = {
            part,
            name,
            opened,
            live: opened,
            snapshot: this.intendedDraft()
        };
        this.present();
        this.root.querySelector('textarea')?.focus();
    }
    persistEditor() {
        if (this.editor === undefined) return Promise.resolve();
        const next = this.applyEditor(this.intendedParts(), this.editor, editorText(this.editor.opened, this.editor.live));
        return this.keepDraft(next).then(()=>undefined);
    }
    async commitEditor(value) {
        if (this.editor === undefined) return true;
        const text = editorText(this.editor.opened, value ?? this.editor.live);
        const next = this.applyEditor(this.intendedParts(), this.editor, text);
        this.editor = undefined;
        const written = await this.keepDraft(next);
        this.present();
        return written;
    }
    async cancelEditor() {
        if (this.editor === undefined) return;
        const next = structuredClone(this.editor.snapshot);
        this.editor = undefined;
        await this.keepDraft(next === null || draftEmpty(next) ? null : next);
        this.present();
    }
    async changeField(name, value) {
        const spec = asField(this.definition()?.fields[name]);
        const previous = this.current?.fields?.[name];
        const intended = spec === undefined ? value : storedField(this.filePath(), spec, value);
        const held = this.intendedParts();
        const creation = held.creation;
        if (creation !== undefined && 'type' in creation) {
            const next = {
                ...held,
                creation: {
                    ...creation,
                    fields: {
                        ...creation.fields,
                        [name]: intended
                    }
                }
            };
            await this.keepDraft(next);
            return;
        }
        const { markdown: _markdown, ...withoutMarkdown } = held;
        if (equal(previous, intended)) {
            const fields = Object.fromEntries(Object.entries(withoutMarkdown.fields ?? {}).filter(([field])=>field !== name));
            const { fields: _fields, ...withoutFields } = withoutMarkdown;
            const next = Object.keys(fields).length === 0 ? withoutFields : {
                ...withoutFields,
                fields
            };
            await this.keepDraft(draftEmpty(next) ? null : next);
            return;
        }
        const next = {
            ...withoutMarkdown,
            fields: {
                ...withoutMarkdown.fields,
                [name]: {
                    value: intended,
                    base: previous === undefined ? null : {
                        value: previous
                    }
                }
            }
        };
        await this.keepDraft(next);
    }
    async fileSave() {
        if (this.runtime === undefined) return;
        const writeEpoch = this.writeEpoch;
        if (this.editor !== undefined && !await this.commitEditor()) return;
        await this.writeChain;
        if (writeEpoch !== this.writeEpoch) return;
        if (this.draft === null) return;
        const { path, revision } = this.draft;
        const moved = this.draft.parts.move?.to;
        const result = await this.runtime.save(this.roomName(), [
            {
                path,
                revision
            }
        ]);
        if (result.outcome === 'refused') {
            if (result.rule !== 'durable-write' && this.draft.parts.removal !== undefined) {
                const { removal: _removal, ...retained } = this.draft.parts;
                if (!await this.keepDraft(draftEmpty(retained) ? null : retained)) return;
            }
            this.localRefusal = result;
            this.present();
            return;
        }
        this.localRefusal = undefined;
        this.editor = undefined;
        this.draft = await this.runtime.roomDraft.read(this.roomName(), moved ?? this.filePath());
        if (moved !== undefined && moved !== this.filePath()) {
            this.setAttribute('path', moved);
            return;
        }
        this.present();
    }
    async removeFile() {
        const next = {
            ...this.intendedParts(),
            removal: {
                base: this.current?.markdown ?? null
            }
        };
        if (!await this.keepDraft(next)) return;
        await this.fileSave();
    }
    async discardDraft() {
        if (!await this.keepDraft(null)) return;
        this.localRefusal = undefined;
        this.present();
    }
    section(name) {
        const section = document.createElement('section');
        section.className = 'part';
        section.setAttribute('role', 'region');
        section.setAttribute('aria-label', name);
        const heading = document.createElement('h2');
        heading.textContent = name;
        section.append(heading);
        return section;
    }
    markdown(label, text) {
        const element = document.createElement('md-markdown');
        element.setAttribute('room', this.roomName());
        element.setAttribute('path', this.filePath());
        element.setAttribute('label', label);
        element.text = text;
        return element;
    }
    backlinks(file) {
        const panel = document.createElement('nav');
        panel.className = 'panel';
        panel.setAttribute('aria-label', 'Backlinks');
        const heading = document.createElement('h2');
        heading.textContent = 'Backlinks';
        const list = document.createElement('ul');
        list.className = 'links';
        const entries = [
            ...file.backlinks ?? []
        ].sort((left, right)=>left.path.localeCompare(right.path));
        for (const entry of entries){
            const item = document.createElement('li');
            const control = document.createElement('button');
            control.type = 'button';
            control.textContent = entry.path;
            control.addEventListener('click', ()=>{
                this.dispatchEvent(new CustomEvent('open-path', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        room: file.room,
                        path: entry.path
                    }
                }));
            });
            item.append(control);
            list.append(item);
        }
        panel.append(heading, list);
        return panel;
    }
    history(file) {
        const panel = document.createElement('details');
        panel.className = 'panel';
        panel.open = this.historyOpened;
        const summary = document.createElement('summary');
        summary.textContent = 'History';
        panel.append(summary);
        panel.addEventListener('toggle', ()=>{
            this.historyOpened = panel.open;
            if (panel.open) {
                this.requestHistory(file);
                return;
            }
            this.historyOpenHandled = false;
            if (this.historyKind === undefined) this.historyFailure = undefined;
        });
        if (this.historyOpened) this.requestHistory(file);
        this.renderHistory(panel, file);
        return panel;
    }
    currentFile(file) {
        return this.getAttribute('room') === file.room && this.getAttribute('path') === file.path;
    }
    requestHistory(file) {
        if (this.historyOpenHandled) return;
        this.historyOpenHandled = true;
        if (this.historyKind === undefined) void this.loadHistory(file);
    }
    async loadHistory(file, pageToken) {
        if (this.runtime === undefined || this.historyLoading) return;
        const generation = ++this.historyGeneration;
        this.historyLoading = true;
        const result = await this.runtime.history(file.room, file.path, pageToken === undefined ? undefined : {
            pageToken
        });
        if (generation !== this.historyGeneration || !this.currentFile(file)) return;
        this.historyLoading = false;
        if (result.kind === 'history') {
            this.historyFailure = undefined;
            this.historyKind = 'history';
            this.historyRevisions = pageToken === undefined ? [
                ...result.revisions
            ] : [
                ...this.historyRevisions,
                ...result.revisions
            ];
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
    async loadRevision(file, revision) {
        if (this.runtime === undefined) return;
        const generation = ++this.revisionGeneration;
        this.selectedRevision = revision;
        this.revisionContent = undefined;
        const result = await this.runtime.history(file.room, file.path, {
            revision
        });
        if (generation !== this.revisionGeneration || !this.currentFile(file)) return;
        if (this.selectedRevision !== revision) return;
        this.revisionContent = result.kind === 'revision' ? result.content : undefined;
        this.present();
    }
    renderHistory(panel, file) {
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
        for (const revision of this.historyRevisions){
            const item = document.createElement('li');
            const control = document.createElement('button');
            control.type = 'button';
            control.textContent = this.revisionLabel(revision);
            control.addEventListener('click', ()=>{
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
            more.addEventListener('click', ()=>{
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
    revisionLabel(revision) {
        const time = new Intl.DateTimeFormat(navigator.language, {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(new Date(revision.time));
        return `${revision.author} · ${time}`;
    }
}
customElements.define('md-document-view', DocumentView);
