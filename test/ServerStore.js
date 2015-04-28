import test from 'tape';
import m from 'mori';
import B from 'bluebird';

test('ServerStore', (t) => {
	var s, ServerStore;

	t.test('basic get and set works on server', (t) => {
		var ServerStore = require('../ServerStore'), s = new ServerStore('test', [ 2 ]);

		t.ok(m.equals(s.get(), m.hashMap()), 'basic is empty');
		s.set([ 'a' ], 'b');
		t.ok(s.get([ 'a' ]) == 'b', 'key get works');

		t.ok(m.equals(s.get(), m.hashMap('a', 'b')), 'map get works');
		t.end();
	});

	t.test("getter doesn't notify", (t) => {
		var ServerStore = require('../ServerStore'), s = new ServerStore('test', [ 2 ]);

		t.plan(1);
		ServerStore.__set__('_server2', { 'default': function() { return new B(function() {}); } });
		s.subscribe([ 'a', 'b' ], function() { t.ok(true, 'subscription called'); });
		s.get([ 'a', 'b' ]);
		t.ok(true, 'passed');
	});

	t.test('subscribe/notify works on server function - called twice with arty 2', (t) => {
		var ServerStore = require('../ServerStore'), s = new ServerStore('test', [ 2 ]);

		t.plan(3);
		s.subscribe([ 'a' ], function() { t.ok(true, 'subscription called'); });

		ServerStore.__set__('_server2', { 'default': function() { return B.resolve('abc'); } });

		s.get([ 'a', 'b' ]);
		s.get([ 'a', 'c' ]);
		t.ok(true, 'finished');
	});

	t.test('subscribe/notify works on server function - called once with arity 1', (t) => {
		var ServerStore = require('../ServerStore'), s = new ServerStore('test', [ 1 ]);

		t.plan(2);
		s.subscribe([ 'a' ], function() { t.ok(true, 'subscription called'); });

		ServerStore.__set__('_server2', { 'default': function() { return B.resolve('abc'); } });

		s.get([ 'a', 'b' ]);
		s.get([ 'a', 'c' ]);
		t.ok(true, 'finished');
	});
	/*
	t.test('nested get and set works', (t) => {
		s.set([ 'a', 'b' ], 'c');

		t.ok(s.get([ 'a', 'b' ]) == 'c', 'key get works');
		t.ok(s.get([ 'b' ]) == null, 'empty key is empty');

		t.ok(m.equals(s.get(), m.hashMap('a', m.hashMap('b', 'c'))), 'map get works');
		t.ok(m.equals(s.get([ 'a' ]), m.hashMap('b', 'c')), 'map get 2 works');

		t.end();
	});

	t.test('subscribe/notify works', (t) => {
		t.plan(2);
		s.subscribe([ 'a', 'b' ], () => {
			t.ok(true, 'was notified');
		});
		s.set([ 'a', 'b' ], 'b');
		s.set([ 'a', 'b' ], 'c');
		s.set([ 'a', 'c' ], 'c');
	});

	t.test('parent subscribe/notify works', (t) => {
		t.plan(3);
		s.subscribe([ 'a' ], () => { t.ok(true, 'was notified'); });
		s.set([ 'a', 'b' ], 'b');
		s.set([ 'a', 'b' ], 'c');
		s.set([ 'a', 'c' ], 'c');
		s.set([ 'b', 'c' ], 'd');
	});

	t.test('unsubscribe works', (t) => {
		t.plan(1);

		var f = () => {
			// if not ok, this gets called over and over until we hit the recursion limit.
			t.ok(true, 'was notified');
			s.unsubscribe([ 'a', 'b' ], f);
			s.set([ 'a', 'b' ], 'c');
		};

		s.subscribe([ 'a', 'b' ], f);
		s.set([ 'a', 'b' ], 'b');
	});
	*/

}, { timeout: 100 });
