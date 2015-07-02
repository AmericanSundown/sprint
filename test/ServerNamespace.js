import test from 'tape';
import m from 'mori';
import B from 'bluebird';

// This isn't the best but it works
function arrayEq(a, b) {
	return m.equals(m.toClj(a), m.toClj(b));
}

test('ServerNamespace loading', (t) => {
	var s, ServerNamespace;

	t.test('basic get and set works on server', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', { action: () => {} }, 2, 2);

		t.ok(m.equals(s.get(), m.hashMap()), 'basic is empty');
		s.set([ 'a' ], 'b');
		t.ok(s.get([ 'a' ]) == 'b', 'key get works');

		t.ok(m.equals(s.get(), m.hashMap('a', 'b')), 'map get works');
		t.end();
	});

	t.test("getter doesn't notify", (t) => {
		t.plan(1);
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', { action: () => { return new B(function() {}); } }, 2, 2);

		s.subscribe([ 'a', 'b' ], () => { t.ok(true, 'subscription called'); });
		s.get([ 'a', 'b' ]);
		t.ok(true, 'passed');
	});

	t.test('subscribe/notify works on server function - called twice with arity 2', (t) => {
		t.plan(12);
		var server = { action: (ns, key, action, data) => {
			function valid(k) { return ; }

			// These should all be called twice
			t.equal(ns, 'test', 'ns correct');
			t.ok(arrayEq(key, [ 'a', 'b' ]) || arrayEq(key, [ 'a', 'c' ]), 'correct keys passed in');
			t.equal(action, 'load', 'action correct');

			return B.delay(1).return({ '$set': [ { 'key': key, 'value': 'abc' } ] });
		} };

		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', server, 2, 2);

		s.subscribe([ 'a' ], () => {
			// This should execute twice.
			t.ok(true, 'subscription called');
		});

		t.ok(!s.get([ 'a', 'b' ]), 'not loaded 1');
		t.ok(!s.get([ 'a', 'c' ]), 'not loaded 2');

		setTimeout(() => {
			t.ok(s.get([ 'a', 'b' ]) == 'abc', 'loaded 1');
			t.ok(s.get([ 'a', 'c' ]) == 'abc', 'loaded 2');
		}, 4);
	});

	t.test('subscribe/notify works on server function - called once with arity 1', (t) => {
		t.plan(6);
		var server = { action: (ns, key, action, data) => {
			t.ok(m.equals(m.toClj(key), m.toClj([ 'a' ])), 'keys correct');

			return B.delay(1).return({
				'$set': [ { 'key': key, 'value': { 'b': 1, 'c': 2 } } ]
			});
		} };

		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', server, 1, 2);

		s.subscribe([ 'a' ], () => { t.ok(true, 'subscription called'); });

		t.ok(!s.get([ 'a', 'b' ]), 'not loaded 1');
		t.ok(!s.get([ 'a', 'c' ]), 'not loaded 2');

		setTimeout(() => {
			t.ok(s.get([ 'a', 'b' ]) == 1, 'loaded 1');
			t.ok(s.get([ 'a', 'c' ]) == 2, 'loaded 2');
		}, 4);
	});


	t.test('isLoading works', (t) => {
		t.plan(20);
		var server = { action: (ns, key, action, data) => {
			var k = m.toJs(key);
			return B.delay(k[1] == 'b' ? 5 : 10).return({
				'$set': [ { 'key': k, 'value': { 'd': 'e' } } ]
			});
		} };
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', server, 2, 2);

		function verifyLoadingState(ab, ac, msg) {
			t.equal(s.isLoading([ 'a', 'b' ]), ab, msg + ' ab');
			t.equal(s.isLoading([ 'a', 'b', 'd' ]), ab, msg + ' abd');
			t.equal(s.isLoading([ 'a', 'c' ]), ac, msg + ' ac');
			t.equal(s.isLoading([ 'a', 'c', 'd' ]), ac, msg + ' acd');
		}

		verifyLoadingState(false, false, 'start');

		// Trigger loading
		s.get([ 'a', 'b' ]);
		verifyLoadingState(true, false, 'one triggered');
		s.get([ 'a', 'c' ]);
		verifyLoadingState(true, true, 'both triggered');


		setTimeout(() => {
			verifyLoadingState(false, true, 'one resolved');
		}, 7);

		setTimeout(() => {
			verifyLoadingState(false, false, 'both resolved');
		}, 15);
	});

}, { timeout: 500 });


