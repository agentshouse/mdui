# mdui

mdui is the minimal [agents.house](https://agents.house) App that every new App
and Template starts from. It lists the documents of the Room its one `room`
slot binds and updates the list as they change; a click selects a document.
While the slot binds none, it says so and offers a signed-in User Choose Rooms,
which opens House's page that binds them at that slot and returns to the App.
It is framework-free TypeScript: `index.html`, `main.ts`, `app.json` and
`schema.yaml`.

`main.ts` takes the runtime client House hands the App,
`houseBridge().runtime` from `@agentshouse/app-bridge`; the runtime
package `@agentshouse/mdruntime` describes what the client offers. House's
`find_command` "App" is the guide to building an App or a Site from mdui.

When House refuses the connection or the runtime fails to start, the page
shows the code it received, known or not, in place of the list. It offers Try
again only when the runtime's refusal or the failure is retryable: a refusal's
asks the runtime to retry, and a failure's reloads the page.

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
