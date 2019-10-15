// Copyright 2017 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


let uniqueId = 0;
const originals = {};
const proxies = {};

/**
 * Checks that the XHR / Fetch objects were not modified further in between,
 * and if so resets them to the original functions.
 */
export function resetOriginals() {
  if (originals.send && XMLHttpRequest.prototype.send === proxies.send) {
    XMLHttpRequest.prototype.send = originals.send;
  }
  if (originals.fetch && fetch === proxies.fetch) {
    // eslint-disable-next-line no-global-assign
    fetch = originals.fetch;
  }
}


/**
 * Overrides the native XHR send method in order to keep track of in-flight
 * network requests.
 * @param {!ProxyConfig} config
 */
export function patchXMLHTTPRequest(config) {
  originals.send = XMLHttpRequest.prototype.send;

  // eslint-disable-next-line max-len
  XMLHttpRequest.prototype.send = proxies.send = function(...args) { // No arrow function.
    const requestId = uniqueId++;
    config.beforeCb(requestId);
    this.addEventListener('readystatechange', () => {
      // readyState 4 corresponds to 'DONE'
      if (this.readyState === 4) config.afterCb(requestId);
    });
    return originals.send.apply(this, args);
  };
}


/**
 * Overrides the native fetch() in order to keep track of in-flight network
 * requests.
 * @param {!ProxyConfig} config
 */
export function patchFetch(config) {
  originals.fetch = fetch;

  // TODO(philipwalton): assign this to a property of the global variable
  // explicitely rather than implicitely.
  // eslint-disable-next-line no-global-assign
  fetch = proxies.fetch = (...args) => {
    return new Promise((resolve, reject) => {
      const requestId = uniqueId++;
      config.beforeCb(requestId);
      originals.fetch(...args).then(
          (value) => {
            config.afterCb(requestId);
            resolve(value);
          },
          (err) => {
            config.afterCb(err);
            reject(err);
          });
    });
  };
}


/** @type {!Array<string>} */
const requestCreatingNodeNames =
    ['img', 'script', 'iframe', 'link', 'audio', 'video', 'source'];


/**
 * Determines if a node or its descendants match one of the passed node names.
 * @param {!Array<!Node>|!NodeList<!Node>} nodes
 * @param {!Array<string>} nodeNames
 * @return {boolean}
 */
function subtreeContainsNodeName(nodes, nodeNames) {
  for (const node of nodes) {
    if (nodeNames.includes(node.nodeName.toLowerCase()) ||
        (node.children && subtreeContainsNodeName(node.children, nodeNames))) {
      return true;
    }
  }
  return false;
}


/**
 * Start observing DOM mutations for added nodes that may initiate network
 * requests.
 * @param {!Function} callback
 * @return {!MutationObserver}
 */
export function observeResourceFetchingMutations(callback) {
  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type == 'childList' &&
          subtreeContainsNodeName(
              mutation.addedNodes, requestCreatingNodeNames)) {
        callback(mutation);
      } else if (mutation.type == 'attributes' &&
          requestCreatingNodeNames.includes(
              mutation.target.tagName.toLowerCase())) {
        callback(mutation);
      }
    }
  });

  mutationObserver.observe(document, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['href', 'src'],
  });

  return mutationObserver;
}
