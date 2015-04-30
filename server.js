import m from 'mori';
import superagent from 'superagent';
import B from 'bluebird';

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
		this._timeout = setTimeout(() => this._flush(), this._flushAfter);

		return promise;
	}

	_flush() {
		var actions = this._actions, responses = this._responses;
		this._actions = {};
		this._responses = {};

		superagent.post(this._endpoint).send(actions).end((err, res) => {
			if (err || res.status != 200) {
				if (!err) { err = new Error("Got status " + res.status); }
				for (var k in responses) {
					if (responses.hasOwnProperty(k)) {
						responses[k].reject(err);
					}
				}
				return;
			}
			for (var k in res.body) {
				if (k != 'responses' && res.body.hasOwnProperty(k)) {
					var response = res.body.responses[res.body[k]];
					if (response.error) { responses[k].reject(response.error); }
					else { responses[k].resolve(response.value); }
				}
			}
		});
	}
}

export default Server;
