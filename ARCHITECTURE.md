# Architecture

Describes only what exists in the code today. A decided but unbuilt thing
appears here only as a callout linking to its requirement, ADR, or PRD in
`agentshouse/mdruntime`.

The repository is one npm project. `src/index.html` loads the TypeScript
ES-module entry in `src/index.ts`; the entry loads the published MD Runtime
without creating product state. There are no components or screens yet.
Its application dependencies are `@agentshouse/mdruntime` and
`@agentshouse/mdruntime-adapter`, each pinned to the published
`0.1.0-alpha.1` prerelease with registry integrity in `package-lock.json`.

`compose.yaml` owns one Linux check service. Its image contains the locked
toolchain and Chromium; each invocation uses this worktree's source and an
isolated dependency volume. `scripts/ops.mjs` routes the existing backlog,
documentation, and merge commands together with checks and formatting.
The check runner checks source imports with dependency-cruiser and runs the
three public test seams documented in [`TESTING.md`](docs/agents/TESTING.md).

The browser lane's local host serves the App source. It transforms TypeScript
on request and maps bare imports through the installed packages' public
exports. Its one browser specification connects the published MD Runtime to
its public in-memory Adapter. This host is check tooling, and no server or
bundle is shipped by the workspace.

The chosen composition is owned by MD Runtime's
[PRD-0005](https://github.com/agentshouse/mdruntime/blob/main/docs/prd/prd-0005-shipped-form-and-release.md)
and [ADR-0007](https://github.com/agentshouse/mdruntime/blob/main/docs/adr/0007-ship-components-as-web-components.md).
Component and screen behavior remains specified there in
[PRD-0004](https://github.com/agentshouse/mdruntime/blob/main/docs/prd/prd-0004-document-view-components-and-base-template.md).
