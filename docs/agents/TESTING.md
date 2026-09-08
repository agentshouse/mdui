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

| Decision                                | Command                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Full gate before the PR                 | `docker compose run --rm --build check`                                                                      |
| Pure slice                              | `docker compose run --rm --build check npm run ops -- check pure test/pure/<name>.spec.ts [-t <name>]`       |
| Browser slice                           | `docker compose run --rm --build check npm run ops -- check browser test/browser/<name>.spec.ts [-g <name>]` |
| Static lane                             | `docker compose run --rm --build check npm run ops -- check static`                                          |
| Typecheck or format check               | `docker compose run --rm --build check npm run ops -- check <typecheck\|format>`                             |
| Apply formatting                        | `docker compose run --rm --build check npm run ops -- format`                                                |

The full gate runs typecheck, format check, pure specs, browser specs, and
the static lane in that order. The browser lane verifies swc compilation
by loading the source modules it transforms.
Operator checks such as `docs check` and `backlog check` also run through
this service: `docker compose run --rm --build check npm run ops -- docs check`.

The browser runner serves `src/index.html` and compiles requested source
modules with swc in memory. Its import map resolves the installed
dependencies' public exports. Playwright loads this App directly, without a
bundle step or compiled-file dependency. The browser fixture uses
`@agentshouse/mdruntime/memory`; component specs from `components/01` onward
use that same public in-memory Adapter. It belongs only to tests and is
excluded from the eventual bundle by PRD-0005 in `agentshouse/mdruntime`.

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

The foundation has one specification per lane. Its pure and browser
placeholders establish loading only; later component and screen tickets
replace them with their owning public-seam specifications. Browser results
and traces are written under `tmp/browser/`.
