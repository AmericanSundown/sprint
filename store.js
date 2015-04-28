import m from 'mori';

class Store {
	constructor() {
		this._subscribers = m.hashMap();
		this._data = m.hashMap();
	}

	get(keys) {
		return m.getIn(this._data, keys);
	}

	set(keys, value) {
		this._data = m.assocIn(this._data, keys, value);
		this._notify(keys);
	}

	_notify(keys) {
		var self = this;
	
		// Get the key path ([a b c] -> [[a] [a b] [a b c]])
		var keyCombos = m.reduce(function(acc, key) {
			return m.conj(acc, m.conj(m.last(acc) || m.vector(), key));
		}, m.vector(), keys);
	
		// Go through each key combo, then each subscriber, and trigger them.
		m.each(keyCombos, (keyCombo) => {
			m.each(m.get(this._subscribers, keyCombo), (subscriber) => {
				subscriber();
			});
		});
	}

	subscribe(keys, fn) {
		var k = m.toClj(keys),
			previous_subscribers = m.get(this._subscribers, k),
			new_subscribers = m.conj(previous_subscribers || m.set(), fn);
		this._subscribers = m.assoc(this._subscribers, k, m.conj(new_subscribers, fn));
	}

	unsubscribe(keys, fn) {
		var k = m.toClj(keys);
		this._subscribers = m.assoc(this._subscribers, k, m.disj(m.get(this._subscribers, k), fn));
	}
}

export default Store;
