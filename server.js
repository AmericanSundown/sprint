var superagent = require('superagent');

class Server {
	constructor(flushAfter, endpiont) {
		this._actions = {};
		this.timeout = null;
		this._flushAfter = flushAfter || 10;
		this._endpoint = endpoint;
	}


	action(namespace, action, data) {
		if (!this._actions[namespace]) { this._actions[namespace] = {}; }
		if (!this._actions[namespace][action]) { this._actions[namespace][action] = []; }

		this._actions[namespace][action].push(data);

		if (this._timeout) { clearTimeout(this._timeout); }
		this._timeout = setTimeout(() => { this._flush(); }, flushAfter);
	}

	_flush() {
		superagent
		this._actions
	}
}

export default Server;