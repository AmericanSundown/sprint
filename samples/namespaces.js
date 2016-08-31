import m from 'mori';
import ServerNamespace from '../src/ServerNamespace';
import Server from '../src/Server';

var server = new Server('https://dashboard.branch.io/sprint');

storage.register('app', new ServerNamespace('app', server, 0, 1));
storage.register('marketing_link', new ServerNamespace('marketing_link', server, 1, 2));
