import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRealDataApi, createSupabaseReadProvider, isStoredTimestamp, maskStoredName, maskStoredPhone, realDataConfig } from '../real-data.mjs';

// Isolated synthetic data and fetch implementation only; no process.env or external service access.
const origin = 'https://db.example.test';
const fakeKey = 'sb_publishable_fixture_key';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const q = value => new URLSearchParams(value);

function fixtures() {
  const consultations = Array.from({ length: 21 }, (_, index) => ({
    id: 'consultation_' + String(index + 1).padStart(3, '0'), customer_id: 'customer_001', store_id: 'store_005',
    purpose: '요금제 확인', status: '완료', used_ai: true, call_id: 'call_fixture_' + index,
    ai_summary: '테스트고객 요청 확인. 010-0000-1234 또는 fixture@example.test로 연락.',
    ai_transcription: 'RAW_TRANSCRIPT_MUST_NEVER_APPEAR', used_phone: false, used_visit: false,
    started_at: '2026-01-' + String(index + 1).padStart(2, '0') + 'T01:00:00+00:00',
    ended_at: '2026-01-' + String(index + 1).padStart(2, '0') + 'T01:30:00+00:00',
  }));
  return {
    customers: [
      { id: 'customer_001', name: '테스트고객', phone: '010-0000-1234', privacy_consent: true, product_id: 'product_001', plan_id: 'own_plan_001', birth_date: '2000-01-01', gender: '남성' },
      { id: 'customer_002', name: '비공개테스트', phone: '010-9999-5678', privacy_consent: false, product_id: 'product_001', plan_id: 'own_plan_001' },
      { id: 'customer_003', name: '다른매장고객', phone: '010-8888-9012', privacy_consent: true, product_id: 'product_001', plan_id: 'own_plan_001' },
    ],
    consultations: [...consultations,
      { ...consultations[0], id: 'consultation_040', customer_id: 'customer_002', ai_summary: 'PRIVATE_SUMMARY', purpose: 'PRIVATE_PURPOSE' },
      { ...consultations[0], id: 'consultation_050', customer_id: 'customer_003', store_id: 'store_001' },
    ],
    reservations: [
      { id: 'reservation_001', consultation_id: 'consultation_001', store_id: 'store_005', employee_id: 'employee_001',
        source: 'AI', reserved_at: '2026-10-05T01:00:00.123456+00:00', visit_at: '2026-10-07T14:30:00+09:00',
        purpose: '테스트고객 요금제 상담', note: '테스트고객이 010-0000-1234로 확인 요청', status: '예약 확정' },
      { id: 'reservation_002', consultation_id: 'consultation_040', store_id: 'store_005', employee_id: 'employee_001',
        source: 'PHONE', reserved_at: '2026-10-05T01:00:00Z', visit_at: '2026-10-08T02:00:00Z',
        purpose: 'PRIVATE_PURPOSE', note: 'PRIVATE_NOTE', status: '노쇼' },
      { id: 'reservation_003', consultation_id: 'consultation_050', store_id: 'store_001', employee_id: 'employee_002',
        source: 'AI', reserved_at: '2026-10-05T01:00:00Z', visit_at: '2026-10-09T02:00:00Z',
        purpose: '다른 매장 예약', note: null, status: '예약 확정' },
    ],
    employees: [
      { id: 'employee_001', store_id: 'store_005', name: '테스트직원', phone: 'STAFF_PHONE_NEVER_SELECTED' },
      { id: 'employee_002', store_id: 'store_001', name: '다른매장직원' },
    ],
    risks: consultations.map((row, index) => ({
      id: 'risk_' + String(index + 1).padStart(3, '0'), consultation_id: row.id, customer_id: row.customer_id,
      stage: 'AI', risk_score: 33, risk_level: '주의', created_at: row.ended_at,
    })),
    products: [{ id: 'product_001', name: '테스트 단말', maker: 'Samsung', storage_gb: 128, color: '검정', price: 100000 }],
    own_plans: [{ id: 'own_plan_001', name: '테스트 요금제', monthly_fee: 11000 }],
    bundles: [{ id: 'bundle_001', name: '테스트 결합', type: 'TOTAL', parent_id: null, discount_method: 'RULE' }],
    bundle_rules: [{ id: 'bundle_rule_001', bundle_id: 'bundle_001', order_no: 1, description: '테스트 조건' }],
  };
}

