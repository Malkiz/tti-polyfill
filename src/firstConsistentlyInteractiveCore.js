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


/**
 * Computes the first consistently interactive value...
 * @param {number} searchStart
 * @param {number} minValue
 * @param {number} lastKnownNetwork2Busy
 * @param {number} currentTime
 * @param {!Array<{start: (number), end: (number)}>} longTasks
 * @return {number|null}
 */
export const computeFirstConsistentlyInteractive =
    (searchStart, minValue, lastKnownNetwork2Busy, currentTime, longTasks) => {
  // Have not reached network 2-quiet yet.
  if ((currentTime - lastKnownNetwork2Busy) < 5000) return null;

  const maybeFCI = lastNonLonelyTaskEnd(searchStart, longTasks);

  // Main thread has not been quiet for long enough.
  if (currentTime - maybeFCI < calcQuietWindow(maybeFCI)) return null;

  return Math.max(maybeFCI, minValue);
};

/**
 * Computes the required quiet window length, in ms
 * @param {number} t - time in ms
 * @return {number}
 */
export function calcQuietWindow(t) {
  // formula: f(t) = 4 * e^(-0.045 * t) + 1
  return (4 * Math.pow(Math.E, -0.045 * (t / 1000)) + 1) * 1000;
}


/**
 * Computes the end of the last non-lonely task
 * @param {number} searchStart
 * @param {!Array<{start: (number), end: (number)}>} longTasks
 * @return {number}
 */
function lastNonLonelyTaskEnd(searchStart, longTasks) {
  const minLonelyTaskTime = searchStart + 5000;

  const maybeLonelyTasks = longTasks.filter((t) => t.start > minLonelyTaskTime);
  const regularTasks = longTasks.filter((t) => t.start <= minLonelyTaskTime);
  let minEnd = regularTasks.length === 0 ?
    searchStart : regularTasks[regularTasks.length - 1].end;

  // no tasks in the quiet window
  if (maybeLonelyTasks.length === 0) {
    return minEnd;
  }


  const updateBlock = () => {
    if (currBlock.end - currBlock.start > 250) {
      // current block is too big - start looking again
      minEnd = Math.max(minEnd, currBlock.end);
      currentQuietWindow = calcQuietWindow(minEnd - searchStart);
    }
  };
  let currentQuietWindow;
  let currBlock = {start: minEnd - 1000, end: minEnd};
  updateBlock();
  for (let i = 0; i < maybeLonelyTasks.length; i++) {
    const currTask = maybeLonelyTasks[i];

    if (currTask.start < currBlock.end + 1000) {
      // current task joins the current block
      currBlock.end = currTask.end;
      updateBlock();
    } else if (currTask.start > minEnd + currentQuietWindow) {
      // current task is outside the quiet window - we can stop
      break;
    } else {
      // current task starts a new block
      currBlock = {start: currTask.start, end: currTask.end};
      updateBlock();
    }
  }

  return minEnd;
}


/**
 * Computes the time (in milliseconds since requestStart) that the network was
 * last known to have >2 requests in-flight.
 * @param {!Array<number>} incompleteRequestStarts
 * @param {!Array<{start: (number), end: (number)}>} observedResourceRequests
 * @return {number}
 */
export const computeLastKnownNetwork2Busy =
      (incompleteRequestStarts, observedResourceRequests) => {
  if (incompleteRequestStarts.length > 2) return performance.now();

  const endpoints = [];
  for (const req of observedResourceRequests) {
    endpoints.push({
      timestamp: req.start,
      type: 'requestStart',
    });
    endpoints.push({
      timestamp: req.end,
      type: 'requestEnd',
    });
  }

  for (const ts of incompleteRequestStarts) {
    endpoints.push({
      timestamp: ts,
      type: 'requestStart',
    });
  }

  endpoints.sort((a, b) => a.timestamp - b.timestamp);

  let currentActive = incompleteRequestStarts.length;

  for (let i = endpoints.length - 1; i >= 0; i--) {
    const endpoint = endpoints[i];
    switch (endpoint.type) {
      case 'requestStart':
        currentActive--;
        break;
      case 'requestEnd':
        currentActive++;
        if (currentActive > 2) {
          return endpoint.timestamp;
        }
        break;
      default:
        throw Error('Internal Error: This should never happen');
    }
  }

  // If we reach here, we were never network 2-busy.
  return 0;
};
