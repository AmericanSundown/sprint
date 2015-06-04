# Sprint

Sprint is Branch's front-end data library. Think of it as a 'model' layer that compliments React's view layer (though it doesn't necessarily need to be used with React, it's definitely most useful that way). It fills a similar void to Facebook's [Flux](https://facebook.github.io/flux/) or [Relay](https://facebook.github.io/react/blog/2015/02/20/introducing-relay-and-graphql.html).

This document assumes a fairly deep knowledge of React.

## Prior Art/Inspiration

### Ad-hoc state management

In the beginning, we used to manage all the state of our front-end applications using React's component state. In some cases, this can be very elegant: if state is very local to a component - for example, in a hypothetical select box component, the state of whether or not it's currently expanded or collapsed is solidly local state. However, this quickly becomes extremely unwieldy – it has two principal issues:


1. There is no good way of dealing with state that is shared between multiple components – for example, we have several analytics components, and all have a time period for which they are accurate. We have one time selector which governs all of those components. In order to share state, we'd need a common parent component which stores that state, and that component would need to pass a callback in to the date-picker component, which the date-picker component would then call whenever a user interacts with it; this is problematic because now you have to worry about what state lives in the parent vs. what state lives in the component, what calling convention the parent expects, etc. Additionally, you end up with a parent component which contains all kinds of random state all lumped together. Gross.

2. There's no good way of dealing with server coordination. Fetching data from the server is very one-off. There's no way to coordinate what needs to be pulled from the server between multiple components.

### [Flux](https://facebook.github.io/flux/)

Flux is definitely an improvement – it provides a way to store global state fairly cleanly, and propagate changes nicely. It also provides a good model for server-side update.

However, with Flux, it becomes very easy to conflate **original state** from **dervided state** – which can cause issues when in the store logic, you update derived state, for example, but not original state, then when the original state is updated next time, that change isn't stored.

Additionally, there is a lot of boilerplate with Flux, and of course, if you get things wrong there, it's possible to create many different subtle bugs. There is virtually no way of handling errors, and and so we end up again coming up with a lot of one-off solutions.

Finally, there are issues with stores depending on other stores, and deriving data from them – the propagation can be janky and unnecessary. One ends up building very complex solutions for simple problems.

### [Relay](https://facebook.github.io/react/blog/2015/02/20/introducing-relay-and-graphql.html)

At the time of writing, Relay is not available to the public, so obviously we can't use it. Relay has a very nice model for fetching nested data; however, it is very oriented towards graph-data, whereas our data is much more key-value oriented. While they have discussed it somewhat, their approach to any writes is a bit nebulous (reads seem awesome though).

### [Meteor](https://meteor.com/)

We were inspired by Meteor's client-side data storage.

### [mori](http://swannodette.github.io/mori/)



## Sprint

### Global storage

### Keys

### Namespaces

#### Server Namespaces

### Actions

### Component wrapper