function setup({ data = fixtures(), override } = {}) {
  const sent = [];
  const fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    const table = parsed.pathname.split('/').at(-1);
    sent.push({ table, query: new URLSearchParams(parsed.search), init });
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.equal(init.redirect, 'manual');
    let rows = structuredClone(data[table] ?? []);
    for (const [column, filter] of parsed.searchParams) {
      if (['select', 'order', 'limit'].includes(column)) continue;
      if (filter.startsWith('eq.')) rows = rows.filter(row => String(row[column]) === filter.slice(3));
      else if (filter.startsWith('in.(')) {
        const values = new Set(filter.slice(4, -1).split(','));
        rows = rows.filter(row => values.has(row[column]));
      }
    }
    for (const part of (parsed.searchParams.get('order') ?? '').split(',').reverse()) {
      if (!part) continue;
      const [field, direction] = part.split('.');
      rows.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1));
    }
    rows = rows.slice(0, Number(parsed.searchParams.get('limit')));
    if (override) rows = override(table, rows, parsed.searchParams);
    return json(rows);
  };
  const provider = createSupabaseReadProvider({ supabaseUrl: origin, supabaseKey: fakeKey, fetchImpl });
  const api = createRealDataApi({ provider, homeStoreId: 'store_005' });
  return { sent, provider, api, data };
}

test('config uses explicit supplied server-only READ_KEY, never a service-role fallback', () => {
  assert.deepEqual(realDataConfig({}), { supabaseUrl: '', supabaseKey: '' });
  assert.deepEqual(realDataConfig({ SUPABASE_URL: ' ' + origin + '/// ', SUPABASE_READ_KEY: ' ' + fakeKey + ' ', SUPABASE_SERVICE_ROLE_KEY: 'ignored' }),
    { supabaseUrl: origin, supabaseKey: fakeKey });
});

test('provider supports minimum catalog/readOne queries with GET-only and strips unexpected fields', async () => {
  const { provider, sent } = setup();
  assert.deepEqual(await provider.readOne('products', { select: 'id,name,price', filters: { id: 'eq.product_001' }, order: 'id.asc' }),
    { ok: true, data: { id: 'product_001', name: '테스트 단말', price: 100000 } });
  assert.deepEqual(await provider.readOne('products', { select: 'id,name', filters: { id: 'eq.product_999' } }), { ok: true, data: null });
  assert.equal(sent[0].init.headers.apikey, fakeKey);
  assert.equal(sent[0].init.headers.Authorization, undefined);
  assert.equal(sent[0].query.get('limit'), '1');
});

test('modern publishable/secret API keys are never JWT bearer values; only legacy JWTs get Bearer', async () => {
  for (const key of ['sb_publishable_fixture', 'sb_secret_fixture', 'fixture.header.signature']) {
    let headers;
    const provider = createSupabaseReadProvider({ supabaseUrl: origin, supabaseKey: key, fetchImpl: async (_url, init) => { headers = init.headers; return json([]); } });
    assert.deepEqual(await provider.read('products', { select: 'id' }), { ok: true, data: [] });
    assert.equal(headers.apikey, key);
    assert.equal(headers.Authorization, key.startsWith('sb_') ? undefined : 'Bearer ' + key);
  }
});

test('provider blocks unverified columns, raw transcripts, wildcard/RPC/nested select, injection and unbounded queries before fetching', async () => {
  const { provider, sent } = setup();
  const bad = [
    ['customers', { select: '*' }],
    ['customers', { select: 'id,birth_date' }],
    ['employees', { select: 'id,phone' }],
    ['consultations', { select: 'id,ai_transcription' }],
    ['products', { select: 'id,customers(id)' }],
    ['rpc/query', { select: 'id' }],
    ['constructor', { select: 'id' }],
    ['products', { select: 'id,id' }],
    ['products', { select: 'id', limit: 0 }],
    ['products', { select: 'id', limit: 1001 }],
    ['products', { select: 'id', filters: { or: '(id.eq.product_001)' } }],
    ['products', { select: 'id', filters: { id: 'eq.product_001&limit=1000' } }],
    ['products', { select: 'id', order: 'name.desc,unknown.asc' }],
  ];
  for (const [table, query] of bad) assert.deepEqual(await provider.read(table, query), { ok: false, code: 'REAL_DATA_INVALID_QUERY' });
  assert.equal(sent.length, 0);
});

