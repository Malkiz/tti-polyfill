Time to Interactive Polyfill
============================

A polyfill for the Time to Interactive metric. See the [metric definition](https://goo.gl/OSmrPk) for in-depth implementation details.
Specifically, this is an implementation of `Definition 4: Combining proportional leniency and lonely tasks` from the linked doc above.

## Installation

You can install the TTI polyfill from npm by running:

```sh
npm install tti-polyfill
```

## Usage

Adding the TTI polyfill is a two-step process. First you need to add a snippet of code to the head of your document (before any other scripts run). This snippet creates a `PerformanceObserver` instance and starts observing `longtask` entry types.

```html
<script>
!function(){if('PerformanceLongTaskTiming' in window){var g=window.__tti={e:[]};
g.o=new PerformanceObserver(function(l){g.e=g.e.concat(l.getEntries())});
g.o.observe({entryTypes:['longtask']})}}();
</script>
```

*__Note:__ this snippet is a temporary workaround, until browsers implement level 2 of the Performance Observer spec and include the [`buffered`](https://w3c.github.io/performance-timeline/#dom-performanceobserverinit-buffered) flag.*

The second step is to import the module into your application code and invoke the `getFirstConsistentlyInteractive()` method. The `getFirstConsistentlyInteractive()` method returns a promise that resolves to the TTI metric value (in milliseconds since navigation start). If no TTI value can be found, or if the browser doesn't support all the APIs required to detect TTI, the promise resolves to `null`.

```js
import ttiPolyfill from './path/to/tti-polyfill.js';

ttiPolyfill.getFirstConsistentlyInteractive(opts).then((tti) => {
  // Use `tti` value in some way.
});
```

Note that this method can be invoked at any time, it does not need to be called prior to interactivity being reached. This allows you to load the polyfill via `<script async>`, so it doesn't block any other critical resources.

### Configuration options

The following table outlines the configuration options you can pass to the `getFirstConsistentlyInteractive()` method:

<table>
  <tr valign="top">
    <th align="left">Name</th>
    <th align="left">Type</th>
    <th align="left">Description</th>
  </tr>
  <tr valign="top">
    <td><code>minValue</code></td>
    <td><code>number|null</code></td>
    <td>
      The lower bound to start forward-searching for the quite window. If no value is set, the default is after the <code>DOMContentLoaded</code> event.
    </td>
  </tr>
  <tr valign="top">
    <td><code>useMutationObserver</code></td>
    <td><code>boolean</code></td>
    <td>
      When true (the default), a mutation observer is used to detect when added DOM elements will create additional network requests. This can be disabled to improve performance in cases where you know no additional request-creating DOM elements will be added.
    </td>
  </tr>
  <tr valign="top">
    <td><code>__tti</code></td>
    <td><code>Object|null</code></td>
    <td>
      The object from the snippet, cotaining the original observer and entries. The object looks like this: <code>{ o /* observer */, e /* past entries */ }</code>
    </td>
  </tr>
  <tr valign="top">
    <td><code>setTimeout</code></td>
    <td><code>Function|null</code></td>
    <td>
      Optional override for the <code>setTimeout</code> function.
    </td>
  </tr>
  <tr valign="top">
    <td><code>clearTimeout</code></td>
    <td><code>Function|null</code></td>
    <td>
      Optional override for the <code>clearTimeout</code> function.
    </td>
  </tr>
</table>

### The debug version

A [debug](https://github.com/GoogleChrome/tti-polyfill/blob/master/tti-polyfill-debug.js) version of the polyfill ships with this repo that includes helpful `console.log()` statements that can be used to better understand how the polyfill is working under the hood.

*__Note:__ usage for the debug version is exactly the same as the regular version.*

## Browser support

The TTI polyfill will work in any browser that supports [`PerformanceObserver`](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver) and the [`PerformanceLongTaskTiming`](https://w3c.github.io/longtasks/) entry.

At the moment this is Chrome 58+.
