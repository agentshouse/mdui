# Testing

Tests protect observable behavior. Validation is evidence for a decision, not a
development heartbeat. Start with the smallest relevant rung and expand only
when the change needs the additional evidence.

The implementing agent runs the tests. Merge does not rerun them. The Master
does not run them.

Concrete runner commands land in this file when the runtime is chosen. Until
then, name the exact command you ran and keep the cadence below.

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

Tests live at public seams, never against internals. The exact directory layout
and file suffix are recorded here when the runtime is chosen.