test('provider distinguishes missing/invalid configuration without network access or secret echo', async () => {
  let sent = 0;
  for (const [url, key, code] of [
    ['', fakeKey, 'REAL_DATA_NOT_CONFIGURED'],
    [origin, '', 'REAL_DATA_NOT_CONFIGURED'],
    ['http://db.example.test', fakeKey, 'REAL_DATA_CONFIG_INVALID'],
    [origin + '/rest/v1', fakeKey, 'REAL_DATA_CONFIG_INVALID'],
    [origin + '?private=value', fakeKey, 'REAL_DATA_CONFIG_INVALID'],
    ['https://user:password@db.example.test', fakeKey, 'REAL_DATA_CONFIG_INVALID'],
    [origin, 'private\nkey', 'REAL_DATA_CONFIG_INVALID'],
  ]) {
    const provider = createSupabaseReadProvider({ supabaseUrl: url, supabaseKey: key, fetchImpl: async () => { sent += 1; return json([]); } });
    assert.deepEqual(await provider.read('products', { select: 'id' }), { ok: false, code });
  }
  assert.equal(sent, 0);
});

test('provider distinguishes denied, unavailable, malformed JSON/rows, network failure and timeout; no retry', async () => {
  for (const [fetchImpl, code] of [
    [async () => json({ private: 'do not expose' }, 401), 'REAL_DATA_ACCESS_DENIED'],
    [async () => json({}, 403), 'REAL_DATA_ACCESS_DENIED'],
    [async () => json({}, 404), 'REAL_DATA_UNAVAILABLE'],
    [async () => json({}, 500), 'REAL_DATA_UNAVAILABLE'],
    [async () => new Response(null, { status: 302, headers: { Location: 'https://redirect.example.test' } }), 'REAL_DATA_UNAVAILABLE'],
    [async () => new Response('private-not-json'), 'REAL_DATA_INVALID_RESPONSE'],
    [async () => json({ rows: [] }), 'REAL_DATA_INVALID_RESPONSE'],
    [async () => json([null]), 'REAL_DATA_INVALID_RESPONSE'],
    [async () => json([{}]), 'REAL_DATA_INVALID_RESPONSE'],
    [async () => json([{ id: 'product_001' }, { id: 'product_002' }]), 'REAL_DATA_INVALID_RESPONSE'],
    [async () => { throw new TypeError('private network detail'); }, 'REAL_DATA_UNAVAILABLE'],
    [async (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))), 'REAL_DATA_TIMEOUT'],
  ]) {
    let attempts = 0;
    const provider = createSupabaseReadProvider({ supabaseUrl: origin, supabaseKey: fakeKey, timeoutMs: 20,
      fetchImpl: async (...args) => { attempts += 1; return fetchImpl(...args); } });
    const keepAlive = setTimeout(() => {}, 500);
    try { assert.deepEqual(await provider.read('products', { select: 'id', limit: 1 }), { ok: false, code }); }
    finally { clearTimeout(keepAlive); }
    assert.equal(attempts, 1);
  }
});

test('provider close aborts a pending read, never retries or keeps using credentials', async () => {
  let started;
  const began = new Promise(resolve => { started = resolve; });
  const provider = createSupabaseReadProvider({ supabaseUrl: origin, supabaseKey: fakeKey, fetchImpl: async (_url, init) => {
    started();
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  } });
  const pending = provider.read('products', { select: 'id' });
  await began;
  provider.close();
  assert.deepEqual(await pending, { ok: false, code: 'REAL_DATA_UNAVAILABLE' });
  assert.deepEqual(await provider.read('products', { select: 'id' }), { ok: false, code: 'REAL_DATA_UNAVAILABLE' });
});

test('stored ISO dates validate the calendar and preserve valid offsets and Postgres fractional precision', () => {
  for (const value of ['2026-10-07T14:30:00+09:00', '2026-10-05T01:00:00.123456+00:00', '2028-02-29T00:00:00Z']) assert.equal(isStoredTimestamp(value), true);
  for (const value of ['2026-02-29T00:00:00Z', '2026-02-30T00:00:00Z', '2026-13-01T00:00:00Z', '2026-01-01T24:00:00Z',
    '2026-01-01T00:60:00Z', '2026-01-01T00:00:00+24:00', '2026-01-01T00:00:00', null]) assert.equal(isStoredTimestamp(value), false);
  assert.equal(maskStoredName('김'), '*');
  assert.equal(maskStoredName('홍길동'), '홍*동');
  assert.equal(maskStoredPhone('010-0000-1234'), '***-****-1234');
});

