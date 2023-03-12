//import:, ready:, timeout:, raf:
(function () {
  function dispatchWhenReactionReady(attr, event, delay = 4, i = 0) {
    attr.reactions ?
      eventLoop.dispatch(event, attr) :
      attr._timer = setTimeout(_ => dispatchWhenReactionReady(attr, event, delay, ++i), delay ** i);
  }

  class Import extends CustomAttr {
    async upgrade() {
      if (!this.value)
        return;
      this._originalValue = this.value;
      const detail = await import(new URL(this.value, this.baseURI).href);
      if (!this._stopped)
        dispatchWhenReactionReady(this, new CustomEvent(this.type, {detail}), this.suffix[0]);
    }

    changeCallback() {  //make the import .value immutable.
      this.value = this._originalValue;
    }

    destructor() {
      this._stopped = true;
      clearTimeout(this._timer);
    }
  }

  class Ready extends CustomAttr {
    upgrade() {
      if (this.name !== this.type)
        Promise.resolve().then(_ => dispatchWhenReactionReady(this, new Event(this.type), this.suffix[0]));
    }

    destructor() {
      clearTimeout(this._timer);
    }
  }

  class Interval extends CustomAttr {
    upgrade() {
      if (this.name === this.type)
        return;
      let countDown = parseInt(this.suffix[1]) || Infinity;
      eventLoop.dispatch(new Event(this.type), this);
      this._interval = setInterval(_ => {
        if (!this.reactions)
          return;
        eventLoop.dispatch(new Event(this.type), this);
        //the countdown state is not reflected in the DOM. We could implement this by actually adding/removing the attribute with a new attribute. That would be ok.
        if (countDown-- === 1)
          clearInterval(this._interval);
      }, this.suffix[0]);
    }

    destructor() {
      clearInterval(this._interval);
    }
  }

  class Timeout extends CustomAttr {
    upgrade() {
      if (this.name !== this.type)
        this._timer = setTimeout(_ => this._trigger(1, this.suffix[1]), this.suffix[0]);
    }

    _trigger(i, delay = 4) {
      this.reactions ?
        eventLoop.dispatch(new Event(this.type), this) :
        this._timer = setTimeout(_ => this._trigger(++i, delay), delay ** i);
    }

    destructor() {
      clearTimeout(this._timer);
    }
  }

  class Raf extends CustomAttr {
    upgrade() {
      this._count = parseInt(this.suffix[0]) || Infinity;
      this._timer = requestAnimationFrame(_ => this.trigger());
    }

    trigger() {
      if (!this._count)
        this.destructor();
      if (!this.reactions)
        return;
      this._count--;
      eventLoop.dispatch(new Event(this.type), this);
    }

    destructor() {
      cancelAnimationFrame(this._timer);
    }
  }

  customAttributes.define("ready", Ready);
  customAttributes.define("import", Import);
  customAttributes.define("timeout", Timeout);
  customAttributes.define("interval", Interval);
  customAttributes.define("raf", Raf);
})();

//border-box: and content-box:
(function () {
  class ResizeAttr extends CustomAttr {
    upgrade() {
      this._obs = new ResizeObserver(([detail]) => eventLoop.dispatch(new CustomEvent(this.type, {detail}), this));
      this._obs.observe(this.ownerElement, {box: this.type});
    }

    destructor() {
      this._obs.disconnect();
    }
  }

  customAttributes.define("border-box", ResizeAttr);
  customAttributes.define("content-box", ResizeAttr);
  customAttributes.define("device-pixel-content-box", ResizeAttr);
})();

function processNumArrayMonad(num, reaction) {
  if (Number.isInteger(num))
    return Number(num);
  throw new SyntaxError(`${num} is not an Integer or "" empty string.\n The array monad HO reaction has the following signature: "a.Integer.reaction"/"a..reaction": ${reaction}`);
}

