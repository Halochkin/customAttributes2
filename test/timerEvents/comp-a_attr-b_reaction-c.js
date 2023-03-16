export class CompA extends HTMLElement {
  constructor() {
    super();
    this.click();
  }
}

export class AttrB extends CustomAttr {
  upgrade(){
    eventLoop.dispatch(new CustomEvent(this.type, {detail: this.suffix}), this);
  }
}

export function reactionA(e, _, ...args){
  console.log("reaction a");
}

export function reactionB(e, _, ...args){
  console.log("reaction b");
}

export function reactionC(e, _, ...args){
  return "reaction-c";
}