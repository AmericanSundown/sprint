import m from 'mori';
import Namespace from './Namespace';

const STATE_LOADING = 'loading';
const STATE_LOADED = 'loaded';
const STATE_ERROR = 'error';

function emptyAssocIn(obj, keys, value) {
	if (!m.count(keys)) { return value; }
	return m.assocIn(obj, keys, value);
}

function isObj(o) {
	try {
		return o !== null && (m.isMap(o) || Object.getPrototypeOf(o) === Object.prototype);
	}
	catch (e) { return false; }
}

class ServerNamespace extends Namespace {
	constructor(namespace, server, loadArity, saveArity) {
		super();

		if (typeof loadArity != 'number' || typeof saveArity != 'number') { throw "Must specify a load and save arity"; }

		this._namespace = namespace;
		this._loadArity = loadArity;
		this._saveArity = saveArity;
		this._server = server;

		// _data is locally-modified data
		// _remote is server data
		// _stage is data that's in the process of being saved
		this._remote = m.hashMap();
		this._stage = m.hashMap();

		// Whether a value is loading/loaded/error.
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
			if (!isObj(local)) { return local; }
			data = local;
		}
		if ((stage = m.getIn(this._stage, keys)) !== null) {
			if (!data && !isObj(stage)) { return stage; }
			data = m.merge(stage, data);
		}
		if ((remote = m.getIn(this._remote, keys)) !== null) {
			if (!data && !isObj(remote)) { return remote; }
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

	action(name, params) {
		return this._server.action(this._namespace, name, m.toJs(params));
	}

	save(keys) {
		if (m.count(keys) < this._saveArity) { throw "Save is not specific enough"; }

		var keys_to_save = m.take(this._saveArity, keys),
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

		return this.action('save', {
			key: m.toJs(keys_to_save),
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
			if (isObj(stage) && isObj(local)) {
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

		this.action('load', { keys: m.toJs(keys_to_load) }).then((value) => {
			this._loading = m.assoc(this._loading, keys_to_load, STATE_LOADED);

			this._remote = emptyAssocIn(this._remote, keys_to_load, m.toClj(value));
			this._notify(keys_to_load);

		}, () => {
			this._loading = m.assoc(this._loading, keys_to_load, STATE_ERROR);
		});
	}

	_loaderKeys(keys) {
		if (m.count(keys) < this._loadArity) { throw "Load is not specific enough"; }

		return m.into(m.vector(), m.take(this._loadArity, keys));
	}
}

export default ServerNamespace;
