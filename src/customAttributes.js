//todo replace CustomAttr with a monkeyPatch on Attr? will be more efficient.
class CustomAttr extends Attr {
  get type() {
    return this.chainBits[0][0];
  }

  get suffix() {
    return this.chainBits[0].slice(1);
  }

  get chain() {
    const value = this.name.split(":");
    Object.defineProperty(this, "chain", {value, writable: false, configurable: true});
    return value;
  }

  get chainBits() {
    const value = this.chain.map(s => s.split(/(?<=.)_/));
    Object.defineProperty(this, "chainBits", {value, writable: false, configurable: true});
    return value;
  }

  get chainBitsDots() {
    const value = this.chain.map(s => s.split(/(?<=.)_/).map(s => s.split(".")));
    Object.defineProperty(this, "chainBitsDots", {value, writable: false, configurable: true});
    return value;
  }

  static upgrade(at, Definition) {                    //discover time, => check all the definitions.
    Object.setPrototypeOf(at, Definition.prototype);  //then add to the unknown register what is needed
    try {                                             //then upgrade
      at.upgrade?.();
      at.changeCallback?.();
    } catch (error) {
      // Object.setPrototypeOf(at, CustomAttr.prototype);
      // todo do we want this?? No.. don't think so. Should we flag the attribute as broken?? yes, maybe.
      //todo should we catch the error here? or should we do that elsewhere?
      eventLoop.dispatch(new ErrorEvent("error", {error}), at.ownerElement);  //todo Rename to AttributeError?
    }
    return at;
  }

  get defaultAction() {
    let value = this.chain.indexOf("") || 0;
    if (value < 0) value = 0;
    Object.defineProperty(this, "defaultAction", {value, writable: false, configurable: true});
    return value;
  }

  get reactions() {
    const value = [];
    for (let i = 1; i < this.chain.length; i++) {
      const [prefix, ...args] = this.chainBits[i];
      const [prefixBits, ...argsBits] = this.chainBitsDots[i];
      const rDef = customReactions.getDefinition(prefix, prefixBits);
      if (rDef === undefined)
        return rDef;
      value.push([rDef, prefix, ...args.map((arg, i) => customTypes.getDefinition(arg, argsBits[i]))]);
    }
    Object.defineProperty(this, "reactions", {value, writable: false, configurable: true});
    return value;
  }

  set value(value) {
    const oldValue = super.value;
    if (value === oldValue)
      return value;
    super.value = value;
    try {
      this.changeCallback?.(oldValue);
    } catch (error) {
      eventLoop.dispatch(new ErrorEvent("error", {error}), this.ownerElement);
    }
    return value;
  }

  get value() {
    return super.value;
  }
}

class UnknownAttributes {
  #ref = new Set();

  addTriggerless(value) {
    this.#ref.add(new WeakRef(value));
  }

  tryAgainstTriggerDef(prefix, Def) {
    for (let ref of this.#ref) {
      const at = ref.deref();
      if (!at?.ownerElement || at.type === prefix && CustomAttr.upgrade(at, Def))
        this.#ref.delete(ref);
    }
  }

  tryAgainstTriggerRule(prefix, Rule) {
    for (let ref of this.#ref) {
      const at = ref.deref();
      if (!at?.ownerElement)
        this.#ref.delete(ref);
      const Def = Rule(at.type);
      if (Def && CustomAttr.upgrade(at, Def))
        this.#ref.delete(ref);
    }
  }
}

window.unknownAttributes = new UnknownAttributes();

class GlobalTriggers {
  #dict = {};

  put(name, at) {
    (this.#dict[name] ??= new Set()).add(new WeakRef(at));
  }

  * loop(event) {
    const set = this.#dict["_" + event.type];
    if (!set)
      return;
    for (let ref of set) {
      const at = ref.deref();
      if (!at?.ownerElement)
        set.delete(at);
      else if (at.ownerElement.isConnected)
        if (at.reactions?.length) //todo this will be something that we can check before we add it!
          if (!(at.defaultAction && (event.defaultAction || event.defaultPrevented)))
            yield at;
    }
  }
}

window.globalTriggers = new GlobalTriggers();

class DefinitionRegistry {
  #register = {};
  #rules = {};
  #cache = {};

