import m from 'mori';
import superagent from 'superagent';

class Server {
	constructor(endpoint, flushAfter) {
		this._actions = {};
		this._responses = {};

		this.timeout = null;
		this._flushAfter = flushAfter || 10;
		this._endpoint = endpoint;
	}

	action(namespace, action, data) {
		var hash = String(m.hash(m.vector(namespace, action, data)));
		if (this._responses[hash]) { return this._responses[hash].promise; }

		var resolve,
			reject,
			promise = new B(function(res, rej) { resolve = res; reject = rej; });

		this._actions[hash] = [ namespace, action, data ];
		this._responses[hash] = {
			resolve: resolve,
			reject: reject,
			promise: promise
		};

		if (this._timeout) { clearTimeout(this._timeout); }
		this._timeout = setTimeout(() => { this._flush(); }, flushAfter);

		return promise;
	}

	_flush() {
		var actions = this._actions, responses = this._responses;
		this._actions = {};
		this._responses = {};

		superagent(this._endpoint).post(actions).end((err, res) => {
			for (var k in res.body) {
				if (res.body.hasOwnProperty(k)) {
					if (err) {
						responses[k].reject(err);
					}
					else if (res.body[k].error) {
						responses[k].reject(res.body[k].error);
					}
					else {
						responses[k].resolve(res.body[k].value);
					}
				}
			}
		});
	}
}

export default Server;
