import { SprintComponent, wrap, k, a } from 'sprint';

class BlackberrySelector extends SprintComponent {
	render() {
		return <div>Hello {this.props.name}</div>;
	}
}

var app_id_key = k([ k("props", "app_id"), k("user_prefs", "app_id") ]);

export default wrap(BlackberrySelector, {
	props: {
		"blackberry_url": k("app", app_id_key, "blackberry_url"),
		"default_url": k("app", app_id_key, "default_url"),
	},
	actions: {
		"save": a("app", "save")
	}
});


class SprintComponent extends React.Comopnent {
	setState(state) {
		super(state);
		this.props._setState(state);
	}
}

function wrap(component, options) {
	return class extends React.Component {
		constructor() {
			super();
			this.state = {};
		}

		// Ugly mutations sorry.
		_getStateForProp(k, props) {
			var val = this.props.storage.get(options.props[k]);

			var error = props[k + '_error'] = this.props.storage.isError(options.props[k]);
			var loading = props[k + '_loading'] = this.props.storage.isLoading(options.props[k]);

			props[k] = !error && !loading ? val : null;

			return props;
		}

		_getState() {
			var props = {};
			for (var k in options.props) {
				if (options.props.hasOwnProperty(k)) {
				}
			}

			return props;
		}

		componentWillMount() {
			this._subscribers = [];
			var subscribe = (k) => {
				var subscriber = () => {
					this.setState(this._getStateForProps(k, {}));
				};

				this._subscribers.push(subscriber);
				this.props.storage.subscribe(k, subscriber);
			}
			for (var k in options.props) {
				if (options.props.hasOwnProperty(k)) { subscribe(k); }
			}

			this.state = getState();
		}

		componentWillUnmount() {
			for (var i = 0; i < this._subscribers.length; i++) {
				this.props.storage.unsubscribe(this._subscribers[i]);
			}
		}
	}
}