  define(prefix, Definition) {
    if (this.#register[prefix])
      throw `"${prefix}" is already defined.`;
    this.#register[prefix] = Definition;
  }

  defineAll(defs) {
    for (let [type, Function] of Object.entries(defs))
      this.define(type, Function);
  }

  defineRule(prefix, Function) {
    this.#rules[prefix] = Function;
  }

  getDefinition(type, bits) {
    return this.#cache[type] ??= bits.length === 1 ? this.#register[bits[0]] : this.#rules[bits[0]]?.(...bits);
  }
}

class TypeRegistry extends DefinitionRegistry {

  getDefinition(type, bits) {  //numbers and strings and builtIn are not cached..
    const builtIn = {
      true: true,
      false: false,
      null: null,
      undefined: undefined,
    };
    if (type in builtIn)
      return builtIn[type];
    // type = bits.join(".");  //todo two places where we need the type, its the cache and here for numbers with dot
    if (type && !isNaN(type))
      return Number(type);
    const Def = super.getDefinition(type, bits);
    return (Def !== undefined ? Def : type);
  }

  //todo this essentially functions as builtin types for Numbers and strings. Should we add the other builtin types here too? such as true/false and null??
  //todo or should we say that true/false is only 1/0. I like this. This would require the reaction function to convert true to 1 and false to 0.
}

window.customTypes = new TypeRegistry();

class ReactionRegistry extends DefinitionRegistry {

  constructor() {
    super();
    super.define("", ReactionRegistry.DefaultAction);
  }

  define(type, Definition) {
    if (!(Definition instanceof Function))
      throw `"${Definition}" must be a Function.`;
    if (ReactionRegistry.arrowFunctionWithThis(Definition))
      throw ` ==> ${type} <==  Arrow function using 'this' keyword. Convert it into an anonymous function please.`;
    super.define(type, Definition);
  }

