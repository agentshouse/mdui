# 01-choose-the-stack-and-lay-the-workspace - Choose the stack and lay the workspace

Status: ready-for-agent

## Frame

Rests on PRD-0005 in `agentshouse/mdruntime`
(`docs/prd/prd-0005-shipped-form-and-release.md`) sections Parts and
packages and The bundle, on PRD-0004 there
(`docs/prd/prd-0004-document-view-components-and-base-template.md`) for the
component and screen seams the runner must serve, on ADR-0007 there for plain
HTML and ES modules without a framework, and on [`AGENTS.md`](../../../../AGENTS.md)
and [`docs/agents/TESTING.md`](../../../agents/TESTING.md), which say the
stack and runner commands land there when chosen. The User has chosen the
stack: the same as Agents House and the MD Runtime, which means the Node and
npm versions House's package manifest pins, TypeScript, Vitest, swc for
compilation, oxfmt for formatting, and dependency-cruiser for dependency
rules, with Docker Compose as the runner and Playwright as the browser-lane
runner.

## What to build

One npm project that is the App: plain HTML and ES modules, empty of
behavior, whose only dependencies are `@agentshouse/mdruntime`,
`@agentshouse/mdruntime-adapter`, and what they pin. One Docker Compose
service runs every check: typecheck, format, the pure-seam runner, a
browser-seam runner that loads the App in a real browser over the MD
Runtime's in-memory Adapter, and the static lane whose first rule is the
neutrality rule. The stack, the commands, the test locations, and the file
suffix are recorded in their owners.

## Acceptance criteria

- [ ] The project pins the Node and npm versions Agents House's package
      manifest pins, compiles with TypeScript and swc, tests with Vitest,
      and formats with oxfmt; the source is empty of behavior and depends on
      the two packages and nothing else.
- [ ] One documented Compose command runs typecheck, format check, the pure
      lane, the browser lane, and the static lane, each green on the empty
      project with one placeholder spec per lane.
- [ ] The browser lane runs real browser specs through Playwright with the
      App served from its source without a bundle step; the placeholder spec
      loads the App and the MD Runtime package, and the in-memory Adapter
      that package exports is used from `components/01` on.
- [ ] The static lane enforces the neutrality rule through dependency-cruiser:
      a planted Provider-specific import outside the Adapter package fails
      the lane and removing it passes.
- [ ] AGENTS.md lists the commands and the engineering conventions the stack
      adds; TESTING.md names the runner commands, locations, and suffix;
      ARCHITECTURE.md describes only the project that now exists.

## Mines

Waits for `foundation/01` in `agentshouse/mdruntime`, which lays the two
packages this project consumes, and for their first prerelease on npm under
`@agentshouse`, which the User publishes from that repository's main branch;
this project pins published prereleases and never a Git or path dependency,
because npm cannot install one package of a Git workspace and an App
Creator's fork must install from npm. No behavior lands here. Comments in code are not allowed. A folder is a
namespace, so file names do not repeat it. Derived artifacts stay in
gitignored `tmp/`. Keep the existing `npm run ops` backlog and merge
commands; Compose is the test runner, not a second operator CLI. No framework
is added and dependencies stay minimal, because an App Creator's agent adds
whatever its fork needs later. Strict replacement applies from the first
commit: no scaffold left for a later cleanup.

## Out of scope

Any component or screen behavior, the bundle build, and the agent instruction
file.
