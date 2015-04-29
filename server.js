import m from 'mori';
import superagent from 'superagent';

class Server {
	constructor(flushAfter, endpoint) {
		this._actions = m.hashMap();
		this._responses = m.hashMap();

		this.timeout = null;
		this._flushAfter = flushAfter || 10;
		this._endpoint = endpoint;
	}

	action(namespace, action, data) {
		var hash = m.hash(m.vector(namespace, action, data));
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
		this._actions = m.hashMap();
		this._responses = m.hashMap();

		superagent(this.endpoint).post(actions).end((err, res) => {
			if (err) {
				return m.each((d) => { d.reject(err); }, m.vals(responses));
			}

			for (var k in res.body) {
				if (res.body.hasOwnProperty(k)) {
					if (res.body[k].error) {
						m.get(this._responses, k).reject(res.body[k].error);
					}
					else {
						m.get(this._responses, k).resolve(res.body[k].value);
					}
				}
			}
		});
	}
}

export default Server;