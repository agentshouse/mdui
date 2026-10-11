# mdui

mdui is the minimal [agents.house](https://agents.house) App that every new App
and Template starts from. It lists the documents of the Room its one `room`
slot binds and updates the list as they change. It is framework-free
TypeScript: `index.html`, `main.ts`, `app.json` and `schema.yaml`.

`main.ts` takes the runtime client House hands the App,
`connectHouseBridge().runtime` from `@agentshouse/app-bridge`; the runtime
package `@agentshouse/mdruntime` describes what the client offers.

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
`npm run publish -- --name "<name>"`.

The package is private, so `npm publish` refuses.

## License

[MIT](LICENSE)
