# Sprint

Sprint is Branch's front-end data library. Think of it as a 'model' layer that compliments React's view layer (though it doesn't necessarily need to be used with React, it's definitely most useful that way). It fills a similar void to Facebook's [Flux]() or [Relay]().

This document assumes a fairly deep knowledge of React.

## Prior Art/Inspiration

### Ad-hoc state management

In the beginning, we used to manage all the state of our front-end applications using React's component state. In some cases, this can be very elegant: if state is very local to a component - for example, in a hypothetical select box component, the state of whether or not it's currently expanded or collapsed is solidly local state. However, this quickly becomes extremely unwieldy – it has two principal issues:
1. There is no good way of dealing with state that is shared between multiple components – for example, we have several analytics components, and all have a time period for which they are accurate. We have one time selector which governs all of those components. In order to share state, we'd need a common parent component which stores that state, and that component would need to pass a callback in to the date-picker component, which the date-picker component would then call whenever a user interacts with it; this is problematic because now you have to worry about what state lives in the parent vs. what state lives in the component, what calling convention the parent expects, etc. Additionally, you end up with a parent component which contains all kinds of random state all lumped together. Gross.
2. There's no good way of dealing with server coordination. Fetching data from the server is very one-off. There's no way to coordinate what needs to be pulled from the server between multiple components.

### [Flux]()




### [Relay]()

### [Meteor]()

## Sprint

### Global storage

### Keys

### Namespaces

#### Server Namespaces

### Actions

### Component wrapper

