import m from 'mori';
import Store from './Store';
import server from './server';

const STATE_LOADING = 'loading';
const STATE_LOADED = 'loaded';
const STATE_ERROR = 'error';

class ServerStore extends Store {
	constructor(namespace, loadArity) {
		super();

		if (!loadArity) { throw "Must specify a load arity"; }

		this._namespace = namespace;
		// From deep to shallow
		this._loadArity = loadArity.sort(function(a, b) { return b - a; });

		this._cache = m.hashMap();
		this._loading = m.hashMap();
	}

	get(keys) {
		var local = m.getIn(this._data, keys),
			cache = m.getIn(this._cache, keys);
		if (local !== null) {
			if (m.isMap(local) && m.isMap(cache)) { return m.merge(cache, local); }
			return local;
		}
		if (cache) {
			return cache;
		}

		this._load(keys);
		return null;
	}

	isLoading(keys) {
		return this._loadingState(keys) == STATE_LOADING;
	}

	isError(keys) {
		return this._loadingState(keys) == STATE_ERROR;
	}

	_load(keys) {
		if (this._loadingState(keys)) { return this._loadingState(keys); }

		var keys_to_load = m.into(m.vector(), m.take(this._loadArity[0], keys));
		this._loading = m.assoc(this._loading, keys_to_load, STATE_LOADING);
		server(this._namespace, 'load', { keys: m.toJs(keys_to_load) }).then((value) => {
			this._loading = m.assoc(this._loading, keys_to_load, STATE_LOADED);
			this._setCache(keys_to_load, value);
		}, () => {
			this._loading = m.assoc(this._loading, keys_to_load, STATE_ERROR);
		});
	}

	_loadingState(keys) {
		var keyCombos = m.map((arity) => {
			return m.take(arity, keys);
		}, this._loadArity);

		m.each(keyCombos, (combo) => {
			if (m.get(this._loading, combo)) {
				return m.get(this._loading, combo);
			}
		});
	}

	_setCache(keys, value) {
		this._cache = m.assocIn(this._cache, keys, value);
		this._notify(keys);
	}
}

export default ServerStore;
