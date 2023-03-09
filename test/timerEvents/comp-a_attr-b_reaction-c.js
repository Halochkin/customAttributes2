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

export function reactionC(e, prefix, ...args){
  return prefix;
}