import { addressed, composeAddress, fileSuffix, parseAddress } from './address.js';
import { adopt, appStyles } from './components/theme.js';
import { mdTypes, observation, queueKinds, refusalParts } from './components/runtime.js';
import './components/status.js';
import './components/view.js';
function parsePresentation(value) {
    if (value === null || typeof value !== 'object') return null;
    if (!('screen' in value) || typeof value.screen !== 'string' || !addressed(value.screen)) {
        return null;
    }
    const room = 'room' in value && typeof value.room === 'string' ? value.room : undefined;
    const path = 'path' in value && typeof value.path === 'string' ? value.path : undefined;
    return {
        screen: value.screen,
        room,
        path
    };
}
function currentAddress(bridge) {
    const held = bridge.address();
    if (held !== null) return Promise.resolve(held);
    return new Promise((resolve)=>{
        const stop = bridge.onAddress((address)=>{
            stop();
            resolve(address);
        });
    });
}
const reasons = {
    'no-matching-version': 'No matching Room Contract version',
    'missing-required-guarantee': 'A required Capability is missing',
    'md-model-version-mismatch': 'The declared MD Model version cannot be loaded',
    'revoked-authorization': 'Authorization was revoked'
};
let unbind = ()=>{};
function addPath(nodes, parts, full) {
    const [head, ...rest] = parts;
    if (head === undefined) return;
    if (rest.length === 0) {
        nodes.push({
            name: head,
            path: full
        });
        return;
    }
    let directory = nodes.find((node)=>node.children !== undefined && node.name === head);
    if (directory === undefined) {
        directory = {
            name: head,
            path: '',
            children: []
        };
        nodes.push(directory);
    }
    addPath(directory.children ?? [], rest, full);
}
function fileTree(paths) {
    const root = [];
    for (const path of [
        ...paths
    ].sort())addPath(root, path.split('/'), path);
    return root;
}
function renderTree(nodes, labelled, open) {
    const list = document.createElement('ul');
    if (labelled) list.setAttribute('aria-label', 'Files');
    for (const node of nodes){
        const item = document.createElement('li');
        if (node.children !== undefined) {
            item.append(node.name, renderTree(node.children, false, open));
        } else {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = node.path;
            button.addEventListener('click', ()=>open(node.path));
            item.append(button);
        }
        list.append(item);
    }
    return list;
}
function option(value, label) {
    const entry = document.createElement('option');
    entry.value = value;
    entry.textContent = label;
    return entry;
}
function fillSelect(select, blank, entries) {
    const selected = select.value;
    select.replaceChildren(option('', blank));
    for (const entry of entries)select.append(option(entry, entry));
    if ([
        ...select.options
    ].some((entry)=>entry.value === selected)) select.value = selected;
}
function fieldKind(types, field, typeName) {
    const kinds = new Set();
    for (const type of types){
        if (typeName !== '' && type.name !== typeName) continue;
        const definition = type.fields[field];
        if (definition === null || typeof definition !== 'object' || !('kind' in definition)) continue;
        const kind = definition.kind;
        if (typeof kind === 'string') kinds.add(kind);
    }
    return kinds.size === 1 ? [
        ...kinds
    ][0] : undefined;
}
function fieldEquality(raw, kind) {
    if (kind === 'number' && raw !== '') {
        const count = Number(raw);
        if (Number.isFinite(count)) return count;
    }
    return raw;
}
function containsText(value, text) {
    if (typeof value === 'string') return value.includes(text);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value).includes(text);
    if (Array.isArray(value)) return value.some((item)=>containsText(item, text));
    return false;
}
function matchesSearch(file, text) {
    if (text === '') return true;
    for (const section of Object.values(file.sections)){
        if (section.includes(text)) return true;
    }
    for (const value of Object.values(file.fields)){
        if (containsText(value, text)) return true;
    }
    return false;
}
function searchSelector(form, types) {
    const data = new FormData(form);
    const room = String(data.get('room') ?? '');
    const type = String(data.get('type') ?? '');
    const field = String(data.get('field') ?? '');
    const value = String(data.get('value') ?? '');
    const clauses = [];
    if (room !== '') clauses.push({
        room
    });
    if (type !== '') clauses.push({
        type
    });
    if (field !== '') {
        clauses.push({
            [`fields.${field}`]: fieldEquality(value, fieldKind(types, field, type))
        });
    }
    if (clauses.length === 0) return {};
    if (clauses.length === 1) return clauses[0];
    return {
        $and: clauses
    };
}
function connectionRefusalText(refusal) {
    if (refusal.reason === 'client-host-protocol-mismatch') return refusal.reason;
    return reasons[refusal.reason];
}
export async function bindApp(runtime, bridge) {
    unbind();
    const template = document.getElementById('md-app');
    if (!(template instanceof HTMLTemplateElement)) throw new TypeError('The App template is missing.');
    const fragment = template.content.cloneNode(true);
    const root = fragment.querySelector('#app');
    if (!(root instanceof HTMLElement)) throw new TypeError('The App root is missing.');
    const app = root;
    adopt(document, appStyles);
    document.body.append(fragment);
    const status = app.querySelector('md-sync-status');
    const view = app.querySelector('md-document-view');
    const roomsPart = app.querySelector('[data-part="rooms"]');
    const unresolvedPart = app.querySelector('[data-part="unresolved"]');
    const resultsPart = app.querySelector('[data-part="results"]');
    const draftsPart = app.querySelector('[data-part="drafts"]');
    const draftsState = app.querySelector('[data-part="drafts-state"]');
    const retryDrafts = app.querySelector('[data-part="retry-drafts"]');
    const queuesPart = app.querySelector('[data-part="queues"]');
    const refusalPart = app.querySelector('[data-part="refusal"]');
    const reauthorize = app.querySelector('[data-part="reauthorize"]');
    const storagePart = app.querySelector('[data-part="storage"]');
    const logPart = app.querySelector('[data-part="log"]');
    const form = app.querySelector('form');
    const roomSelect = form.elements.namedItem('room');
    const typeSelect = form.elements.namedItem('type');
    const fieldSelect = form.elements.namedItem('field');
    const queues = new Map();
    const stops = [];
    let queueStops = [];
    let current = 'rooms';
    let draftRead = 0;
    let renderedRooms;
    let visibleRooms = [];
    let closed = false;
    let searchRead = 0;
    let openRoom;
    let openPath;
    let lastPresentation;
    let unresolved = null;
    let heldRefusal = null;
    let generation = 0;
    let runtimeStorage = null;
    let presentationReadFault = null;
    let presentationWriteFault = null;
    function cleanup() {
        closed = true;
        draftRead += 1;
        searchRead += 1;
        for (const stop of queueStops)stop();
        queueStops = [];
        for (const stop of stops)stop();
        stops.length = 0;
        app.remove();
    }
    unbind = cleanup;
    function reveal(screen) {
        current = screen;
        for (const section of app.querySelectorAll('section[data-screen]')){
            section.hidden = section.dataset.screen !== screen;
        }
        for (const button of app.querySelectorAll('nav[aria-label="Screens"] button')){
            if (button.dataset.screen === screen) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }
        if (screen === 'work') {
            void refreshDrafts();
            presentQueues();
        }
        if (screen === 'log') void presentLog();
    }
    function openFile(room, path) {
        if (openRoom !== room || openPath !== path || current !== 'file') {
            openRoom = room;
            openPath = path;
            view.bind(runtime, room, path);
        }
        reveal('file');
    }
    async function documentHeld(locator, path) {
        const rooms = visibleRooms.length > 0 ? visibleRooms : await runtime.rooms();
        if (closed || !rooms.some((room)=>room.locator === locator)) return false;
        const result = await runtime.query({
            selector: {
                room: locator
            }
        });
        return !closed && result.documents.some((file)=>file.path === path);
    }
    function nameUnresolved(address) {
        unresolved = address;
        if (address === null) {
            unresolvedPart.hidden = true;
            unresolvedPart.textContent = '';
            return;
        }
        unresolvedPart.hidden = false;
        unresolvedPart.textContent = address;
    }
    function freezeAddress() {
        return heldRefusal !== null;
    }
    async function writePresentation() {
        if (!addressed(current) || unresolved !== null || presentationReadFault !== null) return;
        const value = openRoom !== undefined && openPath !== undefined ? {
            screen: current,
            room: openRoom,
            path: openPath
        } : {
            screen: current
        };
        const snapshot = JSON.stringify(value);
        if (snapshot === lastPresentation) return;
        try {
            await runtime.presentation.write(value);
            lastPresentation = snapshot;
            if (presentationWriteFault !== null) {
                presentationWriteFault = null;
                await presentStorage(runtimeStorage);
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            presentationWriteFault = `Presentation State could not be written: ${reason}`;
            await presentStorage(runtimeStorage);
        }
    }
    async function applyAddress(address, origin = 'delivery') {
        if (origin === 'replay' && (current === 'refusal' || current === 'storage')) return;
        const token = ++generation;
        if (freezeAddress()) return;
        const parsed = parseAddress(address);
        if (parsed.screen === 'file' && parsed.room !== null && parsed.path !== null) {
            if (await documentHeld(parsed.room, parsed.path)) {
                if (closed || freezeAddress() || token !== generation) return;
                nameUnresolved(null);
                openFile(parsed.room, parsed.path);
                await writePresentation();
                return;
            }
        }
        if (closed || freezeAddress() || token !== generation) return;
        if (parsed.screen === 'file' && parsed.room === null && parsed.path === null) {
            nameUnresolved(null);
            reveal('file');
            await writePresentation();
            return;
        }
        if (parsed.screen === 'file' || parsed.screen === null) {
            if (parsed.remainder) nameUnresolved(address);
            else nameUnresolved(null);
            reveal('rooms');
            if (!parsed.remainder) await writePresentation();
            return;
        }
        nameUnresolved(null);
        reveal(parsed.screen);
        await writePresentation();
    }
    function holdOpenFile(stored) {
        if (stored.room !== undefined && stored.path !== undefined) {
            openRoom = stored.room;
            openPath = stored.path;
        }
    }
    function presentationSuffix(stored) {
        if (stored.screen === 'file' && stored.room !== undefined && stored.path !== undefined) {
            return fileSuffix(stored.room, stored.path);
        }
        return stored.screen;
    }
    async function restorePresentation(stored, token) {
        if (closed || freezeAddress() || token !== generation) return;
        holdOpenFile(stored);
        if (stored.screen === 'rooms') {
            await applyAddress(composeAddress(''));
            return;
        }
        if (closed || freezeAddress() || token !== generation) return;
        if (parseAddress(bridge.address() ?? '/').remainder) return;
        await bridge.replace(composeAddress(presentationSuffix(stored)));
    }
    async function applyStart(address) {
        if (closed || freezeAddress()) return;
        const parsed = parseAddress(address);
        if (parsed.remainder) {
            await applyAddress(address);
            return;
        }
        const token = generation;
        let stored = null;
        try {
            stored = parsePresentation(await runtime.presentation.read());
        } catch (error) {
            stored = null;
            const reason = error instanceof Error ? error.message : String(error);
            presentationReadFault = `Presentation State could not be read: ${reason}`;
            await presentStorage(runtimeStorage);
        }
        if (closed || freezeAddress() || token !== generation) return;
        if (stored !== null) {
            await restorePresentation(stored, token);
            return;
        }
        await applyAddress(address);
    }
    async function followPresentation(value) {
        const token = generation;
        if (closed || freezeAddress() || current === 'refusal' || current === 'storage') return;
        const parsed = parseAddress(bridge.address() ?? '/');
        if (parsed.remainder) return;
        const stored = parsePresentation(value);
        if (stored === null) return;
        await restorePresentation(stored, token);
    }
    async function go(screen, file) {
        const held = parseAddress(bridge.address() ?? '/');
        const target = screen === 'file' ? file ?? (openRoom !== undefined && openPath !== undefined ? {
            room: openRoom,
            path: openPath
        } : undefined) : undefined;
        const suffix = target !== undefined ? fileSuffix(target.room, target.path) : screen;
        const sameDocument = target !== undefined && held.screen === 'file' && held.room === target.room && held.path === target.path;
        await bridge.push(composeAddress(suffix, sameDocument ? {
            search: held.search,
            hash: held.hash
        } : {}));
    }
    async function presentRooms(rooms) {
        visibleRooms = rooms;
        const content = await Promise.all(rooms.map(async (room)=>({
                room,
                types: mdTypes(room.model),
                paths: (await runtime.query({
                    selector: {
                        room: room.locator
                    }
                })).documents.map((file)=>file.path)
            })));
        if (closed) return;
        const snapshot = JSON.stringify(content);
        if (snapshot === renderedRooms) return;
        renderedRooms = snapshot;
        roomsPart.replaceChildren();
        for (const { room, types: definitions, paths } of content){
            const article = document.createElement('article');
            article.setAttribute('aria-label', room.name);
            const heading = document.createElement('h2');
            heading.textContent = room.name;
            const typesHeading = document.createElement('h3');
            typesHeading.textContent = 'MD Types';
            const types = document.createElement('ul');
            types.setAttribute('aria-label', 'MD Types');
            for (const type of definitions){
                const item = document.createElement('li');
                item.textContent = type.name;
                types.append(item);
            }
            const filesHeading = document.createElement('h3');
            filesHeading.textContent = 'Files';
            article.append(heading, typesHeading, types, filesHeading, renderTree(fileTree(paths), true, (path)=>{
                void go('file', {
                    room: room.locator,
                    path
                });
            }));
            roomsPart.append(article);
        }
        const types = new Map();
        const fields = new Set();
        for (const { types: definitions } of content){
            for (const type of definitions){
                types.set(type.name, type);
                for (const field of Object.keys(type.fields))fields.add(field);
            }
        }
        fillSelect(roomSelect, 'All Rooms', rooms.map((room)=>room.locator));
        for (const entry of [
            ...roomSelect.options
        ]){
            if (entry.value === '') continue;
            const room = rooms.find((item)=>item.locator === entry.value);
            if (room !== undefined) entry.textContent = room.name;
        }
        fillSelect(typeSelect, 'All MD Types', [
            ...types.keys()
        ].sort());
        fillSelect(fieldSelect, 'Any field', [
            ...fields
        ].sort());
        if (freezeAddress()) return;
        const address = bridge.address();
        if (address === null) return;
        const parsed = parseAddress(address);
        if (parsed.screen === 'file' && parsed.room !== null && parsed.path !== null && (openRoom !== parsed.room || openPath !== parsed.path || current !== 'file')) {
            await applyAddress(address, 'replay');
        }
    }
    function presentDrafts(drafts) {
        draftsPart.replaceChildren();
        for (const draft of drafts){
            const item = document.createElement('li');
            item.textContent = `${draft.locator} ${draft.path}`;
            draftsPart.append(item);
        }
        draftsState.textContent = drafts.length === 0 ? 'No Drafts.' : '';
        retryDrafts.hidden = true;
    }
    async function refreshDrafts() {
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
    function presentQueues() {
        queuesPart.replaceChildren();
        for (const room of visibleRooms){
            const article = document.createElement('article');
            article.setAttribute('aria-label', `${room.name} Pending Changes`);
            const heading = document.createElement('h3');
            heading.textContent = room.name;
            const list = document.createElement('ul');
            for (const entry of queues.get(room.locator) ?? []){
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
                    for (const part of refusalParts(entry.outcome)){
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
    function watchQueues(rooms) {
        for (const stop of queueStops)stop();
        queueStops = [];
        queues.clear();
        for (const room of rooms){
            queueStops.push(observation(runtime.observe('queue', room.locator, (entries)=>{
                queues.set(room.locator, entries);
                if (current === 'work') presentQueues();
            })));
        }
    }
    function presentRefusal(refusal) {
        const resume = heldRefusal !== null && refusal === null;
        heldRefusal = refusal;
        if (refusal === null) {
            refusalPart.textContent = 'No Connection Refusal';
            reauthorize.hidden = true;
            if (resume) {
                const address = bridge.address();
                if (address !== null) void applyStart(address);
            }
            return;
        }
        refusalPart.textContent = connectionRefusalText(refusal);
        reauthorize.hidden = !refusal.reauthorizationOffered;
        reveal('refusal');
    }
    async function presentStorage(statement) {
        runtimeStorage = statement;
        const persistence = await runtime.persistence();
        if (closed) return;
        const parts = [
            runtimeStorage,
            presentationReadFault,
            presentationWriteFault
        ].filter((part)=>typeof part === 'string' && part.length > 0);
        storagePart.textContent = `${parts.length === 0 ? 'No storage loss.' : parts.join(' ')} ${String(persistence)}`;
    }
    async function presentLog() {
        const text = await runtime.log();
        if (!closed) logPart.textContent = text;
        return text;
    }
    status.bind(runtime);
    app.querySelector('nav[aria-label="Screens"]')?.addEventListener('click', (event)=>{
        const button = event.target;
        if (!(button instanceof HTMLButtonElement)) return;
        const screen = button.dataset.screen;
        if (screen === undefined) return;
        if (screen === 'refusal' || screen === 'storage') {
            reveal(screen);
            return;
        }
        if (addressed(screen)) void go(screen);
    });
    form.addEventListener('submit', (event)=>{
        event.preventDefault();
        const requested = ++searchRead;
        resultsPart.replaceChildren();
        void (async ()=>{
            const types = [];
            for (const room of visibleRooms)types.push(...mdTypes(room.model));
            const text = String(new FormData(form).get('text') ?? '');
            const result = await runtime.query({
                selector: searchSelector(form, types)
            });
            if (closed || requested !== searchRead) return;
            resultsPart.replaceChildren();
            for (const file of result.documents){
                if (!matchesSearch(file, text)) continue;
                const item = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = `${file.room} ${file.path}`;
                button.addEventListener('click', ()=>{
                    void go('file', {
                        room: file.room,
                        path: file.path
                    });
                });
                item.append(button);
                resultsPart.append(item);
            }
        })();
    });
    reauthorize.addEventListener('click', ()=>{
        void runtime.reauthorize();
    });
    retryDrafts.addEventListener('click', ()=>{
        void refreshDrafts();
    });
    app.querySelector('[data-part="export"]')?.addEventListener('click', ()=>{
        void presentLog().then((text)=>{
            const url = URL.createObjectURL(new Blob([
                text
            ], {
                type: 'text/plain'
            }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'synchronization-log.txt';
            link.click();
            URL.revokeObjectURL(url);
        });
    });
    app.addEventListener('open-path', (event)=>{
        const detail = event.detail;
        void go('file', {
            room: detail.room,
            path: detail.path
        });
    });
    async function hold(start) {
        const end = await start;
        if (closed) {
            end();
            return;
        }
        stops.push(end);
    }
    await Promise.all([
        hold(runtime.observe('rooms', (rooms)=>{
            void presentRooms(rooms);
            watchQueues(rooms);
            if (current === 'work') presentQueues();
        })),
        hold(runtime.observe('query', {}, ()=>{
            void presentRooms(visibleRooms);
        })),
        hold(runtime.observe('drafts', (drafts)=>{
            draftRead += 1;
            presentDrafts(drafts);
        })),
        hold(runtime.observe('connection-refusal', presentRefusal)),
        hold(runtime.observe('storage-loss', (statement)=>void presentStorage(statement))),
        hold(runtime.observe('presentation', (value)=>{
            void followPresentation(value);
        })),
        hold(runtime.observe('sync-status', ()=>{
            if (current === 'log') void presentLog();
        }))
    ]);
    const address = await currentAddress(bridge);
    stops.push(bridge.onAddress((next)=>{
        void applyAddress(next);
    }));
    if (!closed) await applyStart(address);
    return cleanup;
}
