const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

test('forwards payment request timeouts and exposes only valid diagnostic error codes', async () => {
  let responseCode = 'TIP_ORDER_QUERY_FAILED';
  let request;
  let networkFailure;
  const source = readFileSync(path.join(__dirname, '../utils/ajax.ts'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS
      }
    }).outputText,
    {
      module,
      exports: module.exports,
      require: name =>
        name.endsWith('config') ? { apiBaseUrl: 'https://example.com' } : {},
      wx: {
        request(options) {
          request = options;
          if (networkFailure) {
            options.fail({ errMsg: networkFailure });
            return;
          }
          options.success({
            statusCode: 503,
            data: { code: responseCode, error: 'private-details' }
          });
        }
      }
    }
  );
  const ajax = module.exports;
  for (const code of ['TIP_ORDER_QUERY_FAILED', 'unsafe-code-with-secret']) {
    responseCode = code;
    let failure;
    try {
      await ajax.get('/tips/orders/MA12345678', {
        timeout: 8000,
        showLoading: false,
        showError: false
      });
    } catch (error) {
      failure = error;
    }
    assert.equal(request.timeout, 8000);
    assert.equal(
      ajax.getErrorCode(failure),
      code === 'TIP_ORDER_QUERY_FAILED' ? code : undefined
    );
  }
  networkFailure = 'request:fail timeout private-network-data';
  let failure;
  try {
    await ajax.get('/tips/orders/MA12345678', {
      timeout: 8000,
      showLoading: false,
      showError: false
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(ajax.getErrorCode(failure), 'REQUEST_TIMEOUT');
  assert.equal(failure.message.includes('private-network-data'), false);
});
