# 02-document-view-reading-and-the-sync-status-indicator - Document View reading and the Sync Status indicator

Status: blocked

## Frame

Rests on PRD-0004 in `agentshouse/mdruntime`
(`docs/prd/prd-0004-document-view-components-and-base-template.md`) sections
Components and Document View, and on `R006`, `R011`, `R016`, and `R031`. It
uses the Sync Status and the History surface of the MD Runtime.

## What to build

Document View for reading: one Document of one Room shown with its typed
fields as the controls of `components/01`, its sections through the
renderer, a backlinks panel from a Local Query, and a history panel that
loads the file's revisions only when opened; every control disabled with the
reason visible when the file has no write grant or is a Provider-owned Path.
The Sync Status indicator: the one App state, the last completed
synchronization time, and whether attention is required.

## Acceptance criteria

- [ ] Document View renders a typed file's fields by kind, its sections in
      declared order, a structured section as its declared list, and an
      untyped file as its whole rendered text.
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

Waits for `runtime/04` and `runtime/07` in `agentshouse/mdruntime`, which
deliver Sync Status and the History surface. Nothing is editable yet;
controls render read-only here and gain editing in `components/03`. The
indicator never belongs to one Room or file. No element calls the Adapter or
the browser store.

## Out of scope

Editing, Drafts, Save, and the screens.
