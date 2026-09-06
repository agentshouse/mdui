# Roadmap

This roadmap selects capability sequence and candidate exit criteria. It does
not own product behavior, terminology, implementation design, ticket state, or
ticket dependency edges.

## Sequence

Ticket paths and edges are owned by
[`backlog.config.json`](backlog.config.json); this is the order in which the
sets are worked. Waits on `agentshouse/mdruntime` are recorded in each
ticket's Mines.

1. **Stand the repository.** `foundation/01`, once `foundation/01` in
   `agentshouse/mdruntime` has laid the MD Runtime and Adapter packages this
   repository consumes.
2. **Components.** `components/01` after MD Runtime `runtime/03`, then
   `components/02` after `runtime/07` and `components/03` after `runtime/06`.
   Exit: Document View reads and edits a fixture Room over the in-memory
   Adapter in the browser lane, and a refused Change Batch reopens the Draft.
3. **Screens.** `components/04` after `runtime/08`. Exit: the main branch
   runs end to end over the in-memory Adapter in the browser lane with the
   launch promises kept.
4. **Ship.** `shipped-form/01` after MD Runtime `shipped-form/01` and
   `agents-house-adapter/02`. Exit: main builds to a static bundle with its
   policy and runs over a real Agents House Building.

## Exit

The release bar is `R036` in `agentshouse/mdruntime`: the main branch of this
repository running over a real Agents House Building through the Agents House
Adapter with no House-specific code outside that Adapter. The release is
declared here once both repositories are green. An example branch never
gates it.
