(function(){var DEBUG=true;
let uniqueId = 0;
let originals = {};
let proxies = {};
function resetOriginals() {
  if (originals.send && XMLHttpRequest.prototype.send === proxies.send) {
    XMLHttpRequest.prototype.send = originals.send;
  }
  if (originals.fetch && fetch === proxies.fetch) {
    fetch = originals.fetch;
  }
}
function patchXMLHTTPRequest(config) {
  originals.send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = proxies.send = function(...args) {
    let requestId = uniqueId++;
    config.beforeCb(requestId);
    this.addEventListener("readystatechange", () => {
      if (this.readyState === 4) {
        config.afterCb(requestId);
      }
    });
    return originals.send.apply(this, args);
  };
}
function patchFetch(config) {
  originals.fetch = fetch;
  fetch = proxies.fetch = (...args) => {
    return new Promise((resolve, reject) => {
      let requestId = uniqueId++;
      config.beforeCb(requestId);
      originals.fetch(...args).then(value => {
        config.afterCb(requestId);
        resolve(value);
      }, err => {
        config.afterCb(requestId, err);
        reject(err);
      });
    });
  };
}
let requestCreatingNodeNames = ["img", "script", "iframe", "link", "audio", "video", "source"];
function subtreeContainsNodeName(nodes, nodeNames) {
  for (let node of nodes) {
    if (nodeNames.includes(node.nodeName.toLowerCase()) || node.children && subtreeContainsNodeName(node.children, nodeNames)) {
      return true;
    }
  }
  return false;
}
function observeResourceFetchingMutations(callback) {
  let mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type == "childList" && subtreeContainsNodeName(mutation.addedNodes, requestCreatingNodeNames)) {
        callback(mutation);
      } else {
        if (mutation.type == "attributes" && requestCreatingNodeNames.includes(mutation.target.tagName.toLowerCase())) {
          callback(mutation);
        }
      }
    }
  });
  mutationObserver.observe(document, {attributes:true, childList:true, subtree:true, attributeFilter:["href", "src"]});
  return mutationObserver;
}
let log = (...args) => {
  if (DEBUG) {
    console.log(...args);
  }
};
let computeFirstConsistentlyInteractive = (searchStart, minValue, lastKnownNetwork2Busy, currentTime, longTasks) => {
  if (currentTime - lastKnownNetwork2Busy < 5000) {
    return null;
  }
  const maybeFCI = lastNonLonelyTaskEnd(searchStart, longTasks);
  if (currentTime - maybeFCI < calcQuietWindow(maybeFCI)) {
    return null;
  }
  return Math.max(maybeFCI, minValue);
};
function calcQuietWindow(t) {
  return (4 * Math.pow(Math.E, -0.045 * (t / 1000)) + 1) * 1000;
}
function lastNonLonelyTaskEnd(searchStart, longTasks) {
  let minLonelyTaskTime = searchStart + 5000;
  let maybeLonelyTasks = longTasks.filter(t => t.start > minLonelyTaskTime);
  let regularTasks = longTasks.filter(t => t.start <= minLonelyTaskTime);
  let minEnd = regularTasks.length === 0 ? searchStart : regularTasks[regularTasks.length - 1].end;
  if (maybeLonelyTasks.length === 0) {
    return minEnd;
  }
  let updateBlock = () => {
    if (currBlock.end - currBlock.start > 250) {
      minEnd = Math.max(minEnd, currBlock.end);
      currentQuietWindow = calcQuietWindow(minEnd - searchStart);
    }
  };
  let currentQuietWindow;
  let currBlock = {start:minEnd - 1000, end:minEnd};
  updateBlock();
  for (let i = 0; i < maybeLonelyTasks.length; i++) {
    let currTask = maybeLonelyTasks[i];
    if (currTask.start < currBlock.end + 1000) {
      currBlock.end = currTask.end;
      updateBlock();
    } else {
      if (currTask.start > minEnd + currentQuietWindow) {
        break;
      } else {
        currBlock = {start:currTask.start, end:currTask.end};
        updateBlock();
      }
    }
  }
  return minEnd;
}
let computeLastKnownNetwork2Busy = (incompleteRequestStarts, observedResourceRequests) => {
  if (incompleteRequestStarts.length > 2) {
    return performance.now();
  }
  const endpoints = [];
  for (const req of observedResourceRequests) {
    endpoints.push({timestamp:req.start, type:"requestStart"});
    endpoints.push({timestamp:req.end, type:"requestEnd"});
  }
  for (const ts of incompleteRequestStarts) {
    endpoints.push({timestamp:ts, type:"requestStart"});
  }
  endpoints.sort((a, b) => a.timestamp - b.timestamp);
  let currentActive = incompleteRequestStarts.length;
  for (let i = endpoints.length - 1; i >= 0; i--) {
    const endpoint = endpoints[i];
    switch(endpoint.type) {
      case "requestStart":
        currentActive--;
        break;
      case "requestEnd":
        currentActive++;
        if (currentActive > 2) {
          return endpoint.timestamp;
        }
        break;
      default:
        throw Error("Internal Error: This should never happen");
    }
  }
  return 0;
};
let noop = () => {
};
class FirstConsistentlyInteractiveDetector {
  constructor(config = {}) {
    this.setTimeout = config.setTimeout || setTimeout;
    this.clearTimeout = config.clearTimeout || clearTimeout;
    this._useMutationObserver = !!config.useMutationObserver;
    this._minValue = config.minValue || null;
    let snippetEntries = config.__tti && config.__tti.e;
    let snippetObserver = config.__tti && config.__tti.o;
    this._longTasks = [];
    this._networkRequests = [];
    if (snippetEntries) {
      log(`Consuming the long task & network entries already recorded.`);
      snippetEntries.forEach(performanceEntry => {
        if (performanceEntry.entryType === "longtask") {
          this._addLongTaskEntry(performanceEntry);
        } else {
          if (performanceEntry.entryType === "resource") {
            this._addNetworkEntry(performanceEntry);
          }
        }
      });
    }
    if (snippetObserver) {
      snippetObserver.disconnect();
    }
    this._incompleteJSInitiatedRequestStartTimes = new Map;
    this._timerId = null;
    this._timerActivationTime = -Infinity;
    this._scheduleTimerTasks = false;
    this._firstConsistentlyInteractiveResolver = null;
    this._performanceObserver = null;
    this._mutationObserver = null;
    this._registerListeners();
  }
  getFirstConsistentlyInteractive() {
    return new Promise((resolve, reject) => {
      this._firstConsistentlyInteractiveResolver = resolve;
      if (document.readyState == "complete") {
        this.startSchedulingTimerTasks();
      } else {
        window.addEventListener("load", () => {
          this.startSchedulingTimerTasks();
        });
      }
    });
  }
  startSchedulingTimerTasks() {
    log(`Enabling FirstConsistentlyInteractiveDetector`);
    this._scheduleTimerTasks = true;
    let lastLongTaskEnd = this._longTasks.length > 0 ? this._longTasks[this._longTasks.length - 1].end : 0;
    let lastKnownNetwork2Busy = computeLastKnownNetwork2Busy(this._incompleteRequestStarts, this._networkRequests);
    this.rescheduleTimer(Math.max(lastKnownNetwork2Busy + 5000, lastLongTaskEnd));
  }
  rescheduleTimer(earliestTime) {
    if (!this._scheduleTimerTasks) {
      log(`startSchedulingTimerTasks must be called before ` + `calling rescheduleTimer`);
      return;
    }
    log(`Attempting to reschedule FirstConsistentlyInteractive ` + `check to ${earliestTime}`);
    log(`Previous timer activation time: ${this._timerActivationTime}`);
    if (this._timerActivationTime > earliestTime) {
      log(`Current activation time is greater than attempted ` + `reschedule time. No need to postpone.`);
      return;
    }
    this.clearTimeout(this._timerId);
    this._timerId = this.setTimeout(() => {
      this._checkTTI();
    }, earliestTime - performance.now());
    this._timerActivationTime = earliestTime;
    log(`Rescheduled firstConsistentlyInteractive check at ${earliestTime}`);
  }
  disable() {
    log(`Disabling FirstConsistentlyInteractiveDetector`);
    this.clearTimeout(this._timerId);
    this._scheduleTimerTasks = false;
    this._unregisterListeners();
    this._clearReferences();
  }
  _registerPerformanceObserver() {
    this._performanceObserver = new PerformanceObserver(entryList => {
      let entries = entryList.getEntries();
      for (let entry of entries) {
        if (entry.entryType === "resource") {
          this._networkRequestFinishedCallback(entry);
        }
        if (entry.entryType === "longtask") {
          this._longTaskFinishedCallback(entry);
        }
      }
    });
    this._performanceObserver.observe({entryTypes:["longtask", "resource"]});
  }
  _registerListeners() {
    this._proxyConfig = {beforeCb:this._beforeJSInitiatedRequestCallback.bind(this), afterCb:this._afterJSInitiatedRequestCallback.bind(this)};
    patchXMLHTTPRequest(this._proxyConfig);
    patchFetch(this._proxyConfig);
    this._registerPerformanceObserver();
    if (this._useMutationObserver) {
      this._mutationObserver = observeResourceFetchingMutations(this._mutationObserverCallback.bind(this));
    }
  }
  _unregisterListeners() {
    if (this._performanceObserver) {
      this._performanceObserver.disconnect();
    }
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
    }
    resetOriginals();
    if (this._proxyConfig) {
      this._proxyConfig.beforeCb = noop;
      this._proxyConfig.afterCb = noop;
    }
  }
  _clearReferences() {
    this._longTasks = [];
    this._networkRequests = [];
    this._incompleteJSInitiatedRequestStartTimes = new Map;
  }
  _beforeJSInitiatedRequestCallback(requestId) {
    log(`Starting JS initiated request. Request ID: ${requestId}`);
    this._incompleteJSInitiatedRequestStartTimes.set(requestId, performance.now());
    log(`Active XHRs: ${this._incompleteJSInitiatedRequestStartTimes.size}`);
  }
  _afterJSInitiatedRequestCallback(requestId) {
    log(`Completed JS initiated request with request ID: ${requestId}`);
    this._incompleteJSInitiatedRequestStartTimes.delete(requestId);
    log(`Active XHRs: ${this._incompleteJSInitiatedRequestStartTimes.size}`);
  }
  _networkRequestFinishedCallback(performanceEntry) {
    log(`Network request finished`, performanceEntry);
    this._addNetworkEntry(performanceEntry);
    this.rescheduleTimer(computeLastKnownNetwork2Busy(this._incompleteRequestStarts, this._networkRequests) + this._quietWindow);
  }
  _addNetworkEntry(performanceEntry) {
    let item = {start:performanceEntry.fetchStart, end:performanceEntry.responseEnd};
    this._networkRequests.push(item);
    return item;
  }
  _longTaskFinishedCallback(performanceEntry) {
    log(`Long task finished`, performanceEntry);
    let item = this._addLongTaskEntry(performanceEntry);
    this.rescheduleTimer(item.end + this._quietWindow);
  }
  _addLongTaskEntry(performanceEntry) {
    let taskEndTime = performanceEntry.startTime + performanceEntry.duration;
    let item = {start:performanceEntry.startTime, end:taskEndTime};
    this._longTasks.push(item);
    return item;
  }
  _mutationObserverCallback(mutationRecord) {
    log(`Potentially network resource fetching mutation detected`, mutationRecord);
    log(`Pushing back FirstConsistentlyInteractive check by 5 seconds.`);
    this.rescheduleTimer(performance.now() + this._quietWindow);
  }
  _getMinValue() {
    if (this._minValue) {
      return this._minValue;
    }
    if (performance.timing.domContentLoadedEventEnd) {
      let {domContentLoadedEventEnd, navigationStart} = performance.timing;
      return domContentLoadedEventEnd - navigationStart;
    }
    return null;
  }
  get _incompleteRequestStarts() {
    return [...this._incompleteJSInitiatedRequestStartTimes.values()];
  }
  get _quietWindow() {
    let min = this._getMinValue();
    let t = min !== null ? performance.now() - min : 0;
    return calcQuietWindow(t);
  }
  _checkTTI() {
    log(`Checking if First Consistently Interactive was reached...`);
    let navigationStart = performance.timing.navigationStart;
    let lastBusy = computeLastKnownNetwork2Busy(this._incompleteRequestStarts, this._networkRequests);
    let firstPaint = window.chrome && window.chrome.loadTimes ? window.chrome.loadTimes().firstPaintTime * 1000 - navigationStart : 0;
    let searchStart = firstPaint || performance.timing.domContentLoadedEventEnd - navigationStart;
    let minValue = this._getMinValue();
    let currentTime = performance.now();
    if (minValue === null) {
      log(`No usable minimum value yet. Postponing check.`);
      this.rescheduleTimer(Math.max(lastBusy + this._quietWindow, currentTime + 1000));
    }
    log(`Parameter values:`);
    log(`NavigationStart`, navigationStart);
    log(`lastKnownNetwork2Busy`, lastBusy);
    log(`Search Start`, searchStart);
    log(`Min Value`, minValue);
    log(`Last busy`, lastBusy);
    log(`Current time`, currentTime);
    log(`Long tasks`, this._longTasks);
    log(`Incomplete JS Request Start Times`, this._incompleteRequestStarts);
    log(`Network requests`, this._networkRequests);
    let maybeFCI = computeFirstConsistentlyInteractive(searchStart, minValue, lastBusy, currentTime, this._longTasks);
    if (maybeFCI) {
      this._firstConsistentlyInteractiveResolver(maybeFCI);
      this.disable();
      return;
    }
    log(`Could not detect First Consistently Interactive. ` + `Retrying in 1 second.`);
    this.rescheduleTimer(performance.now() + 1000);
  }
}
let getFirstConsistentlyInteractive = (opts = {}) => {
  if ("PerformanceLongTaskTiming" in window) {
    const detector = new FirstConsistentlyInteractiveDetector(opts);
    return detector.getFirstConsistentlyInteractive();
  } else {
    return Promise.resolve(null);
  }
};
let moduleExport = {getFirstConsistentlyInteractive};
if (typeof module != "undefined" && module.exports) {
  module.exports = moduleExport;
} else {
  if (typeof define === "function" && define.amd) {
    define("ttiPolyfill", [], () => moduleExport);
  } else {
    window.ttiPolyfill = moduleExport;
  }
}
;})();
//# sourceMappingURL=tti-polyfill-debug.js.map
