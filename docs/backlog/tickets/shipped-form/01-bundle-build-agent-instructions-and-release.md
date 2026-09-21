# 01-bundle-build-agent-instructions-and-release - Bundle build, agent instructions, and release

Status: ready-for-human

## Frame

Rests on PRD-0005 in `agentshouse/mdruntime`
(`docs/prd/prd-0005-shipped-form-and-release.md`) sections The bundle,
Instructions for the App Creator's agent, and License and release, and on
`R029`, `R034`, and `R036`. It builds the main branch of `components/04`
over the published packages of `agentshouse/mdruntime`. Since 2026-09-16
mdruntime's PRD-0006 (`docs/prd/prd-0006-worker-hosted-runtime-and-remote-client.md`)
makes the Provider build and serve every App from its committed source: the
bundle carries no Content Security Policy and no client identity document,
and this ticket waits for that PRD's re-cut before dispatch.

## What to build

The build that turns main into the committed tree the Provider builds: the
Adapter and the required guarantees the App declares are build inputs, and
the external origins the App's code needs are declared in its manifest for
the Provider to enforce. A written agent instruction file at the root
stating the MD Runtime API, the Draft, Save, and outcome rules, the
neutrality rule, the content-safety rules, the launch promises main keeps,
what an agent must never do, and that the agent works in a fork with Git:
obtain the App Repository, change it, build, push. The MIT license file at
the root. The release seam: main built and served by House, running over
the host's Runtime against a real Agents House Building, observed as an App
Creator would.

## Acceptance criteria

- [x] Building main from its committed tree and locked dependencies yields
      the App the Provider serves, with the external origins its code needs
      declared in the manifest and nothing else declared; there is no MD App
      server.
- [x] The repository root carries the agent instruction file with the listed
      content and the MIT license file.
- [x] The neutrality lane is green on main, and the bundle sends no
      telemetry.
- [ ] Main, built by House from its committed tree and served at its own
      path on the control origin, runs over the host's Runtime under the App
      Creator's own Account on the dev Building, with no App-chosen origin
      and no Adapter package consumed by main: Rooms, Search, File with
      reading and editing, Work, and Log are observed working as an App
      Creator would, which is the bar of `R036`.

## Mines

Waits for `shipped-form/01`, `worker-hosted-runtime/04` and
`worker-hosted-runtime/07` in `agentshouse/mdruntime`, so that the packages
the bundle consumes are published with Mutation, History and the Provider
Actions, and on `remote-client/01` and `remote-client/02` here, so that main
already runs over the remote client with an address. The placement is
House's: the release seam needs House's App runtime under PRD-0070 in
`agentshouse/core`, the shell, the SharedWorker that hosts the Runtime and
the port handoff from `app-runtime/02-run-every-app-over-one-shared-worker`
and the managed build that resolves the committed lockfile from
`app-runtime/07-build-from-the-committed-lockfile`, and the status stays
`blocked` until House builds and serves the App. The release seam runs the
App where House serves it, at its own path on the control origin; there is
no client identity document and no static host of the App Creator's own.
Making the repository public is an outward-facing act; the implementer stops
for the User's confirmation before it. Declaring the release is agent work
like a merge (`AGENTS.md`) and needs no confirmation. No
support matrix, browser matrix, cadence, or governance file is added. No
example branch gates the release.

## Out of scope

Hosting, a scaffolding command, any wrapper for a framework, and any example
branch.
