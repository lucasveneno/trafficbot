
# better-batch

  Run jobs in parallel with concurrency control, argument passing, and generator function support.

## Installation

Node:

```bash
$ npm install better-batch
```

Browser (with Duo):

```js
var Batch = require('matthewmueller/batch');
```

## Example

```js
Batch()
  .push(function *(url) {
    var res = yield get(url);
    return res.status;
  })
  .push(function(url, fn) {
    get(url, function(err, res) {
      return fn(err, res.status);
    })
  })
  .end('http://github.com', function(err, statuses) {
    if (err) throw err;
    console.log(statuses);
  });
```

## Differences from [visionmedia/batch](https://github.com/visionmedia/batch)

- Generator and synchronous function support
- Support for passing arguments through `batch.end([args, ...], fn)`
- Composable and support for passing arrays into Batch([batch1, batch2]) or `batch.push([fn1, fn2])`
- Does not have "progress" events. I've never needed them, but feel free to open a PR if you need them :-)

## API

### `Batch([fn|generator|array|batch])`

Initialize a `batch`. Optionally supports passing a function, generator, array or another batch instance.

### `Batch.push([fn|array|batch|generator])`

Add a job to `batch`. Optionally supports passing a function, generator, array or another batch instance.

If you don't specify a callback function, the function will be considered synchronous.

### `Batch.end([args, ...], fn)`

Run the `batch`. Optionally pass some `args` into `fn`. When batch finishes `fn` will be called with the errors or results.

### `Batch.concurrency(n)`

Set the parallelism of `batch` to `n`. Defaults to `Infinity`.

### `Batch.throws(throws)`

Tells `batch` how to handle errors, either call `end` immediately or buffer errors and return when done. Defaults to `true` which would call `end` immediately in the event of an error.

## Test

```bash
$ npm install
$ make test
```

## License

(The MIT License)

Copyright (c) 2014 Matthew Mueller &lt;mattmuelle@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
