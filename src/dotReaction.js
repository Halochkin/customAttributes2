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
  return () => getProp(window, props);
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

customReactions.defineRule(function (reaction) {
  if (!reaction.startsWith("window."))
    return;
  const {props, getter} = normalizePath(reaction.substring(7).split("."));
  return getter ? windowGetter(props) : makeCaller("window", props);
});
customReactions.defineRule(function (reaction) {
  if (!reaction.startsWith("this."))
    return;
  const {props, getter} = normalizePath(reaction.substring(5).split("."));
  return getter ? thisGetter(props) : makeCaller("this", props);
});
customReactions.defineRule(function (reaction) {
  if (!reaction.startsWith("e."))
    return;
  const {props, getter} = normalizePath(reaction.substring(2).split("."));
  return getter ? eGetter(props) : makeCaller("e", props);
});
customReactions.define("console.log", (e, _, ...args) => console.log(...args));

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
customTypes.defineRule(part => isNaN(part) || part === "" ? undefined : Number(part));
customTypes.defineRule(part => part.startsWith("e.") ?
  eGetter(part.substring(2).split(".").map(ReactionRegistry.toCamelCase)) : undefined);
customTypes.defineRule(part => part.startsWith("this.") ?
  thisGetter(part.substring(5).split(".").map(ReactionRegistry.toCamelCase)) : undefined);
customTypes.defineRule(part => part.startsWith("window.") ?
  windowGetter(part.substring(7).split(".").map(ReactionRegistry.toCamelCase)) : undefined);