import m from 'mori';

class Key {
	constructor(elements) {
		this.elements = elements;
	}

	get(storage) {
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
		return storage.get(elements);
	}

	isLoading(storage) {
		return this._isX('isLoading', storage);
	}

	isError(storage) {
		return this._isX('isError', storage);
	}

	subscribe(storage, f) {
		console.log('subscribing...')
	}

	unsubscribe(storage, f) {
		console.log('unsubscribing...')
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
		return this._x('get', storage);
	}

	isLoading(storage) {
		return this._x('isLoading', storage);
	}

	isError(storage) {
		return this._x('isError', storage);
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

	_x(x, storage) {
		for (var i = 0; i < this.options.length; i++) {
			var resolved = this.options[i][x](storage);
			if (resolved !== null) { return resolved; }
		}
		return null;
	}

}

export default function key(options) {
	if (Array.isArray(options)) {
		return new KeyOption(options);
	}
	return new Key(Array.prototype.slice.call(arguments));
}
