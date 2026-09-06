---
name: h-tdd
description: 'Apply this repository test policy as a red-green vertical-slice loop with no confirmation round.'
---

# Test-Driven Development

Read `docs/agents/TESTING.md` and execute its slice loop for each ticket
acceptance criterion. That document is the single owner of seams, test quality,
cadence, breadth, and evidence.

The dispatcher has already admitted the ticket, so do not ask the User to confirm
its seams. Record the chosen seams in the PR body, then return the completed
slices to `/h-implement` for its author check and reviewable candidate.
