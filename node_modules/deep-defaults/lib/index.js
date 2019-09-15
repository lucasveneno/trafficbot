'use strict';

var _ = require('lodash');

/**
 * Recursively assigns own enumerable properties of the source object to the destination object for all destination properties that resolve to undefined.
 * @param {Object} dest destination object; this object is modified.
 * @param {Object} src source object that has the defaults
 * @returns {Object} destination object
 */
function _deepDefaults(dest, src) {
    if(_.isUndefined(dest) || _.isNull(dest) || !_.isPlainObject(dest)) { return dest; }

    _.each(src, function(v, k) {
        if(_.isUndefined(dest[k])) {
            dest[k] = v;
        } else if(_.isPlainObject(v)) {
            _deepDefaults(dest[k], v);
        }
    });

    return dest;
}

exports = module.exports = _deepDefaults;