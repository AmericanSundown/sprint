// this part belongs in BlackberrySelector
import { ServerNamespace, Storage, SprintComponent, wrap, k, a } from '../index';
import React from 'react';
import B from 'bluebird';

var storage = new Storage();
var server = {
	action: function() {
		console.log('calling action')
		return B.delay(1000).return({
			'a': { 'blackberry_url': 'ABC' },
			'b': { 'blackberry_url': 'DEF' }
		});
	}
};

var appNS = new ServerNamespace('app', server, 0, 1);
//appNS.set([ 'a' ], { 'blackberry_url': 'ABC' });
//appNS.set([ 'b' ], { 'blackberry_url': 'DEF' });
storage.register('app', appNS);

class TestComponent extends SprintComponent {
	render() {
		return <div>Hello {this.props.blackberry_url}</div>;
	}
}
var T = wrap(TestComponent, {
	props: {
		"blackberry_url": k("app", k("props", "app_id"), "blackberry_url")
	},
	actions: {
		"save": a("app", "save")
	}
});

window.onload = function() {
	React.render(<T storage={storage} app_id="b" />, document.getElementById('test'));
};

