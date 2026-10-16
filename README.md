# mdui

mdui is the minimal [agents.house](https://agents.house) App that every new App
and Template starts from. It lists the documents of the Room its one `room`
slot binds and updates the list as they change. It is framework-free
TypeScript: `index.html`, `main.ts`, `app.json` and `schema.yaml`.

`main.ts` takes the runtime client House hands the App,
`houseBridge().runtime` from `@agentshouse/app-bridge`; the runtime
package `@agentshouse/mdruntime` describes what the client offers. House's
`find_command` "App" is the guide to building an App or a Site from mdui.

A click selects a document. `main.ts` registers `houseBridge().cooperate`, so
a newer release of the App takes over the open page with the same document
selected and the list scrolled where it was; the bridge's `docs/families.md`
describes that contract.

When House refuses the connection or the runtime fails to start, the page
shows the code it received, known or not, in place of the list, offers Try
again, which reloads the page, only when that refusal or failure is
retryable, and its `ready()` answers `false`.

## Build

```sh
npm ci
npm run build
npm test
```

`npm run build` writes `dist/` with the built files and `app.json` and
`schema.yaml` at its root. `npm test` builds the App and runs it against the
runtime's in-memory adapter.

## Publish

Commit your change, then run:

```sh
npm run publish
```

It refuses while the working tree holds uncommitted changes. Otherwise it
builds, then pushes `main` and the build, as one new commit without parents on
`release`, to `origin` in one atomic push, and prints the remote's answer. The
App's House repository publishes the `release` it receives. In a clone of
House's `app/new.git`, the push that creates the App names it:
`npm run publish -- --name "<name>"`. It prints the App's `.git` address;
point `origin` there with `git remote set-url origin <address>` before the next
publish.

The package is private, so `npm publish` refuses.

## License

[MIT](LICENSE)
