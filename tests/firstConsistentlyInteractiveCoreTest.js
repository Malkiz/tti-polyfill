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


/* eslint-disable no-console, require-jsdoc */


import {computeLastKnownNetwork2Busy, computeFirstConsistentlyInteractive}
    from '../src/FirstConsistentlyInteractiveCore.js';


function testComputeLastKnownNetwork2Busy() {
  const startTime = performance.now();

  console.log('TestComputeLastKnownNetwork2Busy');

  // Never network busy.
  console.assert(computeLastKnownNetwork2Busy([], []) === 0);

  // Too many incomplete requests.
  console.assert(computeLastKnownNetwork2Busy([10, 20, 30], []) >= startTime);

  // Almost too many incomplete requests, but not quite.
  console.assert(computeLastKnownNetwork2Busy([10, 20], []) === 0);

  // Network quiet at the end of an observed resource request.
  console.assert(computeLastKnownNetwork2Busy(
      [10, 20], [{start: 0, end: 50}]) === 50);

  // No incomplete requests.
  console.assert(computeLastKnownNetwork2Busy([], [{start: 0, end: 100},
      {start: 0, end: 50}, {start: 25, end: 75}]) === 50);

  // Complex layout of observed resource requests.
  console.assert(computeLastKnownNetwork2Busy([3], [{start: 0, end: 5},
      {start: 0, end: 10}, {start: 11, end: 20}, {start: 21, end: 30}]) === 5);

  // Network quiet is between two incomplete request starts.
  console.assert(computeLastKnownNetwork2Busy(
      [10, 90], [{start: 20, end: 50}, {start: 30, end: 60}]) === 50);

  console.log('Ran all tests.');
}

function testComputeFirstConsistentlyInteractive() {
  console.log('testComputeFirstConsistentlyInteractive');

  function assert({searchStart, minValue, lastKnownNetwork2Busy, currentTime,
      longTasks}, expected) {
    console.assert(computeFirstConsistentlyInteractive(searchStart, minValue,
      lastKnownNetwork2Busy, currentTime, longTasks) === expected);
  }

  // If we have not had a long enough network 2-quiet period, FCI is null.
  assert({
      searchStart: 500,
      minValue: 3000,
      lastKnownNetwork2Busy: 1000,
      currentTime: 5999,
      longTasks: [],
    }, null);

  // If we have not had a long enough main thread quiet period, FCI is null.
  assert({
      searchStart: 500,
      minValue: 500,
      lastKnownNetwork2Busy: 1000,
      currentTime: 6001,
      longTasks: [{start: 4000, end: 4060}],
    }, null);

  // If we have not had a long enough window since searchStart, FCI is null.
  assert({
      searchStart: 3000,
      minValue: 500,
      lastKnownNetwork2Busy: 1000,
      currentTime: 6001,
      longTasks: [],
    }, null);

  // If there is no long task, FCI is searchStart.
  assert({
      searchStart: 4000,
      minValue: 3000,
      lastKnownNetwork2Busy: 1000,
      currentTime: 10000,
      longTasks: [],
    }, 4000);

  // searchStart can be before network quiet
  assert({
      searchStart: 750,
      minValue: 500,
      lastKnownNetwork2Busy: 1000,
      currentTime: 6001,
      longTasks: [],
    }, 750);

  // minValue can be before network quiet.
  assert({
      searchStart: 300,
      minValue: 500,
      lastKnownNetwork2Busy: 1000,
      currentTime: 6001,
      longTasks: [],
    }, 500);

  // FCI does not fire before minValue.
  assert({
      searchStart: 500,
      minValue: 4000,
      lastKnownNetwork2Busy: 1000,
      currentTime: 10000,
      longTasks: [{start: 2000, end: 2200}, {start: 2500, end: 2570}],
    }, 4000);

  // FCI is the end of last long task.
  assert({
      searchStart: 1500,
      minValue: 2000,
      lastKnownNetwork2Busy: 1000,
      currentTime: 10000,
      longTasks: [{start: 2000, end: 2200}, {start: 2500, end: 2570}],
    }, 2570);

  // FCI looks back from network quiet and ignores lonely task.
  assert({
      searchStart: 500,
      minValue: 2000,
      lastKnownNetwork2Busy: 1000,
      currentTime: 17000,
      longTasks: [
        {start: 2000, end: 2200},
        {start: 6600, end: 6700},
        {start: 10000, end: 10070},
      ],
    }, 2200);

  // FCI looks back from network quiet and ignores lonely task.
  assert({
      searchStart: 500,
      minValue: 2000,
      lastKnownNetwork2Busy: 1000,
      currentTime: 17000,
      longTasks: [
        {start: 2000, end: 2200},
        {start: 5480, end: 5520},
        {start: 10000, end: 10070},
      ],
    }, 5520);

  // FCI looks back from network quiet, and detects too long block
  assert({
      searchStart: 500,
      minValue: 2000,
      lastKnownNetwork2Busy: 1000,
      currentTime: 17000,
      longTasks: [
        {start: 2000, end: 2200},
        {start: 5480, end: 5520},
        {start: 7600, end: 7700},
        {start: 7750, end: 7900},
        {start: 10000, end: 10070},
      ],
    }, 7900);

  // FCI looks back from network quiet, and detects too long block
  assert({
      searchStart: 500,
      minValue: 2000,
      lastKnownNetwork2Busy: 1000,
      currentTime: 17000,
      longTasks: [
        {start: 2000, end: 2200},
        {start: 5480, end: 5520},
        {start: 7600, end: 7700},
        {start: 7750, end: 7900},
        {start: 10000, end: 10270},
      ],
    }, 10270);

  // FCI looks back from network quiet, and detects too long block
  assert({
      searchStart: 500,
      minValue: 2000,
      lastKnownNetwork2Busy: 1000,
      currentTime: 17000,
      longTasks: [
        {start: 2000, end: 2200},
        {start: 5480, end: 5520},
        {start: 7600, end: 7700},
        {start: 7750, end: 7900},
        {start: 14000, end: 14270},
      ],
    }, 7900);

  console.log('Ran all tests.');
}

testComputeLastKnownNetwork2Busy();
testComputeFirstConsistentlyInteractive();
