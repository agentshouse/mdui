# Architecture

Describes only what exists in the code today. A decided but unbuilt thing
appears here only as a callout linking to its requirement, ADR, or PRD in
`agentshouse/mdruntime`.

The repository is one npm project. `src/index.html` loads the TypeScript
ES-module entry in `src/index.ts`; the entry loads the published MD Runtime
and registers the field controls and Markdown renderer without creating a Runtime instance.
Its application dependencies are `@agentshouse/mdruntime` at
`0.1.0-alpha.2` and `@agentshouse/mdruntime-adapter` at `0.1.0-alpha.1`,
with published registry integrity in `package-lock.json`.
The renderer uses exactly `micromark@4.0.2` and
`micromark-extension-gfm@3.0.0` under the narrow
[User-approved dependency exception](docs/agents/renderer-dependency-approval.json).

`compose.yaml` owns one Linux check service. Its image contains the locked
toolchain and Chromium; each invocation uses this worktree's source and an
isolated dependency volume. `scripts/ops.mjs` routes the existing backlog,
documentation, and merge commands together with checks and formatting.
The check runner checks source imports with dependency-cruiser and runs the
three public test seams documented in [`TESTING.md`](docs/agents/TESTING.md).

The browser lane's local host serves the App source. It transforms TypeScript
on request and uses Rolldown to bundle the installed packages' public root
exports and the public `@agentshouse/mdruntime/memory` fixture entry, with
their pinned dependencies, in memory. Its browser specification reads
Types and Query through the published MD Runtime's public in-memory Adapter.
This host is check tooling, and no server or bundle is shipped by the workspace.

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
The [original GFM 0.29 fixtures](test/fixtures/README.md) qualify the selected
dependency versions. **Components01 is still incomplete:** the exact pins fail
the original FTP autolink and inline-comment examples, also reproduced at the
browser component seam. The profile has not been broadened to accept those
differences, and no replacement parser has been added.

Public HTML token hooks distinguish raw HTML from Markdown-generated elements.
Raw fragments pass through an inert template. Temporary comment markers preserve
only `details` and `summary` tag boundaries across fragments; fresh output keeps
no raw attributes except the boolean disclosure `open` state. Every other raw
element is stripped. Script, style, embedded-document and raw-text bodies are
dropped. A second inert template receives the compiler output, and a fresh
allowlisted DOM is constructed without fetching elements or resource attributes.

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
the required host context remain text. Supported external links retain ordinary
anchor behavior. No Room lookup or extra shared state is created by the renderer.

The renderer uses the same theme properties as the fields, with `--md-link`
for link color. Browser preference supplies light/dark defaults. Code blocks
and tables have labelled, keyboard-focusable scroll regions; long text wraps
inside a 360px viewport. The browser tests cover published Query section input
and direct adversarial input at the public `text` property, including network
interception, disclosure focus, internal Path events, CSS overrides, and both
viewport sizes. Invalid collection fixtures are not needed to exercise the
renderer, whose public text input is independent of Runtime validation.

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
`--md-error` on a containing element. The browser seam exercises these overrides,
visible keyboard focus, disabled controls, and both themes at a 360px viewport.
