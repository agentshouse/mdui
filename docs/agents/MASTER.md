# Master session

A Master is a deliberately started coordination session that keeps `slots`
Assignments in flight from its first dispatch to its report. It reads this
document whole at every sitting. Manual launches use the same commands.

One Master sitting covers the three MD App repositories, `mdruntime`,
`mdmodel`, and `mdui`, from their primary checkouts side by side; `slots` is
the total across them, and every command below runs from the repository that
owns the ticket. Agents House has its own Master and is never dispatched from
here.

## Dispatch

1. Read `slots`, `residualRounds`, and `skipTracks` from `agent-run profile`.
2. Read `npm run ops -- backlog frontier --dispatch` in each repository, and
   read it again before every dispatch: the User's claims are the only thing
   that keeps the Master off the User's tickets.
3. Select Tracks and tickets yourself within the frontiers, skipping
   `skipTracks`. Pass over a candidate whose Ownership or Mines overlap work in
   flight; when every candidate overlaps, run fewer slots. A ticket whose Mines
   wait on another repository is `Status: blocked` until the User lifts the
   hold; the Master never lifts it. When a primary checkout is dirty or behind
   `origin/main`, read that frontier from a throwaway worktree at
   `origin/main` rather than the working tree.
4. For each free slot, claim one ticket with
   `npm run ops -- backlog claim <ticket>` in its repository, then launch one
   implementer from that repository through `agent-run start --role
   implementer` with `/h-implement <ticket path>`. One ticket per slot, never
   a bundle.

## Follow and merge

Follow work through `git worktree list`, `gh-axi pr list`, and
`agent-run collect` in the repository that launched it. Resume only a
finished job; `collect` reports `running` until then. When the implementer
reports its review sequence complete with no open `defect`, run
`npm run ops -- merge <pr-number>` in that repository as one command that
writes its full stream to `tmp/merge-<n>.log`. Watch that log for `^merge: `
lines. One merge at a time across the sitting. The command squash-merges; it
does not run tests. The implementer already ran the tests
`docs/agents/TESTING.md` names. A merge refusal goes back to the implementer.
A PR gets two merge attempts per sitting and is parked after the second
refusal. Refill the slot immediately after a merge or a park.

A merge that lands a ticket another repository waits on is reported, not
acted on: publishing a package and lifting a `blocked` hold are the User's
acts.

The Master never implements, never runs tests, never edits an implementer's
branch, never adds findings or asks for fixes beyond the class rules of
`/h-code-review`, never files Issues, never publishes a package, and never
chooses a model.

## Report

The sitting ends with one message: merged PRs per repository, parked PRs with
their blocking defect, aggregated Residuals with class, Issues filed by
implementers, and the cross-repository waits that a merge in this sitting
made liftable.

## Repository housekeeping

Deterministic backlog and archive maintenance may be committed directly to
`main`; product code, runtime behavior, and live development contracts use the
PR delivery flow. Ticket state and the Issue policy are owned
by [`issue-tracker.md`](issue-tracker.md).
