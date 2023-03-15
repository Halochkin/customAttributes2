(function () {
  function toggleAttr(e, prefix) {
    const el = this.ownerElement;
    el.hasAttribute(prefix) ? el.removeAttribute(prefix) : el.setAttribute(prefix);
    return e;
  }

  function parentToggleAttr(e, prefix, suffix) {
    suffix = suffix?.toUpperCase();
    let el = this.ownerElement.parentElement;
    while (el && suffix && el.tagName !== suffix)
      el = el.parentElement;
    if (!el)
      return;
    el.hasAttribute(prefix) ? el.removeAttribute(prefix) : el.setAttribute(prefix);
    return e;
  }

  function newEvent(e, prefix) {
    return eventLoop.dispatch(new Event(prefix), this.ownerElement), e;
  }

  function cloneEvent(e, prefix) {
    return new e.constructor(prefix, e);
  }

  function customEvent(data, prefix) {
    return new CustomEvent(prefix, data);
  }

  function dispatch(e, _, querySelector) {
    const target = querySelector ? document.querySelector(querySelector) : this.ownerElement;
    eventLoop.dispatch(e, target);
    return e;
  }

  function dispatchDetail(e, prefix, name = prefix) {
    return dispatch.call(this, customEvent.call(this, e, name));
  }

  function dispatchClone(e, prefix, type = prefix) {
    const c = new e.constructor(type, e);
    return eventLoop.dispatch(c, this.ownerElement), c;
  }

  function toCamelCase(strWithDash) {
    return strWithDash.replace(/-([a-z])/g, g => g[1].toUpperCase());
  }

  function cssClass(e, css, onOff) {
    if (onOff === undefined || onOff === "on")
      this.ownerElement.classList.add(css);
    else if (onOff === "off")
      this.ownerElement.classList.remove(css);
    return e;
  }

  async function _fetch(body, _, type = "text", method = "GET") { //fetch_json and fetch_text_POST
    return await (await fetch(this.value, method.toUpperCase() === "POST" ? {method, body} : undefined))[type]();
  }

  window.lib = {
    toggleAttr,
    parentToggleAttr,
    newEvent,
    cloneEvent,
    customEvent,
    dispatch,
    dispatchDetail,
    dispatchClone, //todo untested
    cssClass,
    toCamelCase,
    fetch: _fetch,  //todo untested
  };
})();