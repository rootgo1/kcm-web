import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createBackend } from '../app.mjs';
import { createSupabaseReadProvider } from '../real-data.mjs';

// Synthetic identities and records. All upstream traffic terminates in this fake fetch.
const authId = '11111111-1111-4111-8111-111111111111';
const origin = 'https://staff.example.test';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const rows = {
  employees: [{ id: 'employee_001', store_id: 'store_005', name: '테스트직원' }],
  customers: [
    { id: 'customer_001', name: '테스트고객', phone: '010-0000-1234', privacy_consent: true, product_id: 'product_001', plan_id: 'own_plan_001' },
    { id: 'customer_002', name: '비동의고객', phone: '010-0000-5678', privacy_consent: false, product_id: null, plan_id: null },
    { id: 'customer_003', name: '다른매장고객', phone: '010-0000-9012', privacy_consent: true, product_id: 'product_001', plan_id: 'own_plan_001' },
  ],
  consultations: [1, 2, 3].map(n => ({
    id: `consultation_00${n}`, customer_id: `customer_00${n}`, store_id: n === 3 ? 'store_001' : 'store_005',
    purpose: n === 2 ? 'PRIVATE_PURPOSE' : '현재 가입된 요금제 확인', status: '완료',
    used_ai: true, used_phone: false, used_visit: false, call_id: `call_fixture_${n}`,
    ai_summary: n === 2 ? 'PRIVATE_SUMMARY' : '가입된 요금제 확인 요청. 매장 방문 확인을 안내함.',
    ai_transcription: 'RAW_TRANSCRIPT', started_at: '2026-10-07T02:09:00Z', ended_at: '2026-10-07T02:10:00Z',
  })),
  risks: [{ id: 'risk_001', consultation_id: 'consultation_001', customer_id: 'customer_001', stage: 'AI', risk_score: 0, risk_level: '정상', created_at: '2026-10-07T02:10:00Z' }],
  products: [{ id: 'product_001', name: '테스트 단말', maker: 'Samsung', storage_gb: 128, color: '검정' }],
  own_plans: [{ id: 'own_plan_001', name: '테스트 요금제', monthly_fee: 11000 }],
};

async function setup(t, extra = {}) {
  const queried = [];
  const authCalls = [];
  const state = { revoked: false, failAuth: false, employeeStore: 'store_005', authId };
  const provider = createSupabaseReadProvider({ supabaseUrl: 'https://db.example.test', supabaseKey: 'sb_publishable_fixture_read', fetchImpl: async (url, init) => {
    assert.equal(init.method, 'GET');
    const parsed = new URL(url);
    const table = parsed.pathname.split('/').at(-1);
    queried.push({ table, query: parsed.searchParams });
    let result = structuredClone(rows[table] ?? []);
    if (table === 'employees') result[0].store_id = state.employeeStore;
    for (const [column, filter] of parsed.searchParams) {
      if (filter.startsWith('eq.')) result = result.filter(row => String(row[column]) === filter.slice(3));
      else if (filter.startsWith('in.(')) result = result.filter(row => filter.slice(4, -1).split(',').includes(row[column]));
    }
    for (const part of (parsed.searchParams.get('order') ?? '').split(',').reverse()) {
      if (!part) continue;
      const [field, direction] = part.split('.');
      result.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1));
    }
    return json(result.slice(0, Number(parsed.searchParams.get('limit') ?? 100)));
  } });
  const staffAuthFetchImpl = async (url, init) => {
    authCalls.push(new URL(url).pathname);
    if (state.failAuth) throw new Error('UPSTREAM_SECRET');
    if (new URL(url).pathname.endsWith('/token')) return json({ access_token: 'fake-access-token-server-only', refresh_token: 'fake-refresh-secret', expires_in: 3600, user: { id: state.authId } });
    if (state.revoked) return json({ secret: 'UPSTREAM_SECRET' }, 401);
    return json({ id: state.authId, is_anonymous: false, email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: { store_id: 'store_005' } });
  };
  const server = createBackend({ key: '', agentId: '', log() {}, monitors: { start() {}, release() {}, close() {} },
    deployment: { origin, staticDir: '.' }, demoStoreId: 'store_005', realDataProvider: provider,
    supabaseUrl: 'https://db.example.test', publishableKey: 'sb_publishable_fixture_auth',
    accountsJson: JSON.stringify([{ authUserId: authId, employeeId: 'employee_001', storeId: 'store_005' }]), staffAuthFetchImpl, ...extra });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (path, { method = 'GET', cookie, body, headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = request(base + path, { method, headers: { Host: 'staff.example.test', Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers } }, response => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(data), headers: response.headers }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const login = async () => {
    const response = await call('/api/staff-read/login', { method: 'POST', body: { email: 'staff@example.test', password: 'synthetic-password' } });
    assert.equal(response.status, 200);
    return { response, cookie: response.headers['set-cookie'][0].split(';')[0] };
  };
  return { call, login, queried, authCalls, state };
}

test('anonymous/forged staff cookies cannot invoke Auth or business DB reads', async t => {
  const { call, queried, authCalls } = await setup(t);
  assert.equal((await call('/api/data/customers')).body.errorCode, 'STAFF_LOGIN_REQUIRED');
  assert.equal((await call('/api/data/customers/customer_001/consultations', { cookie: '__Host-kcm-staff-read=' + 'a'.repeat(43) })).body.errorCode, 'STAFF_SESSION_EXPIRED');
  assert.deepEqual(queried, []);
  assert.deepEqual(authCalls, []);
  const session = await call('/api/staff-read/session');
  assert.equal(session.body.required, true);
  assert.equal(session.body.authenticated, false);
});

test('verified staff can read only fixed-store masked customers and saved summaries; logout invalidates cookie', async t => {
  const { call, login, queried, authCalls } = await setup(t);
  const { response, cookie } = await login();
  const header = response.headers['set-cookie'][0];
  for (const flag of ['__Host-kcm-staff-read=', 'HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/']) assert.ok(header.includes(flag));
  assert.ok(!JSON.stringify(response.body).includes('token'));
  const list = await call('/api/data/customers', { cookie });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map(row => row.id).sort(), ['customer_001', 'customer_002']);
  assert.ok(!JSON.stringify(list.body).includes('010-0000'));
  const history = await call('/api/data/customers/customer_001/consultations?limit=5', { cookie });
  assert.equal(history.status, 200);
  assert.equal(history.body.items[0].summaryPreview, '가입된 요금제 확인 요청. 매장 방문 확인을 안내함.');
  assert.equal(history.body.items[0].risks[0].score, 0);
  assert.ok(!JSON.stringify(history.body).includes('RAW_TRANSCRIPT'));
  assert.equal((await call('/api/data/customers/customer_002/consultations', { cookie })).body.errorCode, 'CUSTOMER_PRIVACY_RESTRICTED');
  assert.equal((await call('/api/data/customers/customer_003/consultations', { cookie })).status, 404);
  for (const entry of queried.filter(row => row.table === 'consultations')) assert.equal(entry.query.get('store_id'), 'eq.store_005');
  assert.ok(authCalls.filter(path => path.endsWith('/user')).length >= 5);
  const logout = await call('/api/staff-read/logout', { method: 'POST', cookie, body: {} });
  assert.equal(logout.status, 200);
  assert.ok(logout.headers['set-cookie'][0].includes('Max-Age=0'));
  const count = queried.length;
  assert.equal((await call('/api/data/customers', { cookie })).status, 401);
  assert.equal(queried.length, count);
});

