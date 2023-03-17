function getProp(e, props) {
  // if(props.length > 1)
  //   console.info(...props);
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

function makeCaller(root, ...props) {
  props = props.map(ReactionRegistry.toCamelCase);
  return function (_, ...args) {
    let e = /*root === "e" ? e :*/ root === "this" ? this : window;
    let p, prop;
    for (prop of props) {
      p = e;
      if (!p)
        return;
      e = p[prop];
    }
    return e instanceof Function ? e.call(p, ...args) :
      !args.length ? e :                              //getter
        p[prop] = args.length === 1 ? args[0] : args; //setter
  };
}

customReactions.defineRule("window", makeCaller);
customReactions.defineRule("this", makeCaller);
// customReactions.defineRule("e", makeCaller);

customReactions.defineRule("console", function (_, fun) {
  if (fun in console)
    return (e, ...args) => console[fun](...args);
  throw new SyntaxError(`console.${fun} is unknown.`);
});

//todo mathAddOns untested
const mathAddOns = {
  minus: (_, s, ...as) => as.reduce((s, a) => s - a, s),
  times: (_, s, ...as) => as.reduce((s, a) => s * a, s),
  divide: (_, s, ...as) => as.reduce((s, a) => s / a, s),
  percent: (_, s, ...as) => as.reduce((s, a) => s % a, s),
  factor: (_, s, ...as) => as.reduce((s, a) => s ** a, s),
  gt: (_, s, ...as) => as.reduce((s, a) => s > a, s),
  gte: (_, s, ...as) => as.reduce((s, a) => s >= a, s),
  lt: (_, s, ...as) => as.reduce((s, a) => s < a, s),
  lte: (_, s, ...as) => as.reduce((s, a) => s <= a, s),
};
customReactions.defineRule("math", function (_, fun) {
  return mathAddOns[fun] ?? fun in Math ? (e, ...args) => Math[fun](...args) : undefined;
});

customTypes.defineAll({
  window: window,
  document: document,
  e: e => e,
  this: function () {
    return this;
  },
});
customTypes.defineRule("e", (e, ...part) => eGetter(part.map(ReactionRegistry.toCamelCase)));
customTypes.defineRule("this", (t, ...part) => thisGetter(part.map(ReactionRegistry.toCamelCase)));
customTypes.defineRule("window", (w, ...part) => windowGetter(part.map(ReactionRegistry.toCamelCase)));

//el and p
customReactions.defineRule("el", function (el, ...more) {
  return customReactions.getDefinition("this.ownerElement." + more.join("."), ["this", "ownerElement", ...more]);
});
customReactions.defineRule("p", function (el, ...more) {
  return customReactions.getDefinition("this.ownerElement.parentElement." + more.join("."), ["this", "ownerElement", "parentElement", ...more]);
});
customTypes.defineAll({
  el: function () {
    return this.ownerElement;
  },
  p: function () {
    return this.ownerElement.parentElement;
  }
});
customTypes.defineRule("el", (_, ...ps) => thisGetter(["ownerElement", ...ps.map(ReactionRegistry.toCamelCase)]));
customTypes.defineRule("p", (_, ...ps) => thisGetter(["ownerElement", "parentElement", ...ps.map(ReactionRegistry.toCamelCase)]));

//CSSOM style getComputedStyle
customTypes.defineRule("style", function (_, prop) {
  prop = ReactionRegistry.toCamelCase(prop);
  return function () {
    return getComputedStyle(this.ownerElement)[prop];
  }
});

//querySelector
customTypes.defineRule("q", (_, query) => () => document.querySelector(query));