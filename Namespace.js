import m from 'mori';
import { emptyAssocIn } from './utils';

class Namespace {
	constructor(keyArity) {
		this._subscribers = m.hashMap();
		this._local = m.hashMap();
		this._keyArity = keyArity;
	}

	get(keys) {
		return m.getIn(this._local, keys);
	}

	set(keys, value) {
		var v = m.toJs(keys).indexOf('marketing_links1') != -1 ? value : m.toClj(value); // straight up hack because mori isn't working with obj w/ a key of "uc" see: https://github.com/swannodette/mori/issues/178
		this._local = emptyAssocIn(this._local, keys, v);
		this._notify(keys);
	}

	isLoading() { return false; }
	isError() { return false; }

	_notify(keys) {
		var self = this;

		// Get the key path ([a b c] -> [[a] [a b] [a b c]])
		var keyCombos = m.reduce(
			(acc, key) => m.conj(acc, m.conj(m.last(acc), key)),
			m.vector(m.vector()), // Notify the empty key :-)
			m.take(this._keyArity, keys)
		);

		// Go through each key combo, then each subscriber, and trigger them.
		m.each(keyCombos, (keyCombo) => {
			m.each(m.get(this._subscribers, keyCombo), (subscriber) => subscriber());
		});
	}

	subscribe(keys, fn) {
		var k = m.into(m.vector(), m.take(this._keyArity, m.toClj(keys))),
			previous_subscribers = m.get(this._subscribers, k),
			new_subscribers = m.conj(previous_subscribers || m.set(), fn);
		this._subscribers = m.assoc(this._subscribers, k, m.conj(new_subscribers, fn));
	}

	unsubscribe(keys, fn) {
		var k = m.into(m.vector(), m.take(this._keyArity, m.toClj(keys)));
		this._subscribers = m.assoc(this._subscribers, k, m.disj(m.get(this._subscribers, k), fn));
	}
}

export default Namespace;
