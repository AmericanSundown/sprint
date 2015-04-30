
class EventSystem {
	constructor() {
		this.functions = {};
		this.trigger = this.trigger.bind(this);
	}
	register(ns, fn) {
		this.functions[ns] = fn;
	}
	trigger() {
		for (var k in this.functions) {
			this.functions[k].call(null, arguments);
		}
	}
}

export default EventSystem;