  static arrowFunctionWithThis(Definition) {
    let txt = Definition.toString();
    if (!/^(async\s+|)(\(|[^([]+=)/.test(txt))
      return false;
    txt = txt.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, ''); //remove comments
    //ATT!! `${"`"}this` only works when "" is removed before ``
    txt = txt.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '');   //remove "'-strings
    txt = txt.replace(/(`)(?:(?=(\\?))\2.)*?\1/g, '');   //remove `strings
    return /\bthis\b/.test(txt); //the word this
  }

  static toCamelCase(strWithDash) { //todo move this somewhere else..
    return strWithDash.replace(/-([a-z])/g, g => g[1].toUpperCase());
  }

  static DefaultAction = function () {
  };
}

window.customReactions = new ReactionRegistry();

class AttributeRegistry extends DefinitionRegistry {

  define(prefix, Definition) {
    if (!(Definition.prototype instanceof CustomAttr))
      throw `"${Definition.name}" must be a CustomAttr.`;
    super.define(prefix, Definition);
    unknownAttributes.tryAgainstTriggerDef(prefix, Definition);
  }

  defineRule(prefix, Function) {
    super.defineRule(prefix, Function);
    unknownAttributes.tryAgainstTriggerRule(prefix, Function);
  }

  upgrade(...attrs) {
    for (let at of attrs) {
      //todo the steps below should be CustomAttr.discover(at);//
      //todo so there isn't a problem waiting with the attribute, we should wait with
      //we can wait with the attribute upgrade, until everything is ready. So ready all the time.
      Object.setPrototypeOf(at, CustomAttr.prototype);
      at.type[0] === "_" && globalTriggers.put(at.type, at);
      const Def = this.getDefinition(at.type, at.chainBitsDots[0][0])
      Def ? CustomAttr.upgrade(at, Def) :
        unknownAttributes.addTriggerless(at);
      //todo adding to the globalTriggers should be done at the ReactionsReady time.
      //todo here //todo there is no point in adding to global triggers if the Reactions are not ready.
      //todo we have the Discover attribute, then Reactions ready =>
    }
  }
}

window.customAttributes = new AttributeRegistry();

class ReactionErrorEvent extends ErrorEvent {

  constructor(error, at, i, async, input) {
    super("error", {error, cancelable: true});
    this.pos = i;
    this.at = at;
    this.async = async;
    this.inputCausingTheReactionToFail = input;
  }

  get attribute() {
    return this.at;
  }

  get message() {
    return (this.async ? "ASYNC" : "") + ReactionErrorEvent.errorString(this.at, this.pos);
  }

  static errorString(at, i) {  //todo this.ownerElement can void when the error is printed..
    const chain = at.chain.slice(0);
    chain[i + 1] = `==>${chain[i + 1]}<==`;
    return `<${at.ownerElement?.tagName.toLowerCase()} ${chain.join(":")}>`;
  }
}

(function () {

  let currentTarget, composedPath;
  let eventUid = 1;
  const eventToUid = new WeakMap(); //event.uid
  Object.defineProperties(Event.prototype, {
    uid: {
      get: function () {
        let uid = eventToUid.get(this);
        uid === undefined && eventToUid.set(this, uid = eventUid++);
        return uid;
      }
    },
    currentTarget: {
      get: function () {
        return currentTarget;
      }
    },
    target: {
      get: function () {
        return this.path[0];
      }
    },
    path: {
      get: function () {
        const currentDocument = this.currentTarget?.getRootNode();
        return composedPath.filter(el => el.getRootNode() === currentDocument);
      }
    }
  });

  function makeComposedPath(target, event, slotMode = false, path = []) {
    for (let el = target; el; el = el.parentElement || !slotMode && el.parentNode?.host) {
      path.push(el);
      if (el.assignedSlot)
        makeComposedPath(el.assignedSlot, event, true, path);
    }
    return path;
  }

  function getReactions(el, event, attr = []) {
    for (let at of el.attributes)
      if (at.type === event.type)
        if (at.reactions?.length)
          if (!at.defaultAction || !event.defaultAction && !event.defaultPrevented)
            attr.push(at);
    return attr;
  }

  class EventLoop {
    #eventLoop = [];

    dispatch(event, target) {
      if (!(event instanceof Event))
        throw new SyntaxError("First argument of eventLoop.dispatch(event, target?) must be an Event.");
      if (!(target === undefined || target === null || target instanceof Element || target instanceof Attr))  //a bug in the ElementObserver.js causes "instanceof HTMLElement" to fail.
        throw new SyntaxError("Second argument of eventLoop.dispatch(event, target?) must be either undefined, an Element, or an Attr.");
      if (event.type[0] === "_")
        throw new SyntaxError(`eventLoop.dispatch(..) doesn't accept events beginning with "_": ${event.type}.`);
      this.#eventLoop.push({target, event});
      if (this.#eventLoop.length > 1)
        return;
      while (this.#eventLoop.length) {
        const {target, event} = this.#eventLoop[0];
        currentTarget = null, composedPath = [];
        if (target instanceof Attr)
          target.reactions?.length && EventLoop.#runReactions(event, target);
        else /*if (!target || target instanceof Element)*/
          EventLoop.bubble(target, event);
        this.#eventLoop.shift();
      }
    }

    //bubble only runs on elements while they are connected to the DOM.
    //todo problems will arise if you take gestures on/off DOM while their state is not empty/in the default state.
    static bubble(rootTarget, event) {
      if (rootTarget instanceof Element && !rootTarget.isConnected)
        throw new Error(`Global listeners for events occuring off-dom needs to be filtered..
        Then we need to check that the other elements are connected to the same root. This is a heavy operation..
        `);
      for (let at of globalTriggers.loop(event))
        EventLoop.#runReactions(event, at, true);

      for (currentTarget of (composedPath = makeComposedPath(rootTarget, event)))
        for (let at of getReactions(currentTarget, event))
          if (!at.defaultAction || !event.defaultAction && !event.defaultPrevented)
            if (at.ownerElement)
              EventLoop.#runReactions(event, at, true);

      if (event.defaultAction && !event.defaultPrevented) {
        const {at, res, target} = event.defaultAction;
        currentTarget = target;
        EventLoop.#runReactions(res, at, false, at.defaultAction);
      }
    }

    static #runReactions(event, at, doDA, start = 0) {
      for (let i = start, res = event; i < at.reactions.length; i++) {
        const reaction = at.reactions[i];
        if (reaction[0] !== ReactionRegistry.DefaultAction) {
          try {
            const [r, ...args] = reaction;
            let output = r.call(at, res, ...args.map(a => a instanceof Function ? a.call(at, res) : a).slice(1));
            if (output instanceof Promise) {
              if (doDA && at.defaultAction)
                throw new SyntaxError("You cannot use reactions that return Promises before default actions.");
              output
                .then(input => {
                  if (input === undefined && reaction[1][0] === ".")
                    input = res;
                  return input !== undefined && this.#runReactions(input, at, false, i + 1);
                })
                .catch(error => eventLoop.dispatch(new ReactionErrorEvent(error, at, i, true, res), at.ownerElement));
              return;
            }
            if (reaction[1][0] !== ".") {
              res = output;
              if (output === undefined)
                return;
            }
          } catch (error) {
            eventLoop.dispatch(new ReactionErrorEvent(error, at, i, start > 0, res), at.ownerElement);
            return;
          }
        } else if (doDA)
          return event.defaultAction = {at, res, target: event.target};
      }
    }
  }

  window.eventLoop = new EventLoop();
})
();

function deprecated() {
  throw `${this}() is deprecated`;
}

(function (Element_proto, documentCreateAttributeOG,) {
  const removeAttrOG = Element_proto.removeAttribute;
  const getAttrNodeOG = Element_proto.getAttributeNode;
  const setAttributeNodeOG = Element_proto.setAttributeNode;
  const setAttributeOG = Element_proto.setAttribute;
  Element.prototype.hasAttributeNS = deprecated.bind("Element.hasAttributeNS");
  Element.prototype.getAttributeNS = deprecated.bind("Element.getAttributeNS");
  Element.prototype.setAttributeNS = deprecated.bind("Element.setAttributeNS");
  Element.prototype.removeAttributeNS = deprecated.bind("Element.removeAttributeNS");
  Element.prototype.getAttributeNode = deprecated.bind("Element.getAttributeNode");
  Element.prototype.setAttributeNode = deprecated.bind("Element.setAttributeNode");
  Element.prototype.removeAttributeNode = deprecated.bind("Element.removeAttributeNode");
  Element.prototype.getAttributeNodeNS = deprecated.bind("Element.getAttributeNodeNS");
  Element.prototype.setAttributeNodeNS = deprecated.bind("Element.setAttributeNodeNS");
  Element.prototype.removeAttributeNodeNS = deprecated.bind("Element.removeAttributeNodeNS");
  document.createAttribute = deprecated.bind("document.createAttribute");

  Element_proto.setAttribute = function (name, value) {
    if (this.hasAttribute(name))
      getAttrNodeOG.call(this, name).value = value;
      //todo this is likely to fail for Gestures.
    // We might need to do this via Object.getOwnPropertyDescriptor(Attr.prototype, "value").get.call(attr, value)
    else {
      value === undefined ?
        setAttributeNodeOG.call(this, documentCreateAttributeOG.call(document, name)) :
        setAttributeOG.call(this, name, value);
      customAttributes.upgrade(getAttrNodeOG.call(this, name));
    }
  };

  Element_proto.removeAttribute = function (name) {
    getAttrNodeOG.call(this, name)?.destructor?.();
    removeAttrOG.call(this, name);
  };
})(Element.prototype, document.createAttribute);

observeElementCreation(els => els.forEach(el => window.customAttributes.upgrade(...el.attributes)));

//** CustomAttribute registry with builtin support for the native HTML events.
(function (addEventListener, removeEventListener) {
  EventTarget.prototype.addEventListener = deprecated.bind("EventTarget.addEventListener");
  EventTarget.prototype.removeEventListener = deprecated.bind("EventTarget.removeEventListener");

  class NativeAttr extends CustomAttr {
    get passive() {
      return !(this.chain.indexOf("prevent"));
    }

    static* domEvents() {
      yield "touchstart";
      yield "touchmove";
      yield "touchend";
      yield "touchcancel";
      for (let prop in HTMLElement.prototype)
        if (prop.startsWith("on"))
          yield prop.substring(2);
      for (let prop in Element.prototype)
        if (prop.startsWith("on"))
          if (!(prop in HTMLElement.prototype))
            yield prop.substring(2);
    }

    static* windowEvents() {
      for (let prop in window)
        if (prop.startsWith("on"))
          if (!(prop in HTMLElement.prototype))
            if (!(prop in Element.prototype))
              yield prop.substring(2);
    }

    static* documentEvents() {
      for (let prop in Document.prototype)
        if (prop.startsWith("on"))
          if (!(prop in HTMLElement.prototype))
            if (!(prop in Element.prototype))
              if (!(prop in window))
                yield prop.substring(2);
    }

    //note! This map can be generated declaratively, on the server.
    static allNativeEvents() {
      const res = {};
      for (let type of NativeAttr.domEvents()) {
        res[type] = NativeBubblingEvent;
        res["_" + type] = ShadowRootEvent;
      }
      for (let type of NativeAttr.documentEvents())
        res["_" + type] = NativeDocumentEvent;
      for (let type of NativeAttr.windowEvents())
        res["_" + type] = NativeWindowEvent;
      res["_domcontentloaded"] = NativeDCLEvent;
      return res;
    }
  }

  class NativeBubblingEvent extends NativeAttr {
    upgrade() {
      this._listener = NativeBubblingEvent.listener.bind(this);
      addEventListener.call(this.ownerElement, this.type, this._listener, {passive: this.passive});
    }

    static listener(e) {
      // e.preventDefault();
      // the default actions will potentially be delayed a couple of loops in the event loop.
      e.stopImmediatePropagation();
      eventLoop.dispatch(e, e.composedPath()[0]);
    }

    destructor() {
      removeEventListener.call(this.ownerElement, this.type, this._listener);
    }
  }

  class NativeWindowEvent extends NativeAttr {

    static #GC = new FinalizationRegistry(args => removeEventListener.call(...args));

    listener(e) {
      e.stopImmediatePropagation();
      eventLoop.dispatch(e);
    }

    get nativeTarget() {
      return window;
    }

    get eventType() {
      return this.type.substring(1);
    }

    upgrade() {
      this._args = [this.nativeTarget, this.eventType, this.listener.bind({}), {
        passive: this.passive,
        capture: true
      }];
      NativeWindowEvent.#GC.register(this, this._args);
      addEventListener.call(...this._args);
    }

    destructor() {
      removeEventListener.call(...this._args);
    }
  }

  class NativeDocumentEvent extends NativeWindowEvent {
    get nativeTarget() {
      return document;
    }
  }

  class NativeDCLEvent extends NativeDocumentEvent {
    listener(e) {
      e.stopImmediatePropagation();
      Object.defineProperty(e, "type", {value: "domcontentloaded", writable: false, enumerable: true});
      eventLoop.dispatch(e);
    }

    get eventType() {
      return "DOMContentLoaded";
    }
  }

  class ShadowRootEvent extends NativeWindowEvent {
    listener(e) {
      e.stopImmediatePropagation();
      eventLoop.dispatch(e, e.composedPath()[0]);
    }

    get nativeTarget() {
      return this.ownerElement.getRootNode();                 //todo this is broken for _click for example.
    }
  }

  customAttributes.defineAll(NativeAttr.allNativeEvents());
})(addEventListener, removeEventListener);

//** default error event handling
customReactions.define("console-error", e => (console.error(e.message, e.error), e));
document.documentElement.setAttribute("error::console-error");