import m from 'mori';

/**
 * Root storage object
 *
 * Storage doesn't store any data in itself - it only stores the root-level
 * namespaces; those actually contain the data.
 */
class Storage {
	constructor() {
		// Pass through all these calls to functions to the namespace indicated
		// by the first element of the first parameter (i.e. the first element
		// of the key).
		[ 'get', 'set', 'isLoading', 'isError', 'subscribe', 'unsubscribe' ].forEach((func) => {
			this[func] = (a, b, c, d) => {
				var nsName = m.first(a), ns = m.get(this._namespaces, nsName);
				if (!ns) { throw new Error("Namespace " + nsName + " not found in storage."); }
				return ns[call].call(ns, m.rest(a), b, c, d);
			};
		});
	}

	/**
	 * Add a new namespace.
	 * @param {Namespace} ns a namespace object
	 */
	register(ns) {
		this._namespaces = m.assoc(this._namespaces, ns.name, ns);
	}

	/**
	 * Clone this storage into a new storage object. The new storage object
	 * won't be able to namespaces of the old one, however the data within the
	 * existing namespaces is still shared.
	 */
	clone() {
		var s = new Storage();
		m.each(this._namespaces, (k, v) => { s.register(k, v); });
		return s;
	}

	/**
	 * Retrieve a namespace by name.
	 * @param {String} name the name of the namespace
	 */
	getNamespace(name) {
		return m.get(this._namespaces, name);
	}
}

export default Storage;
