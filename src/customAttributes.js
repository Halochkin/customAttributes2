//todo replace CustomAttr with a monkeyPatch on Attr? will be more efficient.
class CustomAttr extends Attr {
  get type() {
    const value = this.name.match(/(_?[^_:]+)/)[1];
    Object.defineProperty(this, "type", {value, writable: false, configurable: true});
    return value;
  }

  get eventType() {
    let value = this.type;
    if (value[0] === "_") value = value.substring(1);
    if (value.startsWith("fast")) value = value.substring(4);      //annoying
    Object.defineProperty(this, "eventType", {value, writable: false, configurable: true});
    return value;
  }

  get global() {
    return this.name[0] === "_";
  }

  get passive() {
    const value = this.name[0].startsWith("_fast") || this.name[0].startsWith("fast");
    Object.defineProperty(this, "passive", {value, writable: false, configurable: true});
    return value;
  }

  get suffix() {
    return this.name.match(/_?([^:]+)/)[1].split("_").slice(1);
  }

  get chain() {
    const value = this.name.split(":").slice(1);
    Object.defineProperty(this, "chain", {value, writable: false, configurable: true});
    return value;
  }

  get defaultAction() {
    const value = this.chain?.indexOf("") + 1 || 0;
    Object.defineProperty(this, "defaultAction", {value, writable: false, configurable: true});
    return value;
  }

  get reactions() {
    const value = this.chain.map(reaction => customReactions.getReaction(reaction));
    if (value.indexOf(undefined) >= 0)
      return undefined;
    Object.defineProperty(this, "reactions", {value, writable: false, configurable: true});
    return value;
  }

  get ready() {
    return this.reactions !== undefined;
  }

