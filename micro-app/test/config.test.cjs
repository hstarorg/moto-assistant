const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

test('uses the production API without requiring mini-program environment information', () => {
  const source = readFileSync(path.join(__dirname, '../config.ts'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS
      }
    }).outputText,
    { module, exports: module.exports }
  );
  assert.equal(module.exports.apiBaseUrl, 'https://apis.hstar.org/moto/api/v1');
  assert.equal(Object.isFrozen(module.exports), true);
});
