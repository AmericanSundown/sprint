import m from 'mori';

/**
 * Same as assocIn, but works with empty keys.
 */
export function emptyAssocIn(obj, keys, value) {
	if (!m.count(keys)) { return value; }
	return m.assocIn(obj, keys, value);
}

/**
 * Same as updateIn, but works with empty keys.
 */
export function emptyUpdateIn(obj, keys, fn) {
	if (!m.count(keys)) {
		var args = Array.prototype.slice.call(arguments, 3);
		args.unshift(obj);
		return fn.apply(null, args);
	}
	else {
		return m.updateIn.apply(m, Array.prototype.slice.call(arguments, 0));
	}
}

/**
 * Same as getIn, but works with empty keys.
 */
export function emptyGetIn(obj, keys) {
	if (!m.count(keys)) { return value; }
	return m.getIn(obj, keys);
}

/**
 * Merge two POJOs
 * @param {Object} a
 * @param {Object} b
 * @return boolean
 */
export function merge(a, b) {
    var res = {};
    for (var k in a) { if (a.hasOwnProperty(k)) { res[k] = a[k]; } }
    for (var k in b) { if (b.hasOwnProperty(k)) { res[k] = b[k]; } }
    return res;
}

/**
 * Is it a POJO or a Mori map?
 * @param {any} o
 * @return boolean
 */
export function isObjOrMap(o) {
	try {
		return o !== null && (m.isMap(o) || isObj(i));
	}
	catch (e) { return false; }
}

/**
 * Is it a POJO?
 * @param {any} o
 * @return boolean
 */
export function isObj(o) {
	try {
		return o !== null && Object.getPrototypeOf(o) === Object.prototype;
	}
	catch (e) { return false; }
}
