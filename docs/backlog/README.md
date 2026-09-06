# Backlog: ownership, Delivery Tracks, and executable work

The backlog has four independent axes:

- a ticket folder preserves one PRD or execution-set partition;
- Ownership names the stable capability owner;
- Delivery Tracks cover every open ticket with finite ordered outcome chains;
- authored cross-Track dependencies say what a Track's own order does not.

The generated [INDEX](INDEX.md) is the human status view. Generated
[state.json](state.json) is the machine-readable snapshot. Ownership definitions
and routing rules are rendered in [OWNERSHIP](OWNERSHIP.md). The complete Track
graph is rendered in [INDEX](INDEX.md) and in the `backlog-planner` board, which
`npm run ops -- backlog push` publishes.

Build order and exit criteria live in [ROADMAP.md](ROADMAP.md). Ticket state,
claims, and the GitHub Issue boundary live in
[`docs/agents/issue-tracker.md`](../agents/issue-tracker.md).

## Cycle

1. **Shape.** A product question that needs shaping follows
   `/grill-with-docs -> /h-to-spec -> /h-to-tickets`. Decisions that change the
   product contract become an R-item in
   `docs/requirements/ledger.md` of `agentshouse/mdruntime`.
2. **Build.** Approved shaped work runs through the ticket, dispatch, delivery,
   and follow-up rules in
   [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md).
3. **Harvest.** Once implemented, apply the tracker transition.

## Rules

- **Ownership routing.** The generated [OWNERSHIP](OWNERSHIP.md) catalog is the
  human reference; its sole authored source is `backlog.config.json`.
- **Every open ticket has one Delivery Track.** A Track may cross PRD
  execution-set folders and Ownership boundaries to reach one observable
  result. Its ticket list is execution order, not a copy of a folder.
- **Order is authored once.** A Track is an ordered chain, so ticket N is
  blocked by ticket N-1 without anyone writing that edge. Only edges a Track's
  own order cannot express are authored, in `delivery.dependencies`; authoring
  one the Track already orders is a compiler error. A Track's current blockers
  come only from its first open ticket; later cross-Track seams are shown
  without blocking it.
- **External waits are Mines, not edges.** A wait on another repository has no
  local ticket id. Record it in `## Mines`. `Status: blocked` is the assignment
  hold when that wait must stop dispatch.

## Commands

```text
npm run ops -- backlog frontier
npm run ops -- backlog frontier --dispatch
npm run ops -- backlog sync
npm run ops -- backlog claim <ticket>
npm run ops -- backlog release <ticket>
npm run ops -- backlog push
```
