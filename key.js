import m from 'mori';

/**
 * Often times, it can be useful to represent a key on its own. This is
 * particularly useful when using keys that depend on other keys (for example,
 * if you want to get the current user's current app's name, it's structured as
 * two namespace lookups: get the current user's app id, then get the name of
 * that app). We do that with a 'key' object. A key object simply stores the
 * elements of the key, though each element can be a reference to another key.
 *
 * Additionally, keys can be subscribed too, which means in the previous
 * example that when the user's app changes, the caller doesn't need to worry
 * about unsubscribing from the old app and subscribing to the new app (or
 * loading the new app or whatever); the key object handles all this.
 *
 * Finally, in some cases it's useful to provide a default value for keys. You
 * can use a KeyOption for that - given a set of keys to choose from, it'll
 * choose the first one with a non-null value.
 */

/**
 * Keys abide by the following interface:
 * interface IKey {
 *     dependencies(storage: Storage): set<IKey>;
 *     get(storage: Storage): any;
 *     set(storage: Storage, value: any);
 *     materialize(storage: Storage): any[];
 *     isLoading(storage: Storage);
 *     isError(storage: Storage);
 *     subscribe(storage: Storage, () => null);
 *     unsubscribe(storage: Storage, () => null);
 * }
 */

/**
 * Whether `e` abides by IKey (roughly).
 */
export function isKey(e) {
	return typeof e != 'string' &&
			typeof e != 'boolean' &&
			typeof e != 'number' &&
			e.dependencies &&
			e.get;
}

/**
 * A basic key - though it can contain embedded keys.
 *
 * Note that subscriptions are specific to a Storage.
 */
class Key {
	constructor(elements) {
		this.elements = elements;

		// Map of (storage -> set<fn>)
		this._subscriptions = m.hashMap();

		// We don't directly subscribe subscription functions to storage; we
		// have an internal intermediate that's used to unsubscribe and
		// resubscribe if a nested key changes; these functions are stored here
		// as (storage -> fn)
		this._subscriptionFuncs = m.hashMap();
	}

	/**
	 * Returns an array of key elements, but with nested keys "materialized",
	 * i.e. their actual values filled in. E.g., if 'c' = 1,
	 * Key([ 'a', 'b', Key([ 'c' ]) ]).materialize() = [ 'a', 'b', 1 ].
	 *
	 * If an element could not be materialized, perhaps because one of its
	 * dependencies is loading or otherwise, this function returns null.
	 */
	materialize(storage) {
		var elements = [];
		for (var i = 0; i < this.elements.length; i++) {
			if (!isKey(this.elements[i])) {
				elements.push(this.elements[i]);
			}
			else {
				// It is a nested key! Get it. If it's null, we can't load this
				// key.
				var resolved = this.elements[i].get(storage);
				if (resolved === null) { return null; }
				elements.push(resolved);
			}
		}
		return elements;
	}

	/**
	 * Actually get this key in the given storage.
	 */
	get(storage) {
		var element = this.materialize(storage);
		if (!element) { return null; }
		return storage.get(element);
	}

	/**
	 * Set the key in the given storage.
	 */
	set(storage, value) {
		var element = this.materialize(storage);
		if (!element) { throw 'Cannot set an empty key'; }
		return storage.set(element, value);
	}

	isLoading(storage) {
		return this._isX('isLoading', storage);
	}

	isError(storage) {
		return this._isX('isError', storage);
	}

	_isX(x, storage) {
		var elements = m.vector();
		for (var i = 0; i < this.elements.length; i++) {
			// If one of the dependent keys is error / loading,
			// then this key is also error / loading.
			if (isKey(this.elements[i]) &&
				this.elements[i][x]) {
				return true;
			}
		}

		// If all of the dependent keys are in a good state, check the current
		// key.
		if (this.materialize(storage)) {
			return storage[x](this.materialize(storage));
		}

		// If we couldn't materialize, this is the best we can do...
		// TODO: maybe we should throw here?
		return false;
	}

	/**
	 * Get the set of keys that this key depends on (recursively, to account
	 * for multiple levels of nesting), including this key.
	 */
	dependencies(storage) {
		var dependencies = m.set();

		for (var i = 0; i < this.elements.length; i++) {
			// If it's a nested key, get its dependencies.
			if (isKey(this.elements[i])) {
				dependencies = m.union(dependencies, this.elements[i].dependencies(storage));
			}
		}

		if (this.materialize(storage)) {
			// Include the current key in the list of dependencies.
			dependencies = m.conj(dependencies, this.materialize(storage));
		}

		return dependencies;
	}

