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


/* eslint-disable */


// UMD globals
var define;
define.amd;
var module;
module.exports;


// TTI Polyfill global export
window.ttiPolyfill;
window.ttiPolyfill.getFirstConsistentlyInteractive = function() {};

/**
 * @typedef {{
 *   e: (Array<PerformanceEntry>|undefined),
 *   o: (PerformanceObserver|undefined)
 * }}
 */
var TTIConfig;

/**
 * @typedef {{
 *   useMutationObserver: (boolean|undefined),
 *   minValue: (numver|undefined),
 *   __tti: (TTIConfig|undefined)
 * }}
 */
var FirstConsistentlyInteractiveDetectorInit;


/**
 * @constructor
 */
function PerformanceObserverEntry() {}


/**
 * @param {!PerformanceObserverInit} options
 */
PerformanceObserver.prototype.observe = function(options) {};


PerformanceObserver.prototype.disconnect = function() {};


/**
 * @define {boolean}
 */
const DEBUG = false;

/**
 * @typedef {{
 *   beforeCb: (!Function)
 *   afterCb: (!Function)
 * }}
 */
var ProxyConfig;
