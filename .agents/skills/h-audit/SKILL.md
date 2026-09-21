---
name: h-audit
description: Run one fresh read-only audit through the audit role, either of a published ticket set (`tickets`) or of requirement consistency after a decision changed (`requirements`).
---

<!-- house: vendored from agentshouse/house — md/skills/h-audit/SKILL.md (channel md).
Do not edit this copy. Edit it in `house`, then run `npm run ops -- house sync`. -->

# Audit

Invoke as `/h-audit tickets` or `/h-audit requirements [R-items...]`. Each
scope runs as one fresh read-only agent launched through
`agent-run start --role audit`, never inside the authoring session. The auditor
edits nothing and files no Issue. Its whole answer is findings; a clean run is
the one line `audit <scope>: clean`.

Send the auditor the output contract below, the paths its scope names, and the
scope's check list verbatim. Collect the job and print its findings unchanged.

Every finding carries:

- **level**: `decision owner`, `PRD translation`, `ticket decomposition`, or
  `backlog placement`, naming where the problem arose;
- **sources**: the conflicting lines quoted with their paths;
- **resolution**: one proposed change.

## `tickets`

Reads the whole set against the PRD, `docs/backlog/backlog.config.json`, and
the live owners the tickets' Frames link. It reports:

- a settled requirement no ticket covers;
- an acceptance criterion or requirement with no source in the PRD or a live
  owner;
- a slice cut by file or layer rather than as a tracer bullet;
- a Track order or authored edge that is not a real cannot-start-before, a
  missing hard dependency, or a preference edge;
- potentially parallel tickets that collide on write surfaces, producer or
  consumer interfaces, schema, migrations, generated artifacts, shared test
  infrastructure, or shared contracts;
- a ticket that does not fit one implementation context and one review;
- tickets that must land together, or must not, left unnamed;
- an acceptance criterion without an observable seam;
- a ticket that preserves a superseded state, a dual implementation, a
  speculative fallback, or a dead surface.

The compiler already refuses cycles, dangling edges, unassigned tickets, and
missing Ownership; the auditor does not repeat those checks, and it does not
declare unfamiliar existing code dead.

## `requirements`

Runs when the User has changed a decision, before `/h-audit tickets` and never
per dispatch. Seed the auditor with
`git diff origin/main -- docs/requirements docs/prd docs/adr` plus any R-item
named in the arguments. It reads only the affected chain: decision owners,
PRDs, glossary entries, tickets, and backlog placement. It reports:

- a PRD contradicting a newer owner;
- a ticket resting on a cancelled decision;
- a requirement not propagated to a neighbouring PRD;
- two owners answering one question differently;
- backlog work a new decision made unnecessary;
- a new ticket duplicating or conflicting with an open one.
