// node_modules/@agentshouse/app-bridge/dist/index.js
var houseBridge = () => globalThis.houseBridge;

// render.ts
var shown = /* @__PURE__ */ new WeakMap();
function renderStopped(main2, said, retry) {
  const alert = document.createElement("p");
  alert.setAttribute("role", "alert");
  alert.textContent = said;
  if (retry === null) {
    main2.replaceChildren(alert);
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Try again";
  button.addEventListener("click", retry);
  main2.replaceChildren(alert, button);
}
var unbound = /* @__PURE__ */ new WeakMap();
function renderUnbound(main2, choose2) {
  const drawn = main2.firstElementChild;
  if (drawn !== null && unbound.get(drawn) === choose2) return;
  const note = document.createElement("p");
  note.textContent = "No Room is chosen yet.";
  unbound.set(note, choose2);
  if (choose2 === null) {
    main2.replaceChildren(note);
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Choose Rooms";
  button.addEventListener("click", choose2);
  main2.replaceChildren(note, button);
}
function renderRooms(main2, rooms, query, selected2, select, choose2) {
  if ("pending" in query) {
    main2.replaceChildren();
    return;
  }
  if (rooms.length === 0) {
    renderUnbound(main2, choose2);
    return;
  }
  const documents = query.documents;
  const focus = document.activeElement;
  const focused = focus && main2.contains(focus) ? shown.get(focus) : void 0;
  let refocus;
  main2.replaceChildren(
    ...rooms.filter((room) => room.roomVersion !== null).map((room) => {
      const heading = document.createElement("h1");
      heading.textContent = room.name;
      const list2 = document.createElement("ul");
      list2.append(
        ...documents.filter((document2) => document2.room === room.locator).map((held) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = held.path;
          shown.set(button, held);
          if (held.room === focused?.room && held.path === focused.path) refocus = button;
          if (held.room === selected2?.room && held.path === selected2.path) {
            button.setAttribute("aria-current", "true");
          }
          button.addEventListener("click", () => {
            main2.querySelector("[aria-current]")?.removeAttribute("aria-current");
            button.setAttribute("aria-current", "true");
            select({ room: held.room, path: held.path });
          });
          const item = document.createElement("li");
          item.append(button);
          return item;
        })
      );
      const section = document.createElement("section");
      section.append(heading, list2);
      return section;
    })
  );
  refocus?.focus({ preventScroll: true });
}

// main.ts
function refused(refusal2, retry) {
  const codes = refusal2.refusal === null ? refusal2.code : `${refusal2.code}: ${refusal2.refusal.code}`;
  return {
    said: `House refused the connection (${codes}).`,
    retry: refusal2.retryable ? retry : null
  };
}
function codeOf(error) {
  const held = error;
  return typeof held?.code === "string" ? held.code : String(error);
}
function failed(error) {
  const held = error;
  return {
    said: `mdui could not start (${codeOf(error)}).`,
    retry: held?.retryable === true ? () => location.reload() : null
  };
}
var bridge = houseBridge();
var main = document.querySelector("main");
var refusal = null;
var failure = null;
var list = null;
var selected = null;
var chooser = null;
function render() {
  const stop = refusal ?? failure;
  if (stop === null) {
    list?.();
    return;
  }
  renderStopped(main, stop.said, stop.retry);
}
function fail(error) {
  failure = failed(error);
  render();
}
function choose() {
  if (chooser === null) return;
  bridge.ceremony(`/bind/${encodeURIComponent(chooser)}?slot=room`).catch((error) => {
    failure = { said: `House did not open the choice of Rooms (${codeOf(error)}).`, retry: null };
    render();
  });
}
bridge.onStatus((status) => {
  const next = status.credential.state === "held" ? status.app : null;
  if (next === chooser) return;
  chooser = next;
  render();
});
async function start() {
  const runtime = await bridge.runtime;
  const refusals = await runtime.observe("connection-refusal");
  const follow = (held) => {
    refusal = held === null ? null : refused(held, () => void runtime.retry().catch(fail));
    render();
  };
  refusals.subscribe(follow);
  follow(refusals.current());
  const rooms = await runtime.observe("rooms");
  const documents = await runtime.observe("query", { select: {}, orderBy: [{ by: "path" }] });
  list = () => renderRooms(
    main,
    rooms.current(),
    documents.current(),
    selected,
    (document2) => {
      selected = document2;
    },
    chooser === null ? null : choose
  );
  rooms.subscribe(render);
  documents.subscribe(render);
  render();
}
start().catch(fail);
