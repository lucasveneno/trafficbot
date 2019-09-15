/**
 * Module dependencies
 */

var sliced = require('sliced');
var noop = function(){};

/**
 * Export `enqueue`
 */

module.exports = enqueue;

/**
 * Initialize `enqueue`
 *
 * @param {Function} fn
 * @param {Object} options
 */

function enqueue(fn, options) {
  options = options || {};

  var concurrency = options.concurrency || 1;
  var timeout = options.timeout || false;
  var limit = options.limit || Infinity;
  var pending = 1;
  var tids = {};
  var jobs = [];
  var id = 0;

  return function() {
    var args = sliced(arguments);

    if (jobs.length + pending > limit) {
      return new Error('queue limit reached, try later');
    }

    var args = sliced(arguments);
    var last = args[args.length - 1];
    var end = 'function' == typeof last && last;
    var ctx = this;
    id++;

    // remove "on end" function if there is one
    end = end ? args.pop() : noop;
    jobs.push([id, ctx, args.concat(once(done(id)))]);
    return next();

    function next() {
      if (pending > concurrency) return;
      var job = jobs.shift();
      if (!job) return;

      var id = job[0]
      var ctx = job[1];
      var args = job[2];
      var finish = args[args.length - 1];

      pending++;

      // support timeouts
      if (timeout) {
        tids[id] = setTimeout(function() {
          finish(new Error('job timed out'))
        }, timeout);
      }

      // call the fn
      return fn.apply(job[1], job[2]);
    }

    function done(id) {
      return function _done() {
        clearTimeout(tids[id]);
        pending--;
        next();
        return end.apply(this, arguments);
      }
    }
  }
}

/**
 * Once
 */

function once(fn) {
  var called = false;
  return function _once() {
    if (called) return noop();
    called = true;
    return fn.apply(this, arguments);
  }
}
