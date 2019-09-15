/**
 * Module Dependencies
 */

var slice = [].slice;
var co = require('co');
var noop = function(){};

/**
 * Export `wrap-fn`
 */

module.exports = wrap;

/**
 * Wrap a function to support
 * sync, async, and gen functions.
 *
 * @param {Function} fn
 * @param {Function} done
 * @return {Function}
 * @api public
 */

function wrap(fn, done) {
  done = done || noop;

  return function() {
    var args = slice.call(arguments);
    var ctx = this;

    if (!fn) {
      // done
      return done.apply(ctx, [null].concat(args));
    } else if (fn.length > args.length) {
      // async
      fn.apply(ctx, args.concat(done));
    } else if (generator(fn)) {
      // generator
      co(fn).apply(ctx, args.concat(done));
    } else {
      // sync
      var ret = fn.apply(ctx, args);
      ret instanceof Error ? done(ret) : done();
    }
  }
}

/**
 * Is `value` a generator?
 *
 * @param {Mixed} value
 * @return {Boolean}
 * @api private
 */

function generator(value) {
  return value
    && value.constructor
    && 'GeneratorFunction' == value.constructor.name;
}
