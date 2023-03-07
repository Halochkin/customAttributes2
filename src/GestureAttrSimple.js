//todo the "o." reaction
customReactions.defineRule(function (fullReaction) {
  const match = fullReaction.match(/^o\.(\w+)\.(.+)/);
  if (!match)
    return;
  const [_, type, reaction] = match;
  const reactionImpl = customReactions.getDefinition(reaction);
  if (reactionImpl)            //else undefined
    return function (...args) {
      let owner;
      for (let at of this.ownerElement.attributes)
        if (at.type === type) {
          owner = at;
          break;
        }
      if (!owner)
        throw new Error(`${fullReaction}: can't find owner attribute: "${type}.`);
      // delete this attribute together with the owner.
      // const fullOwnerName = owner.name;
      // const ownerRemoved = new MutationObserver(mrs=>{
      //   debugger;
      //   if(!mrs[0].target.hasAttribute(fullOwnerName))  //check if the attribute is removed.
      //     this.ownerElement.removeAttribute(this.name);
      // }); //adding the owner attribute in a closure. I think it is ok.
      // ownerRemoved.observe(this.ownerElement, {attributes:true, attributeFilter: [fullOwnerName]});
      return reactionImpl.call(owner, ...args);
    };
});

customReactions.define("value", function (e, _, state) {
  this.ownerElement.setAttribute(this.name, state);
  return state;
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
      this._transitions[state] = this._transitions[state].map(
        ([chain, next]) => next ? chain + `:await:o.${this.type}.value_${next}` : chain);
  }

  changeCallback(oldState) {
    if (oldState !== undefined)
      for (let attr of this._transitions[oldState])
        this.ownerElement.removeAttribute(attr);
    for (let attr of this._transitions[this.value])
      this.ownerElement.setAttribute(attr, "");
  }
}