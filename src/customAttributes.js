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
    const value = this.chain.slice(1).map(reaction => customReactions.getDefinition(reaction));
    if (value.indexOf(undefined) >= 0)
      return undefined;
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

class WeakArrayDict {
  push(key, value) {
    (this[key] ??= []).push(new WeakRef(value));
  }

  * values(key) {
    if (this.gc(key))
      yield* this[key].map(ref => ref.deref());
  }

  //sync with native gc and remove all attributes
  gc(key) {
    this[key] = this[key]?.filter(ref => ref.deref());
    return this[key]?.length || 0;
  }
}

//todo use this instead of the upper WeakMap.
class WeakAttributeArray {
  #ref = [];

  push(value) {
    this.#ref.push(new WeakRef(value));
  }

  //this has cost, we make two new temporary arrays. We do this to:
  //1. ensure no mutation on the list while the same list is being iterated,
  //2. provide only the derefenced attribute,
  //3. provide efficient enough manual GC
  dereffedCopy() {
    const res = [], missing = [];
    for (let i = 0; i < this.#ref.length; i++) {
      const ref = this.#ref[i].deref();
      ref ? res.push(ref) : missing.push(i);
    }
    for (let num of missing)
      this.#ref.splice(num, 1)[0]?.destructor();
    res;
  }
}

class DefinitionRegistry {
  #register = {};
  #rules = [];
  #cache = {"": ReactionRegistry.DefaultAction};

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
    this.#rules.push(Function);
    //todo here we need to try all the existing unknown attributes/reactions against this new rule.
  }

  tryRules(type) {
    for (let Def of this.#rules)
      if ((Def = Def(type)) instanceof Function)        //todo Def.prototype instanceof CustomAttr
        return Def;
  }

  getDefinition(type) {
    return this.#cache[type] ??= this.#register[type.split(/(?<=.)_/)[0]] ?? this.tryRules(type);
  }
}

class ReactionRegistry extends DefinitionRegistry {

  define(type, Definition) {
    if (!(Definition instanceof Function))
      throw `"${Definition}" must be a Function.`;
    if (ReactionRegistry.arrowFunctionWithThis(Definition))
      throw ` ==> ${type} <==  Arrow function using 'this' keyword. Convert it into non-array function please.`;
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

  #unknownEvents = new WeakArrayDict();
  #globals = new WeakArrayDict();

  define(prefix, Definition) {
    if (!(Definition.prototype instanceof CustomAttr))
      throw `"${Definition.name}" must be a CustomAttr.`;
    super.define(prefix, Definition);
    for (let at of this.#unknownEvents.values(prefix))
      this.#upgradeAttribute(at, Definition);
    delete this.#unknownEvents[prefix];
  }

  upgrade(...attrs) {
    for (let at of attrs) {
      //todo getDefinitions for both attribute and reactions
      Object.setPrototypeOf(at, CustomAttr.prototype);
      const Definition = this.getDefinition(at.type);
      Definition ?
        this.#upgradeAttribute(at, Definition) :             //upgrade to a defined CustomAttribute
        this.#unknownEvents.push(at.type, at);               //or register as unknown
      at.name[0] === "_" && this.#globals.push(at.type, at); //and then register globals
    }
  }

  globalListeners(type) {
    return this.#globals.values(type);
  }

  #upgradeAttribute(at, Definition) {
    Object.setPrototypeOf(at, Definition.prototype);
    try {
      at.upgrade?.();
    } catch (error) {
      //todo Rename to AttributeError?
      eventLoop.dispatch(new ErrorEvent("error", {error}), at.ownerElement);
    }
    try {
      at.changeCallback?.();
    } catch (error) {
      //todo Rename to AttributeError?
      eventLoop.dispatch(new ErrorEvent("error", {error}), at.ownerElement);
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

//todo move this to core.js? //todo
customReactions.define("console-error", e => (console.error(e.message, e.error), e));
document.documentElement.setAttributeNode(document.createAttribute("error::console-error"));

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
        //todo if (target?.isConnected === false) then bubble without default action?? I think that we need the global listeners to run for disconnected targets, as this will make them able to trigger _error for example. I also think that attributes on disconnected ownerElements should still catch the _global events. Don't see why not.
        this.#eventLoop.shift();
      }
    }

    static bubble(rootTarget, event) {

      //todo bug
      //3. we need to check if the attr should be garbage collected.
      //   as we don't have any "justBeforeGC" callback, that will be very difficult.
      //   todo so, here we might want to add a check that if the !attr.ownerElement.isConnected, the _global: listener attr will be removed?? That will break all gestures.. They will be stuck in the wrong state when elements are removed and then added again during execution.

      //todo
      if (rootTarget instanceof Element && !rootTarget.isConnected)
        throw new Error(`Global listeners for events occuring off-dom needs to be filtered..
        Then we need to check that the other elements are connected to the same root. This is a heavy operation..
        `);
      globalTarget = null;
      for (let at of customAttributes.globalListeners("_" + event.type))
        if (!(at.defaultAction && (event.defaultAction || event.defaultPrevented)) && at.reactions?.length)
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
        if (reaction !== ReactionRegistry.DefaultAction)
          res = this.#runReaction(res, reaction, at, i, start > 0, allowAsync);
        else if (doDA)
          return event.defaultAction = {at, res, target: event.target};
      }
    }

    static #runReaction(input, reaction, at, i, async, allowAsync) {
      try {
        const output = reaction.call(at, input, ...at.chainBits[i + 1]);
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

  customAttributes.defineRule(t => isDomEvent(t) && NativeBubblingEvent);
  customAttributes.defineRule(t => t[0] === "_" && isDomEvent(t.substring(1)) && ShadowRootEvent);
  customAttributes.defineRule(t => t === "_domcontentloaded" && NativeDCLEvent);
  customAttributes.defineRule(t => t[0] === "_" && `on${t.substring(1)}` in window && NativeWindowEvent);
  customAttributes.defineRule(t => t[0] === "_" && `on${t.substring(1)}` in Document.prototype && NativeDocumentEvent);
  customAttributes.defineRule(t => {
    if (`on${t}` in window || `on${t}` in Document.prototype || t === "domcontentloaded")
      throw new SyntaxError("_global must have _");
  });
})(addEventListener, removeEventListener);

observeElementCreation(els => els.forEach(el => window.customAttributes.upgrade(...el.attributes)));