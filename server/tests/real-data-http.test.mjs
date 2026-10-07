import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createBackend } from '../app.mjs';

async function serverFor(t, options = {}) {
  const server = createBackend({
    key: '', agentId: '', monitors: { start() {}, release() {}, close() {} }, log() {},
    ...options,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return 'http://127.0.0.1:' + server.address().port;
}

// Send only to the local test server while exercising its configured public Host checks.
function localRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const call = request(url, { method: options.method ?? 'GET', headers: options.headers }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => body += chunk);
      response.on('end', () => resolve({ status: response.statusCode, json: async () => JSON.parse(body) }));
      response.on('error', reject);
    });
    call.on('error', reject);
    call.end(options.body);
  });
}

test('read-only DB status exposes only safe availability without keys or upstream URLs', async t => {
  const url = await serverFor(t, { supabaseUrl: 'https://db.example.test', supabaseKey: 'server-only-test-key', demoStoreId: 'store_005' });
  const response = await fetch(url + '/api/data/status');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { source: 'supabase', readOnly: true, configured: true, scopeConfigured: true, errorCode: null });
  assert.equal(JSON.stringify(body).includes('server-only-test-key'), false);
  assert.equal(JSON.stringify(body).includes('db.example.test'), false);
});

test('unconfigured stored data returns explicit errors while Retell/SSE routes retain their own configuration', async t => {
  const url = await serverFor(t);
  for (const path of ['/api/data/appointments', '/api/data/customers', '/api/briefings/reservation_001']) {
    const response = await fetch(url + path);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { errorCode: 'REAL_DATA_NOT_CONFIGURED' });
  }
  const config = await fetch(url + '/retell/config');
  assert.deepEqual(await config.json(), { agent_id: '', configured: false });
  const health = await fetch(url + '/health');
  assert.equal(health.status, 200);
});

test('stored data routes reject writes and retain existing origin protections', async t => {
  const url = await serverFor(t);
  const forbidden = await fetch(url + '/api/data/appointments', { headers: { Origin: 'https://untrusted.example.test' } });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { error_message: 'ORIGIN_NOT_ALLOWED' });
  const write = await fetch(url + '/api/data/appointments', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173' } });
  assert.equal(write.status, 405);
});

test('catalog is read-only and price POST retains JSON/origin checks without changing DB data', async t => {
  const url = await serverFor(t);
  const catalog = await fetch(url + '/api/products/catalog');
  assert.equal(catalog.status, 503);
  assert.deepEqual(await catalog.json(), { errorCode: 'REAL_DATA_NOT_CONFIGURED' });
  const wrongMethod = await fetch(url + '/api/effective-price');
  assert.equal(wrongMethod.status, 405);
  const missingOrigin = await fetch(url + '/api/effective-price', { method: 'POST' });
  assert.equal(missingOrigin.status, 403);
  const nonJson = await fetch(url + '/api/effective-price', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173' }, body: '{}' });
  assert.equal(nonJson.status, 415);
  const calculate = await fetch(url + '/api/effective-price', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: 'own_plan_001' }) });
  assert.equal(calculate.status, 503);
  assert.deepEqual(await calculate.json(), { errorCode: 'REAL_DATA_NOT_CONFIGURED' });
  const injectedPrice = await fetch(url + '/api/effective-price', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: 'own_plan_001', monthly_fee: 1 }) });
  assert.equal(injectedPrice.status, 400);
});

