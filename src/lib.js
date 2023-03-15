(function () {
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

  function dispatch(e, _, querySelector) {
    const target = querySelector ? document.querySelector(querySelector) : this.ownerElement;
    eventLoop.dispatch(e, target);
    return e;
  }

  function dispatchDetail(e, prefix, name = prefix) {
    return dispatch.call(this, (function (data, prefix) {
      return new CustomEvent(prefix, data);
    }).call(this, e, name));
  }

  function dispatchClone(e, prefix, type = prefix) {
    const c = new e.constructor(type, e);
    return eventLoop.dispatch(c, this.ownerElement), c;
  }

  async function _fetch(body, _, type = "text", method = "GET") { //fetch_json and fetch_text_POST
    return await (await fetch(this.value, method.toUpperCase() === "POST" ? {method, body} : undefined))[type]();
  }

  window.lib = {
    parentToggleAttr,
    event: (e, prefix) => e instanceof Event ? new e.constructor(prefix, e) :
      e instanceof String || typeof e === "string" ? new Event(e) :
        new CustomEvent(prefix, e),
    dispatch,
    dispatchDetail,
    dispatchClone, //todo untested
    fetch: _fetch,  //todo untested
  };
})();