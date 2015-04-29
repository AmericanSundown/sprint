// this part belongs in BlackberrySelector
import { ServerNamespace, Storage, SprintComponent, wrap, k, a } from '../index';
import React from 'react';
import B from 'bluebird';

var storage = new Storage();
var appServer = {
	action: function(ns, call, data) {
		return B.delay(1000).return({ 'blackberry_url': data.keys[0] == 'a' ? 'ABC' : 'DEF' });
	}
};
var appNS = new ServerNamespace('app', appServer, 1, 1);
storage.register('app', appNS);

var prefServer = { action: function() { return B.delay(2000).return({ "app_id": 'b' }); } };
var prefNS = new ServerNamespace('prefs', prefServer, 0, 1);
storage.register('prefs', prefNS);

class TestComponent extends SprintComponent {
	render() {
		return <div>Hello {this.props.blackberry_url}</div>;
	}
}
var T = wrap(TestComponent, {
	props: {
		"blackberry_url": k("app", k([ k("prefs", "app_id"), k('props', 'app_id') ]), "blackberry_url")
	},
	actions: {
		"save": a("app", "save")
	}
});

window.onload = function() {
	React.render(<T storage={storage} app_id="a" />, document.getElementById('test'));
};

