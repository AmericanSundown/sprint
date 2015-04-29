import m from 'mori';

class Action {
	constructor(namespace, action, data) {
		this.namespace = namespace;
		this.action = action;
		this.data = data;
	}

	execute(storage) {
		var resolvedData = {};
		for (var k in this.data) {
			if (this.data.hasOwnProperty(k)) {
				if (this.data[k].get && typeof this.data[k].get == 'function') {
					resolvedData[k] = this.data[k].get(storage);
				}
				else {
					resolvedData[k] = this.data[k];
				}
			}
		}

		return storage.getNamespace(this.namespace).action(this.action, resolvedData);
	}
}

export default function action(namespace, action, data) {
	return new Action(namespace, action, data);
}
