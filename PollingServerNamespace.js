import m from 'mori';
import ServerNamespace from './ServerNamespace';

/**
 * A read-only server namespace that polls its keys when someone is listening
 * to them, at the specified interval.
 */
class PollingServerNamespace extends ServerNamespace {
	/**
	 * Create a new polling server namespace
	 *
	 * The polling server namespace will poll for changes in the keys that are
	 * listened for; once keys stop being listened for, the polling stops.
	 *
	 * @param {string} name
	 * @param {Server} serverContainer a server connector
	 * @param {int} keyArity the key arity, as defined in ServerNamespace
	 * @param {int} pollInterval the interval in milliseconds at which to poll
	 */
	constructor(name, server, keyArity, pollInterval) {
		super(name, server, keyArity, 0);
		this._intervalMs = pollInterval;
		this._interval = null;
	}

	// Cannot set or save.
	set() { throw new Error('Cannot set property of read-only namespace'); }
	_save() { throw new Error('Cannot save read-only namespace'); }

	// When the first subscription happens, start polling; when the last
	// unsubscribe happens, stop polling.
	subscribe(key, fn) {
		if (!this._interval) {
			this._interval = setInterval(() => { this._poll(); }, this._intervalMs);
		}
		super(key, fn);
	}
	unsubscribe(key, fn) {
		super(key, fn);
		if (!m.count(this._subscribers)) {
			clearInterval(this._interval);
			this._interval = null;
		}
	}

	/**
	 * Find all the keys that are currently subscribed to, invalidate their
	 * loading state, and load them.
	 */
	_poll() {
		// Polling happens at the keyArity-level key, so take each key to
		// keyArity.
		var keys = m.map((subscriber) => {
			[ subscriberKey, fn ] = m.toJs(subscriber)
			return m.take(this._keyArity, subscriberKey);
		}, this._subscribers);

		// Put it into a set, so there's only one of each key.
		var keySet = m.into(m.set(), keys);

		// Clear the loading state of each key and load it.
		m.each((key) => {
			this._loading = m.dissoc(this._loading, key);
			this._load(key);
		}, keySet);
	}
}

export default ReadOnlyServerNamespace;
