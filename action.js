import m from 'mori';
import { isObj } from './utils';
import { isKey } from './key';

/**
 * Similar to keys, we can statically create actions, which are then executed
 * against a storage. Actions have a key, action name, and data (action name is
 * scoped to the namespace, which is the first element of the key).
 * Data is dynamic in that it can include Keys, and those keys are resolved to
 * their data within the storage.
 */
class Action {
	constructor(key, action, data) {
		this.key = key;
		this.action = action;
		this.data = data;
	}

	/**
	 * Actually execute the action, against the given storage.
	 */
	execute(storage) {
		// If there are any Key objects embedded anywhere within the data tree,
		// get the value associated with them.
		function resolve(data) {
			if (isKey(data)) { return m.toJs(data.get(storage)); }

			if (m.isMap(data) || m.isVector(data)) { data = m.toJs(data); }

			if (isObj(data)) {
				var built = {};
				for (var k in data) {
					if (data.hasOwnProperty(k)) {
						built[k] = resolve(data[k]);
					}
				}
				return built;
			}
			if (Array.isArray(data)) {
				return data.map(resolve);
			}

			return data;
		}

		var key = this.key.materialize(storage);
		return storage.getNamespace(m.first(key)).action(m.rest(key), this.action, resolve(this.data));
	}
}

/**
 * Shorthand to create an action.
 */
export default function action(key, action, data) {
	return new Action(key, action, data);
}
