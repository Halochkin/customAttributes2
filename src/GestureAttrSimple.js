customReactions.defineRule("g", function (reaction) {           //g.push
  // if (reaction.startsWith("g."))
    return customReactions.getDefinition("this.gesture" + reaction.substring(1));
});

customTypes.defineRule("g", function (type) {                   //g.data
  // if (type.startsWith("g."))
    return customReactions.getDefinition("this.gesture" + type.substring(1));
});

//todo this is just a reaction??
customReactions.defineRule("gg", function (reaction) {           //gg.swipeable
  // if (!reaction.startsWith("gg."))
  //   return;
  const type = reaction.substring(3);
  if (!type)
    throw new SyntaxError("gg.ownerType reaction must add a type");
  return function (e) {
    if (this.gesture)                             //todo an efficiency bump can occur here..
      return e;
    for (let at of this.ownerElement.attributes)
      if (at.type === type)
        return this.gesture = at, e;
    throw new Error(`${reaction}: can't find owner .gesture attribute: "${type}.`);
  };
});

class GestureAttr extends CustomAttr {
  //1. the GestureAttr produce events.
  //2. the GestureAttr cannot have any reactions, nor be _global
  //3. there can only be one instance of a GestureAttr on the same element.
  //4. The .stateMachine() must return an object with an empty string default state.
  upgrade() {
    if (this.chain.length > 1)
      throw new SyntaxError(`GestureAttr ${this.type} cannot contain reactions: ${this.name}`);
    if (this.name[0] === "_")
      throw new SyntaxError(`GestureAttr ${this.name} cannot be _global.`);
    for (let at of this.ownerElement.attributes)
      if (at !== this && at.type === this.type)
        throw new SyntaxError(`Cannot add the same GestureAttr ${this.type} to the same element twice: ${this.name}`);

    this._transitions = this.constructor.stateMachine(this.type, ...this.suffix);
    if (!this._transitions[""])    //todo this error should come at define time, not upgrade time
      throw new SyntaxError(`${this.constructor.name}.stateMachine(..) must return an object with a default, empty-string state.`);
    for (let state in this._transitions)
      this._transitions[state] = this._transitions[state].map(t => this.prepTransitions(t));

    //initializing state and data
    const [state, ...data] = this.value.split(" ");
    this._data = data;
    this._state = state;
    this.changeState();
  }

  prepTransitions([chain, next]) {
    chain = chain.split(":");
    chain.splice(1, 0, `gg.${this.type}`);
    next !== undefined && chain.push(`g.state_${next}`);
    return chain.join(":");
  }

  //Blocks locks .value from being set directly.
  // todo test this with a test of el.setAttribute("gesture", "some start value").
  set value(_) {
    throw new SyntaxError(`GestureAttr ${this.type} doesn't allow for setting the value via script`);
    //or can these GestureAttr only be added as empty to begin with? That they can only be instantiated from blank?
    //todo we can have different structures here.. Not sure.. It will not be testable.
  }

  get value() {
    return super.value;
  }

  render() {
    Object.getOwnPropertyDescriptor(Attr.prototype, "value").set.call(this, [this._state, ...this._data].join(" "));
  }

  set state(state) {
    if (Object.keys(this._transitions).indexOf(state) < 0)
      throw new SyntaxError(`The '${state}' state is unknown for GestureAttr '${this.type}'.`);
    this._previousState = this.state;
    this._state = state;
    this.render();
    this.changeState();
  }

  get state() {
    return this._state;
  }

  push(data) {
    this._data.push(data);
  }

  set(...data) {
    this._data = data;
    this.render();
  }

  get data() {
    return this._data;
  }

  changeState() {
    if (this._previousState !== undefined)
      for (let at of this._transitions[this._previousState])
        this.ownerElement.removeAttribute(at);
    for (let at of this._transitions[this.state])
      this.ownerElement.setAttribute(at, "");
  }

  destructor() {
    for (let at of this._transitions[this._previousState])
      this.ownerElement.removeAttribute(at);
    super.destructor?.();
  }
}