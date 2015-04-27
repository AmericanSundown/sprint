var m = require('mori');

var Store = function() {};

Store.prototype.get = function(keys) {
    return m.getIn(this._data, keys);
};

Store.prototype.set = function(keys, value) {
    this._data = m.assocIn(this._data, keys, value);
    this._notify(keys);
};

Store.prototype._notify = function(keys) {
    var self = this;

    // Get the key path ([a b c] -> [[a] [a b] [a b c]])
    var keyCombos = m.reduce(function(acc, key) {
        return m.conj(acc, m.conj(m.last(acc) || m.vector(), key));
    }, m.vector(), keys);

    // Go through each key combo, then each subscriber, and trigger them.
    m.each(keyCombos, function(keyCombo) {
        m.each(m.get(self._subscribers, keyCombo), function(subscriber) {
            subscriber();
        });
    });
};

Store.prototype.subscribe = function(keys, fn) {
    var k = m.toClj(keys),
        previous_subscribers = m.get(this._subscribers, k),
        new_subscribers = m.conj(previous_subscribers || m.set(), fn);
    this._subscribers = m.assoc(this._subscribers, k, m.conj(new_subscribers, fn));
};

Store.prototype.unsubscribe = function(keys, fn) {
    var k = m.toClj(keys);
    this._subscribers = m.assoc(this._subscribers, k, m.disj(m.get(this._subscribers, k), fn));
};

Store.prototype._subscribers = m.hashMap();
Store.prototype._data = m.hashMap();

module.exports = Store;
