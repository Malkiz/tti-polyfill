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
 * @param {number} quietWindow
 * @return {number|null}
 */
export const computeFirstConsistentlyInteractive =
    (searchStart, minValue, lastKnownNetwork2Busy, currentTime, longTasks,
      quietWindow) => {
  // Have not reached network 2-quiet yet.
  if ((currentTime - lastKnownNetwork2Busy) < 5000) return null;

  const maybeFCI =
    lastNonLonelyTaskEnd(searchStart, currentTime, quietWindow, longTasks);

  // Main thread has not been quiet for long enough.
  if (currentTime - maybeFCI < quietWindow) return null;

  return Math.max(maybeFCI, minValue);
};


/**
 * Computes the end of the last non-lonely task
 * @param {number} searchStart
 * @param {number} currentTime
 * @param {number} quietWindow
 * @param {!Array<{start: (number), end: (number)}>} longTasks
 * @return {number}
 */
function lastNonLonelyTaskEnd(searchStart, currentTime, quietWindow,
    longTasks) {
  const minLonelyTaskTime = searchStart + 5000;
  const quietWindowStart = currentTime - quietWindow;

  // no lonely tasks allowed yet
  if (quietWindowStart < minLonelyTaskTime) {
    return longTasks.length === 0 ?
      searchStart : longTasks[longTasks.length - 1].end;
  }

  const maybeLonelyTasks = longTasks.filter((t) => t.start > minLonelyTaskTime);
  const regularTasks = longTasks.filter((t) => t.start <= minLonelyTaskTime);
  const minEnd = regularTasks.length === 0 ?
      searchStart : regularTasks[regularTasks.length - 1].end;

  // no tasks in the quiet window
  if (maybeLonelyTasks.length === 0) {
    return minEnd;
  }

  // search for the last non-lonely task
  const lastTask = maybeLonelyTasks[maybeLonelyTasks.length - 1];
  let currBlock = {start: lastTask.start, end: lastTask.end};
  if (currBlock.end - currBlock.start > 250) {
    return currBlock.end;
  }

  for (let i = maybeLonelyTasks.length - 2; i >= 0; i--) {
    const currTask = maybeLonelyTasks[i];
    if (currTask.end < currBlock.start - 1000) {
      currBlock = {start: currTask.start, end: currTask.end};
    } else {
      currBlock.start = currTask.start;
    }
    if (currBlock.end - currBlock.start > 250) {
      return currBlock.end;
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
