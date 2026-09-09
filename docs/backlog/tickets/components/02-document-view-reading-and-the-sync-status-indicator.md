# 02-document-view-reading-and-the-sync-status-indicator - Document View reading and the Sync Status indicator

Status: ready-for-agent

## Frame

Rests on [PRD-0004](https://github.com/agentshouse/mdruntime/blob/main/docs/prd/prd-0004-document-view-components-and-base-template.md)
in `agentshouse/mdruntime`, sections Components and Document View, and on
[`R006`, `R011`, `R016`, `R030`, and `R031`](https://github.com/agentshouse/mdruntime/blob/main/docs/requirements/ledger.md).
See [Query visibility][r030] and [Document View][r031] at those owners.
It uses the Types, Query, Observe, Sync Status, and History surfaces of the MD Runtime.

[r030]: https://github.com/agentshouse/mdruntime/blob/main/docs/requirements/ledger.md#r030--md-runtime-api
[r031]: https://github.com/agentshouse/mdruntime/blob/main/docs/requirements/ledger.md#r031--document-view-and-md-ui

## What to build

Document View for reading: one Document of one Room shown with its typed
fields as the controls of `components/01`, its text through the renderer under
[R031][r031] from the public Query result, a backlinks panel from a Local Query,
and a history panel that
loads the file's revisions only when opened; every control disabled with the
reason visible when the file has no write grant or is a Provider-owned Path.
The Sync Status indicator: the one App state, the last completed
synchronization time, and whether attention is required.

## Acceptance criteria

- [ ] Document View renders a typed file's fields by kind, its preamble, and
      every section it carries, including sections its MD Type does not
      declare. Declared sections keep their declared order, a structured
      section renders as its declared list, and an untyped file renders as
      its whole text.
- [ ] The browser seam over the published in-memory Adapter shows a typed
      file's declared section, an additional existing section, and its
      preamble from the public Query result under [R030][r030].
- [ ] The backlinks panel lists every file in the same Room that references
      this one and navigates to it; the history panel transfers nothing until
      opened and then shows revisions with author and time and one revision's
      content on request, or the declared absence.
- [ ] A file without a write grant, and a Provider-owned Path, render every
      control disabled with the reason shown.
- [ ] The indicator shows the state, Pending, Syncing, or Synced, the
      attention flag, the last completed synchronization time, and, while
      the Provider is unreachable, that changes remain Pending, from Observe
      alone.
- [ ] Both elements are keyboard-operable, labelled, themed through CSS
      custom properties, and lay out at 360 pixels.

## Mines

`runtime/04` and `runtime/07` in `agentshouse/mdruntime` are merged. Their
Sync Status and History surfaces are published in
`@agentshouse/mdruntime@0.1.0-alpha.4`. The coordinator verified the published
reading prerequisites under the User-delegated release authority; see the
[acceptance receipt](../../../agents/runtime-reading-prerequisite.json). Nothing is editable yet;
controls render read-only here and gain editing in `components/03`. The
indicator never belongs to one Room or file. No element calls the Adapter or
the browser store.

Public read-capability acceptance and package holds remain at
[`runtime/03`](https://github.com/agentshouse/mdruntime/blob/main/docs/backlog/tickets/runtime/03-bootstrap-into-durable-local-replicas-and-local-query.md#acceptance-criteria).
Use its published Runtime surface; no second parser, direct Model call, or
local projection of Document text may substitute for that capability.

## Out of scope

Editing, Drafts, Save, and the screens.