test('status is a pure configuration gate, and every write method is rejected without fetching', async () => {
  const { api, sent } = setup();
  assert.deepEqual(await api.handle('GET', '/api/data/status'), { status: 200, body: { source: 'supabase', readOnly: true, configured: true, scopeConfigured: true, errorCode: null } });
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) assert.deepEqual(await api.handle(method, '/api/data/appointments'), { status: 405, body: { errorCode: 'METHOD_NOT_ALLOWED' } });
  assert.equal(await api.handle('GET', '/retell/config'), null);
  assert.equal(sent.length, 0);
  const unconfigured = createRealDataApi({ provider: createSupabaseReadProvider(), homeStoreId: 'store_005' });
  assert.equal((await unconfigured.handle('GET', '/api/data/status')).body.errorCode, 'REAL_DATA_NOT_CONFIGURED');
  assert.equal((await unconfigured.handle('GET', '/api/data/appointments')).status, 503);
  const unscoped = createRealDataApi({ provider: setup().provider, homeStoreId: 'invalid' });
  assert.equal((await unscoped.handle('GET', '/api/data/status')).body.scopeConfigured, false);
  assert.equal((await unscoped.handle('GET', '/api/data/appointments')).body.errorCode, 'HOME_STORE_NOT_CONFIGURED');
});

test('appointments preserve real reservation status/date and expose only masked contacts/minimum DTO fields', async () => {
  const { api, sent } = setup();
  const result = await api.handle('GET', '/api/data/appointments', q('store_id=store_001'));
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 2);
  const row = result.body.items[0];
  assert.equal(row.status, '예약 확정');
  assert.equal(row.visitAt, '2026-10-07T14:30:00+09:00');
  assert.equal(row.reservedAt, '2026-10-05T01:00:00.123456+00:00');
  assert.equal(row.customerNameMasked, '테***객');
  assert.equal(row.employeeName, '테***원');
  assert.equal(row.phoneMasked, '***-****-1234');
  assert.equal(row.summaryStatus, 'available');
  const rendered = JSON.stringify(result.body);
  for (const forbidden of ['010-0000-1234', 'fixture@example.test', 'RAW_TRANSCRIPT', 'STAFF_PHONE', 'birth_date', 'gender', '_customer', '_consultation', 'PRIVATE_SUMMARY', 'PRIVATE_PURPOSE']) assert.equal(rendered.includes(forbidden), false);
  for (const request of sent.filter(item => ['reservations', 'consultations', 'employees'].includes(item.table))) assert.equal(request.query.get('store_id'), 'eq.store_005');
  assert.equal(sent.some(item => item.query.get('select').includes('ai_transcription') || item.query.get('select').includes('note')), false);
});

test('all verified reservation states are preserved instead of mapped to local consultation states', async () => {
  const data = fixtures();
  data.reservations = ['예약 확정', '방문 완료', '취소', '노쇼'].map((status, index) => ({ ...data.reservations[0], id: 'reservation_' + String(index + 1).padStart(3, '0'), status }));
  const result = await setup({ data }).api.handle('GET', '/api/data/appointments');
  assert.deepEqual(result.body.items.map(item => item.status), ['예약 확정', '방문 완료', '취소', '노쇼']);
});

test('customer listing is scoped through consultations and never selects summary, transcript or demographics', async () => {
  const { api, sent } = setup();
  const result = await api.handle('GET', '/api/data/customers');
  assert.equal(result.status, 200);
  assert.deepEqual(new Set(result.body.items.map(item => item.id)), new Set(['customer_001', 'customer_002']));
  assert.equal(result.body.items[0].latestConsultationId, 'consultation_021');
  assert.deepEqual(result.body.items[0].currentPlan, { id: 'own_plan_001', name: '테스트 요금제', monthlyFee: 11000 });
  assert.deepEqual(result.body.items[0].currentProduct, { id: 'product_001', name: '테스트 단말', maker: 'Samsung', storageGb: 128, color: '검정' });
  assert.equal(result.body.items[1].currentPlan, null);
  assert.equal(result.body.items[1].currentProduct, null);
  const customerReads = sent.filter(item => item.table === 'customers');
  assert.ok(customerReads.every(item => item.query.has('id')));
  assert.ok(sent.every(item => !/ai_summary|ai_transcription|birth_date|gender/.test(item.query.get('select'))));
});

