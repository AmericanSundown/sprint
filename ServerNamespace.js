import m from 'mori';
import Namespace from './Namespace';
import { emptyAssocIn, emptyGetIn, isObjOrMap } from './utils';

const STATE_LOADING = 'loading';
const STATE_LOADED = 'loaded';
const STATE_ERROR = 'error';

/**
 * A 'server' namespaces reads and writes data from/to a server.
 *
 * The first important piece that a server can do is 'actions'. An action is
 * just an RPC, which takes two parameters: the key on which to operate
 * (obviously this means different things to different RPCs, but seems to be a
 * common theme among pretty much all RPCs) and some data (optional).
 * Crucially, in addition to returning some kind of return value, RPCs return a
 * modification of the data stored by their namespaces (and, while discouraged,
 * they are allowed to reach into other namespaces as well...).
 *
 * Next, key retrieval in server namespaces works slightly differently than
 * normal namespaces: if the key is not present, it will execute a special
 * action named 'load' against the key that's being retrieved, and it will use
 * the resulting mutation to load the key.
 *
 * Finally, the server has special 'save' action which, if implemented, will
 * automatically send back to the server the data which has been `set` when
 * called.
 */
class ServerNamespace extends Namespace {
	/**
	 * Create a new server namespace
	 *
	 * keyArity means effectively the depth to which to load the key. For
	 * example, if you use a namespace for all objects of a given type, where
	 * the first key element is the id and the second a property of an object
	 * at that id, you may call a get function like this:
	 * `.get([ '1234', 'name' ])`. If your `keyArity` is 0, it would call load
	 * on the empty key (`[]`), thus expecting the server to load all the
	 * objects of this type; if the `keyArity` is 1, it'll call load with
	 * `[ '1234' ]` as the key, and expect it to load the object at that key;
	 * and if the keyArity is 2, it would expect the server to load just the
	 * name (keyArity of 3 or more would throw an error on get).
	 *
	 * saveArity works the same way: it denotes where the key stops and the
	 * data begins.
	 *
	 * @param {string} name
	 * @param {Server} serverContainer a server connector
	 * @param {int} keyArity
	 * @param {int} saveArity
	 */
	constructor(name, serverContainer, keyArity, saveArity) {
		super(name);
		if (typeof keyArity != 'number' || typeof saveArity != 'number') { throw "Must specify a load and save arity"; }

		this._keyArity = keyArity;
		this._saveArity = saveArity;
		this._serverContainer = serverContainer;

		// _local is locally-modified data (initialized by `super`).
		// _remote is server data.
		// _stage is where we store data that's in the process of being saved.
		this._remote = m.hashMap();
		this._stage = m.hashMap();

		// Whether a value is in a loading/loaded/error state.
		this._loading = m.hashMap();

		// Whether a value is in the process of being saved.
		this._saving = m.hashMap();
	}

	/**
	 * Retrieve a value for a key.
	 * @param {*[]} key
	 */
	get(key) {
		var options = [];
		var local, stage, remote;

		// Get data from each source - starting from local, fallig back to
		// stage, and finally to remote. If any one returns a plain value, just
		// pass it through; if they return an object, merge it in, with local
		// taking precedence over stage, taking precedence over remote.
		var data = null;
		if ((local = emptyGetIn(this._local, key)) !== null) {
			if (!isObjOrMap(local)) { return local; }
			data = local;
		}
		if ((stage = emptyGetIn(this._stage, key)) !== null) {
			if (!data && !isObjOrMap(stage)) { return stage; }
			data = m.merge(stage, data);
		}
		if ((remote = emptyGetIn(this._remote, key)) !== null) {
			if (!data && !isObjOrMap(remote)) { return remote; }
			data = m.merge(remote, data);
		}

		// If the data is here, return it. Otherwise, load it.
		if (data || m.get(this._loading, this._loaderKey(key)) == STATE_LOADED) {
			return data;
		}
		else {
			this._load(key);
			return null;
		}
	}

	/**
	 * Whether the key is loading.
	 */
	isLoading(key) {
		return m.get(this._loading, this._loaderKey(key)) == STATE_LOADING;
	}

	/**
	 * Whether there was an error loading the key.
	 */
	isError(key) {
		return m.get(this._loading, this._loaderKey(key)) == STATE_ERROR;
	}