  errorString(i) {  //todo this.ownerElement can void when the error is printed..
    const chain = this.chain.slice(0);
    chain[i] = `==>${chain[i]}<==`;
    return `<${this.ownerElement?.tagName.toLowerCase()} ${this.name.split(":")[0]}:${chain.join(":")}>`;
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

class Reaction {

  constructor(parts, Function) {
    this.Function = Function;
    [this.prefix, ...this.suffix] = parts;
  }

  //When a Reaction.Function returns a Reaction object, then the Reaction will replace its content with the content from the new Reaction. This enables Reaction functions to upgrade themselves run-time.
  run(at, e) {
    let res;
    while ((res = this.Function.call(at, e, this.prefix, ...this.suffix)) instanceof Reaction)
      Object.assign(this, res);
    return res;
  }
}

class ReactionRegistry {

  #register = {};

  define(type, Func) {
    if (!(Func instanceof Function))
      throw new SyntaxError("reactions must be Functions.");
    const funcString = Func.toString();
    if (funcString.indexOf("=>") > 0 && funcString.indexOf("this") > 0)
      console.warn(`ALERT!! arrow function using 'this' in reaction defintion: ${type}. Should this be a named/anonymous function?
${funcString}`);
    if (type in this.#register)
      throw `The Reaction type: "${type}" is already defined.`;
    this.#register[type] = Func;
  }

  defineAll(defs) {
    for (let [type, Function] of Object.entries(defs))
      this.define(type, Function);
  }

  static toCamelCase(strWithDash) { //todo move this somewhere else..
    return strWithDash.replace(/-([a-z])/g, g => g[1].toUpperCase());
  }

  #cache = {"": ""}; //todo maybe we want to use the empty string attribute for the dotExpressions?

  getReaction(reaction) {
    return this.#cache[reaction] ??= this.#create(reaction);
  }

  #create(reaction) {
    const parts = reaction.split("_");
    //todo should we add a dotReaction regex matcher here, so that we could .define(/\./, dotReaction)?
    //todo would match parts[0]?
    if (this.#register[parts[0]])
      return new Reaction(parts, this.#register[parts[0]]);
  }
}

window.customReactions = new ReactionRegistry();

class WeakArrayDict {
  push(key, value) {
    (this[key] ??= []).push(new WeakRef(value));
  }

  * values(key) {
    if (this.gc(key))
      yield* this[key].map(ref => ref.deref());
  }

  //sync with native gc and remove all attributes without .ownerElement.
  gc(key) {
    this[key] = this[key]?.filter(ref => ref.deref()?.ownerElement);
    return this[key]?.length || 0;
  }
}

class AttributeRegistry {

  #unknownEvents = new WeakArrayDict();
  #globals = new WeakArrayDict();

  define(prefix, Definition) {
    if (!(Definition.prototype instanceof CustomAttr))
      throw `"${Definition.name}" must extend "CustomAttr".`;
    if (this.getDefinition(prefix))
      throw `The customAttribute "${prefix}" is already defined.`;
    this[prefix] = Definition;
    for (let at of this.#unknownEvents.values(prefix))
      this.#upgradeAttribute(at, Definition);
    delete this.#unknownEvents[prefix];
  }

  upgrade(...attrs) {
    for (let at of attrs) {
      Object.setPrototypeOf(at, CustomAttr.prototype);
      const Definition = this.getDefinition(at.type);
      Definition ?
        this.#upgradeAttribute(at, Definition) :        //upgrade to a defined CustomAttribute
        this.#unknownEvents.push(at.type, at);          //or register as unknown
      at.global && this.#globals.push(at.eventType, at);//and then register globals
    }
  }

  getDefinition(type) {
    return this[type];
  }

  globalListeners(type) {
    return this.#globals.values(type);
  }

  //todo if elements with global a customAttr is removed in JS but not yet GCed, this will still run
  globalEmpty(type) {
    return !this.#globals.gc(type);
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

  constructor(error, at, i, async) {
    super("error", {error, cancelable: true});
    this.pos = i;
    this.at = at;
    this.async = async;
  }

  get attribute() {
    return this.at;
  }

  get message() {
    return (this.async ? "ASYNC" : "") + this.at.errorString(this.pos);
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

  const eventToTarget = new WeakMap();
  Object.defineProperty(Event.prototype, "target", {
    get: function () {
      return eventToTarget.get(this);
    }
  });
  //todo path is untested
  Object.defineProperty(Event.prototype, "path", {
    get: function () {
      //The path doesn't include window or document.
      //If a native target is the window or document, path = []
      const path = [];
      for (let el = this.target; el instanceof Element; el = el.parentElement)
        path.push(el)
      return path;
    }
  });
  const _event_to_Document_to_Target = new WeakMap();

  function getTargetForEvent(event, target, root = target.getRootNode()) {
    const map = _event_to_Document_to_Target.get(event);
    if (!map) {
      _event_to_Document_to_Target.set(event, new Map([[root, target]]));
      return target;
    }
    let prevTarget = map.get(root);
    !prevTarget && map.set(root, prevTarget = target);
    return prevTarget;
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
          EventLoop.#runReactions(target.reactions, event, target, undefined);
        else /*if (!target || target instanceof Element)*/
          EventLoop.bubble(target, event);
        //todo if (target?.isConnected === false) then bubble without default action?? I think that we need the global listeners to run for disconnected targets, as this will make them able to trigger _error for example. I also think that attributes on disconnected ownerElements should still catch the _global events. Don't see why not.
        this.#eventLoop.shift();
      }
    }

    static bubble(rootTarget, event, target = rootTarget) {

      for (let attr of customAttributes.globalListeners(event.type)) {
        //todo here are several bugs..
        //1. we need to have the global listeners also be able to set default actions.
        //2. we need to filter out the global listeners that has a default action, when a default action has already been set om the event by a previous reaction.
        //3. we need to check if the attr should be garbage collected.
        //   as we don't have any "justBeforeGC" callback, that will be very difficult.
        //   todo so, here we might want to add a check that if the !attr.ownerElement.isConnected, the _global: listener attr will be removed?? That will break all gestures.. They will be stuck in the wrong state when elements are removed and then added again during execution.
        EventLoop.#runReactions(attr.reactions, event, attr, false);
      }

      for (let prev, t = rootTarget; t; prev = t, t = t.assignedSlot || t.parentElement || t.parentNode?.host) {
        t !== prev?.parentElement && eventToTarget.set(event, target = getTargetForEvent(event, t));
        for (let attr of t.attributes) {
          //todo check that the attr.chain is something. If it is nothing, then skip the attribute.
          if (attr.eventType === event.type && attr.name[0] !== "_") {
            if (attr.defaultAction && (event.defaultAction || event.defaultPrevented))
              continue;
            const res = EventLoop.#runReactions(attr.reactions, event, attr, !!attr.defaultAction);
            if (res !== undefined && attr.defaultAction)
              event.defaultAction = {attr, res, target};
          }
        }
      }

      if (event.defaultAction && !event.defaultPrevented) {
        const {attr, res, target} = event.defaultAction;
        eventToTarget.set(event, target);
        EventLoop.#runReactions(attr.reactions, res, attr, false, attr.defaultAction);
      }
    }

    static #runReactions(reactions = [], event, at, syncOnly = false, start = 0) {
      for (let i = start; i < reactions.length; i++) {
        const reaction = reactions[i];
        if (!reaction && syncOnly)
          return event;
        else if (!reaction)
          continue;
        try {
          event = reaction.run(at, event);
          if (event === undefined)
            return;
          if (event instanceof Promise) {
            if (syncOnly)
              throw new SyntaxError("You cannot use reactions that return Promises before default actions.");
            event
              .then(event => this.#runReactions(reactions, event, at, false, i + 1))
              //todo we can pass in the input to the reaction to the error event here too
              .catch(error => eventLoop.dispatch(new ReactionErrorEvent(error, at, i, true), at.ownerElement));
            return;
          }
        } catch (error) {    //todo we can pass in the input to the error event here.
          return eventLoop.dispatch(new ReactionErrorEvent(error, at, i, start !== 0), at.ownerElement);
        }
      }
      return event;
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

  class NativeBubblingEvent extends CustomAttr {
    upgrade() {
      this._listener = NativeBubblingEvent.listener.bind(this);
      addEventListener.call(this.ownerElement, this.eventType, this._listener, {passive: this.passive});
    }

    static listener(e) {
      // e.preventDefault();
      // the default actions will potentially be delayed a couple of loops in the event loop.
      e.stopImmediatePropagation();
      eventLoop.dispatch(e, e.composedPath()[0]);
    }

    destructor() {
      removeEventListener.call(this.ownerElement, this.eventType, this._listener);
    }
  }

  class NativeWindowEvent extends CustomAttr {
    listener(e) {
      e.stopImmediatePropagation();
      eventLoop.dispatch(e);
    }

    get nativeTarget() {
      return window;
    }

    upgrade() {
      this._listener = this.listener.bind(this);
      addEventListener.call(this.nativeTarget, this.eventType, this._listener, {
        passive: this.passive,
        capture: true
      });
    }

    destructor() {
      removeEventListener.call(this.nativeTarget, this.eventType, this._listener, {
        passive: this.passive,
        capture: true
      });
    }
  }

  class NativeDocumentEvent extends NativeWindowEvent {
    get nativeTarget() {
      return document;
    }
  }

  class NativeDCLEvent extends NativeDocumentEvent {
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

  //todo replace this with a matching function instead.. One for each type.
  class NativeEventsAttributeRegistry extends AttributeRegistry {
    #cache = {};

    findNativeDefinition(type) {
      const global = type[0] === "_";
      global === true && (type = type.substring(1));
      if (type.startsWith("fast")) type = type.substring(4);
      if (`on${type}` in HTMLElement.prototype || "touchstart" === type || "touchmove" === type || "touchend" === type || "touchcancel" === type)
        return global ? ShadowRootEvent : NativeBubblingEvent;
      const res = type === "domcontentloaded" ? NativeDCLEvent :
        `on${type}` in window ? NativeWindowEvent :
          `on${type}` in Document.prototype ? NativeDocumentEvent : null;
      if (res && !global)
        throw new SyntaxError("_global must have _");
      return res;
    }

    getDefinition(type) {
      return super.getDefinition(type) || (this.#cache[type] ??= this.findNativeDefinition(type));
    }
  }

  window.customAttributes = new NativeEventsAttributeRegistry();
})(addEventListener, removeEventListener);

observeElementCreation(els => els.forEach(el => window.customAttributes.upgrade(...el.attributes)));