test('larger reservation/customer lists still batch references instead of doing per-row requests', async () => {
  const baseline = setup();
  await baseline.api.handle('GET', '/api/data/appointments');
  const data = fixtures();
  data.reservations = Array.from({ length: 50 }, (_, index) => ({
    ...data.reservations[0], id: 'reservation_' + String(index + 1).padStart(3, '0'),
  }));
  const large = setup({ data });
  assert.equal((await large.api.handle('GET', '/api/data/appointments')).body.items.length, 50);
  assert.equal(large.sent.length, baseline.sent.length);
  assert.equal(large.sent.filter(item => item.table === 'customers').length, 1);
  assert.equal(large.sent.filter(item => item.table === 'employees').length, 1);
});

test('current products/plans reject absent or mismatched references and preserve a genuine zero plan fee', async () => {
  const data = fixtures();
  data.own_plans[0].monthly_fee = 0;
  assert.equal((await setup({ data }).api.handle('GET', '/api/data/customers')).body.items[0].currentPlan.monthlyFee, 0);
  data.products = [];
  assert.equal((await setup({ data }).api.handle('GET', '/api/data/customers')).body.errorCode, 'REAL_DATA_INVALID_RESPONSE');
});

test('customer history defaults to 5 and explicitly supports at most 20; scores are projected without recomputation', async () => {
  const { api, sent } = setup();
  const short = await api.handle('GET', '/api/data/customers/customer_001/consultations');
  assert.equal(short.status, 200);
  assert.equal(short.body.items.length, 5);
  assert.equal(short.body.items[0].id, 'consultation_021');
  assert.deepEqual(short.body.items[0].risks[0], { id: 'risk_021', stage: 'AI', score: 33, level: '주의', createdAt: '2026-01-21T01:30:00+00:00' });
  assert.equal((await api.handle('GET', '/api/data/customers/customer_001/consultations', q('limit=20'))).body.items.length, 20);
  const before = sent.length;
  for (const limit of ['0', '21', '-1', '1.5', '05', 'Infinity']) assert.equal((await api.handle('GET', '/api/data/customers/customer_001/consultations', q('limit=' + limit))).body.errorCode, 'INVALID_LIMIT');
  assert.equal(sent.length, before);
  assert.equal((await api.handle('GET', '/api/data/customers/customer_003/consultations')).body.errorCode, 'CUSTOMER_NOT_FOUND');
});

test('privacy=false is distinct from missing summary and blocks private history/detail reads', async () => {
  const { api, sent } = setup();
  const list = await api.handle('GET', '/api/data/appointments');
  const row = list.body.items.find(item => item.customerId === 'customer_002');
  assert.equal(row.privacyConsent, false);
  assert.equal(row.customerNameMasked, '비공개 고객');
  assert.equal(row.phoneMasked, '연락처 비공개');
  assert.equal(row.summaryStatus, 'restricted');
  assert.equal(row.summaryPreview, null);
  assert.equal((await api.handle('GET', '/api/data/customers/customer_002/consultations')).body.errorCode, 'CUSTOMER_PRIVACY_RESTRICTED');
  sent.length = 0;
  const briefing = await api.handle('GET', '/api/briefings/reservation_002');
  assert.equal(briefing.status, 200);
  assert.equal(briefing.body.summaryStatus, 'restricted');
  assert.deepEqual(briefing.body.history, []);
  assert.equal(briefing.body.currentProduct, null);
  assert.equal(briefing.body.currentPlan, null);
  assert.equal(briefing.body.requestNote, null);
  assert.ok(sent.every(item => !/ai_summary|note|product_id|plan_id/.test(item.query.get('select'))));
  assert.ok(sent.every(item => item.table !== 'risks'));
  assert.equal(JSON.stringify(briefing.body).includes('PRIVATE_'), false);
});