	/**
	 * Whether the current key is in the process of being saved.
	 */
	isSaving(keys) {
		return m.get(this._saving, m.take(this._saveArity, keys));
	}

	/**
	 * Fire a server action.
	 * @param {string} action the name of the action
	 * @param {*[]} key the key at which to fire the action
	 * @param {*} data any action-related data
	 */
	action(key, action, data) {
		// Hard-coded special case
		if (action == 'save') { return this._save(key); }
		else { return this._action(action, key, data); }
	}

	_action(key, action, data) {
		// TODO: handle statemutations
		return this._serverContainer.action(this.name, key, action, m.toJs(data)).then((result) => {
			if (result.$set) {
				result.$set.forEach((s) => {
					this._remote = emptyAssocIn(this._remote, s.key, m.toClj(s.value));
				});
			}
			if (result.$return) {
				return result.$return;
			}
		});
	}

	_save(key) {
		if (!key) { throw "must specify a key to save"; }
		if (m.count(key) < this._saveArity) { throw "Save is not specific enough"; }

		var keys_to_save = m.take(this._saveArity, key),
			local_data = emptyGetIn(this._local, keys_to_save) || {};

		if (m.get(this._saving, keys_to_save)) { throw "Can't save while another save is in progress"; }

		// Optimistically update remote cache. Shouldn't need to notify anybody
		// about this change, since the combined result should be the same.
		// This just allows further local mutation without clobbering when the
		// database returns.
		// NOTE: it's important to keep the staging data separate from both
		// local and remote. That way, (1) if the save succeeds, it can drop the
		// staging data entirely and update the remote. But if (2) the
		// save fails, the staging data can get merged back into remote; if
		// local has been updated in the mean time, it's fine – we merge such
		// that the local data has precedence.
		this._stage = emptyAssocIn(this._stage, keys_to_save, local_data);
		this._local = emptyAssocIn(this._local, keys_to_save, null); // Todo: should we assoc {} or null?

		this._saving = m.assoc(this._saving, keys_to_save, true);

		return this._action(key, 'save', m.toJs(local_data)).then((newValue) => {
			// Empty stage store – remote store should have been updated from
			// under us.
			this._stage = emptyAssocIn(this._stage, keys_to_save, null);
			this._saving = m.assoc(this._saving, keys_to_save, false);
			this._notify(keys_to_save);
		}, (err) => {
			// Something went wrong, so abort: put stage store back into local,
			// and empty it.
			var stage = emptyGetIn(this._stage, keys_to_save),
				local = emptyGetIn(this._local, keys_to_save);
			var new_local = null;
			if (isObjOrMap(stage) && isObjOrMap(local)) { new_local = m.merge(stage, local); }
			else if (local !== null) { new_local = local; }
			else { new_local = stage; }
			this._local = emptyAssocIn(this._remote, keys_to_save, new_local);
			this._stage = emptyAssocIn(this._stage, keys_to_save, null);

			this._saving = m.assoc(this._saving, keys_to_save, false);

			this._notify(keys_to_save);

			// Rethrow error.
			throw err;
		});
	}

	/**
	 * If we tried to get a key which hasn't yet been loaded yet, load it.
	 */
	_load(key) {
		var key_to_load = this._loaderKey(key);
		// if it's in any kind of loading state, don't load it
		if (m.get(this._loading, key_to_load)) { return; }

		this._loading = m.assoc(this._loading, key_to_load, STATE_LOADING);

		this._action(key_to_load, 'load', null).then((value) => {
			// The server action will change the data, but we need to change
			// the loading state. Assume that the key requested was actually
			// the key returned.
			this._loading = m.assoc(this._loading, key_to_load, STATE_LOADED);
			this._notify(key_to_load);
		}, () => {
			this._loading = m.assoc(this._loading, key_to_load, STATE_ERROR);
			this._notify(key_to_load);
		});
	}

	_loaderKey(key) {
		if (m.count(key) < this._keyArity) { throw new Error("Load is not specific enough; expecting a composite key of " + this._keyArity + " elements, but got " + m.count(keys) + " instead (" + key + ")"); }

		return m.into(m.vector(), m.take(this._keyArity, key));
	}
}

export default ServerNamespace;