test('ServerNamespace saving', (t) => {
	var s, ServerNamespace;

	t.test('basic data type get/save works', (t) => {
		t.plan(4);
		var server = { action: (ns, key, action, data) => {
			t.ok(arrayEq(key, [ 'a' ]), 'key is correct');
			t.ok(data == 'b', 'value is correct');
			return new B.delay(5).return({
				'$set': [ { 'key': [ 'a' ], 'value': 'c' } ]
			});
		} };
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', server, 1, 1);

		s.set([ 'a' ], 'b');
		s.action([ 'a' ], 'save').then(function() {
			t.ok(s.get([ 'a' ]) == 'c', 'saved data correct');
		});
		t.ok(s.get([ 'a' ]) == 'b', 'Staging data correct');
	});


	t.test('basic data type get/save works with override', (t) => {
		t.plan(5);
		var server = { action: (ns, key, action, data) => {
			t.ok(arrayEq(key, [ 'a' ]), 'key is correct');
			t.ok(data == 'b', 'value is correct');
			return new B.delay(5).return('c');
		} };

		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', server, 1, 1);

		s.set([ 'a' ], 'b');
		s.action([ 'a' ], 'save').then(() => {
			t.ok(s.get([ 'a' ]) == 'd', 'saved data correctly overridden');
		});
		t.ok(s.get([ 'a' ]) == 'b', 'staging data correct');
		s.set([ 'a' ], 'd');
		t.ok(s.get([ 'a' ]) == 'd', 'staging data correct once saved');
	});

	t.test('basic data type get/save with error', (t) => {
		t.plan(6);
		var server = { action: (ns, key, action, data) => {
			if (action == 'load') {
				return B.resolve({
					'$set': [ { key: [ 'a' ], value: 'a' } ]
				});
			}
			else {
				t.ok(arrayEq(key, [ 'a' ]), 'key is correct');
				t.ok(data == 'b', 'value is correct');
				return new B.delay(5).throw('c');
			}
		} };

		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', server, 1, 1);

		// Load 'a'
		s.get([ 'a' ]);

		setTimeout(() => {
			t.ok(s.get([ 'a' ]) == 'a', 'load is correct');
			s.set([ 'a' ], 'b');
			t.ok(s.get([ 'a' ]) == 'b', 'local override is correct');

			s.action([ 'a' ], 'save').then(() => {
				t.ok(false, 'should have errored');
			}, () => {
				t.ok(s.get([ 'a' ]) == 'b', 'reverts to local override');
			});

			t.ok(s.get([ 'a' ]) == 'b', 'keeps local override temporarily');
		}, 1);
	});

	t.test('basic data type get/save works with error & override', (t) => {
		t.plan(7);
		var server = { action: (ns, key, action, data) => {
			if (action == 'load') {
				return B.resolve({
					'$set': [ { 'key': key, 'value': 'a' } ]
				});
			}
			else {
				t.ok(arrayEq(key, [ 'a' ]), 'key is correct');
				t.ok(data == 'b', 'value is correct');
				return new B.delay(5).throw('c');
			}
		} };

		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', server, 1, 1);

		// Load 'a'
		s.get([ 'a' ]);

		setTimeout(() => {
			t.ok(s.get([ 'a' ]) == 'a', 'load is correct');
			s.set([ 'a' ], 'b');
			t.ok(s.get([ 'a' ]) == 'b', 'local override is correct');

			s.action([ 'a' ], 'save').then(() => {
				t.ok(false, 'should have errored');
			}, () => {
				t.ok(s.get([ 'a' ]) == 'c', 'keeps new local override');
			});
			t.ok(s.get([ 'a' ]) == 'b', 'keeps local override');
			s.set([ 'a' ], 'c');
			t.ok(s.get([ 'a' ]) == 'c', 'gets new local override');
		}, 1);
	});

	t.test('map get/save works', (t) => {
		t.plan(4);
		var d = m.toClj({ 1: 'a', 2: 'b' }),
			d2 = { 1: 'b', 2: 'c' };

		var server = { action: (ns, key, action, data) => {
			t.ok(arrayEq(key, [ 'a' ]), 'key is correct');
			t.ok(m.equals(m.toClj(data), d), 'value is correct');
			return new B.delay(5).return({
				'$set': [ { 'key': key, 'value': d2 } ]
			});
		} };

		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', server, 1, 1);

		s.set([ 'a' ], d);
		s.action([ 'a' ], 'save').then(function() {
			t.ok(m.equals(s.get([ 'a' ]), m.toClj(d2)), 'saved data correct');
		});
		t.ok(m.equals(s.get([ 'a' ]), d), 'Staging data correct');
	});

	t.test('map get/save works with override', (t) => {
		t.plan(5);

		var d = m.toClj({ "1": 'a', "2": 'b' });

		var server = { action: (ns, key, action, data) => {
			t.ok(arrayEq(key, [ 'a' ]), 'key is correct');
			t.ok(m.equals(m.toClj(data), d), 'value is correct');
			return new B.delay(5).return({
				'$set': [ { 'key': key, 'value': { "1": 'b', "2": 'c' } } ]
			});
		} };
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', server, 1, 1);

		s.set([ 'a' ], d);
		s.action([ 'a' ], 'save').then(() => {
			t.ok(m.equals(s.get([ 'a' ]), m.toClj({ "1": 'c', "2": 'c' })), 'saved data correctly overridden');
		});
		t.ok(m.equals(s.get([ 'a' ]), d), 'staging data correct');
		s.set([ 'a', "1" ], 'c');

		t.ok(m.equals(s.get([ 'a' ]), m.toClj({ "1": 'c', "2": 'b' })), 'staging data correct once saved');
	});

	t.test('basic data type get/save with error', (t) => {
		t.plan(6);
		var server = { action: (ns, key, action, data) => {
			if (action == 'load') {
				return B.resolve({
					'$set': [ { 'key': key, 'value': { "1": "b", "2": "d" } } ]
				});
			}
			else {
				t.ok(arrayEq(key, [ 'a' ]), 'key is correct');
				t.ok(m.equals(m.toClj(data), m.toClj({ '1': 'c' })), 'value is correct');
				return new B.delay(5).throw('c');
			}
		} };

		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', server, 1, 1);

		// Load 'a'
		s.get([ 'a' ]);

		setTimeout(() => {
			t.ok(m.equals(s.get([ 'a' ]), m.toClj({ "1": "b", "2": "d" })), 'load is correct');
			s.set([ 'a', '1' ], 'c');
			t.ok(s.get([ 'a', '1' ]) == 'c', 'local override is correct');

			s.action([ 'a' ], 'save').then(() => {
				t.ok(false, 'should have errored');
			}, () => {
				t.ok(m.equals(s.get([ 'a' ]), m.toClj({ '1': 'c', '2': 'd' })), 'reverts to local override');
			});
			t.ok(m.equals(s.get([ 'a' ]), m.toClj({ '1': 'c', '2': 'd' })), 'keeps local override');
		}, 1);
	});
}, { timeout: 500 });
