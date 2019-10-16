/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


/* eslint-env node */
/* eslint-disable no-console, require-jsdoc */


const fs = require('fs-extra');
const compiler = require('@ampproject/rollup-plugin-closure-compiler');
const gzipSize = require('gzip-size');
const {rollup} = require('rollup');
const nodeResolve = require('rollup-plugin-node-resolve');
const path = require('path');


const generateRollupBundle =
    (entryFilePath, outputFilePath, defines, minify) => {
  const minifyOptions = {};
  if (!minify) {
    minifyOptions.formatting = 'PRETTY_PRINT';
    minifyOptions.compilationLevel = 'WHITESPACE_ONLY';
    minifyOptions.languageOut = 'ECMASCRIPT6';
  } else {
    minifyOptions.compilationLevel = 'ADVANCED';
    minifyOptions.languageOut = 'ECMASCRIPT5';
  }

  return rollup({
    input: entryFilePath,
    plugins: [nodeResolve(), compiler(Object.assign({}, {
      useTypesForOptimization: true,
      outputWrapper:
          `(function(){${defines}%output%})();\n` +
          `//# sourceMappingURL=${path.basename(outputFilePath)}.map`,
      assumeFunctionWrapper: true,
      rewritePolyfills: false,
      warningLevel: 'VERBOSE',
      createSourceMap: true,
      externs: './src/externs.js',
    }, minifyOptions))],
  }).then((bundle) => {
    return bundle.generate({
      format: 'es',
      dest: outputFilePath,
      sourceMap: true,
    });
  });
};


const saveCompiledBundle = (outputFilePath, {code, map}) => {
  fs.outputFileSync(outputFilePath, code, 'utf-8');
  fs.outputFileSync(outputFilePath + '.map', map, 'utf-8');
  const size = (gzipSize.sync(code) / 1000).toFixed(1);
  console.log(`Built ${outputFilePath} (${size} Kb gzipped)`);
};


const build = (entryFilePath, outputFilePath, externs, minify = true) => {
  generateRollupBundle(entryFilePath, outputFilePath, externs, minify)
      .then(({output: [compiledBundle]}) => {
        return saveCompiledBundle(outputFilePath, compiledBundle);
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
};


build('src/umd-wrapper.js', 'dist/tti-polyfill.js', 'var DEBUG=false;');
build('src/umd-wrapper.js', 'dist/tti-polyfill-debug.js', 'var DEBUG=true;', false); // eslint-disable-line max-len

build('src/module-wrapper.js', 'dist/tti-polyfill-module.js', 'var DEBUG=false;'); // eslint-disable-line max-len
build('src/module-wrapper.js', 'dist/tti-polyfill-module-debug.js', 'var DEBUG=true;', false); // eslint-disable-line max-len
