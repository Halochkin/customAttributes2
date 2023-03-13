class SwipeEvent extends MouseEvent {
  constructor(type, dict, start) {
    super(type, dict);
    this.start = start;
    this.end = dict.x;
  }

  get direction() {
    //return ((Math.atan2(y, -x) * 180 / Math.PI) + 270) % 360;
    return this.end >= this.start ? "right" : "left";
  }

  get length() {
    return Math.abs(this.end - this.start);
  }
}

customReactions.define("event", (e, _, type) => new e.constructor(type, e));
customAttributes.define("swipeable", class SwipeAttr extends GestureAttr {

  swipe(e) {
    return new SwipeEvent(this.type.slice(0, -4), e, this.data);
  }

  checkCancel(e) {
    return Math.abs(e.x - this.data[0]) < this.suffix[0] ?
      eventLoop.dispatch(new e.constructor("swipe-cancel", e), this.ownerElement) :
      e;
  }

  static stateMachine() {
    return {
      "": [["mousedown:.g.set_e.x:event_swipe-start:dispatch", "start"]],
      start: [
        [`_mouseup:g.check-cancel_e::g.swipe_e:dispatch`, ""],
        ["_blur:event_swipe-cancel:dispatch", ""],
        ["_selectstart:prevent", ""]
      ]
    };
  }
});