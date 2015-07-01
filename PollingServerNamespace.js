import m from 'mori';
import ServerNamespace from './ServerNamespace';

/**
 * A read-only server namespace that polls its keys when someone is listening
 * to them, at the specified interval.
 */
class PollingServerNamespace extends ServerNamespace {
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
	 * loading state, and then 
	 */
	_poll() {
		var keys = m.map((subscriber) => {
			[ subscriberKey, fn ] = m.toJs(subscriber)
			return m.take(this._keyArity, subscriberKey);
		}, this._subscribers);

		// Put it into a set, so there's only one of each key
		var keySet = m.into(m.set(), keys);

		// Clear the loading state, then load it.
		m.each((key) => {
			this._loading = m.dissoc(this._loading, key);
			this._load(key);
		}, keySet);
	}
}

export default ReadOnlyServerNamespace;
