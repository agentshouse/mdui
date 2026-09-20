# Architecture

Describes only what exists in the code today. A decided but unbuilt thing
appears here only as a callout linking to its requirement, ADR, or PRD in
`agentshouse/mdruntime`.

The repository is one npm project. `src/index.html` loads the TypeScript
ES-module entry in `src/index.ts`; the entry registers the field controls,
Markdown renderer, Document View, and the Sync Status indicator, then calls
`connectApp()`. `connectApp` uses House's published `@agentshouse/app-bridge`
`connectHouseBridge` for the transferred Runtime port and connects
`@agentshouse/mdruntime/client` `connectMdRuntime` to it. Main constructs no
Runtime and no Adapter of its own. It exports `bindApp` so tests can mount the
seven screens from the HTML template against the host entry serving the
in-memory Adapter.
Its application dependencies are `@agentshouse/mdruntime` at
`0.1.0-alpha.10`, `@agentshouse/app-bridge` at `0.1.0-alpha.1`, and
`@agentshouse/mdruntime-adapter` at `0.1.0-alpha.1`,
with published registry integrity in `package-lock.json`.
The Runtime pin carries Model `0.1.0-alpha.5` and Query `0.1.0-alpha.3`.
The renderer uses exactly `micromark@4.0.2` and
`micromark-extension-gfm@3.0.0` under the narrow
[User-approved dependency exception](docs/agents/renderer-dependency-approval.json).

`compose.yaml` owns one Linux check service. Its image contains the locked
toolchain and Chromium; each invocation uses this worktree's source and an
isolated dependency volume. `scripts/ops.mjs` routes the existing backlog,
documentation, and merge commands together with checks and formatting.
The check runner checks source imports with dependency-cruiser and runs the
three public test seams documented in [`TESTING.md`](docs/agents/TESTING.md).

