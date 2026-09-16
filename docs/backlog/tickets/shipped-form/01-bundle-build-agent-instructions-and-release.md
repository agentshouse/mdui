# 01-bundle-build-agent-instructions-and-release - Bundle build, agent instructions, and release

Status: blocked

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
the root. The release seam: main running over a real Agents House Building
through the Agents House Adapter, observed as an App Creator would.

## Acceptance criteria

- [ ] Building main from its committed tree and locked dependencies yields
      the App the Provider serves, with the external origins its code needs
      declared in the manifest and nothing else declared; there is no MD App
      server.
- [ ] The repository root carries the agent instruction file with the listed
      content and the MIT license file.
- [ ] The neutrality lane is green on main, and the bundle sends no
      telemetry.
- [ ] Main, served from a public HTTPS origin the User chooses, runs over the
      dev Building through the published Adapter package: the User completes
      the consent once, and Rooms, Search, File with reading and editing,
      Work, and Log are observed working as an App Creator would, which is
      the bar of `R036`.

## Mines

Waits for `shipped-form/01` and `agents-house-adapter/02` in
`agentshouse/mdruntime`, so that the packages the bundle consumes are
published with Mutation and History. The release seam runs the App where
House serves it, at its own path on the control origin; there is no client
identity document and no static host of the App Creator's own. Making the repository public and
declaring the release are outward-facing acts; the implementer stops for the
User's confirmation before each. No support matrix, browser matrix, cadence,
or governance file is added. No example branch gates the release.

## Out of scope

Hosting, a scaffolding command, any wrapper for a framework, and any example
branch.