test('public deployments block stored customer routes and customer price calculations before invoking the provider', async t => {
  const queried = [];
  const provider = {
    configured: true, configError: null,
    async read(...args) { queried.push(args); throw new Error('Provider must not be invoked'); },
    async readOne(...args) { queried.push(args); throw new Error('Provider must not be invoked'); },
    close() {},
  };
  const url = await serverFor(t, {
    deployment: { origin: 'https://public.example.test', staticDir: '.' },
    demoStoreId: 'store_005', realDataProvider: provider,
  });
  const headers = { Host: 'public.example.test', Origin: 'https://public.example.test' };
  for (const path of [
    '/api/data/appointments', '/api/data/customers?store_id=store_001',
    '/api/data/customers/customer_001/consultations', '/api/briefings/reservation_001',
    '/api/data/status/', '/api/data/unknown',
  ]) {
    const response = await localRequest(url + path, { headers });
    assert.equal(response.status, 503, path);
    assert.deepEqual(await response.json(), { errorCode: 'REAL_DATA_ACCESS_RESTRICTED' });
  }
  // A direct request or forged loopback proxy headers cannot turn a public deployment into QA.
  for (const requestHeaders of [
    { Host: 'public.example.test' },
    { ...headers, 'X-Forwarded-Host': '127.0.0.1', 'X-Forwarded-For': '127.0.0.1' },
    { Host: 'public.example.test', 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' },
  ]) {
    const response = await localRequest(url + '/api/data/customers', { headers: requestHeaders });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { errorCode: 'REAL_DATA_ACCESS_RESTRICTED' });
  }
  for (const customerId of ['customer_001', '', null, 1]) {
    const response = await localRequest(url + '/api/effective-price', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: 'own_plan_001', customer_id: customerId }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { errorCode: 'REAL_DATA_ACCESS_RESTRICTED' });
  }
  const status = await localRequest(url + '/api/data/status', { headers });
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { source: 'supabase', readOnly: true, configured: true, scopeConfigured: true, errorCode: null });
  assert.equal((await localRequest(url + '/retell/config', { headers })).status, 200);
  assert.equal((await localRequest(url + '/health', { headers })).status, 200);
  assert.deepEqual(queried, []);
});

test('public deployments retain nonpersonal catalog and price calculation without querying customer tables', async t => {
  const queried = [];
  const provider = {
    configured: true, configError: null,
    async read(table, query) { queried.push({ table, query }); return { ok: true, data: [] }; },
    async readOne(table, query) {
      queried.push({ table, query });
      assert.equal(table, 'own_plans');
      return { ok: true, data: { id: 'own_plan_001', name: '검증 요금제', monthly_fee: 1000 } };
    },
    close() {},
  };
  const url = await serverFor(t, {
    deployment: { origin: 'https://public.example.test', staticDir: '.' },
    demoStoreId: 'store_005', realDataProvider: provider,
  });
  const headers = { Host: 'public.example.test', Origin: 'https://public.example.test' };
  const catalog = await localRequest(url + '/api/products/catalog', { headers });
  assert.equal(catalog.status, 200);
  assert.deepEqual(await catalog.json(), { source: 'supabase', products: [], ownPlans: [], competitorPlans: [], bundles: [], benefits: [] });
  const price = await localRequest(url + '/api/effective-price?customer_id=customer_001', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_id: 'own_plan_001' }),
  });
  assert.equal(price.status, 200);
  const calculated = await price.json();
  assert.equal(calculated.monthlySubtotal, 1000);
  assert.equal(calculated.currentPlan, null);
  assert.deepEqual(queried.map(row => row.table), ['products', 'own_plans', 'competitor_plans', 'bundles', 'benefits', 'own_plans']);
  // Existing cross-origin and missing-origin protections still run before the new restrictions.
  const wrongOrigin = await localRequest(url + '/api/data/customers', { headers: { ...headers, Origin: 'https://untrusted.example.test' } });
  assert.equal(wrongOrigin.status, 403);
  const missingOrigin = await localRequest(url + '/api/effective-price', {
    method: 'POST', headers: { Host: 'public.example.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_id: 'own_plan_001', customer_id: 'customer_001' }),
  });
  assert.equal(missingOrigin.status, 403);
  assert.equal(queried.length, 6);
});

