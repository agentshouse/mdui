# Artifact authoring discipline

Repository knowledge has one editable owner per fact. Other documents link to
that owner and add only the context their own layer owns. Decisions about
MD App are owned in `agentshouse/mdruntime`; this repository authors tickets,
built state, and its own workflow documents.

## Owner map

| Concern | Canonical owner |
| --- | --- |
| Domain terminology | `agentshouse/mdruntime` `CONTEXT.md` |
| Product requirements | `agentshouse/mdruntime` `docs/requirements/ledger.md` |
| Hard-to-reverse engineering trade-offs | `agentshouse/mdruntime` `docs/adr/` |
| Feature scope, behavior, invariants, and gates | `agentshouse/mdruntime` `docs/prd/` |
| One Provider's fit with the Room Contract | `agentshouse/mdruntime` `docs/providers/` |
| Built state | `ARCHITECTURE.md` |
| Ticket state, body shape, dependency semantics, and publication boundary | `docs/agents/issue-tracker.md` |
| Audit scopes, checks, and finding output | `.agents/skills/h-audit/SKILL.md` |
| Machine-readable statuses, Ownerships, Delivery Tracks, and authored edges | `docs/backlog/backlog.config.json` |
| Test seams, quality, cadence, and breadth | `docs/agents/TESTING.md` |
| Repository-wide routing and invariants | `AGENTS.md` |
| One invoked workflow's lifecycle mechanics | That invoked `h-*` skill |
| Capability sequence and exit selection | `docs/backlog/ROADMAP.md` |

The chain is `decision → PRD → ticket → delivery`. Each layer states only what
it decides:

- an R-item owns the current product contract and operative rationale;
- an ADR owns a hard-to-reverse engineering trade-off within that contract;
- a PRD owns feature scope, behavior, invariants, and gates;
- a ticket owns one closed implementation question, acceptance criteria, and
  mines;
- the authored backlog owns placement, capability ownership, and execution
  edges.

## Conflicts and missing authority

When documents disagree, use `agentshouse/mdruntime` `CONTEXT.md` and then the
current decision owner. Fix a same-concern conflict at its canonical owner and
replace duplicate prose elsewhere with a link. Return only unresolved product or
domain choices to that repository's `docs/requirements/ledger.md` §2; workflow,
testing, tracker, and formatting conflicts return to the owner named above.

If a required concept has no owner, stop rather than inventing a plausible rule.
Use `/domain-modeling` in `agentshouse/mdruntime` for a vocabulary or
qualifying decision gap and the shaping flow there for an unsettled product
contract.

## Numbering

PRDs and ADRs are not authored here. Ticket paths and numbering are owned by
`docs/agents/issue-tracker.md`.

## Style

- Use the glossary's term. Add a missing resolved term there before using it.
- State the current contract, not a session transcript or prediction.
- Link to a neighboring owner instead of paraphrasing it.
- Use a table when more than three parallel items materially benefit from one.
