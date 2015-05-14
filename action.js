import m from 'mori';
import { isObj } from './utils';

class Action {
	constructor(namespace, action, data) {
		this.namespace = namespace;
		this.action = action;
		this.data = data;
	}

	resolve(storage) {
		function resolve(data) {
			if (data && data.get && typeof data.get == 'function') { return m.toJs(data.get(storage)); }

			if (m.isMap(data)) {
				data = m.toJs(data);
			}
			if (isObj(data)) {
				var built = {};
				for (var k in data) {
					if (data.hasOwnProperty(k)) {
						built[k] = resolve(data[k]);
					}
				}
				return built;
			}
			if (Array.isArray(data)) {
				return data.map(resolve);
			}

			return data;
		}
		return resolve(this.data);
	}

	execute(storage) {
		return storage.getNamespace(this.namespace).action(this.action, this.resolve(storage));
	}
}

export default function action(namespace, action, data) {
	return new Action(namespace, action, data);
}
