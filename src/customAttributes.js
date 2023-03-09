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

  get defaultAction() {
    let value = this.chain.indexOf("") || 0;
    if (value < 0) value = 0;
    Object.defineProperty(this, "defaultAction", {value, writable: false, configurable: true});
    return value;
  }

  get reactions() {
    const value = [];
    for (let [prefix, ...args] of this.chainBits.slice(1)) {
      const r = customReactions.getDefinition(prefix);
      if (r === undefined)
        return r;
      value.push([r, prefix, ...args.map(arg => customTypes.getDefinition(arg))]);
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

  tryAgain() {
    for (let ref of this.#ref) {
      const at = ref.deref();
      if (!at?.ownerElement || customAttributes.tryToUpgrade(at))
        this.#ref.delete(ref);
    }
  }

  tryAgainstTriggerDef(prefix, Def) {
    this.tryAgain();
  }

  tryAgainstTriggerRule(Rule) {
    this.tryAgain();
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
      else {
        if (at.ownerElement.isConnected)
          if (!(at.defaultAction && (event.defaultAction || event.defaultPrevented)) && at.reactions?.length)
            yield at;
      }
    }
  }
}

window.globalTriggers = new GlobalTriggers();

class DefinitionRegistry {
  #register = {};
  #rules = [];
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

  defineRule(Function) {
    this.#rules.unshift(Function);
  }

  tryRules(type) {
    for (let Def of this.#rules)
      if (Def = Def(type))
        return Def;
  }

  getDefinition(type) {
    return this.#cache[type] ??= this.#register[type] ?? this.tryRules(type);
  }
}

window.customTypes = new DefinitionRegistry();
customTypes.defineRule(part => part);

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

  defineRule(Function) {
    super.defineRule(Function);
    unknownAttributes.tryAgainstTriggerRule(Function);
  }

  tryToUpgrade(at) {
    const Def = this.getDefinition(at.type)
    return Def && (AttributeRegistry.#upgradeAttribute(at, Def), true);
  }

  upgrade(...attrs) {
    for (let at of attrs) {
      Object.setPrototypeOf(at, CustomAttr.prototype);      //todo getDefinitions for both attribute and reactions
      this.tryToUpgrade(at) || unknownAttributes.addTriggerless(at);
      at.name[0] === "_" && globalTriggers.put(at.type, at);
    }
  }

  //todo this process is under the CustomAttr class..
  // So this can be a this method. The problem is that it should be hidden.
  static #upgradeAttribute(at, Definition) {
    Object.setPrototypeOf(at, Definition.prototype);
    try {
      at.upgrade?.();
      at.changeCallback?.();
    } catch (error) {
      // Object.setPrototypeOf(at, CustomAttr.prototype);
      // todo do we want this?? No.. don't think so. Should we flag the attribute as broken?? yes, maybe.
      //todo should we catch the error here? or should we do that elsewhere?
      eventLoop.dispatch(new ErrorEvent("error", {error}), at.ownerElement);  //todo Rename to AttributeError?
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

//Event.uid
  let eventUid = 1;
  const eventToUid = new WeakMap();
  Object.defineProperty(Event.prototype, "uid", {
    get: function () {
      let uid = eventToUid.get(this);
      uid === undefined && eventToUid.set(this, uid = eventUid++);
      return uid;
    }
  });

  Object.defineProperty(Event.prototype, "target", {
    get: function () {
      return globalTarget;
    }
  });
  //todo not sure that we should use path at all actually. If we have dynamic path, then path cannot be safely queried in advance or in the past.
  Object.defineProperty(Event.prototype, "path", {
    get: function () {
      const path = [];
      for (let el = this.target; el instanceof Element; el = el.parentElement)
        path.push(el)
      return path;
    }
  });

  let globalTarget;

  function* bubbleAttr(target, event, slotMode) {
    for (let el = target; el; el = el.parentElement || !slotMode && el.parentNode?.host) {
      for (let at of el.attributes)
        if (at.type === event.type)
          if (at.reactions?.length)
            if (!at.defaultAction || !event.defaultAction && !event.defaultPrevented)
              globalTarget = target, yield at;      //todo build path here too?
      if (el.assignedSlot)
        yield* bubbleAttr(el.assignedSlot, event, true);
    }
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
        if (target instanceof Attr)
          EventLoop.#runReactions(event, target);
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
      globalTarget = null;
      for (let at of globalTriggers.loop(event))
        EventLoop.#runReactions(event, at, true);

      for (let at of bubbleAttr(rootTarget, event))
        EventLoop.#runReactions(event, at, true);

      if (event.defaultAction && !event.defaultPrevented) {
        const {at, res, target} = event.defaultAction;
        globalTarget = target;
        EventLoop.#runReactions(res, at, false, at.defaultAction);
      }
    }

    static #runReactions(event, at, doDA, start = 0, allowAsync = doDA && at.defaultAction) {
      for (let i = start, res = event; i < at.reactions.length && res !== undefined; i++) {
        const reaction = at.reactions[i];
        if (reaction[0] !== ReactionRegistry.DefaultAction)
          res = this.#runReaction(reaction, at, res, i, start > 0, allowAsync);
        else if (doDA)
          return event.defaultAction = {at, res, target: event.target};
      }
    }

    static #runReaction([reaction, ...args], at, input, i, async, allowAsync) {
      try {
        const output = reaction.call(at, input, ...args.map(a => a instanceof Function ? a.call(at, input) : a));
        if (!(output instanceof Promise))
          return output;
        if (allowAsync)
          throw new SyntaxError("You cannot use reactions that return Promises before default actions.");
        output
          .then(input => input !== undefined && this.#runReactions(input, at, false, i + 1))
          .catch(error => eventLoop.dispatch(new ReactionErrorEvent(error, at, i, true, input), at.ownerElement));
      } catch (error) {
        eventLoop.dispatch(new ReactionErrorEvent(error, at, i, async, input), at.ownerElement);
      }
    }
  }

  window.eventLoop = new EventLoop();
})();

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
    //todo restrict e.preventDefault() to the "prevent" reaction only
    get passive() {
      return !(this.chain.indexOf("prevent") || this.chain.indexOf("e.prevent-default"));
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
      this._args = [this.nativeTarget, this.eventType, this.listener.bind({}), {passive: this.passive, capture: true}];
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
    get type() {
      return "_DOMContentLoaded";
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
      return this.ownerElement.getRootNode();
    }
  }

  function isDomEvent(type) {
    return `on${type}` in HTMLElement.prototype || /^touch(start|move|end|cancel)$/.exec(type);
  }

  customAttributes.defineRule(t => {
    if (isDomEvent(t))
      return NativeBubblingEvent;
    if (t[0] === "_" && isDomEvent(t.substring(1)))
      return ShadowRootEvent;
    if (t === "_domcontentloaded")
      return NativeDCLEvent;
    if (t[0] === "_" && `on${t.substring(1)}` in window)
      return NativeWindowEvent;
    if (t[0] === "_" && `on${t.substring(1)}` in Document.prototype)
      return NativeDocumentEvent;
    if (`on${t}` in window || `on${t}` in Document.prototype || t === "domcontentloaded")
      throw new SyntaxError("_global must have _");
  });
})(addEventListener, removeEventListener);

//** default error event handling
customReactions.define("console-error", e => (console.error(e.message, e.error), e));
document.documentElement.setAttribute("error::console-error");