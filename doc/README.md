# What is `customReactions` ?

`customReactions` - a custom reaction is an "event listener" that you can attach to a custom attribute in html.

## Why to `customReactions` ?

Using custom reactions enable you to see in the html which reactions/event listeners will happen for which event in the
different branches. and it will enable you to add custom functionality and uix and reactivity to any html element.

## How to `customReactions` ?

In order to call the event callback function, it is necessary to define its name (`filter name`). We call it **filter
name** in next explanations.

> One more time, function name = filter name in context of `customReactions`.

The defined filter name serves as the identifier of the function in the attribute value.

```[<eventName> : <filterName>]```

There are two methods to determine the filter name :

1. `.define(filterName, cb)` - defines the name of the function, and the function that will be called.

    * _`filterName`_  - name of the filter;
    * _`cb`_  - function that will be called when the event is triggered.

     ```javascript
            customReactions.define("function1", (e) => { /* actions */ });
     ```

   It is possible to have several functions that should be activated when an event is triggered, so each function must
   have
   its own unique name.

   ```[<eventName> : <filterName1> : <filterName1> : . . .]```

To easily define multiple filters, there is `.defineAll()`.

2. `.defineAll({filterName, cb})` - Allows you to register multiple filters at the same time.

   Unlike `.define()`, this method takes an object where the key is the filter name and the value is the function.

   ```javascript
        customReactions.defineAll({
          "function1": (e) => { /*do this*/ },
          "function2": (e) => { /*do that*/ },
          // . . .
        });
    ```

It is also possible to define a DOM object property name as a filter name and its value as a function. This approach is
called `method on element`:

3. `Method on element`

   This allows to call a function if the element has its name in the attribute, but it is not defined using either of
   the
   two methods described above.

    ```html
        <h1 click:sayHi>hello on-click_shift</h1>
      ```
   Where `sayHi` filter defines as:

    ```javascript
        const h1 = document.querySelector("h1");
        h1.sayHi = (e) => {/* do something */}
    ```

   > We do not recommend this approach, but rather use either `define()` or `defineAll()`.

### What data is passed to the callback function?

As arguments, the callback function takes the event. And as a context (`this`), it takes an attribute.

To pass a default value to a function, add it to the filter value:

   ```html
   <h1 click:on="sayHi">hello on-click_shift</h1>
   ```

> Note: The default value can only be applied to the last filter, because the html syntax does not allow the attribute
> to be defined twice.

```javascript
function test(e) {
  console.log(e, this, this.value);
}

customReactions.define("on", test);
const h1 = document.querySelector("h1");
h1.click();
```

Output:

```
> {Click event}, click:on="sayHi", "sayHi"
```

> Note: Be careful with arrow functions, when using arrow functions, the context `this === window`. When you plan to
> use `this` keyword, declare function as normal `function`.

### Operators

There are several operators that allow you to control the behavior of an event:

