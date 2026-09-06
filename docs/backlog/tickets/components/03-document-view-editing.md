# 03-document-view-editing - Document View editing

Status: blocked

## Frame

Rests on PRD-0004 in `agentshouse/mdruntime`
(`docs/prd/prd-0004-document-view-components-and-base-template.md`) sections
Document View and Draft on a refused Change Batch, and on `R007`, `R013`,
and `R031`. It uses the Draft, Save, and queue surfaces of the MD Runtime.

## What to build

Editing in Document View: field controls and section editors accumulate into
the file's durable Draft through the MD Runtime; each section has an Edit
control that opens its text for plain text editing and ends in Save or
cancel; a whole-text control edits the complete Markdown and saves as one
whole-file change; Save builds one Change Batch from the Draft and shows a
local validation failure at the failing control or section; creation opens a
new typed file with its required parts empty; rename, move, and removal are
controls that produce the structural changes, a refused removal listing every
referring location as links; and a Conflicted or Rejected head reopens the
Draft over the current state with the App Creator's values kept, the fields
and sections the Provider changed marked with the current value beside them,
the Provider's text verbatim, and Save replacing the head or discard removing
it.

## Acceptance criteria

- [ ] Editing a field or a section changes the Draft only; a section editor
      ends in Save or in cancel, which restores that section in the Draft to
      its text when the editor opened; leaving and returning to the file
      restores the Draft; Save consumes it.
- [ ] Save produces one set-field change per changed field, one
      replace-section change per changed section, or one whole-file change
      after whole-text editing, and a local validation failure is shown at
      its control or section with the rule named while the Draft stays.
- [ ] Creating a file of a MD Type, renaming, moving, and removing it work
      as structural changes; a removal with incoming links is refused with
      every referring location shown as a link.
- [ ] After Conflicted or Rejected the Draft reopens over the current file
      with the App Creator's values, marks each field and section the
      Provider changed with the current value beside it, shows the refusal
      verbatim, and offers Save, which replaces the head through the Save
      surface, and discard through the queue surface.
- [ ] There is no WYSIWYG editing; a list field is edited as one value.

## Mines

Waits for `runtime/05` and `runtime/06` in `agentshouse/mdruntime`, which
deliver Draft, Save, and the queue. Nothing is merged automatically. Editing
never creates a Change Batch before Save. A file without a write grant shows
no editing control. The Draft is the MD Runtime's; the element restores it
rather than keeping its own copy.

## Out of scope

The screens and any board or domain screen.
