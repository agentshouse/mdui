---
name: h-implement
description: Deliver assigned repository tickets as one Assignment: claim, one worktree, TDD, bounded review, residuals, and one PR ready for ops merge.
---

<!-- house: vendored from agentshouse/house — md/skills/h-implement/SKILL.md (channel md).
Do not edit this copy. Edit it in `house`, then run `npm run ops -- house sync`. -->

# Implement

## Admit the assignment

1. Read every assigned ticket in full. `Frame`, acceptance criteria, `Mines`,
   and `Out of scope` are binding. The dispatcher admitted the tickets; do not
   recompute the frontier.
2. Claim first: `npm run ops -- backlog claim <ticket path…>` with every
   assigned ticket. A refusal ends the assignment before any edit.
3. Follow `docs/agents/domain.md` to only the terminology and decision owners the
   tickets need.

## Take the worktree

Fetch `origin`, then create one task branch and one dedicated worktree from the
latest `origin/main`. The primary checkout belongs to the User. The Assignment
branch is the only writable ref. Keep the worktree until the PR merges.

## Build

Use `/h-tdd` one vertical slice at a time. When every acceptance criterion is
implemented, check the complete branch:

- every criterion is implemented without widening scope;
- every Product invariant in `AGENTS.md` holds;
- no unrelated churn, secrets, or generated accidents are present.

Then run the tests `docs/agents/TESTING.md` names for the change. The
implementer owns that evidence. Merge does not rerun it.

## Open the PR

Set every delivered ticket to `resolved` as `docs/agents/issue-tracker.md`
defines, run `npm run ops -- backlog sync`, commit, push, and open one PR into
`main`. The body carries these and nothing else is mandatory:

- `## Tickets`: every delivered ticket path as its own line;
- the tested public seams;
- the implementation provider, model, and effort;
- one `review: round=<n> role=<role> job=<id> findings=<n>` line per review
  round, appended as each round is collected;
- `## Residuals`: every finding not fixed, with its class and disposition.
  Name later work by canonical id (`set/01-work`), not a ticket file path.

Write the body at `tmp/pr-body.md` inside this worktree.

## Review and finish

Invoke `/h-code-review`, including its park step after each dispatched round.
After each round, fix every `defect` and every `standard` whose fix is
mechanical: a deletion, a rename, a documentation line inside the diff, or a
de-duplication that moves no behavior. Every other finding is a residual;
contesting a class takes one line and also makes it a residual.

After the sequence, file GitHub Issues only under the policy in
`docs/agents/issue-tracker.md`, push every intended commit, update the PR body,
and leave the worktree clean. Stop with the PR ready for
`npm run ops -- merge <number>`, which the implementer never runs.
