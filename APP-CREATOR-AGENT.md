# Instructions for the App Creator's agent

These instructions address an agent in an environment with Git working on a
fork of MD UI. Obtain the App Repository, change it, build, and push; the
Provider builds the pushed tree and serves the App. They are documentation,
not enforcement. The published MD Runtime carries the same rules for App code
in its own `AGENTS.md`.

## The fork is the App

Everything the App Creator sees is the code of this repository. Nothing here
is privileged: change any screen, component, or style. The App runs in the
Provider's renderer over the remote client, with no origin, no credential,
and no server of its own.

## Change it, build it, push it

[`ARCHITECTURE.md`](ARCHITECTURE.md) owns what is built here and how. The loop
an agent runs is:

1. Change `src/`.
2. Run `npm run ops -- build`.
3. Commit `src/`, `app/`, and any dependency change together.
4. Push to the Provider.

The Provider builds the committed tree and runs no build script of yours, so a
stale `app/` ships the previous App and the check lane refuses it, and a
dependency the lockfile does not pin refuses the Provider's build.

## The manifest

`app.json`, described in [`ARCHITECTURE.md`](ARCHITECTURE.md), declares the
external origins the App's code needs, empty by default. The Provider enforces
exactly that set, so an origin your code fetches from and the manifest omits is
unreachable. Add an origin when you add the code that needs it, and nothing
else.

## The MD Runtime API

App code reaches the MD Runtime through the remote client, imported from
`@agentshouse/mdruntime/client`. The surfaces are Rooms, Slots, Query, Search,
Observe, Types, Room Draft, Save, History, Call, Log, storage loss, the
reported persistence answer, deployment facts, Sync Status, reauthorization,
conversation, the chat draft, and Presentation State.

Every `observe` resolves after its first complete value arrives to a handle:
`current()` reads that value, `subscribe(listener)` hears later complete values
and returns its unsubscribe, and `close()` ends the observation. Rooms, Slots,
Query, Search, Observe, Types, Room Draft, and Save never touch the network.
History and Call go to the Provider. Every member of the client is
asynchronous, so every call site awaits. Results are detached snapshots.
Nothing in this surface returns the authorization, performs a request your
code composes, or exposes the browser store.

App code never constructs a Runtime: it does not import the package main, the
host entry, the in-memory Adapter at `@agentshouse/mdruntime/memory`, or an
Adapter package, and it does not call `createMdRuntime` or `serveMdRuntime`.
Hosts and tests use those entries; the served App does not.

## Room Draft, Save, and outcome rules

The MD Runtime owns one Room Draft per Room and Path, shared by every App and
tab. It is durable, survives reload and navigation, and is enumerable by Room
locator and Path. A write names the revision it read, or `null` when no Room
Draft existed, plus every field, section, preamble, whole Markdown, creation,
move, or removal it should now change. A part new to the Room Draft names the
visible value it was based on. A stale write or discard is refused with the
current Room Draft; read that value before choosing another edit, and never
overwrite it by retrying the old write at its revision.

Save takes one Room and the Room Drafts it consumes, validates locally, and on
success appends one Change Batch to that Room's queue and removes those Room
Drafts. A stale, changed-underneath, durable-write, or validation refusal
creates nothing and leaves the Room Drafts in place.

Outcomes follow the Provider's answer. Accepted advances the confirmed layer.
Conflicted, Rejected, expired, and withdrawn changes leave the queue and return
as Room Drafts marked with why; show a Provider's structured refusal code and
fields as returned rather than as a sentence you compose. The rest of the
queue keeps synchronizing. Saving or discarding a returned Room Draft resolves
its attention. There is no queue discard and no Save in place of a queue head.
Transport failure and Provider unavailability keep work Pending and are never
read as a rejection. The MD Runtime never combines, reorders, or rebases.

## The neutrality rule

No module outside an Adapter package imports, names, or special-cases a
Provider. This repository reaches data only through the client entry, and the
static lane in [`docs/agents/TESTING.md`](docs/agents/TESTING.md) refuses an
import that breaks the rule.

## Content-safety rules

The Provider authorization belongs to the Runtime host and is never readable
by App code, which runs in the Provider's sandboxed renderer with no storage
and no credential. App code reaches the network only at the external origins
`app.json` declares, and every request to the Provider itself goes through the
MD Runtime. Rendered Markdown never executes scripts, renders raw HTML only
for the details and summary elements, and loads images and other resources
only from origins the Provider's policy allows.

## Launch promises main keeps

These are product requirements, owned by the requirement ledger in
`agentshouse/mdruntime` (R029, R034, R035). The main branch of MD UI keeps
them: it uses semantic HTML, is fully operable from a keyboard with visible
focus and labelled controls, and lays out from a 360 pixel wide viewport to a
desktop. Its strings are English only, dates and numbers follow
the browser locale, and content is never translated. Light and dark themes
come from the CSS custom properties in `src/components/theme.ts`, with the
browser's preference as the default and an App's override respected. Reading
and querying never wait for the network. Data lives only in the App Creator's
browser and with the Provider. What you add carries none of these promises by
itself: keep them, or state that your fork dropped them.

## What an agent must never do

An agent must never read the authorization, load code from a Room, call the
Provider directly, or rebase a refused Change Batch.
