import test from 'tape';
import k from '../key';
import m from 'mori';

test("key functions", (t) => {
	t.test("everything filled in", (t) => {
		var storage = {
			get: function(k) { return "abc"; }
		};

		var the_key = k("app", k([ k("props", "app_id"), k("user_prefs", "app_id") ]), "blackberry_url");

		t.ok(m.equals(the_key.dependencies(storage), m.set([ m.vector('props', 'app_id'), m.vector('user_prefs', 'app_id'), m.vector('app', 'abc', 'blackberry_url') ])), 'Proper dependencies');
		t.ok(the_key.get(storage) == 'abc', 'Correct result');

		t.end();
	});

	t.test("last level not filled in", (t) => {
		var storage = {
			get: function(k) {
				if (m.nth(k, 0) == 'app') { return null; }
				return 'abc';
			}
		};

		var the_key = k("app", k([ k("props", "app_id"), k("user_prefs", "app_id") ]), "blackberry_url");

		t.ok(m.equals(the_key.dependencies(storage), m.set([ m.vector('props', 'app_id'), m.vector('user_prefs', 'app_id'), m.vector('app', 'abc', 'blackberry_url') ])), 'Proper dependencies');
		t.ok(the_key.get(storage) === null, 'Correct result');

		t.end();
	});

	t.test("all nulls", (t) => {
		var storage = {
			get: function(k) { return null; }
		};

		var the_key = k("app", k([ k("props", "app_id"), k("user_prefs", "app_id") ]), "blackberry_url");

		t.ok(m.equals(the_key.dependencies(storage), m.set([ m.vector('props', 'app_id'), m.vector('user_prefs', 'app_id') ])), 'Proper dependencies');
		t.ok(the_key.get(storage) === null, 'Correct result');

		t.end();
	});
});
