function eGetter(props) {
  return function (e) {
    for (let prop of props) {
      e = e[prop]
      if (e === undefined)
        return e;
    }
    return e;
  };
}

function thisGetter(props) {
  return function () {
    let e = this;
    for (let prop of props) {
      e = e[prop]
      if (e === undefined)
        return e;
    }
    return e;
  };
}

function windowGetter(props) {
  return function () {
    let e = window;
    for (let prop of props) {
      e = e[prop]
      if (e === undefined)
        return e;
    }
    return e;
  };
}

function normalizePath(props) {
  if (props[0] !== "e" && props[0] !== "this" && props[0] !== "window")
    props.unshift("window");
  const root = props.shift();
  const getter = props[props.length - 1] === "" ? !props.pop() : false;
  return {root, props: props.map(ReactionRegistry.toCamelCase), getter};
}

customReactions.defineRule(function (reaction) {
  const parts = reaction.split(".");//todo this is too wide, I think that e., this., window., should be required.
  if (parts.length < 2)
    return;
  let {props, root, getter} = normalizePath(parts);
  if (getter)
    return root === "e" ? eGetter(props) :
      root === "this" ? thisGetter(props) :
        windowGetter(props);
  return function (e, _, ...args) {
    let p = root === "e" ? e : root === "this" ? this : window;
    for (let i = 0; i < props.length - 1; i++) {
      p = p[props[i]];
      if (p === undefined)
        return;
    }
    e = p[props[props.length - 1]];
    return e instanceof Function ? e.call(p, ...args) :
      args.length > 0 ? (p[props[props.length - 1]] = args.length === 1 ? args[0] : args) : //setter
        e;
  };
});

customTypes.defineAll({
  true: true,
  false: false,
  null: null,
  window: window,
  document: document,
  undefined: _ => undefined,
  e: e => e,
  this: function () {
    return this;
  },
});
customTypes.defineRule(part => isNaN(part) ? undefined : Number(part));
customTypes.defineRule(function (part) {
  let parts = part.split(".");
  if (parts.length < 2)
    return;
  const {root, props} = normalizePath(parts);
  return root === "e" ? eGetter(props) :
    root === "this" ? thisGetter(props) :
      windowGetter(props);
});
// customTypes.defineRule(part => part.indexOf(".") >0 ?
//   windowGetter(part.split(".").map(ReactionRegistry.toCamelCase)) : undefined);
// customTypes.defineRule(part => part.startsWith(".") ?
//   windowGetter(part.substring(1).split(".").map(ReactionRegistry.toCamelCase)) : undefined);
// customTypes.defineRule(part => part.startsWith("e.") ?
//   eGetter(part.substring(2).split(".").map(ReactionRegistry.toCamelCase)) : undefined);
// customTypes.defineRule(part => part.startsWith("this.") ?
//   thisGetter(part.substring(5).split(".").map(ReactionRegistry.toCamelCase)) : undefined);
// customTypes.defineRule(part => part.startsWith("window.") ?
//   windowGetter(part.substring(7).split(".").map(ReactionRegistry.toCamelCase)) : undefined);