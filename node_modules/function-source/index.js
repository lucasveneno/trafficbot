
/**
 * Export `source`
 */

module.exports = source;

/**
 * Get inner `fn` source.
 *
 * @param {Function|String} fn
 * @return {String}
 * @api public
 */

function source(fn){
  var match = /^function *\S*? *\([^)]*\) *{([\S\s]*)}$/.exec(String(fn))
  if (!match) return '';
  var space = /^\n*(\s*)/.exec(match[1])[1];
  var expr = new RegExp('^' + space, 'gm');
  return match[1].replace(expr, '');
}
