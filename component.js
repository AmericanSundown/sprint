import Namespace from './Namespace';
import { merge } from './utils';
import React from 'react';
import m from 'mori';

/**
 * Sprint provides a React component wrapper. This allows taking a stateless
 * (or a mostly-stateless) React component, i.e. one that relies only on props
 * to render, and "wrapping" it with stateful props, e.g. props that come from
 * a database, depend on other components, etc.
 *
 * Note that in the Sprint conception of the world, components that use React's
 * this.state are totally fine; this.state should only be used for *local*
 * state, though. Components that rely on global state should store that state
 * in Sprint and have it passed in as a prop through a wrapped Sprint
 * component.
 */

/**
 * Wrap a relatively state-less component with a stateful component.
 * @param {React.Component} Component the component to wrap
 * @param {{props: {string: Key}, actions: {string: Action}}} options
 *   - props: a map of (name)->Key; the value of the key is passed in as the
 *            name; name_loading and name_error are also passed in as props to
 *            the wrapped component
 *   - actions: a map of (name)->Action; the actions are available as
 *              this.name(); in the wrapped component.
 *
 * Note that within these props, two additional namespaces are available for
 * keys: `props`, which refers to props passed into the wrapped component, and
 * `state`, which refers to state *inside* the component (set as normal with
 * setState).
 *
 * @return a React.Component that takes at least one prop, `storage`. Other
 * props can be passed in and will be accessible in the 'props' namespace.
 */
export function wrap(Component, options) {
	return class extends React.Component {
		constructor() {
			super();

			// State holds values for each fetched key.
			this.state = {};

			this._stateNamespace = new Namespace();
		}

		// Unfortunately this is the first place that props are accessible, so
		// use this to initialize props and state storage.
		componentWillMount() {
			// Clone the passed-in storage, and add 'props' and 'state'
			// namespaces.
			this._storage = this.props.storage.clone();

			this._propsNamespace = new Namespace();
			this._propsNamespace.set([], this.props);

			this._storage.register('props', this._propsNamespace);
			this._storage.register('state', this._stateNamespace);

			// We need to subscribe to each key - store the subscribers.
			this._subscribers = m.hashMap();

			// Subscribe to each key in options.props.
			for (var k in options.props) {
				if (options.props.hasOwnProperty(k)) {
					if (m.get(k, this._subscribers)) { continue; }

					// When there is a change, call updateProp.
					var subscriber = ((k) => { return () => this._updateProp(k); })(k);

					this._subscribers = m.assoc(this._subscribers, k, subscriber);
					options.props[k].subscribe(this._storage, subscriber);

					// Do an initial value fetch.
					this._updateProp(k);
				}
			}

			// Create functions for each action, store it in _actions.
			this._actions = {};
			for (var k in options.actions) {
				if (options.actions.hasOwnProperty(k)) {
					_actions[k] = ((action) => { return () => action.execute(this._storage); })(options.actions[k]);
				}
			}

			// Create a pseudo-action called 'set', used to set keys in props
			this._actions.set = (k, v) => {
				if (!k) { throw new Error("Trying to set undefined key"); }
				if (!options.props[k]) { throw new Error("Unknown key " + k); }
				options.props[k].set(this._storage, v);
			};

			// Event system stuff.
			// TODO: refactor
			for (var k in this.props.events) {
				if (this.props.events.hasOwnProperty(k)) {
					let eventSystem = this.props.events[k],
						action = options.actions[k];
					if (action) { eventSystem.register(action, this._storage); }
				}
			}
		}

		componentWillUnmount() {
			// Unsubscribe.
			m.each(this._subscribers, (v) => {
				var k = m.first(v), subscriber = m.second(v);
				options.props[k].unsubscribe(this._storage, subscriber);
			});
			this._subscribers = m.hashMap();
		}


		componentWillReceiveProps(nextProps) {
			for (var k in nextProps) {
				if (nextProps.hasOwnProperty(k)) {
					if (k == "storage") {
						throw new Error("Cannot change the storage of a mounted component");
					}

					// Set props in the props namespace; subscribers will
					// propagate this change properly.
					if (!m.equals(this.props[k], nextProps[k])) {
						this._propsNamespace.set([ k ], nextProps[k]);
					}
				}
			}
		}

		_wrappedSetState(newState) {
			// This function is called in the child setState, to propagate
			// state changes to the 'state' namespace.
			for (var k in newState) {
				if (newState.hasOwnProperty(k)) {
					this._stateNamespace.set([ k ], newState[k]);
				}
			}
		}

		_updateProp(k) {
			var newState = {}, prop = options.props[k];

			// Trigger load - if we get the loading state before calling `get`,
			// it won't appear to be loading, even while it is loading.
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

		render() {
			return React.createElement(
				Component,
				merge(this.state, {
					// These guys get picked up by SprintComponent and turned
					// into real things...
					_setState: this._wrappedSetState.bind(this),
					_actions: this._actions
				})
			);
		}
	}
}

/**
 * SprintComponent is a base class for any stateless component which can become
 * sprintified. While not strictly necessary, it allows using the stateless
 * component's 'this.state' as a namespace, and allows calling actions directly
 * as `this.actionname();`
 */
export class SprintComponent extends React.Component {
	constructor() {
		super();
	}

	componentWillMount() {
		// Unfortunately, we can't access props until this lifecycle method,
		// which means accessing any of these things in the constructor will
		// fail.
		this.props._setState(this.state || {});
		for (var k in this.props._actions) {
			if (this.props._actions.hasOwnProperty(k)) {
				this[k] = this.props._actions[k];
			}
		}
	}

	setState(state) {
		super.setState(state);
		// Update the parent state.
		this.props._setState(state);
	}
}
