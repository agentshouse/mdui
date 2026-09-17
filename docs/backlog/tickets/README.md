# Tickets

Approved executable tickets, grouped by execution set. Each set is usually one
PRD partition. Placement, Ownership, and edges live in
[`../backlog.config.json`](../backlog.config.json). See
[`../../agents/issue-tracker.md`](../../agents/issue-tracker.md). The PRDs
these tickets rest on live in `agentshouse/mdruntime`; waits on that
repository are recorded in each ticket's Mines.

- [`foundation/`](foundation/) stands the workspace.
- [`components/`](components/) builds the custom elements, Document View, and
  the screens of main.
- [`remote-client/`](remote-client/) moves main onto the remote client of
  the Provider's Runtime host and onto structured refusals, and gives it the
  shell's address and Presentation State.
- [`shipped-form/`](shipped-form/) builds the bundle, writes the agent
  instructions, and declares the release.
