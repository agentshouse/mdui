# 01-bundle-build-agent-instructions-and-release - Bundle build, agent instructions, and release

Status: blocked

## Frame

Rests on PRD-0005 in `agentshouse/mdruntime`
(`docs/prd/prd-0005-shipped-form-and-release.md`) sections The bundle,
Instructions for the App Creator's agent, and License and release, and on
`R029`, `R034`, and `R036`. It builds the main branch of `components/04`
over the published packages of `agentshouse/mdruntime`.

## What to build

The build that turns main into a static bundle: the Provider origin, the
Adapter, the required guarantees the App declares, the App Creator's
connection allowlist, and the App's own origin are build inputs, and the
output carries a Content Security Policy allowing connections only to the
origins the Adapter package declares plus that allowlist, and serves at the
App's origin the client identity document the Adapter declares, with the
App's redirect URI. A written agent instruction file at the root
stating the MD Runtime API, the Draft, Save, and outcome rules, the
neutrality rule, the content-safety rules, the launch promises main keeps,
what an agent must never do, and that the agent works in a fork with Git:
obtain the App Repository, change it, build, push. The MIT license file at
the root. The release seam: main running over a real Agents House Building
through the Agents House Adapter, observed as an App Creator would.

## Acceptance criteria

- [ ] Building main yields static files whose policy contains exactly the
      Adapter's declared origins and the configured allowlist, whose
      Provider origin is the configured one, and which carry the client
      identity document at the path the Adapter declares with the configured
      App origin and redirect URI; the output runs from a plain static server
      with no MD App server.
- [ ] The repository root carries the agent instruction file with the listed
      content and the MIT license file.
- [ ] The neutrality lane is green on main, and the bundle sends no
      telemetry.
- [ ] Main, served from a public HTTPS origin the User chooses, runs over the
      dev Building through the published Adapter package: the User completes
      the consent once, and Rooms, Search, File with reading and editing,
      Work, and Log are observed working as an App Creator would, which is
      the bar of `R036`.

## Mines

Waits for `shipped-form/01` and `agents-house-adapter/02` in
`agentshouse/mdruntime`, so that the packages the bundle consumes are
published with Mutation and History. House's Auth reads the client identity
document over HTTPS from a public address, so the release bundle needs a
public static host; loopback works only for a local browser lane. Making the repository public and
declaring the release are outward-facing acts; the implementer stops for the
User's confirmation before each. No support matrix, browser matrix, cadence,
or governance file is added. No example branch gates the release.

## Out of scope

Hosting, a scaffolding command, any wrapper for a framework, and any example
branch.