* #### `.` - A dotReaction (dot notation) is a reaction that directly mirrors the js function.
  The *`.`* in the `.` is a property operator, and essentially fullfills the same function as a `.` in JS.

  Dot notation rules:
    1. The expression must contain a `.` character. If it doesn't contain a `.` character, it is interpreted as a
       string (and reaction definition). If it contains a dot, then it is a dot expression.

       ```html
       <div _click:console.log_e.type></div>
       ```

       It is equivalent to:

       ```javascript
       const div = document.querySelector("div");
       div.addEventListener("click", e=>console.log(e.type));
       ```

       Output:
        ```
        "click"
        ```

    2. If the dot expression begins with a `.`, then it will be interpreted as a property on window.

       ie.
       ```
         .get-computed-style = window.get-computed-style = window.getComputedStyle
       ```

        ```html
       <style>
          div{
            width: 100px;
         }
       </style>

       <div _click:.get-computed-style_this.owner-element:console.log_e.width>hello sunshine</div>
        ```
       It is equivalent to:

       ```javascript
       function onClick(e){
        const attribute = e.target.attributes[0];
        const div = attribute.ownerElement();
        const computedStyle = getComputedStyle(div);
        console.log(computedStyle.getPropertyValue("width"));
       }
       ```
       
       Output:
        ```
        "100px"
        ```     
       
    4. If the dot expression ends with a `.`, then it is a property `getter`.

        ```html
        <div _click:.get-computed-style.:console.log_e.name></div>
        ```
       It is equivalent to:

       ```javascript
       const div = document.querySelector("div");
       const getter = window.getComputedStyle;
       div.addEventListener("click", console.log(getter.name));
       ```
       Output:
        ```
        "getComputedStyle"
        ```       

    5. If the dot expression does not end with a dot, then it is a function call or `setter` for a property.
       
       ```html
        <div _click:window.test_bobsy:console.log_window.test></div>
        ```
       This code is equivalent to:
  
       ```javascript
        window.test = "bobsy";
        const div = document.querySelector("div");
        div.addEventListener("click", console.log(window.test));
       ```
       Output:
        ```
        "bobsy"
        ```        

    6. Dot expressions can be both prefixes and suffixes.

       ```html
        <div click:window.test_bobsy:console.log_window.test></div>
        ```
       This code is equivalent to:

       ```javascript
        window.test = "bobsy";
        const div = document.querySelector("div");
        div.addEventListener("click", console.log(window.test));
       ```
       Output:
       ```
       "bobsy"
       ```        
           
    7. If the dot expression suffix starts with tripple dots, it is an array that will be spread first and the call will be
       interpreted as an apply. Tripple dots only makes sense on arguments, as in JS.

       ```html
        <div _click:console.log_...e.detail></div>
        ```
       This code is equivalent to:

       ```javascript
        const div = document.querySelector("div");
        div.addEventListener("click", e=> console.log(e.detail));
        eventLoop.dispatch(new CustomEvent("click", {detail: [1, 2]}), document.body);
       ```
       Output:
       ```
       1 2
       ```      

       >  The `.` at the end is only there to override function call for arguments
    
   
* #### `:` - operator between actions. 
  Actually call it a pipe operator. similar to  `|` . But `|` is not a valid attribute
  character.
  <br>
  <br>
  It is basic operator, you saw it in the examples above, it separates the event name from the filter name.
   ##### `:` example

  You can use it to chain filters

  ```[click<:>function1<:>functionName2="World"]```

   ```html
   <h1 click:on:do="sayGoodbye"></h1>
   ```

    ```javascript
    function test(e) {
     console.log(this.value);
    }

    customReactions.define("on", test);
    customReactions.define("do", (e)=>{console.log(this.value + "sunshine")});
    const h1 = document.querySelector("h1");
    h1.click();
     ```
  Output:
     ```
     > sayHi
     > sayGoodbye sunshine 
     ```


* #### `::` - default action operator.

  Default actions allow developers to control the execution of a specific reaction to an event, rather than a multitude
  of other reactions. This is especially important when reactions are added within web components, but it is also
  important when many different elements in the same hierarchy can add a default action to the same event, depending on
  the dom context and event content.

  ```html
  <div click:filter:e.prevent-default>Hello
   <h1 click::dispatch_toggle>sunshine</h1>
  </div>
  
  <script>
    document.addEventListener("toggle", e=> console.log(e.type))
    
     customReactions.defineAll({
    "filter": function(e, prefix, suffix){
      if(e.target.tagName === "H1")
        return e;
     },
    "dispatch": function (e, prefix, suffix){
      let event = new Event(suffix);
      document.dispatchEvent(event);
     }
    });
   document.querySelector("h1").click();
   document.querySelector("div").click();
  </script>
  ```



* #### `_` - function name and argument separators

  It is the customReaction equivalent of function (,,). "<filterName>(one,two)" cannot be written as attributes
  because `()`, are illegal  characters. Therefore, the reaction must be written as `"reaction_one_two"`.

  ##### `_` example

  ```[click<:>function1<_>ArgumentA<_>ArgumentB]```

   ```html
   <h1 click:filterA_one_two></h1>
   ```

   ```javascript
   function filterA(e, prefix, one, two){
     console.log(e, prefix, one, two)
   }
  
   customReactions.define("filterA", filterA);
   const h1 = document.querySelector("h1");
   h1.click();
   ```
  Output:

    ```
    > {ClickEvent}, "filterA", "one", "two"
    ```  

  As you can see from the demonstration, we can pass several default values by listing them with `_`.

### Summary


