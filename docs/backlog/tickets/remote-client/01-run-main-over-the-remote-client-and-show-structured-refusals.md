# 01-run-main-over-the-remote-client-and-show-structured-refusals - Run main over the remote client of the Provider's Runtime host and show every Provider refusal as its structured code and fields

Status: ready-for-agent

## Frame

Rests on PRD-0006 in `agentshouse/mdruntime`
(`docs/prd/prd-0006-worker-hosted-runtime-and-remote-client.md`) sections
Where the MD Runtime runs and The remote client, on the amendment notes of
PRD-0002 and PRD-0004 there, and on `R031`, `R032`, `R033` and `R038` in its
ledger as amended on 2026-09-16 and 2026-09-17: App code reaches the MD
Runtime only through the remote client, every member of which is
asynchronous, and a Provider's refusal is its structured code and fields,
never a composed sentence. House's PRD-0070 §1 and §2 in `agentshouse/core`
(`docs/prd/prd-0070-the-shared-app-runtime.md`) own the shell, the bridge
port, the dedicated Runtime port the worker hands the renderer over it and
the published bridge client. It rests on `components/04` (main over the
in-memory Adapter) and consumes mdruntime's `worker-hosted-runtime/01` (the
host and client entries) and `worker-hosted-runtime/08` (the structured and
retryable refusal shapes).

## What to build

Main obtains its MD Runtime from the package's client entry over the
dedicated Runtime port PRD-0006 and PRD-0070 define: House's shell hands the
renderer the bridge port before its scripts run, House's worker transfers the
Runtime port to the renderer over that bridge port, and main receives the
transferred port through House's published bridge client, the one handshake
main uses that client for here, and hands it to the client entry. Main
constructs no Runtime and no Adapter of its own: the Adapter is the host's.
Every call site awaits the member it calls, including Rooms, Types, Sync
Status and the enumerations the in-process Runtime answered synchronously,
and the screens render from the awaited result and from observations.
Document View editing shows a Rejected or Conflicted outcome with the
Provider's structured code and fields as returned beside the marked changes;
the Work screen and the Sync Status indicator show
the same on an attention-required entry and show a retryable refusal as
Pending with the reset the Provider named; the Refusal screen shows the
client/host protocol mismatch beside the four Connection Refusals it shows
today; the Storage screen shows the storage loss statement with the reported
persistence answer beside it; the Log screen exports the codes the Runtime
records. The component and screen proofs run over the client entry against
the package's host entry serving the in-memory Adapter in the test placement,
so outside the test placement nothing in this repository constructs a Runtime
in the window. The neutrality lane's green case becomes the client entry, and
main imports no other Runtime entry.

## Acceptance criteria

- [ ] Main receives the Runtime port the bridge client surfaces from the transfer over the bridge port, connects the client entry to it and reaches every Room, Document, Draft, Pending Change, History entry and Log entry through that entry; it constructs no Runtime and no Adapter, and it uses the bridge client for nothing else.
- [ ] Every Runtime member is awaited, no screen or component reads a synchronous result, and the existing component and screen proofs pass in meaning over the client entry against the host entry serving the in-memory Adapter in a real browser.
- [ ] A scripted Rejected and a scripted Conflicted outcome appear in Document View editing, on the Work screen and in the Sync Status indicator as the scripted code and fields, no sentence composed in this repository stands in for them, and a scripted retryable refusal shows Pending with its reset.
- [ ] The Refusal screen shows the protocol mismatch as a Connection Refusal beside the four it shows today, and the Storage screen shows the storage loss statement beside the reported persistence answer.
- [ ] Opening several files in turn and unbinding main leave no live subscription on the host for the closed observations, including an observation whose subscription resolves after the rebind or the unbind that closed it.
- [ ] The neutrality lane's green case is the client entry and main imports no other Runtime entry; outside the test placement, no Runtime or Adapter is constructed, no refusal text is read and no Runtime member is called synchronously at the merge boundary.

## Mines

Waits for a published `@agentshouse/mdruntime` prerelease that carries
mdruntime's `worker-hosted-runtime/01` and `/08`, and for House's core
tickets `app-runtime/02-run-every-app-over-one-shared-worker`, which builds
the worker and the Runtime port it transfers over the bridge port, and
`app-runtime/03-publish-the-bridge-client-for-navigation-ceremonies-and-status`,
which publishes the bridge client that listens on the bridge port; main pins
versions, never commits, and the hold lifts when both are installable. The
bridge port is the shell's to hand, the Runtime port is the worker's to
transfer and the App identity is the host's: main never names itself, never
opens a second channel and never listens on the bridge port itself, because
the bridge client is that port's one listener and mdruntime's client the
Runtime port's. The transferred port is a message port, not the Runtime
wire; if the published client surfaces no transferred port, that is a core
gap to report on `app-runtime/03`, never a listener written here.
Presentation State and the address are
[the address ticket](02-resolve-the-shell-address-and-keep-presentation-state.md);
ceremonies are the bridge client's under House's PRD-0070 and no screen
requests one here. Strict replacement: the in-process placement today's
proofs use is a test placement only, and none of it stays as a fallback. A
fork may change anything here, so nothing depends on the shell beyond the
bridge port it hands and the Runtime port that arrives over it.

## Out of scope

The bundle build, the agent instructions and the release, which
`shipped-form/01` keeps; the address and Presentation State, which the
address ticket keeps; the conversation surfaces; the Provider's shell,
worker and bridge client.
