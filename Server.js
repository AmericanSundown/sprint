import m from 'mori';
import superagent from 'superagent';
import B from 'bluebird';

/**
 * Executes request on a server.
 *
 * The Server 'interface' consists of one method -
 * `action(namespace, key, action, data)` - which takes these things and
 * returns a promise, which is fulfilled when the RPC is executed on the
 * server.
 *
 * This server interface uses a JSON over HTTP, batching together multiple
 * calls. The request format is as follows:
 * {
 *    (numeric hash): [ "namespace name", [ "key piece 1", "key piece 2", ... ], "action name", (data) ],
 *    ...
 * }
 * And it expects responses in the following format:
 * {
 *    (numeric hash): { "value": (value) }
 *    or
 *    (numeric hash): { "error": (value) }
 * }
 * If a non-200 status code is provided, every request is rejected.
 */
class Server {
	/**
	 * Create a new server connector.
	 *
	 * @param {string} endpoint the HTTP endpoint to access
	 * @param {int=} flushAfter how much time to wait in order to batch requests
	 */
	constructor(endpoint, flushAfter) {
		this._actions = {};

		this.timeout = null;
		this._flushAfter = flushAfter || 1;
		this._endpoint = endpoint;
	}

	/**
	 * Fire an action.
	 *
	 * @param {string} namespace
	 * @param {*[]} key
	 * @param {string} action
	 * @param {*=} data
	 */
	action(namespace, key, action, data) {
		// For each request, only send a single request.
		var hash = String(m.hash(m.toClj([ namespace, key, action, data ])));
		if (this._responses[hash]) { return this._responses[hash].promise; }

		var resolve, reject, promise = new B(function(res, rej) { resolve = res; reject = rej; });

		this._actions[hash] = {
			resolve: resolve,
			reject: reject,
			promise: promise,
			data: [ namespace, m.toJs(key), action, data ]
		};

		// Debounce
		if (this._timeout) { clearTimeout(this._timeout); }
		this._timeout = setTimeout(() => this._flush(), this._flushAfter);

		return promise;
	}

	/**
	 * Flush the requests to the server.
	 */
	_flush() {
		var actions = {}, responses = this._actions;
		for (k in this._actions) {
			if (this._actions.hasOwnProperty(k)) {
				actions[k] = this._actions[k].data;
			}
		}

		// Free up to be flushed again
		this._actions = {};

		superagent.post(this._endpoint).withCredentials().send(actions).end((err, res) => {
 			if (err || res.status != 200) {
				if (!err) { err = new Error("Got status " + res.status + " with body " + (res.text || res.body)); }
				for (var k in responses) {
					if (responses.hasOwnProperty(k)) {
						responses[k].reject(err);
					}
				}
			}
			else {
				for (var k in res.body) {
					if (res.body.hasOwnProperty(k)) {
						var value = res.body[k];
						if (response.error) { responses[k].reject(response.error); }
						else { responses[k].resolve(response.value); }
					}
				}
			}
		});
	}
}

export default Server;
