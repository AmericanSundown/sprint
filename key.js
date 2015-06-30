import m from 'mori';

class Key {
	constructor(elements) {
		this.elements = elements;
		this._subscriptions = m.hashMap();
		this._subscriptionFuncs = m.hashMap();
	}

	get(storage) {
		var element = this._materializeKey(storage);
		if (!element) { return null; }
		return storage.get(element);
	}

	setStorage(storage, value) {
		var element = this._materializeKey(storage);
		if (!element) { throw 'Your key is empty'; }
		return storage.set(element, value);
	}

	isLoading(storage) {
		return this._isX('isLoading', storage);
	}

	isError(storage) {
		return this._isX('isError', storage);
	}

	subscribe(storage, f) {
		if (m.get(this._subscriptions, storage)) {
			this._subscriptions = m.assoc(this._subscriptions, storage, m.conj(m.get(this._subscriptions, storage), f));
		}
		else {
			this._subscriptions = m.assoc(this._subscriptions, storage, m.set([ f ]));

			var deps = this.dependencies(storage);
			var subscription_func = () => {
				var new_deps = this.dependencies(storage);
				var new_subscriptions = m.difference(new_deps, deps),
					old_subscriptions = m.difference(deps, new_deps);

				m.each(old_subscriptions, (dep) => storage.unsubscribe(dep, subscription_func));
				m.each(new_subscriptions, (dep) => storage.subscribe(dep, subscription_func));

				deps = new_deps;

				m.each(m.get(this._subscriptions, storage), (sub) => sub());
			};

			// Subscribe to first batch.
			m.each(deps, (dep) => { storage.subscribe(dep, subscription_func); });
			this._subscriptionFuncs = m.assoc(this._subscriptionFuncs, storage, subscription_func);
		}
	}

	unsubscribe(storage, f) {
		var subscriptions = m.get(this._subscriptions, storage);
		var new_subs = m.disj(subscriptions, f);
		if (!m.count(new_subs)) {
			var subscription_func = m.get(this._subscriptionFuncs, storage);
			m.each(this.dependencies(storage), (dep) => storage.unsubscribe(dep, subscription_func));
			m.dissoc(this._subscriptionFuncs, storage);
			m.dissoc(this._subscriptions, storage);
		}
	}

	_isX(x, storage) {
		var elements = m.vector();
		for (var i = 0; i < this.elements.length; i++) {
			if (this.elements[i][x] && this.elements[i][x](storage)) {
				return true;
			}
			if (this.elements[i].get) {
				var resolved = this.elements[i].get(storage);
				if (resolved === null) { return false; }
				elements = m.conj(elements, resolved);
			}
			else {
				elements = m.conj(elements, this.elements[i]);
			}
		}
		return storage[x](elements);
	}

	_materializeKey(storage) {
		var elements = m.vector();
		for (var i = 0; i < this.elements.length; i++) {
			if (this.elements[i].get) {
				var resolved = this.elements[i].get(storage);
				if (resolved === null) { return null; }
				elements = m.conj(elements, resolved);
			}
			else {
				elements = m.conj(elements, this.elements[i]);
			}
		}
		return elements;
	}

	dependencies(storage) {
		var dependencies = m.set(), elements = m.vector();

		for (var i = 0; i < this.elements.length; i++) {
			// Add the current key
			if (elements && this.elements[i].get) {
				var resolved = this.elements[i].get(storage);
				if (resolved === null) { elements = false; }
				else { elements = m.conj(elements, resolved); }
			}
			else if (elements) {
				elements = m.conj(elements, this.elements[i]);
			}

			if (this.elements[i].dependencies) {
				dependencies = m.union(dependencies, this.elements[i].dependencies(storage));
			}
		}

		if (elements) {
			dependencies = m.conj(dependencies, elements);
		}
		return dependencies;
	}
}

class KeyOption {
	constructor(options) {
		this.options = options;
	}

	dependencies(storage) {
		return m.union.apply(m, this.options.map((opt) => {
			if (opt.dependencies) {
				return opt.dependencies(storage);
			}
			else {
				return m.set(opt);
			}
		}));
	}

	get(storage) {
		for (var i = 0; i < this.options.length; i++) {
			var resolved = this.options[i].get(storage);
			if (resolved !== null) { return resolved; }
		}
		return null;
	}

	isLoading(storage) {
		return this._isX('isLoading', storage);
	}

	isError(storage) {
		return this._isX('isError', storage);
	}

	subscribe(storage, f) {
		for (var i = 0; i < this.options.length; i++) {
			this.options[i].subscribe(storage, f);
		}
	}

	unsubscribe(storage, f) {
		for (var i = 0; i < this.options.length; i++) {
			this.options[i].unsubscribe(storage, f);
		}
	}

	_isX(x, storage) {
		for (var i = 0; i < this.options.length; i++) {
			if (!this.options[i][x](storage)) { return false; }
		}
		return true;
	}

}

export default function key(options) {
	if (Array.isArray(options)) {
		return new KeyOption(options);
	}
	return new Key(Array.prototype.slice.call(arguments));
}
