# 03-document-view-editing - Document View editing

Status: blocked

## Frame

Rests on [PRD-0004](https://github.com/agentshouse/mdruntime/blob/main/docs/prd/prd-0004-document-view-components-and-base-template.md)
in `agentshouse/mdruntime`, sections Document View and Draft on a refused
Change Batch, and on
[`R007`, `R010`, `R013`, `R030`, and `R031`](https://github.com/agentshouse/mdruntime/blob/main/docs/requirements/ledger.md).
`R010` owns granular changes and their prior-value preconditions; `R030` owns
the text Query exposes; `R031` owns the Document View and Draft behavior.
It uses the Draft, Save, and queue surfaces of the MD Runtime over the reading
surface from `components/02`.

## What to build

Editing in Document View: field controls and text editors accumulate into
the file's durable Draft through the MD Runtime; all existing sections,
whether or not the MD Type declares them, and the preamble each have an Edit
control that opens that text for plain text editing and ends in Save or
cancel; a whole-text control edits the complete Markdown and saves as one
whole-file change; Save builds one Change Batch from the Draft and shows a
local validation failure at the failing control, section, or preamble editor;
creation opens a new typed file with its required parts empty; rename, move, and removal are
controls that produce the structural changes, a refused removal listing every
referring location as links; and a Conflicted or Rejected head reopens the
Draft over the current state with the App Creator's values kept, each field,
section, or preamble the Provider changed marked with its current value beside
it, the Provider's text verbatim, and Save replacing the head or discard
removing it.

## Acceptance criteria

- [ ] Editing a field, any existing section, or the preamble changes the
      Draft only. Each section or preamble editor ends in Save or in cancel;
      cancel restores that text in the Draft exactly as it was when the
      editor opened, including whitespace, and preserves other Draft edits.
      Reloading or leaving and returning to the file restores the Draft;
      successful Save consumes it.
- [ ] Save produces one set-field change per changed field, one
      replace-section change per changed existing section, one preamble
      change when the preamble was edited, or one whole-file change after
      whole-text editing. Through the public Save surface, each field change
      carries its prior value, each section change its exact prior body, and
      the preamble change its exact prior text from the visible state, as
      `R010` requires; whole-file replacement uses the prior file revision.
      Unrelated content is unchanged. A local validation failure is shown at
      its control, section, or preamble editor with the rule named while the
      Draft stays.
- [ ] The browser seam over the published in-memory Adapter edits both a
      section absent from its MD Type's declarations and the preamble,
      verifies their exact prior-text guarded changes on Save, and verifies
      editor cancel restores the opened text without a Change Batch.
- [ ] Creating a file of a MD Type, renaming, moving, and removing it work
      as structural changes; a removal with incoming links is refused with
      every referring location shown as a link.
- [ ] After Conflicted or Rejected the Draft reopens over the current file
      with the App Creator's values, marks each field, section, and preamble the
      Provider changed with the current value beside it, shows the refusal
      verbatim, and offers Save, which replaces the head through the Save
      surface, and discard through the queue surface.
- [ ] There is no WYSIWYG editing; a list field is edited as one value.

## Mines

Waits for
[`runtime/05`](https://github.com/agentshouse/mdruntime/blob/main/docs/backlog/tickets/runtime/05-drafts-save-local-validation-and-change-batch-construction.md)
and
[`runtime/06`](https://github.com/agentshouse/mdruntime/blob/main/docs/backlog/tickets/runtime/06-submission-outcomes-and-the-queue.md)
in `agentshouse/mdruntime`, which
deliver Draft, Save, and the queue. Nothing is merged automatically. Editing
never creates a Change Batch before Save. A file without a write grant shows
no editing control. The Draft is the MD Runtime's; the element restores it
rather than keeping its own copy.

All-existing-section and preamble reads retain the public package capability
hold owned by Runtime's
[`runtime/03`](https://github.com/agentshouse/mdruntime/blob/main/docs/backlog/tickets/runtime/03-bootstrap-into-durable-local-replicas-and-local-query.md).
Published Model support for preamble text and its guarded change remains a
`runtime/05` acceptance hold. Consume these capabilities through the public
Runtime; no second parser, direct Model call, local text projection, or
whole-file replacement may stand in for a missing granular operation.
Replacing a preamble replaces text the file already carries; it creates no
section and no Document. The typed creation behavior above is unchanged.

## Out of scope

The screens and any board or domain screen.