test('Auth denial, store reassignment, metadata-only identity and Auth outage fail closed', async t => {
  const { call, login, queried, state } = await setup(t);
  let { cookie } = await login();
  state.revoked = true;
  let count = queried.length;
  assert.equal((await call('/api/data/customers', { cookie })).status, 401);
  assert.equal(queried.length, count);
  state.revoked = false;
  ({ cookie } = await login());
  state.employeeStore = 'store_001';
  count = queried.filter(row => row.table !== 'employees').length;
  assert.equal((await call('/api/data/customers', { cookie })).status, 403);
  assert.equal(queried.filter(row => row.table !== 'employees').length, count);
  state.employeeStore = 'store_005';
  ({ cookie } = await login());
  state.failAuth = true;
  count = queried.length;
  const unavailable = await call('/api/data/customers', { cookie });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.errorCode, 'STAFF_AUTH_UNAVAILABLE');
  assert.ok(!JSON.stringify(unavailable.body).includes('UPSTREAM_SECRET'));
  assert.equal(queried.length, count);
  state.failAuth = false;
  state.authId = '22222222-2222-4222-8222-222222222222';
  assert.equal((await call('/api/staff-read/login', { method: 'POST', body: { email: 'other@example.test', password: 'synthetic' } })).status, 403);
});

test('staff session does not widen other public routes or allow client-selected store/write methods', async t => {
  const { call, login, queried } = await setup(t);
  const { cookie } = await login();
  const count = queried.length;
  for (const path of ['/api/data/appointments', '/api/briefings/reservation_001', '/api/data/customers/', '/api/data/customers/customer_001/consultations/', '/api/data/unknown']) {
    assert.equal((await call(path, { cookie })).body.errorCode, 'REAL_DATA_ACCESS_RESTRICTED', path);
  }
  assert.equal((await call('/api/data/customers', { method: 'POST', cookie, body: {} })).status, 405);
  assert.equal(queried.length, count);
  assert.equal((await call('/api/data/customers?store_id=store_001', { cookie })).status, 400);
  assert.equal(queried.filter(row => row.table !== 'employees').length, 0);
});

test('login/logout require safe request shapes, same Origin and JSON; malformed requests leave server alive', async t => {
  const { call, queried, authCalls } = await setup(t);
  for (const body of [null, [], {}, { email: 'a', password: 'b', storeId: 'store_001' }]) {
    assert.equal((await call('/api/staff-read/login', { method: 'POST', body })).status, 400);
  }
  assert.equal((await call('/api/staff-read/login', { method: 'POST', body: {}, headers: { Origin: '' } })).status, 403);
  assert.equal((await call('/api/staff-read/login', { method: 'POST', body: {}, headers: { Origin: 'https://evil.example.test' } })).status, 403);
  assert.equal((await call('/api/staff-read/login', { method: 'POST', body: {}, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await call('/api/staff-read/session?token=ignored')).status, 400);
  assert.equal((await call('/api/staff-read/logout', { method: 'POST', body: { anything: true } })).status, 400);
  assert.equal((await call('/health')).status, 200);
  assert.deepEqual(queried, []);
  assert.deepEqual(authCalls, []);
});

test('missing/partial staff config stays closed on public deployments', async t => {
  const { call, queried, authCalls } = await setup(t, { publishableKey: '' });
  const session = await call('/api/staff-read/session');
  assert.equal(session.body.required, true);
  assert.equal(session.body.configured, false);
  assert.equal(session.body.errorCode, 'STAFF_AUTH_NOT_CONFIGURED');
  assert.equal((await call('/api/data/customers')).status, 503);
  assert.deepEqual(queried, []);
  assert.deepEqual(authCalls, []);
});
