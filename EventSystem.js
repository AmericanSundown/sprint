import B from 'bluebird';
import m from 'mori';

// TODO: refactor

class EventSystem {
	constructor() {
		this.actions = [];
		this.trigger = this.trigger.bind(this);
	}
	register(action, storage) {
		this.actions.push([ action, storage ]);
	}
	trigger(e) {
		if (e && e.preventDefault) { e.preventDefault(); }

		var ops = [], hashes = {};

		for (var k in this.actions) {
			if (this.actions.hasOwnProperty(k)) {
				var [ action, storage ] = this.actions[k];
				var hash = String(m.hash(
					m.vector(
						action.namespace,
						action.action,
						m.toClj(action.resolve(storage))
					)));

				if (hashes[hash]) { continue; }
				hashes[hash] = true;

				ops.push(action.execute(storage));
			}
		}
		return B.all(ops);
	}
}

export default EventSystem;