test('loopback deployments retain stored-data and customer-price QA paths', async t => {
  const queried = [];
  const provider = {
    configured: true, configError: null,
    async read(table) { queried.push(table); return { ok: true, data: [] }; },
    async readOne(table) {
      queried.push(table);
      if (table === 'own_plans') return { ok: true, data: { id: 'own_plan_001', name: '검증 요금제', monthly_fee: 1000 } };
      if (table === 'consultations') return { ok: true, data: { id: 'consultation_001', customer_id: 'customer_001', store_id: 'store_005' } };
      if (table === 'customers') return { ok: true, data: { id: 'customer_001', privacy_consent: true, plan_id: null } };
      throw new Error('Unexpected table');
    },
    close() {},
  };
  for (const host of ['localhost', '127.0.0.1', '127.0.0.2', '[::1]']) {
    const origin = 'https://' + host;
    const url = await serverFor(t, { deployment: { origin, staticDir: '.' }, demoStoreId: 'store_005', realDataProvider: provider });
    const headers = { Host: host, Origin: origin };
    const appointments = await localRequest(url + '/api/data/appointments', { headers });
    assert.equal(appointments.status, 200, host);
    assert.deepEqual((await appointments.json()).items, []);
    const briefing = await localRequest(url + '/api/briefings/reservation_001', { headers });
    assert.equal(briefing.status, 404, host);
    assert.deepEqual(await briefing.json(), { errorCode: 'RESERVATION_NOT_FOUND' });
    const price = await localRequest(url + '/api/effective-price', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: 'own_plan_001', customer_id: 'customer_001' }),
    });
    assert.equal(price.status, 200, host);
  }
  assert.ok(queried.includes('reservations'));
  assert.ok(queried.includes('consultations'));
  assert.ok(queried.includes('customers'));
});

test('public v2 quotation remains nonpersonal and customer/origin/JSON gates run before catalog reads', async t => {
  const queried = [];
  const provider = {
    configured: true, configError: null,
    async read() { throw new Error('No bundle was selected'); },
    async readOne(table, query) {
      queried.push({ table, query });
      if (table === 'own_plans') return { ok: true, data: { id: 'own_plan_001', name: '검증 90 요금제', monthly_fee: 90000 } };
      if (table === 'products') return { ok: true, data: { id: 'product_001', name: 'Galaxy S26', maker: 'Samsung',
        storage_gb: 256, color: '블랙', price: 1254000 } };
      throw new Error('Personal table must not be queried');
    },
    close() {},
  };
  const url = await serverFor(t, { deployment: { origin: 'https://public.example.test', staticDir: '.' },
    demoStoreId: 'store_005', realDataProvider: provider });
  const headers = { Host: 'public.example.test', Origin: 'https://public.example.test', 'Content-Type': 'application/json' };
  const input = { product_id: 'product_001', plan_id: 'own_plan_001', installment_months: 24,
    contract_months: 24, discount_type: 'PLAN_DISCOUNT' };
  for (const customer_id of ['customer_001', null]) {
    const blocked = await localRequest(url + '/api/effective-price', {
      method: 'POST', headers, body: JSON.stringify({ ...input, customer_id }),
    });
    assert.equal(blocked.status, 503);
    assert.deepEqual(await blocked.json(), { errorCode: 'REAL_DATA_ACCESS_RESTRICTED' });
  }
  const wrongOrigin = await localRequest(url + '/api/effective-price', {
    method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example.test' }, body: JSON.stringify(input),
  });
  assert.equal(wrongOrigin.status, 403);
  const wrongType = await localRequest(url + '/api/effective-price', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: JSON.stringify(input),
  });
  assert.equal(wrongType.status, 415);
  assert.deepEqual(queried, []);
  const response = await localRequest(url + '/api/effective-price?customer_id=customer_001', {
    method: 'POST', headers, body: JSON.stringify(input),
  });
  assert.equal(response.status, 200);
  const calculated = await response.json();
  assert.equal(calculated.policyVersion, 'n8n-quote-v2');
  assert.equal(calculated.quote.breakdown.plan_fee_after_discount, 67500);
  assert.equal(calculated.quote.excluded.customer_lookup, true);
  assert.equal(JSON.stringify(calculated).includes('customer_001'), false);
  assert.deepEqual(queried.map(row => row.table), ['own_plans', 'products']);
});
