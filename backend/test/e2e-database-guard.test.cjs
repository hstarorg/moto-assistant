const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const path = require('node:path');
const { test } = require('node:test');

const backendRoot = path.resolve(__dirname, '..');

async function runWithTestDatabase(suite, databaseUrl) {
  let child;
  let connections = 0;
  const tripwire = createServer((socket) => {
    connections += 1;
    socket.destroy();
    child?.kill('SIGTERM');
  });
  await new Promise((resolve) => tripwire.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = tripwire.address();
    const env = {
      ...process.env,
      DATABASE_URL: `postgresql://placeholder:guard-placeholder-secret@127.0.0.1:${port}/business_database`,
      WECHAT_CONFIG: 'wx-placeholder|placeholder-secret',
      R2_CONFIG:
        'placeholder-account|placeholder-key|placeholder-secret|placeholder-bucket|images',
      WECHAT_VPAY_CONFIG: '',
    };
    delete env.E2E_DATABASE_URL;
    if (databaseUrl !== undefined) {
      env.E2E_DATABASE_URL =
        typeof databaseUrl === 'function' ? databaseUrl(port) : databaseUrl;
    }
    child = spawn(
      process.execPath,
      [
        '--experimental-vm-modules',
        path.join(backendRoot, 'node_modules/jest/bin/jest.js'),
        '--config',
        path.join(__dirname, 'jest-e2e.json'),
        '--runInBand',
        '--runTestsByPath',
        path.join(__dirname, suite),
      ],
      { cwd: backendRoot, env, timeout: 15_000 },
    );
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    return { code, connections, output };
  } finally {
    child?.kill('SIGTERM');
    await new Promise((resolve) => tripwire.close(resolve));
  }
}

test('ordinary E2E refuses a missing E2E_DATABASE_URL before connecting to DATABASE_URL', async () => {
  const result = await runWithTestDatabase('api.e2e-spec.ts');
  assert.equal(
    result.connections,
    0,
    'E2E attempted to connect to the business DATABASE_URL',
  );
  assert.notEqual(result.code, 0);
  assert.match(result.output, /E2E_DATABASE_URL/);
  assert.equal(result.output.includes('guard-placeholder-secret'), false);
});

const unsafeUrls = [
  ['empty URL', ''],
  ['malformed URL', 'not-a-database-url'],
  [
    'remote host',
    'postgresql://placeholder:guard-placeholder-secret@db.example.invalid/moto_payment_e2e_guard',
  ],
  [
    'business database name',
    (port) => `postgresql://127.0.0.1:${port}/business_database`,
  ],
  [
    'wrong protocol',
    (port) => `https://127.0.0.1:${port}/moto_payment_e2e_guard`,
  ],
  [
    'query connection override',
    (port) =>
      `postgresql://127.0.0.1:${port}/moto_payment_e2e_guard?host=127.0.0.1&port=${port}`,
  ],
  [
    'URL fragment',
    (port) => `postgresql://127.0.0.1:${port}/moto_payment_e2e_guard#ignored`,
  ],
];

for (const suite of ['api.e2e-spec.ts', 'payment.e2e-spec.ts']) {
  const cases =
    suite === 'payment.e2e-spec.ts'
      ? [['missing URL', undefined], ...unsafeUrls]
      : unsafeUrls;
  for (const [reason, url] of cases) {
    test(`${suite} rejects ${reason} before database access`, async () => {
      const result = await runWithTestDatabase(suite, url);
      assert.equal(
        result.connections,
        0,
        'unsafe database connection attempted',
      );
      assert.notEqual(result.code, 0);
      assert.match(result.output, /E2E_DATABASE_URL/);
      assert.equal(result.output.includes('guard-placeholder-secret'), false);
    });
  }
}

test(
  'ordinary E2E uses the validated test database instead of DATABASE_URL',
  {
    skip: !process.env.E2E_DATABASE_URL,
  },
  async () => {
    // Requires an initialized disposable database. All invalid-URL cases above
    // run without PostgreSQL; the tripwire is never a real database.
    const result = await runWithTestDatabase(
      'api.e2e-spec.ts',
      process.env.E2E_DATABASE_URL,
    );
    assert.equal(
      result.connections,
      0,
      'E2E fell back to the business DATABASE_URL',
    );
    assert.equal(result.code, 0, result.output);
  },
);
