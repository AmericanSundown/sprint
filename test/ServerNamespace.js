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
		s.action = () => { return new B(function() {}); };
		s.subscribe([ 'a', 'b' ], () => { t.ok(true, 'subscription called'); });
		s.get([ 'a', 'b' ]);
		t.ok(true, 'passed');
	});

	t.test('subscribe/notify works on server function - called twice with arty 2', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 2, 2);

		t.plan(8);

		s.subscribe([ 'a' ], () => {
			// This should execute twice.
			t.ok(true, 'subscription called');
		});

		s.action = (call, data) => {
			function valid(k) { return m.equals(m.toClj(data.keys), m.toClj([ 'a', k ])); }

			// This should be called twice
			t.ok(valid('b') || valid('c'), 'correct keys passed in');
			return B.delay(1).return('abc');
		};

		t.ok(!s.get([ 'a', 'b' ]), 'not loaded 1');
		t.ok(!s.get([ 'a', 'c' ]), 'not loaded 2');

		setTimeout(() => {
			t.ok(s.get([ 'a', 'b' ]) == 'abc', 'loaded 1');
			t.ok(s.get([ 'a', 'c' ]) == 'abc', 'loaded 2');
		}, 4);
	});

	t.test('subscribe/notify works on server function - called once with arity 1', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 1, 2);

		t.plan(6);
		s.subscribe([ 'a' ], () => { t.ok(true, 'subscription called'); });

		s.action = (call, data) => {
			t.ok(m.equals(m.toClj(data.keys), m.toClj([ 'a' ])), 'keys correct');

			return B.delay(1).return({ 'b': 1, 'c': 2 });
		};

		t.ok(!s.get([ 'a', 'b' ]), 'not loaded 1');
		t.ok(!s.get([ 'a', 'c' ]), 'not loaded 2');

		setTimeout(() => {
			t.ok(s.get([ 'a', 'b' ]) == 1, 'loaded 1');
			t.ok(s.get([ 'a', 'c' ]) == 2, 'loaded 2');
		}, 4);
	});


	t.test('isLoading works', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 2, 2);

		t.plan(20);

		s.action = (call, data) => {
			return B.delay(data.keys[1] == 'b' ? 5 : 10).return({ 'd': 'e' });
		};

		function verifyLoadingState(ab, ac, msg) {
			t.ok(s.isLoading([ 'a', 'b' ]) == ab, msg + ' ab');
			t.ok(s.isLoading([ 'a', 'b', 'd' ]) == ab, msg + ' abd');
			t.ok(s.isLoading([ 'a', 'c' ]) == ac, msg + ' ac');
			t.ok(s.isLoading([ 'a', 'c', 'd' ]) == ac, msg + 'acd');
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



test('ServerSaving loading', (t) => {
	var s, ServerNamespace;

	t.test('basic data type get/save works', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 1, 1);

		t.plan(4);

		s.set([ 'a' ], 'b');
		s.action = (call, data) => {
			t.ok(arrayEq(data.key, [ 'a' ]), 'key is correct');
			t.ok(data.value == 'b', 'value is correct');
			return new B.delay(5).return('c');
		};
		s.save([ 'a' ]).then(function() {
			t.ok(s.get([ 'a' ]) == 'c', 'saved data correct');
		});
		t.ok(s.get([ 'a' ]) == 'b', 'Staging data correct');
	});

	t.test('basic data type get/save works with override', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 1, 1);

		t.plan(5);

		s.set([ 'a' ], 'b');
		s.action = (call, data) => {
			t.ok(arrayEq(data.key, [ 'a' ]), 'key is correct');
			t.ok(data.value == 'b', 'value is correct');
			return new B.delay(5).return('c');
		};
		s.save([ 'a' ]).then(() => {
			t.ok(s.get([ 'a' ]) == 'd', 'saved data correctly overridden');
		});
		t.ok(s.get([ 'a' ]) == 'b', 'staging data correct');
		s.set([ 'a' ], 'd');
		t.ok(s.get([ 'a' ]) == 'd', 'staging data correct once saved');
	});

	t.test('basic data type get/save with error', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 1, 1);

		t.plan(6);

		s.action = (call, data) => {
			if (call == 'load') {
				return B.resolve('a');
			}
			else {
				t.ok(arrayEq(data.key, [ 'a' ]), 'key is correct');
				t.ok(data.value == 'b', 'value is correct');
				return new B.delay(5).throw('c');
			}
		};

		// Load 'a'
		s.get([ 'a' ]);

		setTimeout(() => {
			t.ok(s.get([ 'a' ]) == 'a', 'load is correct');
			s.set([ 'a' ], 'b');
			t.ok(s.get([ 'a' ]) == 'b', 'local override is correct');

			s.save([ 'a' ]).then(() => {
				t.ok(false, 'should have errored');
			}, () => {
				t.ok(s.get([ 'a' ]) == 'b', 'reverts to local override');
			});
			t.ok(s.get([ 'a' ]) == 'b', 'keeps local override');
		}, 1);
	});

	t.test('basic data type get/save works with error & override', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 1, 1);

		t.plan(7);

		s.action = (call, data) => {
			if (call == 'load') {
				return B.resolve('a');
			}
			else {
				t.ok(arrayEq(data.key, [ 'a' ]), 'key is correct');
				t.ok(data.value == 'b', 'value is correct');
				return new B.delay(5).throw('c');
			}
		};

		// Load 'a'
		s.get([ 'a' ]);

		setTimeout(() => {
			t.ok(s.get([ 'a' ]) == 'a', 'load is correct');
			s.set([ 'a' ], 'b');
			t.ok(s.get([ 'a' ]) == 'b', 'local override is correct');

			s.save([ 'a' ]).then(() => {
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
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 1, 1);
		var d = m.toClj({ 1: 'a', 2: 'b' }),
			d2 = { 1: 'b', 2: 'c' };

		t.plan(4);

		s.set([ 'a' ], d);
		s.action = (call, data) => {
			t.ok(arrayEq(data.key, [ 'a' ]), 'key is correct');
			t.ok(m.equals(m.toClj(data.value), d), 'value is correct');
			return new B.delay(5).return(d2);
		};
		s.save([ 'a' ]).then(function() {
			t.ok(m.equals(s.get([ 'a' ]), m.toClj(d2)), 'saved data correct');
		});
		t.ok(m.equals(s.get([ 'a' ]), d), 'Staging data correct');
	});


	t.test('map get/save works with override', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 1, 1);
		var d = m.toClj({ "1": 'a', "2": 'b' });

		t.plan(5);

		s.set([ 'a' ], d);
		s.action = (call, data) => {
			t.ok(arrayEq(data.key, [ 'a' ]), 'key is correct');
			t.ok(m.equals(m.toClj(data.value), d), 'value is correct');
			return new B.delay(5).return({ "1": 'b', "2": 'c' });
		};
		s.save([ 'a' ]).then(() => {
			t.ok(m.equals(s.get([ 'a' ]), m.toClj({ "1": 'c', "2": 'c' })), 'saved data correctly overridden');
		});
		t.ok(m.equals(s.get([ 'a' ]), d), 'staging data correct');
		s.set([ 'a', "1" ], 'c');

		t.ok(m.equals(s.get([ 'a' ]), m.toClj({ "1": 'c', "2": 'b' })), 'staging data correct once saved');
	});

	t.test('basic data type get/save with error', (t) => {
		var ServerNamespace = require('../ServerNamespace'), s = new ServerNamespace('test', 1, 1);

		t.plan(6);

		s.action = (call, data) => {
			if (call == 'load') {
				return B.resolve({ "1": "b", "2": "d" });
			}
			else {
				t.ok(arrayEq(data.key, [ 'a' ]), 'key is correct');
				t.ok(m.equals(m.toClj(data.value), m.toClj({ '1': 'c' })), 'value is correct');
				return new B.delay(5).throw('c');
			}
		};

		// Load 'a'
		s.get([ 'a' ]);

		setTimeout(() => {
			t.ok(m.equals(s.get([ 'a' ]), m.toClj({ "1": "b", "2": "d" })), 'load is correct');
			s.set([ 'a', '1' ], 'c');
			t.ok(s.get([ 'a', '1' ]) == 'c', 'local override is correct');

			s.save([ 'a' ]).then(() => {
				t.ok(false, 'should have errored');
			}, () => {
				t.ok(m.equals(s.get([ 'a' ]), m.toClj({ '1': 'c', '2': 'd' })), 'reverts to local override');
			});
			t.ok(m.equals(s.get([ 'a' ]), m.toClj({ '1': 'c', '2': 'd' })), 'keeps local override');
		}, 1);
	});

}, { timeout: 500 });
