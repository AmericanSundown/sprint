import m from 'mori';

/**
 * Same as assocIn, but works with empty keys.
 */
export function emptyAssocIn(obj, keys, value) {
	if (!m.count(keys)) { return value; }
	return m.assocIn(obj, keys, value);
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
