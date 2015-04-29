import test from 'tape';
import m from 'mori';
import Namespace from '../Namespace';

test('Namespace', (t) => {
	var s;
	function setup() { s = new Namespace(1); };

	t.test('basic get and set works', (t) => {
		setup();
		t.ok(m.equals(s.get(), m.hashMap()), 'basic is empty');
		s.set([ 'a' ], 'b');
		t.ok(s.get([ 'a' ]) == 'b', 'key get works');
		t.ok(s.get([ 'b' ]) == null, 'empty key is empty');
		t.ok(m.equals(s.get(), m.hashMap('a', 'b')), 'map get works');
		t.end();
	});

	t.test('subscribe/notify works', (t) => {
		setup();
		t.plan(2);
		s.subscribe([ 'a' ], () => {
			t.ok(true, 'was notified');
		});
		s.set([ 'a' ], 'b');
		s.set([ 'a' ], 'c');
	});

	t.test('unsubscribe works', (t) => {
		setup();
		t.plan(1);

		var f = () => {
			// if not ok, this gets called over and over until we hit the recursion limit.
			t.ok(true, 'was notified');
			s.unsubscribe([ 'a' ], f);
			s.set([ 'a' ], 'c');
		};

		s.subscribe([ 'a' ], f);
		s.set([ 'a' ], 'b');
	});

	t.test('nested get and set works', (t) => {
		setup();
		s.set([ 'a', 'b' ], 'c');

		t.ok(s.get([ 'a', 'b' ]) == 'c', 'key get works');
		t.ok(s.get([ 'b' ]) == null, 'empty key is empty');

		t.ok(m.equals(s.get(), m.hashMap('a', m.hashMap('b', 'c'))), 'map get works');
		t.ok(m.equals(s.get([ 'a' ]), m.hashMap('b', 'c')), 'map get 2 works');

		t.end();
	});

	t.test('subscribe/notify works', (t) => {
		setup();
		t.plan(2);
		s.subscribe([ 'a', 'b' ], () => {
			t.ok(true, 'was notified');
		});
		s.set([ 'a', 'b' ], 'b');
		s.set([ 'a', 'b' ], 'c');
		s.set([ 'a', 'c' ], 'c');
	});

	t.test('parent subscribe/notify works', (t) => {
		setup();
		t.plan(3);
		s.subscribe([ 'a' ], () => { t.ok(true, 'was notified'); });
		s.set([ 'a', 'b' ], 'b');
		s.set([ 'a', 'b' ], 'c');
		s.set([ 'a', 'c' ], 'c');
		s.set([ 'b', 'c' ], 'd');
	});

	t.test('unsubscribe works', (t) => {
		setup();
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

	t.test('subscribing to a subkey works', (t) => {
		setup();
		t.plan(2);

		var f = () => {
			t.ok(true, 'was notified');
		};

		s.subscribe([ 'a', 'b' ], f);
		s.set([ 'a' ], { 'b': 1 });
		s.set([ 'a' ], { 'b': 2 });
	});
});

