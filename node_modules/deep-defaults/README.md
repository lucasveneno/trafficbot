# deep-defaults

[![NPM](https://nodei.co/npm/deep-defaults.png?compact=true)](https://nodei.co/npm/deep-defaults/)

Recursive version of _.defaults.

```javascript
var deepDefaults = require('deep-defaults');

console.log(JSON.stringify(deepDefaults(
    {"a":1}, 
    {"a":5,"b":10})));
    // {"a":1,"b":10} 

console.log(JSON.stringify(deepDefaults(
    {"a":{"b":1,"c":2},"d":{"e":3,"f":4},"g":5}, 
    {"a":{"k":7},"d":{"i":8}}))); 
    // {"a":{"b":1,"c":2,"k":7},"d":{"e":3,"f":4,"i":8},"g":5} 
```


## Examples
- deepDefaults({}, {}) == {} 
- deepDefaults({}, undefined) == {} 
- deepDefaults({}, null) == {} 
- deepDefaults(undefined, undefined) == undefined 
- deepDefaults(undefined, {}) == undefined 
- deepDefaults(null, {}) == null 
- deepDefaults(undefined, {"a":1}) == undefined 
- deepDefaults(null, {"a":1}) == null 
- deepDefaults({}, {"a":1}) == {"a":1} 
- deepDefaults({"a":1}, {"a":1}) == {"a":1} 
- deepDefaults({"a":2}, {"a":1}) == {"a":2} 
- deepDefaults({"a":2}, {"a":null}) == {"a":2} 
- deepDefaults({"a":2}, {}) == {"a":2} 
- deepDefaults({"a":2}, {"a":{}}) == {"a":2} 
- deepDefaults({"a":{}}, {"a":1}) == {"a":{}} 
- deepDefaults({"a":null}, {"a":1}) == {"a":null} 
- deepDefaults({}, {"a":1}) == {"a":1} 
- deepDefaults({"a":2,"b":1}, {"a":1}) == {"a":2,"b":1} 
- deepDefaults({"a":2,"b":1}, {"b":2}) == {"a":2,"b":1} 
- deepDefaults({"a":2,"b":1}, {"a":1,"b":2}) == {"a":2,"b":1} 
- deepDefaults({"a":2,"b":1}, {"a":1,"b":2,"c":3}) == {"a":2,"b":1,"c":3} 
- deepDefaults({"a":{"b":1}}, {}) == {"a":{"b":1}} 
- deepDefaults({"a":{"b":1}}, {"a":1}) == {"a":{"b":1}} 
- deepDefaults({"a":{"b":1}}, {"b":2}) == {"a":{"b":1},"b":2} 
- deepDefaults({"a":{"b":1,"c":3}}, {"b":2}) == {"a":{"b":1,"c":3},"b":2} 
- deepDefaults({"a":{"b":1,"c":3}}, {"a":{}}) == {"a":{"b":1,"c":3}} 
- deepDefaults({"a":{"b":1,"c":3}}, {"a":{"b":2}}) == {"a":{"b":1,"c":3}} 
- deepDefaults({"a":{"b":1,"c":3}}, {"a":{"d":4}}) == {"a":{"b":1,"c":3,"d":4}} 
- deepDefaults({"a":{}}, {"a":{"d":4}}) == {"a":{"d":4}} 
- deepDefaults({"a":{"b":1,"c":2},"d":{"e":3,"f":4},"g":5}, {}) == {"a":{"b":1,"c":2},"d":{"e":3,"f":4},"g":5} 
- deepDefaults({"a":{"b":1,"c":2},"d":{"e":3,"f":4},"g":5}, {"h":6}) == {"a":{"b":1,"c":2},"d":{"e":3,"f":4},"g":5,"h":6} 
- deepDefaults({"a":{"b":1,"c":2},"d":{"e":3,"f":4},"g":5}, {"a":6}) == {"a":{"b":1,"c":2},"d":{"e":3,"f":4},"g":5} 
- deepDefaults({"a":{"b":1,"c":2},"d":{"e":3,"f":4},"g":5}, {"a":{"k":7}}) == {"a":{"b":1,"c":2,"k":7},"d":{"e":3,"f":4},"g":5} 
- deepDefaults({"a":{"b":1,"c":2},"d":{"e":3,"f":4},"g":5}, {"a":{"k":7},"d":{"i":8}}) == {"a":{"b":1,"c":2,"k":7},"d":{"e":3,"f":4,"i":8},"g":5} 
- deepDefaults({"foo":"foo"}, {"foo":"foo"}) == {"foo":"foo"} 
- deepDefaults({"foo":"foo"}, {}) == {"foo":"foo"} 
- deepDefaults({}, {"foo":"foo"}) == {"foo":"foo"} 
- deepDefaults({"foo":7}, {"foo":"foo"}) == {"foo":7} 
- deepDefaults({"foo":"foo"}, {"foo":7}) == {"foo":"foo"} 
- deepDefaults({"foo":{}}, {"foo":"foo"}) == {"foo":{}} 
- deepDefaults({"foo":{"bar":7}}, {"foo":"foo"}) == {"foo":{"bar":7}} 
- deepDefaults({"foo":{"bar":"foobar"}}, {"foo":"barfoo"}) == {"foo":{"bar":"foobar"}} 
- deepDefaults({"foo":"barfoo"}, {"foo":{"bar":"foobar"}}) == {"foo":"barfoo"} 
- deepDefaults({}, {"foo":[4,5,6]}) == {"foo":[4,5,6]} 
- deepDefaults({"foo":[1,2,3]}, {"foo":[4,5,6]}) == {"foo":[1,2,3]} 
- deepDefaults({"foo":[1,2,3]}, {"foo":"bar"}) == {"foo":[1,2,3]} 
- deepDefaults({"foo":[1,2,3]}, {"foo":[1,2,3,4]}) == {"foo":[1,2,3]} 