	/**
	 * Subscribe a function to this key, in the given storage.
	 */
	subscribe(storage, f) {
		// If it's the first time subscribing to key in this storage...
		if (!m.get(this._subscriptions, storage)) {
			// Add this subscribing function to the list of subscriptions for
			// this key in this storage.
			this._subscriptions = m.assoc(this._subscriptions, storage, m.set([ f ]));

			// Get all the dependencies for this key, including the current
			// key, and subscribe to them our dependency-diffing subscription
			// function.
			var deps = this.dependencies(storage);
			// Dependency-diffing subscription function.
			// If a nested key changes, we may have to change the outer key to
			// which we are subscribed. This function is subscribed to every
			// key in the nesting tree, so it can pick up changes and
			// recalculate changes and subscribe/unsubscribe accordingly.
			var subscription_func = () => {
				// Get this key's dependencies.
				var new_deps = this.dependencies(storage);
				// Dependencies which we were not subscribed to, but we should
				// be subscribed to.
				var new_subscriptions = m.difference(new_deps, deps),
					// Dependencies which we were subscribed to, but are no
					// longer relevant.
					old_subscriptions = m.difference(deps, new_deps);

				// Subscribe/unsubscribe...
				m.each(old_subscriptions, (dep) => storage.unsubscribe(dep, subscription_func));
				m.each(new_subscriptions, (dep) => storage.subscribe(dep, subscription_func));

				// Save these dependencies at the current ones.
				deps = new_deps;

				// Finally, for all functions actually subscribed to this key
				// in this storage, notify them.
				m.each(m.get(this._subscriptions, storage), (sub) => sub());
			};

			// Subscribe to set of dependencies.
			m.each(deps, (dep) => { storage.subscribe(dep, subscription_func); });

			// Add this dependency-diffing subscription function to the list.
			this._subscriptionFuncs = m.assoc(this._subscriptionFuncs, storage, subscription_func);
		}
		else {
			// Add this function to the list of subscribing functions in this storage.
			this._subscriptions = m.updateIn(this._subscriptions, [ storage ], m.conj, f);
		}
	}

	/**
	 * Unsubscribe a function from this key, in the given storage.
	 */
	unsubscribe(storage, f) {
		var subscriptions = m.updateIn(this._subscriptions, [ storage ], m.disj, f);

		// If there aren't any more subscriptions left, unsubscribe the
		// underlying subscribers from the storage and remove them from this
		// key's subscriptions.
		if (!m.count(m.get(this._subscriptions, storage)) {
			var subscription_func = m.get(this._subscriptionFuncs, storage);
			m.each(this.dependencies(storage), (dep) => storage.unsubscribe(dep, subscription_func));

			this._subscriptionFuncs = m.dissoc(this._subscriptionFuncs, storage);
			this._subscriptions = m.dissoc(this._subscriptions, storage);
		}
	}
}

/**
 * Another 'implementation' of the key interface, that can allow fallbacks if a
 * given key cannot be retrieved. Fallbacks can either be another key or a
 * primitive type.
 */
class KeyOption {
	constructor(options) {
		this.options = options;
	}

	// Dependencies are just the dependencies of the component keys.
	dependencies(storage) {
		return m.union.apply(m, this.options.map((opt) => {
			if (isKey(this.elements[i])) { return opt.dependencies(storage); }
			else { return m.set(); }
		}));
	}

	get(storage) {
		for (var i = 0; i < this.options.length; i++) {
			// This will always resolve.
			if (!isKey(this.options[i])) { return this.options[i]; }

			// This will maybe resolve; if not, fall through.
			var resolved = this.options[i].get(storage);
			if (resolved !== null) { return resolved; }
		}
		return null;
	}

	// Just call the following functions on each of the keys in order.
	isLoading(storage) {
		return this._isX('isLoading', storage);
	}

	isError(storage) {
		return this._isX('isError', storage);
	}

	subscribe(storage, f) {
		for (var i = 0; i < this.options.length; i++) {
			if (isKey(this.options[i])) {
				this.options[i].subscribe(storage, f);
			}
		}
	}

	unsubscribe(storage, f) {
		for (var i = 0; i < this.options.length; i++) {
			if (isKey(this.options[i])) {
				this.options[i].unsubscribe(storage, f);
			}
		}
	}

	_isX(x, storage) {
		for (var i = 0; i < this.options.length; i++) {
			if (isKey(this.options[i]) && !this.options[i][x](storage)) {
				return false;
			}
		}
		return true;
	}
}

/**
 * Short-hand for creating keys.
 *
 * - To create a key, just do: `k('a', 'b', 'c')`.
 * - For a nested key, `k('a', k('b', 'c'), 'd')`.
 * - For key options, `k([ k('a'), k('b'), 'fallback string' ])`.
 */
export default function key(options) {
	if (Array.isArray(options)) {
		return new KeyOption(options);
	}
	return new Key(Array.prototype.slice.call(arguments));
}
