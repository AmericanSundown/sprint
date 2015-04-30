// this part belongs in BlackberrySelector
import { Server, ServerNamespace, Storage, SprintComponent, wrap, k, a } from '../index';
import React from 'react';
import B from 'bluebird';

var storage = new Storage();
/*
var appServer = {
	action: function(ns, call, data) {
		if (call == 'save') {
			return B.delay(1000).return({ 'blackberry_url': 'saved' });
		}
		return B.delay(1000).return({ 'blackberry_url': data.keys[0] == 'a' ? 'ABC' : 'DEF' });
	}
};
var appNS = new ServerNamespace('app', appServer, 1, 1);
storage.register('app', appNS);


window.ns = appNS;
window.k = k;

var prefServer = { action: function() { return B.delay(2000).return({ "app_id": 'b' }); } };
var prefNS = new ServerNamespace('prefs', prefServer, 0, 1);
storage.register('prefs', prefNS);
*/
var server = new Server('http://localhost:3000/sprint');
var ns = new ServerNamespace('app', server, 0, 1);
storage.register('app', ns);
window.ns = ns;

class TestComponent extends SprintComponent {
	handleClick() {
		this.save();
	}
	setName(e) {
		this.set('name', e.target.value);
	}
	render() {
		return <div>
			<input value={this.props.name} onChange={this.setName.bind(this)} /><br/>
			<a href="#" onClick={this.handleClick.bind(this)}>Save</a><br />
			{this.props.name_loading ? 'loading' : 'not loading'}
		</div>;
	}
}

var app_id = k("props", "app_id");
var T = wrap(TestComponent, {
	props: {
		"name": k("app", app_id, "name")
	},
	actions: {
		"save": a("app", "save", { "key": [ app_id ] })
	}
});

window.onload = function() {
	React.render(<T storage={storage} app_id="121345863158072757" />, document.getElementById('test'));
};

