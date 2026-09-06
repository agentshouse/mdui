# 01-markdown-renderer-and-field-controls - Markdown renderer and field controls

Status: blocked

## Frame

Rests on PRD-0004 in `agentshouse/mdruntime`
(`docs/prd/prd-0004-document-view-components-and-base-template.md`) sections
Components, Markdown rendering and content safety, and Launch promises, on
ADR-0007 there, and on `R034` and `R035`. It uses the Types and Query
surfaces of the MD Runtime.

## What to build

The first custom elements: the Markdown renderer, which renders section text
under the MD Model's Markdown syntax profile, GitHub Flavored Markdown at the
specification version the MD Model pins, executes no script, keeps raw
HTML only for details and summary, emits image and resource references for
the bundle's policy to decide, and resolves each internal link to a Path in
the same Room reported as an event for the host; and one field control per
kind, string, number, date, enum, reference, and list of one of those, each
exposing its value, validity, and a change event, with the reference control
offering files of the required MD Type from the same Room through a Local
Query and storing the relative Path, and the list control editing its
elements as one value.

## Acceptance criteria

- [ ] The renderer renders the pinned profile, strips every raw HTML element
      except details and summary, never executes a script, emits images and
      other resources as references only, and raises an event for an
      internal link with its Path.
- [ ] Each of the six controls renders as a labelled, keyboard-operable
      element with visible focus, exposes its value and validity, and emits
      a change event; the reference control lists candidates from the same
      Room and required type through Query and stores a relative Path; the
      list control changes as one value.
- [ ] Every element is a standard custom element usable from plain HTML with
      no framework and takes its theme from CSS custom properties with light
      and dark defaults following the browser preference.
- [ ] Strings are English, dates and numbers follow the browser locale, and
      each element lays out at a 360 pixel viewport.
- [ ] The component seam runs in the browser lane over the in-memory Adapter.

## Mines

Waits for `runtime/03` in `agentshouse/mdruntime`, which delivers the Types
and Query surfaces. No element holds Room data beyond what it renders; shared
state flows through the MD Runtime API. Regular expressions never appear in a
human control. The profile is the MD Model's promise, so the renderer follows
it rather than a richer flavor.

## Out of scope

Document View, the Sync Status indicator, and the screens.
