// this part belongs in BlackberrySelector
import { Server, ServerNamespace, Storage, EventSystem, SprintComponent, wrap, k, a } from '../src/index';
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

class Input extends SprintComponent {
	setName(e) {
		this.set('field', e.target.value);
	}
	render() {
		return <div>
			<input value={this.props.field} onChange={this.setName.bind(this)} /><br/>
			{this.props.name_loading ? 'loading' : 'not loading'}
		</div>;
	}
}

var app_id = k("props", "app_id");

var AppName = wrap(Input, {
	props: {
		"field": k("app", app_id, "name")
	},
	actions: {
		"save": a("app", "save", { "key": [ app_id ] })
	}
});

var DevEmail = wrap(Input, {
	props: {
		"field": k("app", app_id, "dev_email")
	},
	actions: {
		"save": a("app", "save", { "key": [ app_id ] })
	}
});


class Group extends React.Component {
	render() {
		var events = new EventSystem();
		return (
			<div>
				<AppName
					storage={storage}
					events={{ 'save': events }}
					app_id="118785423437725698" />
				<DevEmail
					storage={storage}
					events={{ 'save': events }}
					app_id="118785423437725698" />
				<a href="#" onClick={events.trigger}>Save</a><br />
			</div>);
	}
}


window.onload = function() {
	React.render(<Group/>, document.getElementById('test'));
};

