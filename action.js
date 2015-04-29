import m from 'mori';

class Action {
	constructor(namespace, action, data) {
		this.namespace = namespace;
		this.action = action;
		this.data = data;
	}

	execute(storage) {
		// .......
		console.log('action!', k);
	}
}

export default function action(namespace, action, data) {
	return new Action(namespace, action, data);
}
