'use strict';

var deepDefaults = require('../lib/index'),
    assert = require('assert');

describe('deepDefaults()', function() {
    function expect(dest, src, expected) {
        it('deepDefaults(' + JSON.stringify(dest) + ', ' + JSON.stringify(src) + ') == ' + JSON.stringify(expected), function() {
            var actual = deepDefaults(dest, src);
            assert.deepEqual(actual, expected);
            assert.deepEqual(actual, dest);
        });
    }

    expect({}, {}, {});
    expect({}, undefined, {});
    expect({}, null, {});
    expect(undefined, undefined, undefined);
    expect(undefined, {}, undefined);
    expect(null, {}, null);
    expect(undefined, {a:1}, undefined);
    expect(null, {a:1}, null);

    expect({}, {a:1}, {a:1});
    expect({a:1}, {a:1}, {a:1});
    expect({a:2}, {a:1}, {a:2});
    expect({a:2}, {a:null}, {a:2});
    expect({a:2}, {a:undefined}, {a:2});
    expect({a:2}, {a:{}}, {a:2});
    expect({a:{}}, {a:1}, {a:{}});
    expect({a:null}, {a:1}, {a:null});
    expect({a:undefined}, {a:1}, {a:1});

    expect({a:2, b:1}, {a:1}, {a:2, b:1});
    expect({a:2, b:1}, {b:2}, {a:2, b:1});
    expect({a:2, b:1}, {a:1, b:2}, {a:2, b:1});
    expect({a:2, b:1}, {a:1, b:2, c:3}, {a:2, b:1, c:3});

    expect({a:{b:1}}, {}, {a:{b:1}});
    expect({a:{b:1}}, {a:1}, {a:{b:1}});
    expect({a:{b:1}}, {b:2}, {a:{b:1}, b:2});
    expect({a:{b:1, c:3}}, {b:2}, {a:{b:1, c:3}, b:2});
    expect({a:{b:1, c:3}}, {a:{}}, {a:{b:1, c:3}});
    expect({a:{b:1, c:3}}, {a:{b:2}}, {a:{b:1, c:3}});
    expect({a:{b:1, c:3}}, {a:{d:4}}, {a:{b:1, c:3, d:4}});
    expect({a:{}}, {a:{d:4}}, {a:{d:4}});

    expect({a:{b:1, c:2}, d:{e:3, f:4}, g:5}, {}, {a:{b:1, c:2}, d:{e:3, f:4}, g:5});
    expect({a:{b:1, c:2}, d:{e:3, f:4}, g:5}, {h:6}, {a:{b:1, c:2}, d:{e:3, f:4}, g:5, h:6});
    expect({a:{b:1, c:2}, d:{e:3, f:4}, g:5}, {a:6}, {a:{b:1, c:2}, d:{e:3, f:4}, g:5});
    expect({a:{b:1, c:2}, d:{e:3, f:4}, g:5}, {a:{k:7}}, {a:{b:1, c:2, k:7}, d:{e:3, f:4}, g:5});
    expect({a:{b:1, c:2}, d:{e:3, f:4}, g:5}, {a:{k:7}, d:{i:8}}, {a:{b:1, c:2, k:7}, d:{e:3, f:4, i:8}, g:5});

    expect({foo:'foo'}, {foo:'foo'}, {foo:'foo'});
    expect({foo:'foo'}, {}, {foo:'foo'});
    expect({}, {foo:'foo'}, {foo:'foo'});
    expect({foo:7}, {foo:'foo'}, {foo:7});
    expect({foo:'foo'}, {foo:7}, {foo:'foo'});
    expect({foo:{}}, {foo:'foo'}, {foo:{}});
    expect({foo:{bar:7}}, {foo:'foo'}, {foo:{bar:7}});
    expect({foo:{bar:'foobar'}}, {foo:'barfoo'}, {foo:{bar:'foobar'}});
    expect({foo:'barfoo'}, {foo:{bar:'foobar'}}, {foo:'barfoo'});

    // arrays are not merged
    expect({}, {foo: [4,5,6]}, {foo: [4,5,6]});
    expect({foo: [1,2,3]}, {foo: [4,5,6]}, {foo: [1,2,3]});
    expect({foo: [1,2,3]}, {foo: 'bar'}, {foo: [1,2,3]});
    expect({foo: [1,2,3]}, {foo: [1,2,3,4]}, {foo: [1,2,3]});
});