import m from 'mori';
import { isObj } from './utils';

class Action {
	constructor(namespace, action, data) {
		this.namespace = namespace;
		this.action = action;
		this.data = data;
	}

	execute(storage) {
		function resolve(data) {
			try {
				if (data.get && typeof data.get == 'function') { return data.get(storage); }
			}
			catch (e) {}

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

		return storage.getNamespace(this.namespace).action(this.action, resolve(this.data));
	}
}

export default function action(namespace, action, data) {
	return new Action(namespace, action, data);
}
