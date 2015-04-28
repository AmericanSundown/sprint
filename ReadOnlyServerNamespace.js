import m from 'mori';
import ServerNamespace from './ServerNamespace';

class ReadOnlyServerNamespace extends ServerNamespace {
	constructor(namespace, loadArity) {
		return super(namespace, loadArity, 0);
	}
	set() {
		throw new Error('Cannot set property of read-only namespace');
	}
	save() {
		throw new Error('Cannot save read-only namespace');
	}
}

export default ReadOnlyServerNamespace;
