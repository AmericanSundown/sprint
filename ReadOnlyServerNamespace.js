import m from 'mori';
import ServerNamespace from './ServerNamespace';

/**
 * A read-only server namespace is exactly the same as a normal
 * ServerNamespace, except data cannot be written to it.
 */
class ReadOnlyServerNamespace extends ServerNamespace {
	constructor(name, server, keyArity) {
		return super(name, server, keyArity, 0);
	}
	set() { throw new Error('Cannot set property of read-only namespace'); }
	_save() { throw new Error('Cannot save read-only namespace'); }
}

export default ReadOnlyServerNamespace;
