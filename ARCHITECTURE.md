# Architecture

Describes only what exists in the code today. A decided but unbuilt thing
appears here only as a callout linking to its requirement, ADR, or PRD in
`agentshouse/mdruntime`.

The repository is one npm project. `src/index.html` loads the TypeScript
ES-module entry in `src/index.ts`; the entry loads the published MD Runtime
and registers the field controls without creating a Runtime instance.
Its application dependencies are `@agentshouse/mdruntime` at
`0.1.0-alpha.2` and `@agentshouse/mdruntime-adapter` at `0.1.0-alpha.1`,
with published registry integrity in `package-lock.json`.

`compose.yaml` owns one Linux check service. Its image contains the locked
toolchain and Chromium; each invocation uses this worktree's source and an
isolated dependency volume. `scripts/ops.mjs` routes the existing backlog,
documentation, and merge commands together with checks and formatting.
The check runner checks source imports with dependency-cruiser and runs the
three public test seams documented in [`TESTING.md`](docs/agents/TESTING.md).

The browser lane's local host serves the App source. It transforms TypeScript
on request and uses Rolldown to bundle the installed packages' public exports
and their pinned dependencies in memory. Its browser specification reads
Types and Query through the published MD Runtime's public in-memory Adapter.
This host is check tooling, and no server or bundle is shipped by the workspace.

The chosen composition is owned by MD Runtime's
[PRD-0005](https://github.com/agentshouse/mdruntime/blob/main/docs/prd/prd-0005-shipped-form-and-release.md)
and [ADR-0007](https://github.com/agentshouse/mdruntime/blob/main/docs/adr/0007-ship-components-as-web-components.md).
Component and screen behavior remains specified there in
[PRD-0004](https://github.com/agentshouse/mdruntime/blob/main/docs/prd/prd-0004-document-view-components-and-base-template.md).

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
