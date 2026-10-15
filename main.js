// node_modules/@agentshouse/app-bridge/dist/index.js
var houseBridge = () => globalThis.houseBridge;

// render.ts
function renderRooms(main2, rooms2, query) {
  if ("pending" in query) {
    main2.replaceChildren();
    return;
  }
  const documents2 = query.documents;
  main2.replaceChildren(
    ...rooms2.filter((room) => room.roomVersion !== null).map((room) => {
      const heading = document.createElement("h1");
      heading.textContent = room.name;
      const list = document.createElement("ul");
      list.append(
        ...documents2.filter((document2) => document2.room === room.locator).map((held) => {
          const item = document.createElement("li");
          item.textContent = held.path;
          return item;
        })
      );
      const section = document.createElement("section");
      section.append(heading, list);
      return section;
    })
  );
}

// main.ts
var runtime = await houseBridge().runtime;
var rooms = await runtime.observe("rooms");
var documents = await runtime.observe("query", { select: {}, orderBy: [{ by: "path" }] });
var main = document.querySelector("main");
function render() {
  renderRooms(main, rooms.current(), documents.current());
}
rooms.subscribe(render);
documents.subscribe(render);
render();
