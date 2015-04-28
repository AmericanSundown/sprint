import m from 'mori';
import Namespace from './Namespace';
import server from './server';

const STATE_LOADING = 'loading';
const STATE_LOADED = 'loaded';
const STATE_ERROR = 'error';

class ServerNamespace extends Namespace {
	constructor(namespace, loadArity, saveArity) {
		super();

		if (typeof loadArity != 'number' || typeof saveArity != 'number') { throw "Must specify a load and save arity"; }

		this._namespace = namespace;
		this._loadArity = loadArity;
		this._saveArity = saveArity;

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
		return m.get(this._loading, this._loaderKeys(keys)) == STATE_LOADING;
	}

	isError(keys) {
		return m.get(this._loading, this._loaderKeys(keys)) == STATE_ERROR;
	}

	_load(keys) {
		if (m.get(this._loading, this._loaderKeys(keys))) { return; }

		var keys_to_load = this._loaderKeys(keys);

		this._loading = m.assoc(this._loading, keys_to_load, STATE_LOADING);

		server(this._namespace, 'load', { keys: m.toJs(keys_to_load) }).then((value) => {
			this._loading = m.assoc(this._loading, keys_to_load, STATE_LOADED);
			this._setCache(keys_to_load, value);
		}, () => {
			this._loading = m.assoc(this._loading, keys_to_load, STATE_ERROR);
		});
	}

	_loaderKeys(keys) {
		return m.into(m.vector(), m.take(this._loadArity, keys));
	}

	_setCache(keys, value) {
		if (!m.count(keys)) {
			this._cache = value;
		}
		else {
			this._cache = m.assocIn(this._cache, keys, m.toClj(value));
		}
		this._notify(keys);
	}
}

export default ServerNamespace;
