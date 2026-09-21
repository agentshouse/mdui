import { internalPath, relativePath } from './links.js';
import { mdTypes, observation, refusalParts } from './runtime.js';
import './fields.js';
import './markdown.js';
import { viewStyles } from './theme.js';
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
    if (spec.kind === 'list' && spec.of === 'reference' && Array.isArray(value)) {
        return value.map((entry)=>typeof entry === 'string' ? internalPath(entry, path)?.path : entry);
    }
    return value;
}
function storedField(path, spec, value) {
    if (spec.kind === 'reference' && typeof value === 'string') return relativePath(path, value);
    if (spec.kind === 'list' && spec.of === 'reference' && Array.isArray(value)) {
        return value.map((entry)=>typeof entry === 'string' ? relativePath(path, entry) : entry);
    }
    return value;
}
function draftEmpty(draft) {
    return draft.fields === undefined && draft.sections === undefined && draft.preamble === undefined && draft.whole === undefined && draft.create === undefined && draft.moveTo === undefined && draft.remove !== true;
}
function overlayDraft(base, newer) {
    if (newer.whole !== undefined) return {
        ...newer
    };
    return {
        ...base,
        ...newer,
        fields: base.fields === undefined && newer.fields === undefined ? undefined : {
            ...base.fields,
            ...newer.fields
        },
        sections: base.sections === undefined && newer.sections === undefined ? undefined : {
            ...base.sections,
            ...newer.sections
        },
        preamble: newer.preamble ?? base.preamble,
        whole: newer.whole ?? base.whole,
        create: newer.create ?? base.create,
        moveTo: newer.moveTo ?? base.moveTo,
        remove: newer.remove ?? base.remove
    };
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
function asDraft(value) {
    if (typeof value !== 'object' || value === null) return null;
    return value;
}
function cloneDraft(draft) {
    return structuredClone(draft ?? {});
}
function currentText(value) {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return '';
    return JSON.stringify(value);
}
function changePath(change) {
    return change.path;
}
function draftFromChanges(changes, path) {
    const draft = {};
    for (const change of changes){
        if (changePath(change) !== path && !(change.kind === 'move' && change.to === path)) continue;
        if (change.kind === 'field') {
            draft.fields = {
                ...draft.fields,
                [change.name]: change.value
            };
            continue;
        }
        if (change.kind === 'section') {
            draft.sections = {
                ...draft.sections,
                [change.name]: change.value
            };
            continue;
        }
        if (change.kind === 'preamble') {
            draft.preamble = change.value;
            continue;
        }
        if (change.kind === 'replace') {
            draft.whole = change.content;
            continue;
        }
        if (change.kind === 'create') {
            draft.create = {
                type: String(change.fields.type ?? '')
            };
            const fields = {
                ...change.fields
            };
            delete fields.type;
            draft.fields = fields;
            draft.sections = {
                ...change.sections
            };
            continue;
        }
        if (change.kind === 'move') {
            draft.moveTo = change.to;
            continue;
        }
        if (change.kind === 'remove') draft.remove = true;
    }
    return draft;
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
    editor;
    localRefusal;
    queue = [];
    restoredHead;
    conflictBaseline;
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
        await runtime.draft.replace(room, path, {
            create: {
                type
            },
            fields: {},
            sections: {}
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
        this.editor = undefined;
        this.localRefusal = undefined;
        this.restoredHead = undefined;
        this.conflictBaseline = undefined;
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
        const type = this.current?.type ?? this.draft?.create?.type;
        if (type === undefined) return;
        return mdTypes(this.roomState?.model).find((entry)=>entry.name === type);
    }
    refusedHead() {
        const [head] = this.queue;
        if (head === undefined) return;
        if (head.outcome.kind !== 'conflicted' && head.outcome.kind !== 'rejected') return;
        const path = this.filePath();
        if (!head.batch.changes.some((change)=>changePath(change) === path || change.kind === 'move' && change.to === path)) return;
        return head;
    }
    watch() {
        this.unobserve?.();
        this.unobserve = undefined;
        this.current = undefined;
        this.roomState = undefined;
        this.queue = [];
        const generation = this.watchGeneration += 1;
        this.unobserve = ()=>{
            this.watchGeneration += 1;
        };
        if (!this.isConnected || this.runtime === undefined) return;
        const runtime = this.runtime;
        const room = this.roomName();
        const path = this.filePath();
        void (async ()=>{
            const value = await runtime.draft.read(room, path);
            if (generation !== this.watchGeneration) return;
            this.draft = asDraft(value);
            let queried = false;
            const stops = [
                observation(runtime.observe('query', {
                    selector: {
                        room,
                        path
                    }
                }, (result)=>{
                    if (generation !== this.watchGeneration) return;
                    const current = result.documents[0];
                    if (queried && equal(this.current, current)) return;
                    queried = true;
                    this.current = current;
                    this.present();
                })),
                observation(runtime.observe('rooms', (rooms)=>{
                    if (generation !== this.watchGeneration) return;
                    const state = rooms.find((entry)=>entry.locator === room);
                    if (equal(this.roomState, state)) return;
                    this.roomState = state;
                    this.present();
                })),
                observation(runtime.observe('queue', room, (entries)=>{
                    if (generation !== this.watchGeneration) return;
                    if (equal(this.queue, entries)) return;
                    this.queue = entries;
                    void this.restoreRefused();
                    this.present();
                }))
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
    async restoreRefused() {
        const head = this.refusedHead();
        if (head === undefined || this.runtime === undefined) return;
        if (this.restoredHead === head.batch.id) return;
        this.restoredHead = head.batch.id;
        const refused = draftFromChanges(head.batch.changes, this.filePath());
        const next = this.draft === null ? refused : overlayDraft(refused, this.draft);
        await this.keepDraft(next);
        this.present();
    }
    runWrite(work) {
        const next = this.writeChain.then(work, work);
        this.writeChain = next.catch(()=>undefined);
        return next;
    }
    async keepDraft(next) {
        if (this.runtime === undefined) return;
        const room = this.roomName();
        const path = this.filePath();
        this.draft = next;
        await this.runWrite(async ()=>{
            if (this.runtime === undefined) return;
            if (next === null) {
                await this.runtime.draft.discard(room, path);
                return;
            }
            await this.runtime.draft.replace(room, path, next);
        });
    }
    displayedField(name, spec) {
        const drafted = this.draft?.fields?.[name];
        if (drafted !== undefined || this.draft?.fields !== undefined && name in this.draft.fields) return fieldValue(this.filePath(), spec, drafted);
        const value = this.current?.fields[name];
        return value === undefined ? undefined : fieldValue(this.filePath(), spec, value);
    }
    displayedSection(name) {
        if (this.draft?.sections !== undefined && name in this.draft.sections) return this.draft.sections[name];
        return this.current?.sections[name];
    }
    refusalAt(part) {
        if (this.localRefusal === undefined) return false;
        if (this.localRefusal.location === part) return true;
        if (this.localRefusal.location !== undefined) return false;
        if (part === 'preamble') return this.draft?.preamble !== undefined;
        return this.draft?.fields !== undefined && part in this.draft.fields ? true : this.draft?.sections !== undefined && part in this.draft.sections;
    }
    displayedPreamble() {
        return this.draft?.preamble ?? this.current?.preamble ?? '';
    }
    displayedWhole() {
        if (this.draft?.whole !== undefined) return this.draft.whole;
        return this.current?.content;
    }
    refusalUnplaced() {
        if (this.localRefusal === undefined) return false;
        const location = this.localRefusal.location;
        if (location === undefined) return true;
        if (location === 'preamble') return false;
        if (this.definition()?.fields[location] !== undefined) return false;
        if (this.current?.sections[location] !== undefined) return false;
        if (this.draft?.sections !== undefined && location in this.draft.sections) return false;
        return true;
    }
    marks() {
        const marks = new Map();
        const file = this.current;
        const head = this.refusedHead();
        if (file === undefined || head === undefined) return marks;
        if (head.batch.changes.some((change)=>change.kind === 'replace' && change.path === file.path)) return marks;
        const priors = new Map();
        for (const precondition of head.batch.preconditions){
            if (!('path' in precondition) || precondition.path !== file.path) continue;
            if (precondition.kind === 'field') priors.set(`field:${precondition.name}`, precondition.value);
            if (precondition.kind === 'section') priors.set(`section:${precondition.name}`, precondition.value);
            if (precondition.kind === 'preamble') priors.set('preamble', precondition.value);
        }
        const baseline = this.conflictBaseline;
        const priorOf = (key, fromBaseline)=>{
            if (priors.has(key)) return priors.get(key);
            if (baseline !== undefined) return fromBaseline;
        };
        const note = (key, current, prior)=>{
            if (prior !== undefined && !equal(current, prior)) marks.set(key, current);
        };
        const fieldNames = new Set([
            ...Object.keys(file.fields),
            ...Object.keys(baseline?.fields ?? {})
        ]);
        for (const name of fieldNames){
            note(`field:${name}`, file.fields[name], priorOf(`field:${name}`, baseline?.fields[name]));
        }
        const sectionNames = new Set([
            ...Object.keys(file.sections),
            ...Object.keys(baseline?.sections ?? {})
        ]);
        for (const name of sectionNames){
            note(`section:${name}`, file.sections[name], priorOf(`section:${name}`, baseline?.sections[name]));
        }
        note('preamble', file.preamble, priorOf('preamble', baseline?.preamble));
        return marks;
    }
    present() {
        if (!this.writable() && this.editor !== undefined) {
            const next = this.applyEditor(cloneDraft(this.draft), this.editor, editorText(this.editor.opened, this.editor.live));
            this.editor = undefined;
            void this.keepDraft(draftEmpty(next) ? null : next);
        }
        const style = document.createElement('style');
        style.textContent = viewStyles;
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
        else if (this.draft?.create !== undefined && this.runtime !== undefined) this.renderCreation(body);
        this.root.replaceChildren(style, heading, reason, body);
    }
    documentControls() {
        const panel = document.createElement('div');
        panel.className = 'structure';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Document');
        const head = this.refusedHead();
        if (head !== undefined && 'code' in head.outcome) {
            for (const part of refusalParts(head.outcome))panel.append(message('refusal', part));
        }
        if (head !== undefined && 'affected' in head.outcome && head.batch.changes.some((change)=>change.kind === 'replace' && change.path === this.filePath())) {
            const provider = head.outcome.affected[this.filePath()];
            if (typeof provider === 'string') panel.append(message('current', provider));
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
        rename.value = this.draft?.moveTo ?? this.filePath();
        rename.addEventListener('change', ()=>{
            const next = cloneDraft(this.draft);
            if (rename.value === this.filePath()) delete next.moveTo;
            else next.moveTo = rename.value;
            void this.keepDraft(next);
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
        if (head !== undefined) {
            const discard = button('Discard');
            discard.addEventListener('click', ()=>{
                void this.discardHead(head.batch.id);
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
            const extra = Object.keys(file.sections).filter((name)=>!declared.includes(name));
            const names = this.draft?.create === undefined ? [
                ...declared,
                ...extra
            ] : [
                ...new Set([
                    ...declared,
                    ...extra,
                    ...Object.keys(this.draft.sections ?? {})
                ])
            ];
            for (const name of names){
                const text = this.displayedSection(name);
                if (text === undefined && this.draft?.create === undefined) continue;
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
        const marked = this.marks().get(kind === 'preamble' ? 'preamble' : `section:${name}`);
        if (marked !== undefined) section.append(message('current', `Current value: ${currentText(marked)}`));
        if (this.refusalAt(kind === 'preamble' ? 'preamble' : name)) section.append(message('error', this.localRefusal.rule));
        return section;
    }
    applyEditor(draft, editor, text) {
        if (editor.part === 'whole') {
            draft.whole = text;
            delete draft.fields;
            delete draft.sections;
            delete draft.preamble;
            return draft;
        }
        if (editor.part === 'preamble') {
            draft.preamble = text;
            return draft;
        }
        draft.sections = {
            ...draft.sections,
            [editor.name]: text
        };
        return draft;
    }
    openEditor(part, name, opened) {
        if (this.editor !== undefined) {
            const previous = this.editor;
            const retained = this.applyEditor(cloneDraft(this.draft), previous, editorText(previous.opened, previous.live));
            this.draft = retained;
            void this.keepDraft(retained);
        }
        this.editor = {
            part,
            name,
            opened,
            live: opened,
            snapshot: cloneDraft(this.draft)
        };
        this.present();
        this.root.querySelector('textarea')?.focus();
    }
    persistEditor() {
        if (this.editor === undefined) return Promise.resolve();
        const next = this.applyEditor(cloneDraft(this.draft), this.editor, editorText(this.editor.opened, this.editor.live));
        return this.keepDraft(next);
    }
    async commitEditor(value) {
        if (this.editor === undefined) return;
        const text = editorText(this.editor.opened, value ?? this.editor.live);
        const next = this.applyEditor(cloneDraft(this.draft), this.editor, text);
        this.editor = undefined;
        await this.keepDraft(next);
        this.present();
    }
    async cancelEditor() {
        if (this.editor === undefined) return;
        const next = cloneDraft(this.editor.snapshot);
        this.editor = undefined;
        await this.keepDraft(draftEmpty(next) ? null : next);
        this.present();
    }
    async changeField(name, value) {
        const spec = asField(this.definition()?.fields[name]);
        const previous = this.current?.fields[name];
        const intended = spec === undefined ? value : storedField(this.filePath(), spec, value);
        const next = cloneDraft(this.draft);
        delete next.whole;
        if (equal(previous, intended)) {
            if (next.fields !== undefined) {
                delete next.fields[name];
                if (Object.keys(next.fields).length === 0) delete next.fields;
            }
            await this.keepDraft(draftEmpty(next) ? null : next);
            return;
        }
        next.fields = {
            ...next.fields,
            [name]: intended
        };
        await this.keepDraft(next);
    }
    changesFromDraft() {
        const path = this.draft?.moveTo ?? this.filePath();
        const source = this.filePath();
        const draft = this.draft ?? {};
        if (draft.remove === true) return [
            {
                kind: 'remove',
                path: source
            }
        ];
        if (draft.create !== undefined) {
            const definition = this.definition();
            const fields = {
                type: draft.create.type,
                ...draft.fields
            };
            const sections = {};
            for (const name of Object.keys(definition?.sections ?? {})){
                sections[name] = draft.sections?.[name] ?? '';
            }
            return [
                {
                    kind: 'create',
                    path,
                    fields,
                    sections
                }
            ];
        }
        if (draft.whole !== undefined) {
            const changes = [
                {
                    kind: 'replace',
                    path: source,
                    content: draft.whole
                }
            ];
            if (draft.moveTo !== undefined && draft.moveTo !== source) changes.push({
                kind: 'move',
                path: source,
                to: draft.moveTo
            });
            return changes;
        }
        const changes = [];
        const file = this.current;
        for (const [name, value] of Object.entries(draft.fields ?? {})){
            const previous = file?.fields[name];
            if (!equal(previous, value)) changes.push({
                kind: 'field',
                path: source,
                name,
                value
            });
        }
        for (const [name, value] of Object.entries(draft.sections ?? {})){
            if (file?.sections[name] === value) continue;
            changes.push({
                kind: 'section',
                path: source,
                name,
                value
            });
        }
        if (draft.preamble !== undefined && draft.preamble !== file?.preamble) changes.push({
            kind: 'preamble',
            path: source,
            value: draft.preamble
        });
        if (draft.moveTo !== undefined && draft.moveTo !== source) changes.push({
            kind: 'move',
            path: source,
            to: draft.moveTo
        });
        return changes;
    }
    async fileSave() {
        if (this.runtime === undefined) return;
        if (this.editor !== undefined) await this.commitEditor();
        await this.writeChain;
        const moved = this.draft?.moveTo;
        const changes = this.changesFromDraft();
        const head = this.refusedHead();
        const snapshot = this.draft;
        this.conflictBaseline = this.current;
        this.draft = null;
        const result = await this.runtime.save(this.roomName(), changes, head === undefined ? undefined : head.batch.id);
        if (result.outcome === 'refused') {
            if (result.rule === 'durable-write') {
                this.draft = snapshot;
            } else {
                const retained = cloneDraft(snapshot);
                delete retained.remove;
                this.draft = draftEmpty(retained) ? null : retained;
                await this.keepDraft(this.draft);
            }
            this.localRefusal = result;
            this.present();
            return;
        }
        this.localRefusal = undefined;
        this.editor = undefined;
        this.draft = asDraft(await this.runtime.draft.read(this.roomName(), this.filePath()));
        if (moved !== undefined && moved !== this.filePath() && changes.some((change)=>change.kind === 'move')) this.setAttribute('path', moved);
        this.present();
    }
    async removeFile() {
        const next = cloneDraft(this.draft);
        next.remove = true;
        await this.keepDraft(next);
        await this.fileSave();
    }
    async discardHead(identifier) {
        if (this.runtime === undefined) return;
        await this.runtime.queue.discard(this.roomName(), identifier);
        await this.keepDraft(null);
        this.restoredHead = undefined;
        this.conflictBaseline = undefined;
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
            ...file.backlinks
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
