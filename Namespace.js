import m from 'mori';
import { emptyAssocIn } from './utils';

/**
 * Generic namespace base class, as well as client-side namespace.
 *
 * Namespaces actually store data. Data is structured in a key-value format,
 * where each key is actually a composite key (meaning that there are multiple
 * 'elements' to each key) - for example, app 1234's name could have the key
 * [ '1234', 'name' ] in the 'app' namespace.
 *
 * To accomodate this, data is stored in a tree format. Data can be stored and
 * retrieved at any level of the tree – to continue the previous example, you
 * can retrieve the entire app with `.get([ '1234' ])`, or just the name with
 * `.get([ '1234', 'name' ])`; setting works the same way, but with a second
 * argument (the value) passed in. (Bear in mind that you will almost always
 * call these functions from a storage object, not a namespace object, so
 * you'll need to prefix the key with the namespace, i.e.
 * `storage.get([ 'app', '1234', 'name' ])`).
 *
 * Namespaces also provide pub-sub functionality: you can subscribe to changes
 * for a particular key, and any time that key is changed, the subscription
 * function is called.
 *
 * In addition to providing a basic template for all namespaces, this class
 * specifically also functions as a client-side only namespace. So if you want
 * to have a data store that is never used on the server side (to coordinate
 * client-side state that is shared between several components), you can use
 * this namespace. An example use case would be: a global date-picker that
 * allows you to select the start and end date of independent visualizations.
 */
class Namespace {
	/**
	 * @param {String} name the name of the namespace.
	 */
	constructor(name) {
		this.name = name;

		// Actual data.
		this._local = m.hashMap();

		// Subscribers is a hash of vec[key components] -> set[subscription funcs]
		this._subscribers = m.hashMap();
	}

	/**
	 * Retrieve a value for a (composite) key
	 * @param {*[]} key
	 */
	get(key) {
		return m.getIn(this._local, key);
	}

	/**
	 * Set a composite key
	 * @param {*[]} key
	 * @param {*} value
	 */
	set(key, value) {
		this._local = emptyAssocIn(this._local, key, m.toClj(value));
		this._notify(key);
	}

	/**
	 * Whether or not the key is in a loading state.
	 * @param {*[]} key
	 */
	isLoading(key) {
		// For a client-side namespace, it will never load.
		return false;
	}

	/**
	 * Whether or not the key is in an error state.
	 * @param {*[]} key
	 */
	isError(key) {
		// For a client-side namespace, it will never be an error.
		return false;
	}

	/**
	 * Subscribe a functions to changes in a key (and its ancestors).
	 * @param {array<any>} key a composite key to subscribe to
	 * @param {function} fn subscription function
	 */
	subscribe(key, fn) {
		this._subscribers = m.reduce(
			(acc, k) => m.updateIn(this._subscribers, k, (v) => m.conj(v || m.set(), fn)),
			this._subscribers,
			this._keyPath(key)
		);
	}

	/**
	 * Unsubscribe a functions from changes in a key (and its ancestors).
	 * @param {array<string>} key
	 * @param {function} fn
	 */
	unsubscribe(keys, fn) {
		this._subscribers = m.reduce(
			(acc, k) => m.updateIn(this._subscribers, k, (v) => m.disj(v, fn)),
			this._subscribers,
			this._keyPath(key)
		);
	}

	/**
	 * Get the path of a key: [a b c] -> [[] [a] [a b] [a b c]]
	 */
	_keyPath(key) {
		return m.reduce(
			(acc, element) => m.conj(acc, m.conj(m.last(acc), element)),
			m.vector(m.vector()), // Notify the empty key :-)
			key
		);
	}

	/**
	 * Notify the subscribers to each key.
	 */
	_notify(keys) {
		// Go through each key combo, then each subscriber, and trigger them.
		m.each(_keyPath(keys), (keyCombo) => {
			m.each(m.get(this._subscribers, keyCombo), (subscriber) => subscriber());
		});
	}
}

export default Namespace;
