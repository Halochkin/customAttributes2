customReactions.define("await", async e => (await Promise.resolve(), e));
customReactions.define("typeval", function (_, _, type, state) {
  for (let at of this.ownerElement.attributes)
    if (at.type === type)
      return this.ownerElement.setAttribute(at.name, state);//todo or use the setter .value
});

class GestureAttr extends CustomAttr {
  //1. the GestureAttr produce events.
  //2. the GestureAttr cannot have any reactions, nor be _global
  //3. there can only be one instance of a GestureAttr on the same element.
  //4. The .stateMachine() must return an object with an empty string default state.
  upgrade() {
    if (this.chain.length)
      throw new SyntaxError(`GestureAttr ${this.type} cannot contain reactions: ${this.name}`);
    if (this.global)
      throw new SyntaxError(`GestureAttr ${this.name} cannot be _global.`);
    for (let at of this.ownerElement.attributes)
      if (at !== this && at.type === this.type)
        throw new SyntaxError(`Cannot add the same GestureAttr ${this.type} to the same element twice: ${this.name}`);

    this._transitions = this.constructor.stateMachine(this.suffix);
    if (!this._transitions[""])
      throw new SyntaxError(`${this.constructor.name}.stateMachine(..) must return an object with a default, empty-string state.`);
    for (let state in this._transitions)
      this._transitions[state] = this._transitions[state].map(([chain, next]) =>
        next ? chain + `:await:typeval_${this.type}_${next}` : chain);
//    this.value = this.value || Object.keys(this._transitions)[0];
  }

  changeCallback(oldState) {
    if (oldState)
      for (let attr of this._transitions[oldState])
        this.ownerElement.removeAttribute(attr);
    for (let attr of this._transitions[this.value])
      this.ownerElement.setAttribute(attr, "");
  }
}