# Issue tracker: local planned work and GitHub follow-ups

This file owns local-ticket state, body shape, dependency semantics,
publication, and the boundary with GitHub Issues. The machine-readable status
vocabulary, Ownerships, Delivery Tracks, and authored edges live once in
`docs/backlog/backlog.config.json`.

Approved work from `/grill-with-docs -> /h-to-spec -> /h-to-tickets` is tracked
as local markdown tickets. Bugs, concrete review defects, and unrelated
follow-ups discovered outside that shaping flow are tracked as GitHub Issues
under the policy below.

## Layout

- **`to-tickets`** writes to `docs/backlog/tickets/<feature-slug>/`:
  - Ticket: `NN-<slug>.md`. `NN` is a stable file-ordering key inside the
    execution-set namespace and has no scheduling or frontier authority. A
    ticket is referenced by NAME/file, not by number.
  - The folder is an execution set, usually preserving one PRD partition. It is
    not a Stage, Ownership, or Delivery Track.
  - Triage: one `Status:` line at the header. Dependency waiting never changes
    that role; `Status: blocked` records an independent assignment hold, never
    a prerequisite.
  - Nothing else. Ownership assignment and the dependency graph are authored in
    [`backlog.config.json`](../backlog/backlog.config.json), and the compiler
    refuses a ticket that still carries `Ownership:`, `Blocked by:`, `Starts:`,
    `Due:`, or a `## Skills` section.

No symlinks: the cross-cutting views are `Ownership:` metadata and compiled
Delivery Tracks, not the folder layout.

The ledger's §2 queue is the only pending grilling source. "Publish shaped
tickets" means create their local files, assign every open ticket to a Delivery
Track, and pass the set through `/h-audit tickets`. "Publish a follow-up" means
create a GitHub Issue.

## Status

The authored `statuses` array in `docs/backlog/backlog.config.json` validates
these values:

| Value | Meaning |
| --- | --- |
| `needs-triage` | The maintainer must assess it |
| `needs-info` | The reporter must clarify it |
| `blocked` | Assignment is withheld for a reason outside the dependency graph |
| `ready-for-agent` | Fully specified and eligible for agent dispatch when on the frontier |
| `ready-for-human` | Requires human execution |
| `wontfix` | Will not be done |
| `resolved` | Delivered on the default branch; terminal and able to unblock dependents |

Dependency waiting never changes status. A ticket outside the frontier can
remain `ready-for-agent` or `ready-for-human`. During delivery, the implementing
branch sets its tickets to `resolved` before opening the PR. That branch-local
state is provisional: the default branch still carries the prior status, an
abandoned branch has no tracker effect, and only merge makes `resolved`
authoritative for dependents.

Open GitHub Issues use `needs-triage`, `needs-info`, `blocked`,
`ready-for-agent`, `ready-for-human`, and `wontfix` when one of those workflow
roles applies. A delivered GitHub Issue is closed rather than receiving a
`resolved` label.

## Working vocabulary

| Term | Answers | Naming and authority |
| --- | --- | --- |
| **Delivery Track** | Which outcome has a correct next ticket now, or where will that outcome pause later? | A stable kebab-case id and a compact noun-phrase title. Its `outcome` owns the complete result sentence. Defined in `backlog.config.json`. |
| **Execution set** | Which shaping/specification partition produced this ticket? | The folder under `tickets/`. Its slug is a stable ticket-id namespace, not a current work direction. |
| **Ownership** | Which capability owns the changed behavior? | Stable capability vocabulary from `backlog.config.json`; independent of order and readiness. |
| **Ticket** | What closed implementation question can one agent own? | `NN-<specific-outcome>.md`; its header owns only status. |
| **Dependency** | What must be merged before this ticket can correctly start? | Track order for a same-Track prerequisite; an authored `delivery.dependencies` edge for everything else. |
| **Claim** | Who is working on this ticket right now? | An append-only event in `backlog-planner`, taken by `npm run ops -- backlog claim` or a board click and released by `npm run ops -- backlog release` or by `npm run ops -- merge`. It is coordination state, never repository state. |
| **Assignment** | Which tickets does one `/h-implement` invocation deliver? | One branch, one worktree, one PR, one review sequence. |
| **Slot** | How much work does the Master keep in flight? | One concurrent Assignment; `slots` in the run profile. |
| **Sitting** | What does one Master session span? | From its first dispatch to its report. |
| **Run profile** | Which provider and model play which role? | The file named by `AGENT_RUN_PROFILE`, resolved by `agent-run`. |
| **Finding class** | Must this finding be fixed in-round? | `defect`, `standard`, or `note`, assigned by the reviewer. |
| **Residual** | What did the delivery leave unfixed on purpose? | A finding listed in the PR body with its class and disposition. |

### Naming discipline

- Track titles use one to three domain nouns, normally no more than 28 characters.
  Do not repeat `build`, `complete`, `add`, `prepare`, or `prove`; the outcome
  sentence says what done means.
- A new execution-set slug uses the shortest stable specification name that remains
  unambiguous. It never contains a status, date, priority, or current blocker.
- Existing execution-set slugs are canonical ticket namespaces. Do not rename one only to
  shorten the file tree; change it only when the specification partition itself was wrong and
  every ticket identity and inbound reference is deliberately migrated.
