/**
 * Module Dependencies
 */

var enqueue = require('enqueue');
var wrap = require('wrap-fn');
var once = require('once');
var noop = function(){};
var slice = [].slice;

/**
 * Export `Batch`
 */

module.exports = Batch;

/**
 * Initialize `Batch`
 *
 * @param {Function or Array or Batch} fn (optional)
 */

function Batch(fn) {
  if (!(this instanceof Batch)) return new Batch(fn);
  this.n = Infinity;
  this.throws(true);
  this.length = 0;
  this.fns = [];

  if (fn) this.push(fn);
}

/**
 * Set concurrency to `n`.
 *
 * @param {Number} n
 * @return {Batch}
 * @api public
 */

Batch.prototype.concurrency = function(n){
  this.n = n;
  return this;
};

/**
 * Set whether Batch will or will not throw up.
 *
 * @param  {Boolean} throws
 * @return {Batch}
 * @api public
 */

Batch.prototype.throws = function(throws) {
  this.e = !!throws;
  return this;
};

/**
 * Push a new function
 *
 * @param {Function|Generator} fn
 * @return {Batch}
 * @api public
 */

Batch.prototype.push = function (fn) {
  if (fn instanceof Batch) {
    return this.use(fn.fns);
  }

  if (fn instanceof Array) {
    for (var i = 0, f; f = fn[i++];) this.use(f);
    return this;
  }

  this.fns.push(fn);
  this.length = this.fns.length;
  return this;
};

/**
 * Execute all queued functions in parallel,
 * executing `cb(err, results)`.
 *
 * @param {Mixed, ...} args
 * @param {Functio} fn (optional)
 * @return {Batch}
 * @api public
 */

Batch.prototype.end = function() {
  var args = slice.call(arguments);
  var last = args[args.length - 1];
  var done = 'function' == typeof last && last;
  var len = this.length;
  var throws = this.e;
  var fns = this.fns;
  var pending = len;
  var results = [];
  var errors = [];
  var ctx = this;

  // update args
  var args = done
    ? slice.call(arguments, 0, arguments.length - 1)
    : slice.call(arguments);

  // only call done once
  done = once(done || noop);

  // empty
  if (!len) return done(null, results);

  // process
  function next(i) {
    return function(err, res) {
      if (err && throws) return done(err);

      results[i] = res;
      errors[i] = err;

      if (--pending) return;
      else if (!throws) done(errors, results);
      else done(null, results);
    }
  }

  // queue calls with `n` concurrency
  var call = enqueue(function(fn, i) {
    wrap(fn, next(i)).apply(ctx, args);
  }, this.n);

  // call the fns in parallel
  for (var i = 0, fn; fn = fns[i]; i++) call(fn, i);

  return this;
};
