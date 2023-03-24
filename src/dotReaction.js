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

function iGetter(props) {
  return (e, i) => getProp(i, props);
}

function thisGetter(props) {
  return function () {
    return getProp(this, props);
  };
}

function windowGetter(props) {
  return _ => getProp(window, props);
}

function getObj(obj, props) {
  for (let i = 0; i < props.length; i++) {
    obj = obj[props[i]];
    if (!(obj instanceof Object))
      return undefined;
  }
  return obj;
}

function makeTheCall(p, prop, args) {
  const method = p[prop] ?? customReactions.getDefinition(prop, [prop]);
  return method.call(p, ...args);
}

customReactions.defineRule("window", function (_, ...props) {
  const prop = props.pop();
  return function (...args) {
    const p = props.length ? getObj(window, props) : window;         //find the this
    return p && makeTheCall(p, prop, args);                          //find the prop
  };
});

customReactions.defineRule("this", function (_, ...props) {
  const prop = props.pop();
  return function (...args) {
    const p = props.length ? getObj(this, props) : this;
    return p && makeTheCall(p, prop, args);
  };
});

customReactions.defineRule("console", function (_, fun) {
  return console[fun];
});

//todo mathAddOns untested
const mathAddOns = {                                          //todo add these methods to the Math namespace, and then just make the getDefinition([window+math]?
  minus: (s, ...as) => as.reduce((s, a) => s - a, s),
  times: (s, ...as) => as.reduce((s, a) => s * a, s),
  divide: (s, ...as) => as.reduce((s, a) => s / a, s),
  percent: (s, ...as) => as.reduce((s, a) => s % a, s),
  factor: (s, ...as) => as.reduce((s, a) => s ** a, s),
  gt: (s, ...as) => as.reduce((s, a) => s > a, s),
  gte: (s, ...as) => as.reduce((s, a) => s >= a, s),
  lt: (s, ...as) => as.reduce((s, a) => s < a, s),
  lte: (s, ...as) => as.reduce((s, a) => s <= a, s),
};
customReactions.defineRule("math", function (_, fun) {
  return mathAddOns[fun] || Math[fun];
});

customTypes.defineAll({
  window: window,
  document: document,
  e: e => e,
  i: (e, i) => i,
  this: function () {
    return this;
  },
});
customTypes.defineRule("e", (e, ...part) => eGetter(part));
customTypes.defineRule("i", (i, ...part) => iGetter(part));
customTypes.defineRule("this", (t, ...part) => thisGetter(part));
customTypes.defineRule("window", (w, ...part) => windowGetter(part));

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
customTypes.defineRule("el", (_, ...ps) => thisGetter(["ownerElement", ...ps]));
customTypes.defineRule("p", (_, ...ps) => thisGetter(["ownerElement", "parentElement", ...ps]));

//.cssom property for handling getComputedStyle
Object.defineProperty(Element.prototype, "cssom", {
  get: function () {
    return new Proxy(this, {
      get: function (target, prop) {
        return getComputedStyle(target)[prop];
      }
    });
  }
});

//querySelector
customTypes.defineRule("q", (_, query) => () => document.querySelector(query));