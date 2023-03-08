// class DotPath {
//
//   constructor(part) {
//     const getter = part.endsWith(".") ? 1 : 0;
//     const spread = part.startsWith("...") ? 3 : 0;
//     let path = part.substring(spread, part.length - getter);
//     if (path[0] === ".")
//       path = path.substring(1);
//     this.getter = getter;
//     this.spread = spread;
//     this.dots = path.split(".").map(ReactionRegistry.toCamelCase);
//     if (this.dots[0] !== "e" && this.dots[0] !== "this" && this.dots[0] !== "window")
//       this.dots.unshift("window");
//   }
//
//   interpret(e, attr) {
//     const res = [this.dots[0] === "e" ? e : this.dots[0] === "this" ? attr : window];
//     for (let i = 1; i < this.dots.length; i++)
//       res[i] = res[i - 1][this.dots[i]];
//     return res;
//   }
//
//   interpretDotArgument(e, attr) {
//     const objs = this.interpret(e, attr);
//     const last = objs[objs.length - 1];
//     const lastParent = objs[objs.length - 2];
//     return this.getter || !(last instanceof Function) ? last : last.call(lastParent);
//   }
// }
//
// function runDotExpression(e, ...dotParts) {
//   dotParts = dotParts.slice(1);//todo remove the shit ._ rule
//   const prefix = new DotPath(dotParts[0]);
//   const objs = prefix.interpret(e, this);
//   const last = objs[objs.length - 1];
//   if (prefix.getter || dotParts.length === 1 && !(last instanceof Function))
//     return last;
//   const lastParent = objs[objs.length - 2]
//   return last.call(lastParent, ...dotParts.slice(1));
//   // const args = [];
//   // for (let i = 1; i < dotParts.length; i++) {
//   //   const dotPart = dotParts[i];
//   //   const arg = dotPart?.dots ? dotPart.interpretDotArgument(e, this) : dotPart;
//   //   dotPart.spread ? args.push(...arg) : args.push(arg);
//   // }
//   // // const lastParent = objs[objs.length - 2]
//   // if (last instanceof Function)
//   //   return last.call(lastParent, ...args);
//   // lastParent[prefix.dots[prefix.dots.length - 1]] = args.length === 1 ? args[0] : args;
//   // return e;
// }
//
// // function parseDotExpression(parts) {
// //   const dotParts = parts.map(parsePartDotMode);
// //   if (dotParts[0].spread)
// //     throw "spread on prefix does not make sense";
// //   if (dotParts[0].length > 1 && dotParts[0].getter)
// //     throw "this dot expression has arguments, then the prefix cannot be a getter (end with '.').";
// //   return dotParts;
// // }
// //
// // function parsePartDotMode(part) {
// //   const PRIMITIVES = {
// //     true: true,
// //     false: false,
// //     null: null,
// //     undefined: undefined
// //   };
// //   if (part in PRIMITIVES)
// //     return PRIMITIVES[part];
// //   if (!isNaN(part))
// //     return Number(part);
// //   if (part === "e" || part === "this" || part === "window" || part.indexOf(".") >= 0)
// //     return new DotPath(part);
// //   return part;
// // }

customReactions.defineRule(function (fullReaction) {
  const reaction = fullReaction.split("_")[0];
  let props = reaction.split(".");
  if (props.length < 2)
    return;
  if (props[0] === "") props[0] = "window";
  if (props[0] !== "e" && props[0] !== "this" && props[0] !== "window")
    props.unshift("window");
  props = props.map(ReactionRegistry.toCamelCase);
  const root = props.shift();
  const getter = props[props.length - 1] === "";
  if (getter) props.pop();
  return function (e, _, ...args) {
    e = root === "e" ? e : (root === "this") ? this : /*window|""*/ window;
    let previous;
    for (let i = 0; i < props.length; i++) {
      let prop = props[i];
      previous = e;
      e = e[prop];
      if (e === undefined && i !== props.length - 1)
        return e;
    }
    if (!getter && previous && e instanceof Function)
      return e.call(previous, ...args);
    if (args.length > 0)    //todo this is a setter
      return previous[props[props.length - 1]] = args.length === 1 ? args[0] : args;
    return e;
  };

  // return runDotExpression;
  // const dotParts = parseDotExpression(fullReaction.substring(2).split("_"));
  // return function (e) {
  //   return runDotExpression.call(this, e, ...dotParts);
  // };
});