test('briefing deterministically projects stored summary/current plan/product/request note, never inventing desired products or calling n8n', async () => {
  const { api, sent } = setup();
  const first = await api.handle('GET', '/api/briefings/reservation_001');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.currentProduct, { id: 'product_001', name: '테스트 단말', maker: 'Samsung', storageGb: 128, color: '검정' });
  assert.deepEqual(first.body.currentPlan, { id: 'own_plan_001', name: '테스트 요금제', monthlyFee: 11000 });
  assert.equal(first.body.history.length, 5);
  assert.equal(first.body.desiredProductStatus, 'not_recorded');
  assert.equal(first.body.desiredDeviceStatus, 'not_recorded');
  assert.equal(first.body.desiredProduct, null);
  assert.equal(first.body.desiredDevice, null);
  assert.equal(first.body.requestNote.includes('010-0000-1234'), false);
  assert.equal(first.body.summary.includes('fixture@example.test'), false);
  assert.deepEqual(await api.handle('GET', '/api/briefings/reservation_001'), first);
  assert.ok(sent.every(item => item.init.method === 'GET' && !item.query.get('select').includes('ai_transcription')));
});

test('missing and blank stored summary/note remain missing rather than processing/generated data', async () => {
  for (const value of [null, '', '   ']) {
    const data = fixtures();
    data.consultations[0].ai_summary = value;
    data.reservations[0].note = value;
    const result = await setup({ data }).api.handle('GET', '/api/briefings/reservation_001');
    assert.equal(result.status, 200);
    assert.equal(result.body.summaryStatus, 'missing');
    assert.equal(result.body.summary, null);
    assert.equal(result.body.requestNote, null);
  }
});

test('IDs and scoped not-found results do not probe a global customer table', async () => {
  const { api, sent } = setup();
  for (const path of ['/api/data/customers/customer_bad/consultations', '/api/briefings/DEMO-R002']) assert.equal((await api.handle('GET', path)).status, 400);
  assert.equal(sent.length, 0);
  assert.equal((await api.handle('GET', '/api/briefings/reservation_999')).body.errorCode, 'RESERVATION_NOT_FOUND');
  assert.equal((await api.handle('GET', '/api/briefings/reservation_003')).body.errorCode, 'RESERVATION_NOT_FOUND');
  assert.equal((await api.handle('GET', '/api/data/customers/customer_999/consultations')).body.errorCode, 'CUSTOMER_NOT_FOUND');
  assert.ok(sent.every(item => item.table !== 'customers'));
});

test('mismatched store/customer/FK, absent references, invalid dates/status/summary and duplicate history fail safely', async () => {
  const cases = [
    data => { data.consultations[0].store_id = 'store_001'; },
    data => { data.employees[0].store_id = 'store_001'; },
    data => { data.customers = data.customers.filter(row => row.id !== 'customer_001'); },
    data => { data.reservations[0].visit_at = '2026-02-30T00:00:00Z'; },
    data => { data.reservations[0].status = 'completed'; },
    data => { data.consultations[0].ai_summary = { private: 'invalid' }; },
  ];
  for (const change of cases) {
    const data = fixtures();
    change(data);
    const result = await setup({ data }).api.handle('GET', '/api/data/appointments');
    assert.deepEqual(result, { status: 502, body: { errorCode: 'REAL_DATA_INVALID_RESPONSE' } });
  }
  const wrongRisk = setup({ override: (table, rows) => table === 'risks' ? rows.map(row => ({ ...row, customer_id: 'customer_003' })) : rows });
  assert.equal((await wrongRisk.api.handle('GET', '/api/data/customers/customer_001/consultations')).body.errorCode, 'REAL_DATA_INVALID_RESPONSE');
  const duplicate = setup({ override: (table, rows, query) => table === 'consultations' && query.get('customer_id') ? [rows[0], rows[0]] : rows });
  assert.equal((await duplicate.api.handle('GET', '/api/data/customers/customer_001/consultations')).body.errorCode, 'REAL_DATA_INVALID_RESPONSE');
});

test('actual spaced consultation enums are accepted; unrelated or missing fields never become successful DTOs', async () => {
  const data = fixtures();
  data.consultations[20].status = '진행 중';
  data.consultations[20].ended_at = null;
  data.consultations[19].status = '방문 예정';
  data.consultations[19].ended_at = null;
  const history = await setup({ data }).api.handle('GET', '/api/data/customers/customer_001/consultations');
  assert.equal(history.status, 200);
  assert.equal(history.body.items[0].status, '진행 중');
  assert.equal(history.body.items[1].status, '방문 예정');
  data.consultations[20].status = '진행중';
  assert.equal((await setup({ data }).api.handle('GET', '/api/data/customers')).body.errorCode, 'REAL_DATA_INVALID_RESPONSE');
});
