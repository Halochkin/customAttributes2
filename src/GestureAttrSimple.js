//todo rename to g.., g., g.state. and more??  or g_, g., g-state_ etc? have only one rule??
customReactions.defineRule(function (fullReaction) {                   //o..swipeable
  const type = fullReaction.match(/^o\.\.([a-zA-Z0-9]+)$/)?.[1];
  if (!type)
    return;
  return function (e) {
    if (this.owner)                             //todo an efficiency bump can occur here..
      return e;
    for (let at of this.ownerElement.attributes)
      if (at.type === type)
        return this.owner = at, e;
    throw new Error(`${fullReaction}: can't find owner attribute: "${type}.`);
  };
});

customReactions.defineRule(function (fullReaction) {                   //o.value_observe
  const reaction = fullReaction.match(/^o\.(.+)/)?.[1];
  if (!reaction)
    return;
  const reactionImpl = customReactions.getDefinition(reaction);
  if (!reactionImpl)
    return;
  return function (...args) {
    return reactionImpl.call(this.owner, ...args);
  };
});

customReactions.define("value", function (e, _, state) {  //todo rename?
  return this.value = state;
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
      this._transitions[state] = this._transitions[state].map(([chain, next]) => {
        if (next)
          chain += `:await:o.value_${next}`;
        chain = chain.split(":");
        chain.splice(1, 0, `o..${this.type}`);
        return chain.join(":");
      });
  }

  changeCallback(oldState) {
    if (oldState !== undefined)
      for (let attr of this._transitions[oldState])
        this.ownerElement.removeAttribute(attr);
    for (let attr of this._transitions[this.value])
      this.ownerElement.setAttribute(attr, "");
  }

  destructor() {
    for (let attr of this._transitions[this.value])
      this.ownerElement.removeAttribute(attr);
    super.destructor?.();
  }
}