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
`@agentshouse/mdruntime/client`. The surfaces are Rooms, Query, Observe,
Types, Draft, Save, Queue, History, Call, Log, storage loss, the reported
persistence answer, Sync Status, reauthorization, conversation, the unsent
instruction, and Presentation State.

Rooms, Query, Observe, Types, Draft, and Save never touch the network.
History and Call go to the Provider. Every member of the client is
asynchronous, including those an in-process MD Runtime answers synchronously,
so every call site awaits. Results are detached snapshots. Nothing in this
surface returns the authorization, performs a request your code composes, or
exposes the browser store.

App code never constructs a Runtime: it does not import the package main, the
host entry, the in-memory Adapter at `@agentshouse/mdruntime/memory`, or an
Adapter package, and it does not call `createMdRuntime` or `serveMdRuntime`.
Hosts and tests use those entries; the served App does not.

## Draft, Save, and outcome rules

A Draft is durable: it survives reload and navigation, and every durable Draft
is enumerable by its Room locator and Path. Save takes structured changes,
validates locally, and on success appends one Change Batch to that Room's
queue. A local validation failure leaves the Draft and creates nothing.

Outcomes follow the Provider's answer. Accepted advances the confirmed layer.
Conflicted and Rejected leave the head in place, carry the affected current
state and the Provider's structured refusal code and fields as returned, and
block that Room's queue; show that refusal as returned rather than as a
sentence you compose. The App Creator resolves a head by discarding it or by
saving a corrected Change Batch that replaces it in place. Transport failure
and Provider unavailability keep work Pending and are never read as a
rejection. The MD Runtime never combines, reorders, or rebases.

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
