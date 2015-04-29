import m from 'mori';

class Key {
	constructor(elements) {
		this.elements = elements;
	}

	resolve(storage) {
		var elements = m.vector();
		for (var i = 0; i < this.elements.length; i++) {
			if (this.elements[i].resolve) {
				var resolved = this.elements[i].resolve(storage);
				if (resolved === null) { return null; }
				elements = m.conj(elements, resolved);
			}
			else {
				elements = m.conj(elements, this.elements[i]);
			}
		}
		return storage.get(elements);
	}

	getDependencies(storage) {
		var dependencies = m.set(), elements = m.vector();

		for (var i = 0; i < this.elements.length; i++) {
			// Add the current key
			if (elements && this.elements[i].resolve) {
				var resolved = this.elements[i].resolve(storage);
				if (resolved === null) { elements = false; }
				else { elements = m.conj(elements, resolved); }
			}
			else if (elements) {
				elements = m.conj(elements, this.elements[i]);
			}

			if (this.elements[i].getDependencies) {
				dependencies = m.union(dependencies, this.elements[i].getDependencies(storage));
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

	resolve(storage) {
		for (var i = 0; i < this.options.length; i++) {
			var resolved = this.options[i].resolve(storage);
			if (resolved !== null) { return resolved; }
		}
		return null;
	}

	getDependencies(storage) {
		return m.union.apply(m, this.options.map((opt) => {
			if (opt.getDependencies) {
				return opt.getDependencies(storage);
			}
			else {
				return m.set(opt);
			}
		}));
	}
}

export default function key(options) {
	if (Array.isArray(options)) {
		return new KeyOption(options);
	}
	return new Key(Array.prototype.slice.call(arguments));
}
