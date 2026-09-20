---
name: h-to-tickets
description: Break an accepted PRD, plan, or settled conversation into this repository's tracer-bullet tickets and Delivery Tracks, audited by a fresh agent before the User commits them.
---

<!-- house: vendored from agentshouse/house — md/skills/h-to-tickets/SKILL.md (channel md).
Do not edit this copy. Edit it in `house`, then run `npm run ops -- house sync`. -->

# To Tickets

## Gather context

Use the settled conversation and any supplied PRD, issue, or plan. Read referenced
material in full. Use glossary vocabulary and honor the current decision owners
in scope. Explore the built code only when the existing seams are not already
clear.

## Draft vertical slices

Break the work into tracer-bullet tickets:

- Each slice cuts a narrow but complete path through every affected layer.
- A completed slice is independently demoable or verifiable.
- Each slice fits one fresh implementation context.
- A preparatory refactor is its own ticket only when it leaves one current
  implementation and independently satisfies a verifiable done criterion.

Place every ticket in one Delivery Track, assign its Ownership, order the Track,
and identify only genuine cross-Track waits. The execution-set folder preserves
the shaping partition; it does not own current execution order.

For a wide replacement that cannot remain green as independent slices, apply
**Strict replacement** from `AGENTS.md` at every review and merge boundary.
Internal commits may stage the rewrite, but no delivered candidate retains old
and new forms, aliases, compatibility readers, transitional branches, or a
disabled former path. If the replacement cannot fit one delivery, return it to
shaping instead of publishing a transitional sequence.

## Publish

Read `docs/agents/issue-tracker.md` and use its exact ticket layout, dependency
semantics, status, and publication rules. Write each ticket under
`docs/backlog/tickets/<execution-set>/`, then update
`docs/backlog/backlog.config.json` with its Ownership, Track placement, and any
cross-Track dependency.

Run `npm run ops -- backlog sync` and fix what it refuses. A ticket set that does
not compile is not published. Do not close or modify a parent GitHub Issue.

## Audit

Launch `/h-audit tickets` over the set through `agent-run start --role audit`
and collect its findings. A finding is mechanical when its proposed resolution
changes no requirement, scope, or dependency meaning: fix it yourself and rerun
`npm run ops -- backlog sync`. Show every other finding to the User with its
level. Commit nothing: the User's commit on `main` is the approval.
