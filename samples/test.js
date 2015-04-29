// this part belongs in BlackberrySelector
import { Namespace, Storage, SprintComponent, wrap, k, a } from '../index';
import React from 'react';

class TestComponent extends SprintComponent {
	render() {
		return <div>Hello {this.props.blackberry_url}</div>;
	}
}

var storage = new Storage();
var appNS = new Namespace();
appNS.set([ 'a' ], { 'blackberry_url': 'ABC' });
appNS.set([ 'b' ], { 'blackberry_url': 'DEF' });
storage.register('app', appNS);

var T = wrap(TestComponent, {
	props: {
		"blackberry_url": k("app", k("props", "app_id"), "blackberry_url")
		// "default_url": k("app", app_id_key, "default_url"),
	},
	actions: {
		"save": a("app", "save")
	}
});

window.onload = function() {
	var e = React.createElement(T, { "storage": storage, "app_id": "b" });
	React.render(e, document.getElementById('test'));
}

