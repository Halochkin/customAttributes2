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

export function reactionA(e, prefix, ...args){
  console.log("reaction a");
}

export function reactionB(e, prefix, ...args){
  console.log("reaction b");
}

export function reactionC(e, prefix, ...args){
  return prefix;
}