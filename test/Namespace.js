import test from 'tape';
import m from 'mori';
import Namespace from '../Namespace';

test('Namespace', (t) => {
	var s;
	function setup() { s = new Namespace('test'); };

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

	// Subscribe/notify
	[
		{ subscribe: [], set: [], shouldNotify: true },
		{ subscribe: [], set: [ 'a' ], shouldNotify: true },
		{ subscribe: [], set: [ 'a', 'b' ], shouldNotify: true },
		{ subscribe: [ 'a' ], set: [], shouldNotify: true },
		{ subscribe: [ 'a' ], set: [ 'a' ], shouldNotify: true },
		{ subscribe: [ 'a' ], set: [ 'a', 'b' ], shouldNotify: true },
		{ subscribe: [ 'a', 'b' ], set: [], shouldNotify: true },
		{ subscribe: [ 'a', 'b' ], set: [ 'a' ], shouldNotify: true },
		{ subscribe: [ 'a', 'b' ], set: [ 'a', 'b' ], shouldNotify: true },
		{ subscribe: [ 'a', 'b' ], set: [ 'a', 'c' ], shouldNotify: false }
	].forEach((c, i) => {
		t.test('subscribe/notify works case ' + i, (t) => {
			t.plan(c.shouldNotify ? 3 : 1);

			setup();
			s.subscribe(c.subscribe, () => {
				t.ok(true, 'was notified');
			});
			s.set(c.set, 'a');
			s.set(c.set, 'b');
			t.ok(true, 'finished');
		});
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
});

