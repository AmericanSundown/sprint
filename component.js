import Namespace from './Namespace';
import { merge } from './utils';
import React from 'react';
import m from 'mori';

export class SprintComponent extends React.Component {
	constructor() {
		super();
	}

	componentWillMount() {
		this.props._setState(this.state || {});
		for (var k in this.props._actions) {
			if (this.props._actions.hasOwnProperty(k)) {
				this[k] = this.props._actions[k];
			}
		}
	}

	setState(state) {
		super.setState(state);
		this.props._setState(state);
	}
}

export function wrap(Component, options) {
	return class extends React.Component {
		constructor() {
			super();
			this.state = {};
		}

		componentWillReceiveProps(nextProps) {
			for (var k in nextProps) {
				if (nextProps.hasOwnProperty(k)) {
					if (!m.equals(this.props[k], nextProps[k])) {
						this._propsNamespace.set([ k ], nextProps[k]);
					}
				}
			}
		}

		_wrappedSetState(newState) {
			for (var k in newState) {
				if (newState.hasOwnProperty(k)) {
					if (!m.equals(this._wrappedState[k], newState[k])) {
						this._stateNamespace.set([ k ], newState[k]);
						this._wrappedState[k] = newState[k];
					}
				}
			}
		}

		_updateProp(k) {
			var newState = {}, prop = options.props[k];
			// Trigger load :P
			var val = prop.get(this._storage);

			var err = newState[k + '_error'] = prop.isError(this._storage);
			var loading = newState[k + '_loading'] = prop.isLoading(this._storage);

			newState[k] = !err && !loading ? val : null;

			this.setState(newState);
		}

		shouldComponentUpdate(nextProps, nextState) {
			// Only check state – props updates state in componentWillReceiveProps.
			for (var k in nextState) {
				if (nextState.hasOwnProperty(k)) {
					if (!m.equals(this.state[k], nextState[k])) { return true; }
				}
			}
			return false;
		}

		componentWillMount(wrappedState) {
			this._wrappedState = wrappedState;

			this._storage = this.props.storage.clone();
			this._propsNamespace = new Namespace();
			this._stateNamespace = new Namespace();
			this._storage.register('props', this._propsNamespace);
			this._storage.register('state', this._stateNamespace);

			this._propsNamespace.set([], this.props);
			this._stateNamespace.set([], wrappedState);

			this._subscribers = m.hashMap();

			for (var k in options.props) {
				if (options.props.hasOwnProperty(k)) {
					this._updateProp(k);
				}
			}

			var _actions = {};
			var createAction = (k) => {
				_actions[k] = () => { this._action(k); };
			};
			for (var k in options.actions) {
				if (options.actions.hasOwnProperty(k)) {
					createAction(k);
				}
			}

			_actions.set = (k, v) => options.props[k].set(this._storage, v);

			this._otherParameters = {
				_setState: this._wrappedSetState,
				_actions: _actions
			};

			var subscribe = (k) => {
				if (m.get(k, this._subscribers)) { return; }

				var subscriber = () => { this._updateProp(k); };

				this._subscribers = m.assoc(this._subscribers, k, subscriber);
				options.props[k].subscribe(this._storage, subscriber);
			};

			for (var k in options.props) {
				if (options.props.hasOwnProperty(k)) { subscribe(k); }
			}
		}

		componentWillUnmount() {
			m.each(function(v) {
				var [ k, subscriber ] = v;
				k.unsubscribe(this._storage, subscriber);
			}, this._subscribers);
			this._subscribers = m.hashMap();
		}

		render() {
			return React.createElement(
				Component,
				merge(this.state, this._otherParameters)
			);
		}

		_action(k) {
			return options.actions[k].execute(this._storage);
		}
	}
}

