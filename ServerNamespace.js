import m from 'mori';
import Namespace from './Namespace';
import { emptyAssocIn, isObjOrMap } from './utils';

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
		this._serverContainer = server;

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

	get(keys) {
		var options = [];
		var local, stage, remote;

		// Get data from each source.
		var data;
		if ((local = m.getIn(this._local, keys)) !== null) {
			if (!isObjOrMap(local)) { return local; }
			data = local;
		}
		if ((stage = m.getIn(this._stage, keys)) !== null) {
			if (!data && !isObjOrMap(stage)) { return stage; }
			data = m.merge(stage, data);
		}
		if ((remote = m.getIn(this._remote, keys)) !== null) {
			if (!data && !isObjOrMap(remote)) { return remote; }
			data = m.merge(remote, data);
		}

		// If the data is here, return it. Otherwise, load it.
		if (data) {
			return data;
		}
		else {
			this._load(keys);
			return null;
		}
	}

	isLoading(keys) {
		return m.get(this._loading, this._loaderKeys(keys)) == STATE_LOADING;
	}

	isError(keys) {
		return m.get(this._loading, this._loaderKeys(keys)) == STATE_ERROR;
	}

	isSaving(keys) {
		return m.get(this._saving, m.take(this._saveArity, keys));
	}

	action(name, data, update) {
		var local_data = m.getIn(this._local, data.key) || {};
		this._server(name, {
			keys: data.key,
			value: m.toJs(local_data)
		});
	}

	registerAction(name, func) {
		this._customActions[name] = func;
	}

	_server(name, params) {
		return this._serverContainer.action(this._namespace, name, m.toJs(params));
	}

	_save(data) {
		if (!data.key) { throw "must specify a key to save"; }
		if (m.count(data.key) < this._saveArity) { throw "Save is not specific enough"; }

		var keys_to_save = m.take(this._saveArity, data.key),
			local_data = m.getIn(this._local, keys_to_save) || {};

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

		return this._server('save', {
			keys: m.toJs(keys_to_save),
			value: m.toJs(local_data)
		}).then((newValue) => {
			// Empty stage store, and update remote store.
			this._stage = emptyAssocIn(this._stage, keys_to_save, null);
			this._remote = emptyAssocIn(this._remote, keys_to_save, m.toClj(newValue));

			this._saving = m.assoc(this._saving, keys_to_save, false);

			this._notify(keys_to_save);
		}, (err) => {
			// Put stage store back into local and empty it.
			var stage = m.getIn(this._stage, keys_to_save),
				local = m.getIn(this._local, keys_to_save);
			var new_local = null;
			if (isObjOrMap(stage) && isObjOrMap(local)) {
				new_local = m.merge(stage, local);
			}
			else if (local !== null) {
				new_local = local;
			}
			else {
				new_local = stage;
			}
			this._local = emptyAssocIn(this._remote, keys_to_save, new_local);
			this._stage = emptyAssocIn(this._stage, keys_to_save, null);

			this._saving = m.assoc(this._saving, keys_to_save, false);

			this._notify(keys_to_save);
			throw err;
		});
	}

	_load(keys) {
		if (m.get(this._loading, this._loaderKeys(keys))) { return; }

		var keys_to_load = this._loaderKeys(keys);

		this._loading = m.assoc(this._loading, keys_to_load, STATE_LOADING);

		this._server('load', { keys: m.toJs(keys_to_load) }).then((value) => {
			this._loading = m.assoc(this._loading, keys_to_load, STATE_LOADED);

			this._remote = emptyAssocIn(this._remote, keys_to_load, m.toClj(value));
			this._notify(keys_to_load);

		}, () => {
			this._loading = m.assoc(this._loading, keys_to_load, STATE_ERROR);
		});
	}

	_loaderKeys(keys) {
		if (m.count(keys) < this._keyArity) { throw "Load is not specific enough"; }

		return m.into(m.vector(), m.take(this._keyArity, keys));
	}
}

export default ServerNamespace;
