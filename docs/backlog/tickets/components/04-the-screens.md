# 04-the-screens - The screens of main

Status: ready-for-agent

## Frame

Rests on PRD-0004 in `agentshouse/mdruntime`
(`docs/prd/prd-0004-document-view-components-and-base-template.md`) sections
The screens and Launch promises, on PRD-0005 there for the App's minimal
dependencies, and on `R031`, `R032`, `R033`, and `R035`. It uses the Rooms
surface and the storage-loss state of the MD Runtime.

## What to build

The main branch as the zero-code App: plain HTML and ES modules composed from
the components over the MD Runtime API, with the seven screens of PRD-0004,
Rooms, Search, File, Work, Refusal, Storage, and Log, the Sync Status
indicator on every screen, Local Search over section text and field values
narrowed by Room, MD Type, and one field value, and the launch promises kept
on every screen. Its dependencies are the two MD Runtime packages and what
they pin, nothing more.

## Acceptance criteria

- [x] Rooms lists every Room from the Rooms surface with its MD Types and
      file tree and opens any file in Document View; Search finds files
      through Local Search across all Rooms, narrowed by each of the three
      values.
- [x] Work lists the App Creator's Drafts across Rooms and each Room's
      Pending Change queue with outcomes and the Provider's text; Refusal
      shows the Connection Refusal with its reason and a re-authorization
      control for a revoked authorization; Storage shows the storage-loss
      statement; Log exports the synchronization log as text.
- [x] Every screen is operable from the keyboard with visible focus and
      labelled controls, lays out at 360 pixels and on a desktop, uses
      English strings and locale formatting, and follows the light and dark
      themes.
- [x] The App depends on the two packages and nothing else, and the browser
      lane serves its source without a bundle step; the static bundle build
      is `shipped-form/01`.
- [x] The screen seam runs end to end in the browser lane over the
      in-memory Adapter.

## Mines

Waits for `runtime/08` in `agentshouse/mdruntime`, which delivers the
storage-loss state and durability across tabs. No ranked search, board,
dashboard, saved query, or display default. Nothing in main is privileged:
everything goes through the public MD Runtime API and the components,
because an App Creator's agent will fork and change it. No framework is
added; an App Creator's agent may add one later. An example branch, such as
a task tracker, is not built here and never gates the release.

## Out of scope

The bundle build, the agent instruction file, the release, and any example
branch.
