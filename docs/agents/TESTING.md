# Testing

Tests protect observable behavior. Validation is evidence for a decision, not a
development heartbeat. Start with the smallest relevant rung and expand only
when the change needs the additional evidence.

The implementing agent runs the tests. Merge does not rerun them. The Master
does not run them.

## Runner

Every check runs in the Linux Docker Compose `check` service with the Node,
npm, and dependency pins in `package.json` and `package-lock.json`. The image
installs from the lockfile and includes Playwright's Chromium and system
dependencies. Each run mounts this worktree and gets its own dependency
volume; no host Node installation or browser participates. The entrypoint,
`scripts/container-user.mjs`, hands that volume and the mount point Docker
creates for it in the worktree, reached through the second mount at
`/checkout`, to the checkout owner's UID/GID, then runs the command as that
owner, so everything a run writes stays removable by the owner.

| Decision                  | Command                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Full gate before the PR   | `docker compose run --rm --build check`                                                                      |
| Pure slice                | `docker compose run --rm --build check npm run ops -- check pure test/pure/<name>.spec.ts [-t <name>]`       |
| Browser slice             | `docker compose run --rm --build check npm run ops -- check browser test/browser/<name>.spec.ts [-g <name>]` |
| Static lane               | `docker compose run --rm --build check npm run ops -- check static`                                          |
| Built App lane            | `docker compose run --rm --build check npm run ops -- check build`                                           |
| Typecheck or format check | `docker compose run --rm --build check npm run ops -- check <typecheck\|format>`                             |
| Apply formatting          | `docker compose run --rm --build check npm run ops -- format`                                                |

The full gate runs typecheck, format check, house check, the built App lane,
pure specs, browser specs, and the static lane in that order. The built App
lane rebuilds `src/` in memory and refuses a committed `app/` that differs, so
the tree the Provider builds is never behind its source. The browser lane
verifies swc compilation by loading the source modules it transforms.
Operator checks such as `docs check` and `backlog check` also run through
this service: `docker compose run --rm --build check npm run ops -- docs check`.

The browser runner serves `src/index.html` and compiles requested source
modules with swc in memory. The public Vite build API, already locked through
Vitest, bundles the installed dependencies' public
root exports and the public Runtime memory entry with their pinned dependency
graph into browser ES modules in memory, including the locked micromark
utility roots used by the renderer's syntax extensions;
the import map resolves those entries. A specification that mounts the source
it protects loads it with no compiled-file dependency; App loading is served
from committed `app/` as built, under a Content Security Policy that carries
the renderer's own restrictions: no inline style and no network but the host's
own origin, so a style the App cannot apply through the Provider fails here.
Its `script-src` also admits `unsafe-inline`, which the renderer does not,
because the runner stands in for the Provider: the import map and bridge shim
the runner injects are the document the Provider composes itself. It admits no
`unsafe-eval`, so the in-page Runtime host proves the Model it carries
validates without generating code. The browser
fixture uses `@agentshouse/mdruntime/host` serving
`@agentshouse/mdruntime/memory` and connects `@agentshouse/mdruntime/client`
over a message port; component specs from `components/01` onward use that same
public in-memory Adapter in the test placement. It belongs only to tests and
ships in no App, by PRD-0005 in `agentshouse/mdruntime`.

The static lane runs dependency-cruiser over `src/` and a specification that
plants a runtime import, a type-only import, and a type-only re-export of a
Provider-specific module outside the Adapter package, observes the
`neutrality` error, removes the imports, and observes a clean result. Fixtures
live under `tmp/` and are removed even on failure. The spec uses the lane's
error reporter to verify both the nonzero exit and the named neutrality error.
Dependency-cruiser parses with swc, which keeps type-only import and export
declarations as dependencies. TypeScript `7.0.2` ships no compiler API that
dependency-cruiser `18.4.0` admits, so its TypeScript parser is not used, and
an inline `typeof import('…')` type query is not extracted.

## Cadence

One development loop:

- **Slice loop:** run the exact test for the current behavior slice once to see
  it fail and after the implementation to see it pass. If it remains red,
  diagnose and make a coherent repair before rerunning it. A green slice stays
  green in the evidence record until later edits could affect it. Cheap type
  and static checks may run whenever they shorten this loop.
- Before opening the PR, run the tests the change needs. Record the tested
  public seams in the PR body.

`npm run ops -- merge` squash-merges a PR whose review sequence is complete
with no open `defect`. It does not run tests.

## What a good test is

A test names an observable outcome at a public **seam**. Code can change
entirely; the test should not. Expected values come from an independent source:
a known-good literal, a worked example, or the spec.

## Anti-patterns

- **Implementation-coupled** — mocks internal collaborators, tests private
  methods, or asserts through a side channel. The tell: refactoring breaks it
  while behavior is unchanged.
- **Tautological** — the assertion recomputes the expected value the way the
  code does, so it can never disagree with the code.
