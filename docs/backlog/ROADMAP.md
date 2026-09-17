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
4. **Remote client.** `remote-client/01` after MD Runtime
   `worker-hosted-runtime/01` and `/08`, then `remote-client/02` after
   `worker-hosted-runtime/05`, both once House's `app-runtime/02` and
   `app-runtime/03` in `agentshouse/core` serve the Runtime port and the
   bridge client. Exit: main runs over the client entry against the host
   entry in the browser lane with every Runtime call awaited, shows a
   scripted refusal as its code and fields, and lands a delivered address on
   the Document it names.
5. **Ship.** `shipped-form/01` after MD Runtime `shipped-form/01`,
   `worker-hosted-runtime/04` and `worker-hosted-runtime/07`, and after House
   builds and serves the App. Exit: main built by House from its committed
   tree runs at its path on the control origin over the host's Runtime
   against a real Agents House Building.

## Exit

The release bar is `R036` in `agentshouse/mdruntime`: the main branch of this
repository running over a real Agents House Building through the Agents House
Adapter with no House-specific code outside that Adapter. The release is
declared here once both repositories are green. An example branch never
gates it.
