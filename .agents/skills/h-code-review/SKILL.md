---
name: h-code-review
description: Review one repository delivery through the standards and spec roles, classify every finding, and run up to residualRounds fresh residual reviews.
---

# Code review

Reviewers are fresh, read-only, and launched through `agent-run start --role`;
the run profile decides who plays each role. The implementing agent fixes
between rounds. Reviewers do not run tests.

## Pin a candidate

Require a clean worktree and an open PR. Record the base and candidate SHAs:

```sh
git fetch origin main
git merge-base origin/main HEAD
git rev-parse HEAD
```

The packet is `git diff <base>...<candidate>` and
`git log <base>..<candidate> --oneline`. If the diff is empty, stop. Later
commits create a new candidate and do not alter an earlier review's claim.

## Source sets

The Spec source is every delivered ticket, including its `Frame`, acceptance
criteria, `Mines`, and `Out of scope`, plus the live contracts linked by its
Frame. For a GitHub Issue or a direct User request, that complete request and
its linked contracts are the Spec source.

The Standards source is `AGENTS.md` plus only the agent or domain documents
relevant to the diff. Every Standards packet includes the Product invariants and
requires an explicit disposition for **Strict replacement** and **No speculative
fallback**. Skip rules already enforced by repository tooling.

## Finding classes

Every reviewer labels each finding with one class:

- `defect`: wrong observable behavior, an unmet acceptance criterion, or a
  violated linked contract, including a Product invariant of `AGENTS.md`,
  stated with a reachable path;
- `standard`: a violation of a written rule in `AGENTS.md` or the linked
  documents, including duplicated implementation and dead surface;
- `note`: everything else, including hardening, taste, a missing optional test,
  and a hypothetical. A `note` is never fixed in-round.

## Dispatch and park

Reviewers receive the pinned SHAs and only their own source set, never the
implementing agent's reasoning. A reviewer the launcher refuses, or that cannot
take the packet, is reported as undispatched; never replace it with a partial
review. Once collected, record each job in the PR body as
`review: round=<n> role=<role> job=<id> findings=<n>`.

After every reviewer of the current round has launched, park when
`AGENT_RUN_JOB_ID` is set:

```sh
agent-run park --compact
```

Every round parks, the last residual and a defect-only round included: what
comes back is findings to fix, and the reading that produced the candidate is
not what fixing them needs. Park takes no instructions and refuses a piped
brief; the compaction instruction is fixed by the launcher. The resumed session
recovers the sequence from its recorded round, never from a note it wrote
itself. A turn that ends while its reviewers run is parked whether or not it
asked, so a skipped park loses neither the compaction nor the reviewers.

Print the job IDs and end the turn. Collect those jobs only after resume. When
`AGENT_RUN_JOB_ID` is unset, collect them in this session.

## Round 1

Dispatch the `standards` and `spec` roles in parallel, plus `security` when
the profile defines it.

Standards brief:

> Review the pinned diff against the supplied repository standards. Label every
> finding `defect`, `standard`, or `note` as defined. Report each with file,
> hunk, and owning rule. Explicitly report the disposition of every Product
> invariant in AGENTS.md, even when it has no finding. Skip style enforced by
> tools. Under 400 words.

Spec brief:

> Review the pinned diff against the supplied tickets, request, and linked live
> contracts. Label every finding `defect`, `standard`, or `note` as defined.
> Report missing or partial acceptance criteria, unrequested behavior,
> violations of Mines or Out of scope, and contradictions with a linked owner.
> Quote the ticket, request, or contract for each finding. Under 400 words.

Security brief:

> Review the pinned diff for security defects reachable from a public seam.
> Label every finding `defect`, `standard`, or `note` as defined. Quote the
> reachable path for each finding. Under 400 words.

Present each axis separately with its finding count and worst finding.

## Residual rounds

The implementer fixes every `defect` and every mechanical `standard` as one
batch, commits, and pushes. A round with no fix ends the sequence. After a fix
batch, pin the new candidate and dispatch one fresh `residual` reviewer with
both source sets and every earlier finding:

> Verify every earlier finding's disposition and review the complete new
> candidate across Standards and Spec. Label every finding `defect`,
> `standard`, or `note` as defined. Report remaining or newly introduced
> violations with their owning rule or contract. Under 400 words.

Repeat up to `residualRounds` from `agent-run profile`. If a `defect` remains
open after the last round, the implementer fixes it as a defect-only batch and
dispatches one `residual` reviewer over that batch alone; the sequence ends
regardless of the answer.

The sequence creates no Issue; the implementer files them afterwards under
`docs/agents/issue-tracker.md`. The PR is mergeable when the sequence is
complete and no `defect` is open.