- Ticket titles stay explicit and verb-led because they are delegation briefs, not navigation
  labels.
- Dependency, status, and sequence language never belongs in a title. Those facts stay in the
  ticket header and compiled Track graph.

## Ticket shape

Use this exact body shape:

```markdown
# <NN>-<slug> - <Ticket title>

Status: ready-for-agent

## Frame

The PRD, R-items, ADRs, and adjacent work this ticket rests on.

## What to build

The end-to-end behavior this ticket makes work.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Mines

Invariants, plausible traps, and authority boundaries.

## Out of scope

What a reader might reasonably assume is included and is not.
```

`Status:` is the only required header field. Avoid implementation file paths and
code snippets. A decision-rich prototype fragment may be included when prose
would be less precise; trim it to the contract it demonstrates.

Everything else lives once in
[`backlog.config.json`](../backlog/backlog.config.json): the allowed Ownerships,
statuses and descriptions, the Delivery Tracks, `delivery.ownership` mapping each
live ticket to one Ownership, and `delivery.dependencies` holding the edges Track
order cannot express. A ticket cannot be published alone: without a Track
placement the compiler fails with `open tickets without a Track`, and without an
Ownership entry it fails with `open ticket has no Ownership`.

Resolved and wontfix history that predates the Ownership taxonomy may remain
unclassified only when named in
[`historical-unclassified.txt`](../backlog/historical-unclassified.txt).
Reopening one of those tickets requires classifying it first.

## Frontier and execution order

The **dependency frontier** is every open ticket whose prerequisites - its Track
predecessor and its authored edges - are all `resolved`. It describes technical
possibility. The **Track frontier** is every Track whose first open ticket has no
unresolved dependency. The board shows those available Tracks. Before invoking
`/h-implement`, the User or dispatching agent verifies that every assigned ticket
is `ready-for-agent` and that the assignment begins at the frontier. A
multi-ticket delivery may continue through the contiguous tickets that become
reachable on the same branch. The implementing agent trusts that dispatch and
does not recompute admission.

Independently, the User may Claim any non-terminal ticket regardless of its
status, blockers, or Track position. A Claim records coordination only and never
authorizes implementation, changes status, changes a dependency, or moves the
frontier. `/h-implement` claims its tickets first and `ops merge` releases
them; a Claim is otherwise released explicitly, or automatically once the next
snapshot reports its ticket resolved.

A Delivery Track is an ordered ticket chain with one outcome. It may cross
execution-set folders and Ownership boundaries. Every open ticket belongs to
exactly one Track. Cross-Track dependencies come from the authored
`delivery.dependencies` edges. Only dependencies of the first open ticket block
the Track now. Dependencies of later tickets are forecast as later seams.

`npm run ops -- backlog frontier` computes the frontier through the same
compiler that generates [state.json](../backlog/state.json). It prints all
available Tracks with their next tickets and later seams, every Track blocked at
its next ticket, attention Tracks, and the longest unresolved ticket chain. It
fails on a missing Track assignment, a missing Ownership, an unknown dependency
reference, a ticket cycle, or an authored edge a Track's own order already
expresses. It never recommends a Track or selects parallel tickets.

An authored edge asserts one thing: this work cannot correctly start until that
ticket merged. Personal preference is the User's Track choice, not an authored
edge. Where two tickets truly can run concurrently but share a port, say so in
the `## Mines` of both.

`delivery.dependencies` names both endpoints by canonical `<execution-set>/<ticket>`
id. The compiler resolves those ids to canonical ticket identities, rejects
missing targets and cycles, removes already-resolved dependencies from the
current frontier, and maps the first open ticket's remaining cross-Track edges
to the current blocker list.

The repository's planner project slug lives in
[`planner-project`](../backlog/planner-project) so this board stays distinct from
any other repository sharing the same planner host.

## GitHub Issues from a delivery

The implementing agent files Issues at the end of the review sequence, one per
concrete finding, after searching for an open duplicate. Reviewers and the
Master file nothing.

Filed:

- a `defect` outside the assignment, or still open after the sequence;
- a cleanliness finding that names the surfaces and the action, such as
  duplicated implementation at two named places or a named module to rewrite;
- separately planned work with no shaping owner.

Never filed: a `note`, missing optional evidence, reviewer uncertainty, generic
hardening, a hypothetical without a reachable path, a duplicate, or anything
already listed under the PR's `## Residuals`. Missing required acceptance
evidence means the delivery is not complete, never an Issue.

A later repair PR names and closes the Issue as part of delivery.

## Local status views

`state.json`, `INDEX.md`, and `OWNERSHIP.md` are operator-local derived views.
They use the compiled backlog state, are gitignored, and never belong in an
agent's branch or delivery workflow. The `backlog-planner` board is the
coordination view: it holds Claims and action requests, which are never written
back to the repository. Agents work from the authored ticket headers and the
authored plan in `backlog.config.json`.

## Relation to the backlog layout

`ROADMAP.md` stays as the thinking and build-order layer. Stable Ownership lives
in the Ownership catalog. Selected execution order lives in Delivery Tracks.
Shaped execution work runs through local `tickets/`; incidental follow-up work
runs through GitHub Issues.
