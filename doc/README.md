# What is `customReactions` ?

`customReactions` - a custom reaction is an "event listener" that you can attach to a custom attribute in html.

## Why to `customReactions` ?

Using custom reactions enable you to see in the html which reactions/event listeners will happen for which event in the different branches. and it will enable you to add custom functionality and uix and reactivity to any html element.

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

    It is possible to have several functions that should be activated when an event is triggered, so each function must have
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

It is also possible to define a DOM object property name as a filter name and its value as a function. This approach is called `method on element`:

3. `Method on element`
   
    This allows to call a function if the element has its name in the attribute, but it is not defined using either of the
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
 
As arguments, the callback function takes the event. And as a context (this), it takes an attribute.

> To pass a default value to a function, add it to the filter value:

   ```html
        <h1 click:on="sayHi">hello on-click_shift</h1>
   ```

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

### Syntax 

There are several operators that allow you to control the behavior of an event:

* `:` - operator between actions. Actually call it a pipe operator. similar to  `|` . But `|` is not a valid attribute character.
   <br>
   <br>
   It is basic operator, you saw it in the examples above, it separates the event name from the filter name.

   #### `:` example 

     You can use it to chain filters

    ```[click<:>function1="Hello"<:>functionName2="World"]```

   ```html
        <h1 click:on="sayHi":do="sayGoodbye"></h1>
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

* ``