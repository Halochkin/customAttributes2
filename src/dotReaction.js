customReactions.defineRule(function (fullReaction) {
  const reaction = fullReaction.split("_")[0];
  let props = reaction.split(".");
  if (props.length < 2)
    return;
  if (props[0] === "") props[0] = "window";
  if (props[0] !== "e" && props[0] !== "this" && props[0] !== "window")
    props.unshift("window");
  props = props.map(ReactionRegistry.toCamelCase);
  const root = props.shift();
  const getter = props[props.length - 1] === "";
  if (getter) props.pop();
  return function (e, _, ...args) {
    e = root === "e" ? e : (root === "this") ? this : /*window|""*/ window;
    let previous;
    for (let i = 0; i < props.length; i++) {
      let prop = props[i];
      previous = e;
      e = e[prop];
      if (e === undefined && i !== props.length - 1)
        return e;
    }
    if (!getter && previous && e instanceof Function)
      return e.call(previous, ...args);
    if (args.length > 0)    //todo this is a setter
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
customTypes.defineRule(function (part) {
  if (!isNaN(part)) return Number(part);
});
customTypes.defineRule(function (part) {
  let props = part.split(".");
  if (props.length < 2)
    return;
  if (props[0] === "") props[0] = "window";   //:.get-computed-style_this.owner-element
  if (props[0] !== "e" && props[0] !== "this" && props[0] !== "window")
    props.unshift("window");
  if(props[props.length-1] === "") props.pop();
  const root = props.shift();
  props = props.map(ReactionRegistry.toCamelCase);
  return function (e) {
    e = root === "e" ? e : (root === "this") ? this : /*window|""*/ window;
    for (let prop of props) {
      e = e[prop]
      if (e === undefined)
        return e;
    }
    return e;
  };
});