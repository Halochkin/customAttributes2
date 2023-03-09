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
  if (props[0] === "") props[0] = "window";
  if (props[0] !== "e" && props[0] !== "this" && props[0] !== "window")
    props.unshift("window");
  const root = props.shift();
  const getter = props[props.length - 1] === "" ? !props.pop() : false;
  return {root, props: props.map(ReactionRegistry.toCamelCase), getter};
}

customReactions.defineRule(function (reaction) {
  let parts = reaction.split(".");
  if (parts.length < 2)
    return;
  let {props, root, getter} = normalizePath(parts);
  if(getter){
    return root === "e" ? eGetter(props) :
      root === "this" ? thisGetter(props) :
        windowGetter(props);
  }
  return function (e, _, ...args) {
    e = root === "e" ? e : (root === "this") ? this : window;
    let previous;
    for (let i = 0; i < props.length; i++) {
      let prop = props[i];
      previous = e;
      e = e[prop];
      if (e === undefined && i !== props.length - 1)
        return e;
    }
    if (previous && e instanceof Function)
      return e.call(previous, ...args);
    if (args.length > 0)
      return previous[props[props.length - 1]] = args.length === 1 ? args[0] : args;
    return e;
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