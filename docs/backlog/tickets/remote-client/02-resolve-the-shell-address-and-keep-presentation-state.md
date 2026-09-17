# 02-resolve-the-shell-address-and-keep-presentation-state - Resolve the shell's address to a Room and a Document and keep main's screen and open file as Presentation State

Status: blocked

## Frame

Rests on PRD-0006 in `agentshouse/mdruntime`
(`docs/prd/prd-0006-worker-hosted-runtime-and-remote-client.md`), whose
ninth user story wants a deep link to land on the right Document and whose
section The conversation surfaces settles that "Navigation itself is not the
Runtime's: the address is the host shell's URL, delivered to and requested by
the App through the host's bridge under House's PRD-0070; a deep link is that
address, and the App resolves it against the Rooms and Documents the Runtime
holds", and on `R038` in its ledger, which keeps Presentation State in the
Runtime per App. House's PRD-0070 §2 in `agentshouse/core`
(`docs/prd/prd-0070-the-shared-app-runtime.md`) owns the Navigation family:
"The part of the path below the App's path, the query and the fragment
belong to the App; the shell delivers them to the renderer when it starts and
whenever the User navigates, and the renderer asks the shell to push or
replace them." It rests on
[the remote-client ticket](01-run-main-over-the-remote-client-and-show-structured-refusals.md)
and consumes mdruntime's `worker-hosted-runtime/05` (the Presentation State
store) and core's published bridge client.

## What to build

Main has an address. The part of the shell's path below the App's path, with
its query and fragment, names a screen and, for the File screen, a Room and a
Document path; main resolves it against the Rooms and Documents the Runtime
holds when the bridge client delivers it at start and on every later
delivery, and shows the Rooms screen with the unresolved address named when
no Room or Document matches. When the User moves between screens or opens a
file, main asks the bridge client to push the new address, and replaces it
where the move corrects rather than extends history. The screen main shows
and the file it holds open are its Presentation State: main writes them
through the client's presentation surface and reads them back when it starts
without an address below the App's path, so a reload reopens where the User
left and every tab of main agrees. An address always wins over Presentation
State. Screen switching through `show(screen)` alone retires under strict
replacement. The proofs run over the client entry against the host entry
serving the in-memory Adapter, with the bridge client's in-page test host
playing the shell.

## Acceptance criteria

- [ ] A delivered address naming a Room and a Document path opens the File screen on that Document over the client entry; one naming a Room or a Document the Runtime does not hold shows the Rooms screen with that address named; the query and fragment survive the round trip.
- [ ] Opening a file and moving between screens push the address through the bridge client's in-page test host, and an address the test host delivers back, as Back and Forward would, lands on the screen and Document it names.
- [ ] The screen and the open file written as Presentation State are observed on a second port of the same App, are read back after a reload without an address below the App's path, and yield to a delivered address.
- [ ] Main composes no address outside its own path segment, opens no channel beside the bridge client and the Runtime port, and no `show(screen)` call remains that changes the screen without the address and Presentation State following.

## Mines

Waits for a published `@agentshouse/mdruntime` prerelease that carries
mdruntime's `worker-hosted-runtime/05`, for House's core ticket
`app-runtime/02-run-every-app-over-one-shared-worker`, which builds the
shell that delivers the address, and for
`app-runtime/03-publish-the-bridge-client-for-navigation-ceremonies-and-status`,
which publishes the Navigation family and the in-page test host these proofs
use; the hold lifts when all three are installable. The address grammar
below the App's path is main's own and a fork may change it; a Room
reference in the address is the Runtime's locator, never a House Room handle
main composes. Presentation State is neither a Draft nor a Pending Change:
main writes only the screen and the open file there, never a Document's
content. The Refusal and Storage screens are shown by state, not by address,
and are never pushed.

## Out of scope

Ceremonies, which the bridge client carries and no screen here requests; the
Presentation State store itself, which mdruntime's `worker-hosted-runtime/05`
keeps; the conversation surfaces.
