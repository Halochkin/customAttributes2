function getProp(e, props) {
  for (let prop of props) {
    e = e[prop]
    if (e === undefined)
      return;
  }
  return e;
}

function eGetter(props) {
  return e => getProp(e, props);
}

function thisGetter(props) {
  return function () {
    return getProp(this, props);
  };
}

function windowGetter(props) {
  return _ => getProp(window, props);
}

function normalizePath(props) {
  const getter = props[props.length - 1] === "" ? !props.pop() : false;
  return {props: props.map(ReactionRegistry.toCamelCase), getter};
}

// function getProp2(props, e, p, prop) {
//   for (prop of props) {
//     p = e;
//     if (p === undefined)
//       break;
//     e = p[prop];
//   }
//   return {p, e, prop};
// }

function makeCaller(root, props) {
  return function (e, _, ...args) {
    e = root === "e" ? e : root === "this" ? this : window;
    let p, prop;
    for (prop of props) {
      p = e;
      if (!p)
        return;
      e = p[prop];
    }
    // let {p, e, prop} = getProp2(props, root === "e" ? e : root === "this" ? this : window);
    // return !p ? undefined :
    return e instanceof Function ? e.call(p, ...args) :
      !args.length ? e :                              //getter
        p[prop] = args.length === 1 ? args[0] : args; //setter
  };
}

function getSetOrCall(root, ...more) {
  const {props, getter} = normalizePath(more);
  return !getter ? makeCaller(root, props) :
    root === "e" ? eGetter(props) :
      root === "this" ? thisGetter(props) :
        windowGetter(props);
}

customReactions.defineRule("window", getSetOrCall);
customReactions.defineRule("this", getSetOrCall);
customReactions.defineRule("e", getSetOrCall);
customReactions.defineRule("console", function (...more) {
  return customReactions.getDefinition("window." + more.join("."));
});

customTypes.defineAll({
  true: true,
  false: false,
  window: window,
  document: document,
  null: _ => null,
  undefined: _ => undefined,
  e: e => e,
  this: function () {
    return this;
  },
});
customTypes.defineRule("e", (e, ...part) => eGetter(part.map(ReactionRegistry.toCamelCase)));
customTypes.defineRule("this", (t, ...part) => thisGetter(part.map(ReactionRegistry.toCamelCase)));
customTypes.defineRule("window", (w, ...part) => windowGetter(part.map(ReactionRegistry.toCamelCase)));