//<empty>:, import:, timeout:, raf:
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
      this._timer = setTimeout(_ => eventLoop.dispatch(new Event(this.type), this), this.suffix[0]);
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
      this._count--;
      eventLoop.dispatch(new Event(this.type), this);
    }

    destructor() {
      cancelAnimationFrame(this._timer);
    }
  }

  customAttributes.define("", Ready);
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
    new: function _new(constructor, ...args) {
      return new window[ReactionRegistry.toCamelCase(constructor)](...args);
    },
    await: async function Await(num) {
      if (!num)
        await Promise.resolve();
      else if (num === "raf")
        await new Promise(r => requestAnimationFrame(r));
      else if (isNaN(num))    //todo detect error at upgradeTime?? if so, how best to do it..
        throw new SyntaxError(`await_${num} is illegal, the '${num}' is not a number or 'raf'.`);
      else
        await new Promise(r => setTimeout(r, num));
    },
    //todo restrict e.preventDefault() to the "prevent" reaction only
    prevent: e => e.preventDefault(),
    debugger: function (i) {
      debugger;
      return i;
    },
    once: function once() {
      this.ownerElement.removeAttribute(this.name);
    },
    dispatch: function dispatch(e, target = this.ownerElement) {
      eventLoop.dispatch(e, target);
      return e;                                                //todo combine with "." carry?
    },

    event: (e, input) =>                                      //todo
      e instanceof Event ? new e.constructor(input, e) :
        e instanceof String || typeof e === "string" ? new Event(e) :
          new CustomEvent(input, e)
    ,

    class: function (css, onOff) {
      const classes = this.ownerElement.classList;
      if (onOff === undefined)
        classes.contains(css) ? classes.remove(css) : classes.add(css);
      else if (onOff === "on")
        classes.add(css);
      else if (onOff === "off")
        classes.remove(css);
    },

    plus: (s, ...as) => as.reduce((s, a) => s + a, s),
    and: (...as) => as.reduce((s, a) => s && a, true),
    or: (...as) => as.reduce((s, a) => s || a, false),
    // equals: ( s, ...as) => as.reduce((s, a) => s === a, s), //todo wrong implement correctly
    // "double-equals": ( s, ...as) => as.reduce((s, a) => s == a, s),//todo wrong implement correctly

    then: function (e, ...labels) {
      const key = labels.join(" ");
      const weakMap = thenElseRegister[key];
      weakMap ?
        (weakMap.has(this.ownerElement) ?
          weakMap.get(this.ownerElement).add(e) :
          weakMap.set([[this.ownerElement, new WeakSet([e])]])) :
        thenElseRegister[key] = new WeakMap([[this.ownerElement, new WeakSet([e])]]);
      return e;
    },
    else: function (e, ...labels) {
      return (!thenElseRegister[labels.join(" ")]?.get(this.ownerElement)?.has(e))
    },

    "toggle-attr": function (prefix) {
      const el = this.ownerElement;
      el.hasAttribute(prefix) ? el.removeAttribute(prefix) : el.setAttribute(prefix);
    },

    throttle: function throttle(value) {
      const primitive = value instanceof Object ? JSON.stringify(value) : value;
      if (throttleRegister.get(this) !== primitive)
        return throttleRegister.set(this, primitive), value;
    },

    define: function define(tag, Def) {
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

  //todo remake the monad wrappers for object and arrays.
  // customReactions.defineRule("m", function (m, prop, ...original) {
  //   const input = original.join(".");
  //   const reactionImpl = customReactions.getDefinition(input, original);
  //   if (reactionImpl)
  //     return function (e, ...args) {
  //       if (!(e instanceof Object))
  //         throw new TypeError(`Reaction '${[m, prop, input].join(".")}: is not getting an Object input. typeof e = ${typeof e}`);
  //       e[prop] = reactionImpl.call(this, e, ...args);
  //       return e;
  //     }
  // });
  // customReactions.defineRule("a", function (a, num, ...rest) {
  //   const original = rest.join(".");
  //   const reaction = "a." + num + "." + original;
  //   const int = num === "" ? num : processNumArrayMonad(num, reaction);
  //   const reactionImpl = customReactions.getDefinition(original, rest);
  //   if (reactionImpl)
  //     return function (e, ...args) {
  //     debugger
  //       if (!(e instanceof Array))
  //         throw new TypeError(`Reaction '${reaction}: is not getting an Array input. typeof e = ${typeof e}`);
  //       const val = reactionImpl.call(this, e, ...args);
  //       num === "" ? e.push(val) :
  //         e.splice(int < 0 ? e.length + int : int, 0, val);
  //       return e;
  //     };
  // });
  customReactions.defineRule("", function (_, ...more) {
    return customReactions.getDefinition(more.join("."), more);
  });
})();