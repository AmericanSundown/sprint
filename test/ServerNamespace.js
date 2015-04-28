import test from 'tape';
import m from 'mori';
import B from 'bluebird';

test('ServerNamespace', (t) => {
	var s, ServerNamespace;

	t.test('basic get and set works on server', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 2, 2);

		t.ok(m.equals(s.get(), m.hashMap()), 'basic is empty');
		s.set([ 'a' ], 'b');
		t.ok(s.get([ 'a' ]) == 'b', 'key get works');

		t.ok(m.equals(s.get(), m.hashMap('a', 'b')), 'map get works');
		t.end();
	});

	t.test("getter doesn't notify", (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 2, 2);

		t.plan(1);
		ServerNamespace.__set__('_server2', { 'default': function() { return new B(function() {}); } });
		s.subscribe([ 'a', 'b' ], function() { t.ok(true, 'subscription called'); });
		s.get([ 'a', 'b' ]);
		t.ok(true, 'passed');
	});

	t.test('subscribe/notify works on server function - called twice with arty 2', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 2, 2);

		t.plan(10);

		s.subscribe([ 'a' ], () => {
			// This should execute twice.
			t.ok(true, 'subscription called');
		});

		ServerNamespace.__set__('_server2', { 'default': (ns, call, data) => {
			function valid(k) { return m.equals(m.toClj(data.keys), m.toClj([ 'a', k ])); }

			// This should be called twice
			t.ok(ns == 'test', 'namespace correct');
			t.ok(valid('b') || valid('c'), 'correct keys passed in');
			return B.delay(1).return('abc');
		} });

		t.ok(!s.get([ 'a', 'b' ]), 'not loaded 1');
		t.ok(!s.get([ 'a', 'c' ]), 'not loaded 2');

		setTimeout(() => {
			t.ok(s.get([ 'a', 'b' ]) == 'abc', 'loaded 1');
			t.ok(s.get([ 'a', 'c' ]) == 'abc', 'loaded 2');
		}, 4);
	});

	t.test('subscribe/notify works on server function - called once with arity 1', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 1, 2);

		t.plan(7);
		s.subscribe([ 'a' ], () => { t.ok(true, 'subscription called'); });

		ServerNamespace.__set__('_server2', { 'default': (ns, call, data) => {
			t.ok(ns == 'test', 'namespace correct');
			t.ok(m.equals(m.toClj(data.keys), m.toClj([ 'a' ])), 'keys correct');

			return B.delay(1).return({ 'b': 1, 'c': 2 });
		} });

		t.ok(!s.get([ 'a', 'b' ]), 'not loaded 1');
		t.ok(!s.get([ 'a', 'c' ]), 'not loaded 2');

		setTimeout(() => {
			t.ok(s.get([ 'a', 'b' ]) == 1, 'loaded 1');
			t.ok(s.get([ 'a', 'c' ]) == 2, 'loaded 2');
		}, 4);
	});

}, { timeout: 100 });
