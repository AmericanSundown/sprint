import m from 'mori';
import ServerNamespace from './ServerNamespace';

class ReadServerNamespace extends ServerNamespace {
	constructor(namespace, loadArity) {
		return super(namespace, loadArity, 0);
	}
	set(keys) {
		throw new Error('Cannot set property of read-only namespace');
	}
}

export default ReadServerNamespace;