(function () {
  const throttleRegister = new WeakMap();
  //labels=>this=>e
  //{}=>WeakMap=>WeakSet
  const thenElseRegister = {};
  customReactions.defineAll({
    new: function _new(e, _, constructor, ...args) {
      return new window[ReactionRegistry.toCamelCase(constructor)](...args, e);
    },
    await: async function Await(e, prefix, num) {
      if (num && isNaN(num))    //todo detect error at upgradeTime?? if so, how best to do it..
        throw new SyntaxError(`${prefix}_${num} is illegal, the _${num} is not a number.`);
      await (num ? new Promise(r => setTimeout(r, num)) : Promise.resolve());
      return this.ownerElement ? e : undefined;
    },
    prevent: e => (e.preventDefault(), e),
    dispatch: function dispatch(e) {
      eventLoop.dispatch(e, this.ownerElement);
      return e;
    },

    //todo untested.
    plus: (s, _, ...as) => as.reduce((s, a) => s + a, s),
    minus: (s, _, ...as) => as.reduce((s, a) => s - a, s),
    times: (s, _, ...as) => as.reduce((s, a) => s * a, s),
    divide: (s, _, ...as) => as.reduce((s, a) => s / a, s),
    percent: (s, _, ...as) => as.reduce((s, a) => s % a, s),
    factor: (s, _, ...as) => as.reduce((s, a) => s ** a, s),
    and: (s, _, ...as) => as.reduce((s, a) => s && a, s),
    or: (s, _, ...as) => as.reduce((s, a) => s || a, s),
    //todo double or triple equals??
    equals: (s, _, ...as) => as.reduce((s, a) => s == a, s),
    //todo the below comparisons should more likely be run as dot-expressions..
    //todo and should dot-expressions return the original 'e'? it feels like a more useful strategy..
    //todo if the dot-expressions use this strategy, then they become monadish too.. not bad.
    //gt: (s, _, ...as) => as.reduce((s, a) => s > a, s),
    //gte: (s, _, ...as) => as.reduce((s, a) => s >= a, s),
    //lt: (s, _, ...as) => as.reduce((s, a) => s < a, s),
    //lte: (s, _, ...as) => as.reduce((s, a) => s <= a, s),
    number: n => Number(n),  //this is the same as .-number_e. Do we want it?
    nan: n => isNaN(n),  //this is the same as .is-na-n_e. Do we want it?

    then: function (e, _, ...labels) {
      const key = labels.join(" ");
      const weakMap = thenElseRegister[key];
      weakMap ?
        (weakMap.has(this.ownerElement) ?
          weakMap.get(this.ownerElement).add(e) :
          weakMap.set([[this.ownerElement, new WeakSet([e])]])) :
        thenElseRegister[key] = new WeakMap([[this.ownerElement, new WeakSet([e])]]);
      return e;
    },
    else: function (e, _, ...labels) {
      if (!thenElseRegister[labels.join(" ")]?.get(this.ownerElement)?.has(e))
        return e;
    },

    debugger: function (e) {
      debugger;
      return e;
    },

    throttle: function throttle(value) {
      const primitive = value instanceof Object ? JSON.stringify(value) : value;
      if (throttleRegister.get(this) !== primitive)
        return throttleRegister.set(this, primitive), value;
    },

    define: function define(Def, _, tag) {
      if (Def.prototype instanceof CustomAttr)
        customAttributes.define(tag, Def);
      else if (Def.prototype instanceof HTMLElement)
        customElements.define(tag, Def);
      else if (Def instanceof Function)
        customReactions.define(tag, Def);
      else
        throw "You cannot define a class that isn't either a CustomAttr, an HTMLElement, or a Function.";
    }
  });

  customReactions.defineRule("m", function (reaction) {
    // if (!reaction.startsWith("m."))
    //   return;
    const [m, prop, ...original] = reaction.split(".");
    const input = original.join(".");
    const reactionImpl = customReactions.getDefinition(input);
    if (reactionImpl)
      return function (e, _, ...args) {
        if (!(e instanceof Object))
          throw new TypeError(`Reaction '${reaction}: is not getting an Object input. typeof e = ${typeof e}`);
        e[prop] = reactionImpl.call(this, e, input, ...args);
        return e;
      }
  });
  customReactions.defineRule("a", function (reaction) {
    // if (!reaction.startsWith("a."))
    //   return;
    const [a, num, ...rest] = reaction.split(".");
    const original = rest.join(".");
    const int = num === "" ? num : processNumArrayMonad(num, reaction);
    const reactionImpl = customReactions.getDefinition(original);
    if (reactionImpl)
      return function (e, prefix, ...args) {
        if (!(e instanceof Array))
          throw new TypeError(`Reaction '${reaction}: is not getting an Array input. typeof e = ${typeof e}`);
        const val = reactionImpl.call(this, e, original, ...args);
        num === "" ? e.push(val) :
          e.splice(int < 0 ? e.length + int : int, 0, val);
        return e;
      };
  });
  customReactions.defineRule("", function (reaction) {
    // if (!reaction.startsWith("."))
    //   return;
    const original = reaction.substring(1);
    const reactionImpl = customReactions.getDefinition(original);
    if (reactionImpl)
      return function (e, _, ...args) {
        const val = reactionImpl.call(this, e, original, ...args);
        return val instanceof Promise ? val.then(() => e) : e;
      };
  });
})();