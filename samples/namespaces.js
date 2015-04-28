import m from 'mori';
import ServerStore from '../ServerStore';

storage.register('app', new AppStore('app', [ 0 ]));
storage.register('link', new ServerStore('link', [ 1, 2 ]));