- **Horizontal slicing** — all tests first, then all implementation. Work in
  vertical slices: one test, one minimal implementation, repeat.

## Rules

- A harmless implementation refactor must not break a test.
- Exact values are allowed when the value is part of observable behavior.
- Tests must not depend on ambient time, execution order, or leftovers from
  another test.
- Resources created by tests must have failure-safe cleanup registered before
  the first assertion.
- One specification owns each cross-module contract. Consumers test only their
  integration edge.
- Delete or consolidate a test when another owning specification already
  protects the behavior, a behavior-preserving refactor breaks it, it asserts an
  implementation detail, or it exists only because setup or scenarios were
  copied.
- A test is never deleted because it fails. The commit that removes a test
  names the behavior that is gone.

## Location and naming

Tests live at public seams, never against internals, and use `.spec.ts`:

| Location        | Runner and public seam                                                           |
| --------------- | -------------------------------------------------------------------------------- |
| `test/pure/`    | Vitest `pure` project: ES modules and pure observable behavior                   |
| `test/browser/` | Playwright: the App's DOM and its public MD Runtime integration                  |
| `test/static/`  | Vitest `static` project: the dependency-cruiser command's acceptance and refusal |

App loading is observed on the committed `app/`, which is the App the Provider
builds; every other browser specification mounts the source it protects.
The browser specifications own App loading, the Markdown renderer, field
controls, Document View, the Sync Status indicator, and the seven screens of
main over the published in-memory Adapter. They exercise actual native
interaction, value and validity events, same-Room reference choices, list
updates, locale, visible focus, disabled states, and 360px light/dark layout.
Document View covers selected Query parts, Room-local backlinks, lazy History
at the public Adapter fixture boundary, visible refusal reasons, Room Draft
field, section, whole-Markdown and creation writes, Save consumption into the
Room queue, cancel and discard, and grant revocation. The indicator covers
Observation handles, returned Room Draft attention, last completed
synchronization, and Pending while unreachable.
The screen seam covers Rooms with MD Types and file tree, including the tree
after a local structural Save while the Provider is unreachable, File through
Document View, Local Search over section text and field values narrowed by
Room, MD Type, and one field value including a number and an empty string,
Work's public Room Draft inventory, returned Provider reasons, and per-Room
queues,
Connection Refusal with re-authorization, the storage-loss statement, and
synchronization log export, plus keyboard operation of labelled screen
controls, 360px and desktop layout, and light and dark themes.
The address and Presentation State seam runs over the client entry against the
host entry serving the in-memory Adapter, with `@agentshouse/app-bridge/test-host`
playing the shell: a delivered address opens File or names an unresolved
address on Rooms, user moves push and Back/Forward land, Presentation State is
followed through its Observation handle on a second port of the same App, and
a reload without an address below the App's path restores it. A later delivery
wins over an earlier File resolution still in flight. Paths encode for a space
or `#`. A second tab with no address below the App path follows Presentation
State. Re-applying the current address does not hide Storage or a live
Connection Refusal. The open file remains in Presentation State when the
screen is not File, and failed Presentation State writes remain visible until
a retry succeeds. The Work specification exercises live Room Draft inventory,
Save consumption into a submitted Change Batch, Provider-returned drafts, and
discard. This is public Runtime integration over the Memory Adapter, not live
Building acceptance.
The renderer seam also
accepts adversarial text directly through its public property, independently
of Model collection validity; normal section input is read through Query.
The pure lane owns `test/pure/address.spec.ts`, `test/pure/app.spec.ts`, and
the renderer corpus. `test/pure/app.spec.ts` owns the shipped form as the
Provider reads it: the manifest's entry and its empty external origins, the
entry document's single reference, the built App's own module set without the
test placement, bare specifiers the committed lockfile pins, and the absence
of any network primitive of the App's own.
`test/pure/address.spec.ts` asserts `splitAddress` and `parseAddress` on the
remainder grammar, including production-delivered `//` and `scheme:` forms,
`/\notes` whose `\` the browser would already have folded to `/`, empty or `/`
as no remainder, File versus addressed screen versus unroutable remainder, and
decode of a space or `#`. The renderer corpus qualifies the renderer dependencies
against the
[original GFM 0.29 corpus](../../test/fixtures/README.md), preserving the source's
base/extension distinction. It is not browser safety evidence, and its current
configuration applies the historical inline-comment rule to both fixture modes
and GFM extensions only to the extension examples. Expected profile output is
never widened to accommodate a dependency difference. Only checkbox attribute
order and void-element slash spelling are normalized; text, element nesting,
and destinations compare exactly. `allowDangerousHtml` is enabled only in these
string comparisons. No empty-suite exemption remains.
Browser results, screenshots,
and traces are written under `tmp/browser/`. Copy retained Assignment evidence
to its own `tmp/` directory before another browser run replaces the results.