The browser lane's local host is check tooling; no server or bundle is shipped
by the workspace. Its compilation and published dependency integration are
documented in [TESTING.md](docs/agents/TESTING.md#runner).

The chosen composition is owned by MD Runtime's
[PRD-0005](https://github.com/agentshouse/mdruntime/blob/main/docs/prd/prd-0005-shipped-form-and-release.md)
and [ADR-0007](https://github.com/agentshouse/mdruntime/blob/main/docs/adr/0007-ship-components-as-web-components.md).
Component and screen behavior remains specified there in
[PRD-0004](https://github.com/agentshouse/mdruntime/blob/main/docs/prd/prd-0004-document-view-components-and-base-template.md).

## Markdown renderer

`md-markdown` accepts section text through its `text` property or attribute.
The host supplies `room`, the current Document's `path`, and an optional
accessible `label`. The element has no Runtime surface: the host obtains text
through the public Runtime and supplies it to the renderer.

```html
<md-markdown room="studio" path="notes/current.md" label="Notes"></md-markdown>
```

The profile configuration disables single-tilde deletion and footnote constructs.
It adds no frontmatter, math, directives, MD Type validation, or Change logic.
The [original GFM 0.29 fixtures](test/fixtures/README.md) retain profile provenance;
[TESTING.md](docs/agents/TESTING.md#location-and-naming) owns their qualification seam.
Two [supported micromark syntax extensions](https://github.com/micromark/micromark#extending-markdown)
restore the pinned profile's FTP literals and historical inline-comment rule.
The comment extension checks that rule with the token stream's lookahead API
and delegates HTML recognition to the public `htmlText` construct from the
locked `micromark-core-commonmark` package. Invalid comments return to ordinary
Markdown parsing; block HTML keeps its upstream grammar. The FTP extension
recognizes only the missing literal scheme inside micromark's text context,
observes link-label state, and compiles its token through the locked public URI
utility. No input preprocessing or installed-package patch is used.

Public HTML token hooks distinguish raw HTML from Markdown-generated elements.
Raw fragments pass through an inert template. Temporary comment markers preserve
only `details` and `summary` tag boundaries across fragments; fresh output keeps
no raw attributes except the boolean disclosure `open` state. Every other raw
element is stripped. Script, style, embedded-document and raw-text bodies are
dropped. A second inert template receives the compiler output, and a fresh
allowlisted DOM is constructed without fetching elements or resource attributes.
The inert compilation stage preserves URI destinations, including FTP and data
references, with `allowDangerousProtocol: true`. That string is never inserted
into a live tree: resource destinations become data and the link connection
step admits only supported external schemes or same-Room Paths before attachment.
Raw HTML compilation remains disabled except for the filtering hooks above.

Images appear as labelled inert placeholders. The defensive `resources` getter
exposes the current references, and each render emits a bubbling, composed
`resource-reference` event per reference with
`{ room, path, reference }`. A reference carries `kind` (`image` or `resource`),
`destination`, `label`, and optional `title`; a raw `srcset` retains the complete
attribute string with `attribute: 'srcset'` for the bundle policy. References
are data only. The renderer does not fetch, authorize origins, or execute them.

Relative links resolve against the supplied current Document directory. A
keyboard or pointer activation emits bubbling, composed `open-path` with
`{ room, path, fragment? }` and prevents document navigation. Decoded traversal
above the Room root, malformed encodings, unsafe schemes, and links without
the required host context remain text. External destinations are parsed by the
browser URL API. HTTP(S), the HTML standard's
[safelisted schemes and `web+` handlers](https://html.spec.whatwg.org/multipage/system-state.html#safelisted-scheme)
retain ordinary anchor behavior, including telephone, messaging, and calendar
links. Executable, local-file, embedded-document, and unrecognized schemes are
not admitted. No Room lookup or extra shared state is created by the renderer.

The renderer uses the same theme properties as the fields, with `--md-link`
for link color. Browser preference supplies light/dark defaults. Code blocks
and tables have labelled, keyboard-focusable scroll regions; long text wraps.
See [TESTING.md](docs/agents/TESTING.md#location-and-naming) for browser acceptance.

## Field controls

`src/components/fields.ts` registers six standard custom elements. Each uses
native labelled controls inside an open shadow root. The shared styles in
`src/components/theme.ts` follow the browser's light or dark preference.

| Element              | Native interaction and value                                 |
| -------------------- | ------------------------------------------------------------ |
| `md-string-field`    | Multiline text; string                                       |
| `md-number-field`    | Number input; finite number or `undefined`                   |
| `md-date-field`      | Date input; ISO date string or `undefined`                   |
| `md-enum-field`      | Select with the MD Type's declared values                    |
| `md-reference-field` | Select with relative Paths returned by public Query          |
| `md-list-field`      | Scalar controls with Add and Remove buttons; one array value |

The entry registers the elements for plain HTML use. After the host's public
Runtime has loaded the Room, bind each element to a field from public Types:

```html
<md-reference-field label="Owner"></md-reference-field>
```

```js
const owner = document.querySelector('md-reference-field');
owner.bind(runtime, room, 'project', 'owner');
owner.value = 'people/ada.md';
owner.addEventListener('change', (event) => {
  const { value, validity } = event.detail;
  showDraft(value, validity);
});
```

`bind(runtime, room, typeName, fieldName)` reads the definition through
`runtime.types(room)` and rejects a missing field or mismatched element kind.
Reference choices use `runtime.query` and a query observation restricted to the
bound Room and declared type. A reference to `any` leaves the type unrestricted
within that Room. Disconnecting the reference element removes its observation.
The elements keep only their definition, rendered choices, and local value;
they do not create a Runtime or apply a Change.

The public `value` property accepts supplied values and returns a defensive
copy. `validity` returns `{ valid, message }`, with an English message for a
missing required value, invalid native input, wrong scalar kind, or unavailable
choice. This is control feedback; collection validation remains with the
published Model through Runtime. An empty string and an empty array are values;
`undefined` is absent. Invalid supplied values remain exposed and invalid.

User commits emit a bubbling, composed `change` event whose detail contains
`{ value, validity }`. A list emits one whole array per item commit, addition,
or removal. Assigning `value` does not emit an event. The `label` attribute sets
the accessible label; the boolean `disabled` attribute disables all native
interactions. Calling `focus()` focuses the first control. Adding and removing
list items places focus on the next usable control.

Number and date displays use the browser locale. Dates retain their ISO value
without a local-timezone shift. App CSS may set `--md-color-scheme`,
`--md-background`, `--md-surface`, `--md-text`, `--md-border`, `--md-focus`, and
`--md-error` on a containing element. Browser acceptance is owned by
[TESTING.md](docs/agents/TESTING.md#location-and-naming).

## Document View

`md-document-view` presents one Document of one Room. The host binds the
public Runtime:

```html
<md-document-view></md-document-view>
```

```js
const view = document.querySelector('md-document-view');
view.bind(runtime, 'studio', 'work/alpha.md');
await view.create(runtime, 'studio', 'work/created.md', 'item');
```

`bind(runtime, room, path)` observes the Document through
`runtime.observe('query')` with that Room and Path, write grants and
Provider-owned Paths from `runtime.observe('rooms')`, and that Room's queue
from `runtime.observe('queue')`. Typed fields render as the field controls of
`components/01`. Text comes from the Query result: the preamble, declared
sections in declared order, extra sections the Document carries, structured
sections as lists through the renderer, and the whole text of an untyped
Document. The backlinks panel lists Query-derived referrers in the same Room
and navigates with `open-path`. The History panel calls `runtime.history` only
after it is opened, then shows native author and time and requested revision
content, or the declared absence. A later page is requested only when the user
continues.

When the Path has a write grant and is not Provider-owned, field controls are
enabled and section, preamble, and whole-text editors write only through
`runtime.draft`, including in-progress textarea text. A whole-text editor opens
the durable `draft.whole` when that value is present, including empty text,
otherwise the public Query document's complete Markdown. File Save calls
`runtime.save` with structured changes from that Draft. `create` writes a typed create Draft at an absent Path. Rename,
move, and removal are controls of the same Save. A missing write grant or a
Provider-owned Path shows the reason, keeps field controls disabled, and
omits editing controls. A Conflicted or Rejected head is restored from the
queue into the Draft; Save names that head, and discard uses
`runtime.queue.discard`.

## Sync Status indicator

`md-sync-status` is the one App Sync Status. It binds the public Runtime and
reads `runtime.observe('sync-status')` only:

```html
<md-sync-status></md-sync-status>
```

```js
document.querySelector('md-sync-status').bind(runtime);
```

It shows Pending, Syncing, or Synced, whether attention is required, the last
completed synchronization time, and, while the Provider is unreachable, that
changes remain Pending. It does not belong to one Room or Document.

Both elements take the same CSS custom properties as the field controls, with
browser light and dark defaults. Browser acceptance is owned by
[TESTING.md](docs/agents/TESTING.md#location-and-naming).

## Screens

`src/index.html` holds the seven screens as plain HTML. `connectApp()` obtains
the Runtime port from the bridge client and calls `bindApp`. `bindApp(runtime, bridge)`
clones that template, binds the Sync Status indicator, and fills each screen
from the public remote client only. The part of the shell address below the App's
path names a screen and, for File, a Room locator and Document path; main
resolves it against the Runtime and asks the bridge client to push or replace
it. Presentation State is which screen is shown and which file Document View is
bound to, written through the client's presentation surface.

```js
import { connectApp } from './index.js';
await connectApp();
```

| Screen  | Public surfaces                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Rooms   | `rooms` / `observe('rooms')`, `observe('query')`, `types`, and Query Paths for each Room's file tree; opening a file binds Document View       |
| Search  | Local Query narrowed by Room, MD Type, and one typed field value; substring over Query section text and field values; a result opens File      |
| File    | existing Document View                                                                                                                         |
| Work    | `draft.list()` / `observe('drafts')` for every durable Draft, and `observe('queue')` per Room with outcome kind and structured code and fields |
| Refusal | `observe('connection-refusal')`; `reauthorize` when `reauthorizationOffered`                                                                   |
| Storage | `observe('storage-loss')` with the reported persistence answer                                                                                 |
| Log     | `log()` shown as text and downloaded as `synchronization-log.txt`                                                                              |

Work renders the complete public Draft snapshot by Room locator and Path,
independently of Rooms and Query membership. Entering Work or retrying a failed
read calls `draft.list()`; `observe('drafts')` updates the rendered inventory
after committed changes. A failed read keeps the last rendered inventory and
shows the error with a Retry Drafts control. A successful later snapshot clears
that error. Draft read failure is separate from the Runtime's storage-loss
statement. A durable Save refusal keeps the Document View's Draft visible and
shows the returned rule without attempting another durable write.
Rooms and Document View retain their controls when an observation repeats the
rendered values, so unchanged notifications do not interrupt native typing or
keyboard focus.

The Sync Status indicator is in the header on every screen. The browser lane
serves this source without a bundle; the static bundle remains
`shipped-form/01`.
