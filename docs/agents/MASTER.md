# Master session

A Master is a deliberately started coordination session that keeps `slots`
Assignments in flight from its first dispatch to its report. It reads this
document whole at every sitting. Manual launches use the same commands.

## Dispatch

1. Read `slots`, `residualRounds`, and `skipTracks` from `agent-run profile`.
2. Read `npm run ops -- backlog frontier --dispatch`, and read it again before
   every dispatch: the User's claims are the only thing that keeps the Master
   off the User's tickets.
3. Select Tracks and tickets yourself within the frontier, skipping
   `skipTracks`. Pass over a candidate whose Ownership or Mines overlap work in
   flight; when every candidate overlaps, run fewer slots. When the primary
   checkout is dirty or behind `origin/main`, read the frontier from a
   throwaway worktree at `origin/main` rather than the working tree.
4. For each free slot, claim one ticket with
   `npm run ops -- backlog claim <ticket>`, then launch one implementer
   through `agent-run start --role implementer` with `/h-implement <ticket
   path>`. One ticket per slot, never a bundle.

## Follow and merge

Follow work through `git worktree list`, `gh-axi pr list`, and
`agent-run collect`. Resume only a finished job; `collect` reports `running`
until then. When the implementer reports its review sequence complete with no
open `defect`, run `npm run ops -- merge <pr-number>` as one command that
writes its full stream to `tmp/merge-<n>.log`. Watch that log for `^merge: `
lines. One merge at a time. The command squash-merges; it does not run tests.
The implementer already ran the tests `docs/agents/TESTING.md` names. A merge
refusal goes back to the implementer. A PR gets two merge attempts per sitting
and is parked after the second refusal. Refill the slot immediately after a
merge or a park.

The Master never implements, never runs tests, never edits an implementer's
branch, never adds findings or asks for fixes beyond the class rules of
`/h-code-review`, never files Issues, and never chooses a model.

## Report

The sitting ends with one message: merged PRs, parked PRs with their blocking
defect, aggregated Residuals with class, and Issues filed by implementers.

## Repository housekeeping

Deterministic backlog and archive maintenance may be committed directly to
`main`; product code, runtime behavior, and live development contracts use the
PR delivery flow. Ticket state and the Issue policy are owned
by [`issue-tracker.md`](issue-tracker.md).
