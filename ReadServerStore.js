import m from 'mori';
import ServerStore from './ServerStore';

class ReadServerStore extends ServerStore {
	set(keys) {
		throw new Error('Cannot set property of read-only store');
	}
}

export default Store;
