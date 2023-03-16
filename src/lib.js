(function () {
  async function _fetch(body, _, type = "text", method = "GET") { //fetch_json and fetch_text_POST
    return await (await fetch(this.value, method.toUpperCase() === "POST" ? {method, body} : undefined))[type]();
  }
})();