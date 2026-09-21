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
volume; no host Node installation or browser participates.

| Decision                  | Command                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Full gate before the PR   | `docker compose run --rm --build check`                                                                      |
| Pure slice                | `docker compose run --rm --build check npm run ops -- check pure test/pure/<name>.spec.ts [-t <name>]`       |
| Browser slice             | `docker compose run --rm --build check npm run ops -- check browser test/browser/<name>.spec.ts [-g <name>]` |
| Static lane               | `docker compose run --rm --build check npm run ops -- check static`                                          |
| Typecheck or format check | `docker compose run --rm --build check npm run ops -- check <typecheck\|format>`                             |
| Apply formatting          | `docker compose run --rm --build check npm run ops -- format`                                                |

The full gate runs typecheck, format check, house check, pure specs, browser
specs, and the static lane in that order. The browser lane verifies swc
compilation by loading the source modules it transforms.
Operator checks such as `docs check` and `backlog check` also run through
this service: `docker compose run --rm --build check npm run ops -- docs check`.

The browser runner serves `src/index.html` and compiles requested source
modules with swc in memory. The public Vite build API, already locked through
Vitest, bundles the installed dependencies' public
root exports and the public Runtime memory entry with their pinned dependency
graph into browser ES modules in memory, including the locked micromark
utility roots used by the renderer's syntax extensions;
the import map resolves those entries. Playwright loads the App source
directly with no compiled-file dependency. The browser fixture uses
`@agentshouse/mdruntime/host` serving `@agentshouse/mdruntime/memory` and
connects `@agentshouse/mdruntime/client` over a message port; component specs
from `components/01` onward use that same public in-memory Adapter in the test
placement. It belongs only to tests and is excluded from the eventual bundle
by PRD-0005 in `agentshouse/mdruntime`.

The static lane runs dependency-cruiser over `src/` and a specification that
plants runtime and type-only Provider-specific imports outside the Adapter
package, observes the `neutrality` error, removes the imports, and observes a
clean result. Fixtures live under `tmp/` and are removed even on failure.
The spec uses the lane's error reporter to verify both the nonzero exit and
the named neutrality error.
Dependency-cruiser uses its TypeScript parser with pre-compilation
dependencies included. TypeScript is pinned to `6.0.3` because
dependency-cruiser `18.2.0` requires the compiler API below version 7; Node
and npm still use House's current pins.

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

The browser specifications own App loading, the Markdown renderer, field
controls, Document View, the Sync Status indicator, and the seven screens of
main over the published in-memory Adapter. They exercise actual native
interaction, value and validity events, same-Room reference choices, list
updates, locale, visible focus, disabled states, and 360px light/dark layout. Document View covers Query
text parts, Room-local backlinks, lazy History at the public Adapter fixture
boundary, visible refusal reasons, Draft and Save through the public Runtime
surfaces, in-progress editor Draft persistence, relative reference storage,
structural changes with whole-text, grant revocation, complete Markdown from
Query `content`, exact whole-file Save and cancel, and a Conflicted or
Rejected head. The indicator covers Observe states,
attention, last completed synchronization, and Pending while unreachable.
The screen seam covers Rooms with MD Types and file tree, including the tree
after a local structural Save while the Provider is unreachable, File through
Document View, Local Search over section text and field values narrowed by
Room, MD Type, and one field value including a number and an empty string,
Work's public Draft inventory and per-Room queues with Provider text,
Connection Refusal with re-authorization, the storage-loss statement, and
synchronization log export, plus keyboard operation of labelled screen
controls, 360px and desktop layout, and light and dark themes.
The address and Presentation State seam runs over the client entry against the
host entry serving the in-memory Adapter, with `@agentshouse/app-bridge/test-host`
playing the shell: a delivered address opens File or names an unresolved
address on Rooms, user moves push and Back/Forward land, Presentation State is
observed on a second port of the same App, a reload without an address below
the App's path restores it, and a delivered address wins over Presentation
State even when restore is still reading. A later delivery wins over an earlier
File resolution still in flight. Paths encode for a space or `#`. A second tab
with no address below the App path follows Presentation State. Re-applying the
current address does not hide Storage or a live Connection Refusal. The open
file remains in Presentation State when the screen is not File.
The Work specification exercises absent-Path creations, unchanged-Path content
changes, remote removal and Room access loss, navigation and literal reload,
same-tab and cross-tab Draft and queue convergence, Save consumption, and
discard. Browser storage-operation exceptions exercise failed reads, writes,
and Save without reading private stores. Read failure, keyboard retry, durable
Save refusal, Pending batches, reopened Conflicted or Rejected Drafts, Accepted
batch removal, and actual storage eviction have distinct assertions. This is
public Runtime integration over the Memory Adapter, not live Building acceptance.
Repeated unchanged Room notifications are observed while a native File field is
being typed into; the field keeps its value and focus until the user commits it.
The renderer seam also
accepts adversarial text directly through its public property, independently
of Model collection validity; normal section input is read through Query.
The pure lane owns `test/pure/address.spec.ts` and the renderer corpus.
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
