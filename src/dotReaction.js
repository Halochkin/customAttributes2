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
  const getter = props[props.length - 1] === "" ? !props.pop() : false;
  return {props: props.map(ReactionRegistry.toCamelCase), getter};
}

function makeCaller(root, props) {
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
customTypes.defineRule(part => part.startsWith("e.") ?
  eGetter(part.substring(2).split(".").map(ReactionRegistry.toCamelCase)) : undefined);
customTypes.defineRule(part => part.startsWith("this.") ?
  thisGetter(part.substring(5).split(".").map(ReactionRegistry.toCamelCase)) : undefined);
customTypes.defineRule(part => part.startsWith("window.") ?
  windowGetter(part.substring(7).split(".").map(ReactionRegistry.toCamelCase)) : undefined);