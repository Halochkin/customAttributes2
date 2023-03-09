import("https://unpkg.com/diff@5.0.0/dist/diff.js");

function consoleLogMonkey() {
  console.log = function consoleLogMonkey(...args) {
    return parent.postMessage(JSON.stringify([_TestHTML_id, ...args]), '*');
  }
}

//todo 2. make a better view per element.  Make the link on the iframe? then, make the diff something you see when you click on it.
//todo make the view as a little grid?
//language=HTML
const template = `
  <style>
    :host { display: block; height: 1em; overflow: hidden; }
    :host([state]) { border-left: 5px solid green; }
    :host([state=maybe]) { border-left: 5px solid orange; }
    :host([state=error]) { border-left: 5px solid red; }

    #diff, #code { white-space: pre-wrap; border: 4px double lightblue; }
    .added {color: green}
    .removed {color: red}
    iframe { height: 10px; width: 10px; display: inline-block; }

    :host([active]) { height: 60vh; overflow: scroll; }
    :host([active]) iframe { height: auto; width: auto; display: block;}
    /*:host([active]) #diff, #code { display: block;}*/
  </style>
  <b id="alt"></b><span id="title"></span><a id="link" target="_blank">(=> new tab)</a> <a id="clipboard">[copy
    JSON-result]</a>
  <iframe id="iframe"></iframe>
  <div id="diff"></div>
  <div id="code"></div>
`;

class TestHTML extends HTMLElement {

  static stringify(ar) {
    return `[\n${ar.map(row => `      ${JSON.stringify(row)}`).join(',\n')}\n]`;
  }

  static #count = 0;
  #id = TestHTML.#count++;

  constructor() {
    super();
    this.attachShadow({mode: "open"});
    this.shadowRoot.innerHTML = template;
    this.insertAdjacentHTML("beforeend", "<script result>[]</script>");
    window.addEventListener('message', e => this.onMessage(e));
    this.shadowRoot.addEventListener('dblclick', e => this.onDblclick(e));
    const clipboard = this.shadowRoot.getElementById('clipboard');
    clipboard.addEventListener('click', _ => navigator.clipboard.writeText(this.result));
  }

  get result() {
    return this.querySelector(":scope>script[result]").textContent;
  }

  set result(v) {
    this.querySelector(":scope>script[result]").textContent = v;
  }

  onMessage(e) {
    const res = JSON.parse(e.data);
    if (!(res instanceof Array) || res.shift() !== this.#id)
      return;
    let ar = JSON.parse(this.result);
    ar.push(res.length === 1 ? res[0] : res);
    if (this.hasAttribute("sort"))
      ar.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en-us"));
    this.render(this.result = TestHTML.stringify(ar));
  }

  static xPathQuoteEscapeBugFix(txt) {
    return "concat('','" + txt.split(/'/).join('\',"\'",\'') + "')";
  }

  render(txt) {
    let state = "error", match;
    if (match = document.evaluate(`//script[@expected][contains(text(), ${TestHTML.xPathQuoteEscapeBugFix(txt)})]`, this, null, XPathResult.ANY_TYPE, null).iterateNext())
      state = "ok";
    else if (match = document.evaluate(`//script[@expected][starts-with(text(), ${TestHTML.xPathQuoteEscapeBugFix(txt.slice(0, -2))})]`, this, null, XPathResult.ANY_TYPE, null).iterateNext())
      state = "maybe";
    this.setAttribute("state", state);
    if (match)
      this.shadowRoot.getElementById("alt").textContent = match.getAttribute("expected");
  }

  onDblclick() {
    this.hasAttribute('active') ? this.removeAttribute('active') : this.setAttribute('active', '');
  }

  onActive() {
    if (this.hasAttribute("ok")) {
      const ok = this.getAttribute('ok');
      this.shadowRoot.getElementById("diff").innerHTML = this.querySelector(`script[expected="${ok}"]`).textContent;
    } else {
      const e = this.querySelector("script[expected]").textContent;
      const r = this.querySelector("script[result]").textContent;
      this.shadowRoot.getElementById("diff").innerHTML =
        Diff.diffWords(e, r).map(p => `<span class="${p.added ? 'added' : p.removed ? 'removed' : ''}">${p.value}</span>`).join('');
    }
  }

  async onTest(newValue) {
    //clean up the text in <script expected>s.
    for (let expect of this.querySelectorAll(":scope > script[expected]"))
      expect.textContent = TestHTML.stringify(JSON.parse(expect.textContent));
    //load the text content for the newValue of the test.
    this.shadowRoot.getElementById("title").textContent = newValue.substr(newValue.lastIndexOf('/') + 1);
    const testUrl = new URL(newValue, document.location);
    this.shadowRoot.getElementById("link").setAttribute('href', testUrl);
    const testTxt = await (await fetch(testUrl)).text();
    this.shadowRoot.getElementById("code").textContent = testTxt;
    const txt = `<base href='${testUrl}'/><script>_TestHTML_id=${this.#id};(${consoleLogMonkey.toString()})();</script>${testTxt}`;
    this.shadowRoot.getElementById("iframe").src = `data:text/html;charset=utf-8,${encodeURIComponent(txt)}`;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'test')
      this.onTest(newValue);
    else if (name === 'active' && newValue !== null)
      this.onActive();
  }

  static get observedAttributes() {
    return ['test', 'active'];
  }
}

try {
  customElements.define('test-html', TestHTML);
} catch (err) {
  //test-html already defined.
}