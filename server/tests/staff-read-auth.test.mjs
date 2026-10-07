import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStaffReadAuth, staffReadAuthConfig } from '../staff-read-auth.mjs';

// Synthetic accounts and fake transports only. Never load process.env or call a service.
const origin = 'https://auth.example.test';
const key = 'sb_publishable_synthetic_fixture';
const userId = 'a1111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const account = { authUserId: userId, employeeId: 'employee_001', storeId: 'store_005' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const credentials = { email: 'staff@example.test', password: 'fixture-password-never-return' };
const factor = { id: 'b1111111-1111-4111-8111-111111111111', factor_type: 'totp', status: 'unverified',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
const cookie = result => result.setCookie.split(';')[0];
const failure = (status, errorCode) => ({ ok: false, status, errorCode });

function setup(options = {}) {
  const state = {
    time: Date.parse('2026-10-07T01:00:00Z'),
    user: { id: userId, is_anonymous: false, email_confirmed_at: '2026-01-01T00:00:00Z',
      user_metadata: { store_id: 'store_999', employee_id: 'employee_999' }, app_metadata: { role: 'admin' } },
    employee: { id: 'employee_001', store_id: 'store_005', name: '테스트직원', private: 'never-projected' },
    calls: [], reads: [], userHook: null, tokenHook: null, providerHook: null,
    expiresIn: 3600, expiresAt: undefined, token: 'synthetic-access-token', ...options.state,
  };
  const fetchImpl = async (url, init) => {
    state.calls.push({ url, init });
    if (url === origin + '/auth/v1/token?grant_type=password') {
      if (state.tokenHook) return state.tokenHook(url, init);
      return json({ access_token: state.token, refresh_token: 'refresh-fixture-never-return', token_type: 'bearer',
        expires_in: state.expiresIn, expires_at: state.expiresAt, user: { id: state.user.id } });
    }
    assert.equal(url, origin + '/auth/v1/user');
    return state.userHook ? state.userHook(url, init) : json(state.user);
  };
  const provider = {
    async readOne(table, query) {
      state.reads.push({ table, query });
      return state.providerHook ? state.providerHook(table, query) : { ok: true, data: state.employee };
    },
  };
  const auth = createStaffReadAuth({ supabaseUrl: origin, publishableKey: key, accountsJson: JSON.stringify([account]),
    homeStoreId: 'store_005', provider, secure: true, fetchImpl, now: () => state.time, ...options.factory });
  return { auth, state, provider, fetchImpl };
}

test('configuration reads only dedicated server auth variables and never falls back to privileged keys', () => {
  assert.deepEqual(staffReadAuthConfig({}), { supabaseUrl: '', publishableKey: '', accountsJson: '' });
  assert.deepEqual(staffReadAuthConfig({ SUPABASE_URL: ' ' + origin + '/// ', SUPABASE_AUTH_PUBLISHABLE_KEY: ' ' + key + ' ',
    STAFF_READ_ACCOUNTS_JSON: ' [] ', SUPABASE_SERVICE_ROLE_KEY: 'do-not-use', SUPABASE_READ_KEY: 'do-not-use' }),
  { supabaseUrl: origin, publishableKey: key, accountsJson: '[]' });
  assert.equal(createStaffReadAuth().configured, false);
});

test('invalid key, URL, home and allowlist fail closed before any transport or employee read', async () => {
  const bad = [
    { publishableKey: 'sb_secret_fixture' }, { publishableKey: 'header.service_role.signature' }, { publishableKey: 'sb_publishable_bad\r\n' },
    { supabaseUrl: 'http://auth.example.test' }, { supabaseUrl: origin + '/auth/v1' }, { supabaseUrl: 'https://user:pass@auth.example.test' },
    { supabaseUrl: origin + '?secret=value' }, { homeStoreId: 'store_005,store_999' },
    ...['null', '{}', '[]', '{invalid', JSON.stringify([account, account]),
      JSON.stringify([account, { ...account, authUserId: otherId }]),
      JSON.stringify([{ ...account, authUserId: 'not-a-uuid' }]),
      JSON.stringify([{ ...account, employeeId: 'employee_001&store_id=eq.store_999' }]),
      JSON.stringify([{ ...account, extra: 'forbidden' }]),
      JSON.stringify(Array.from({ length: 101 }, () => account)),
      JSON.stringify([account, { ...account, authUserId: userId.toUpperCase(), employeeId: 'employee_002' }]),
    ].map(accountsJson => ({ accountsJson })),
  ];
  for (const factory of bad) {
    const { auth, state } = setup({ factory });
    assert.equal(auth.configured, false);
    assert.equal(auth.configError, 'STAFF_CONFIG_INVALID');
    const result = await auth.login(credentials);
    assert.equal(result.status, 503);
    assert.equal(result.body.errorCode, 'STAFF_CONFIG_INVALID');
    assert.equal(state.calls.length, 0);
    assert.equal(state.reads.length, 0);
  }
});

test('password REST then authentic GET /user precede scoped staff read; only opaque cookie and masked identity return', async () => {
  const { auth, state } = setup();
  const result = await auth.login({ email: ' Staff@Example.test ', password: credentials.password, employeeId: 'employee_999', storeId: 'store_999' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { authenticated: true, employee: { employeeId: 'employee_001', storeId: 'store_005', nameMasked: '테***원' },
    expiresAt: state.time + 30 * 60_000, errorCode: null });
  assert.match(result.setCookie, /^__Host-kcm-staff-read=[A-Za-z0-9_-]{43}; Max-Age=1800; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
  assert.deepEqual(state.calls.map(call => new URL(call.url).pathname), ['/auth/v1/token', '/auth/v1/user']);
  const tokenRequest = state.calls[0].init;
  assert.equal(tokenRequest.method, 'POST');
  assert.equal(tokenRequest.headers.apikey, key);
  assert.equal(tokenRequest.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(tokenRequest.body), { email: 'staff@example.test', password: credentials.password });
  const userRequest = state.calls[1].init;
  assert.equal(userRequest.method, 'GET');
  assert.equal(userRequest.headers.Authorization, 'Bearer synthetic-access-token');
  assert.equal(userRequest.headers.apikey, key);
  for (const call of state.calls) assert.equal(call.init.redirect, 'manual');
  assert.deepEqual(state.reads, [{ table: 'employees', query: { select: 'id,store_id,name',
    filters: { id: 'eq.employee_001', store_id: 'eq.store_005' }, limit: 1 } }]);
  const serialized = JSON.stringify(result);
  for (const secret of [credentials.password, 'synthetic-access-token', 'refresh-fixture', key, 'never-projected', '테스트직원']) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.deepEqual(await auth.authorize('other=value; ' + cookie(result)), { ok: true, identity: result.body.employee, expiresAt: result.body.expiresAt });
  assert.equal(state.calls.length, 3, 'each read re-verifies at Auth');
  assert.equal(state.reads.length, 2, 'each read rechecks actual employee scope');
});

test('local development cookie uses same HttpOnly strict scope without Secure', async () => {
  const { auth } = setup({ factory: { secure: false } });
  const result = await auth.login(credentials);
  assert.match(result.setCookie, /^kcm-staff-read=/);
  assert.match(result.setCookie, /; Path=\/; HttpOnly; SameSite=Strict$/);
  assert.equal(result.setCookie.includes('Secure'), false);
});

test('missing, forged, duplicate and restarted cookies never contact Auth or business data', async () => {
  const { auth, state } = setup();
  assert.deepEqual(await auth.authorize(), failure(401, 'STAFF_LOGIN_REQUIRED'));
  assert.deepEqual(await auth.authorize('other=value'), failure(401, 'STAFF_LOGIN_REQUIRED'));
  for (const value of ['bad', 'A'.repeat(43)]) {
    assert.deepEqual(await auth.authorize('__Host-kcm-staff-read=' + value), failure(401, 'STAFF_SESSION_EXPIRED'));
  }
  const result = await auth.login(credentials);
  const sessionCookie = cookie(result);
  const duplicate = sessionCookie + '; ' + sessionCookie;
  const length = state.calls.length;
  assert.deepEqual(await auth.authorize(duplicate), failure(401, 'STAFF_SESSION_EXPIRED'));
  const { auth: restarted, state: fresh } = setup();
  assert.deepEqual(await restarted.authorize(sessionCookie), failure(401, 'STAFF_SESSION_EXPIRED'));
  assert.equal(fresh.calls.length, 0);
  assert.equal(state.calls.length, length);
});

test('unknown, different-store, anonymous, unconfirmed, banned and mismatched Auth identity cannot borrow metadata scope', async () => {
  const users = [
    { id: otherId }, { is_anonymous: true }, { is_anonymous: undefined },
    { email_confirmed_at: null }, { email_confirmed_at: 'bad-date' }, { banned_until: '2026-12-01T00:00:00Z' },
    { banned_until: 'malformed' }, { banned_until: 1 },
  ];
  for (const patch of users) {
    const { auth, state } = setup();
    state.user = { ...state.user, ...patch };
    const result = await auth.login(credentials);
    assert.equal(result.status, 403);
    assert.equal(result.body.errorCode, 'STAFF_ACCESS_DENIED');
    assert.equal(state.reads.length, 0);
    assert.match(result.setCookie, /Max-Age=0/);
  }
  const { auth, state } = setup({ factory: { accountsJson: JSON.stringify([{ ...account, storeId: 'store_999' }]) } });
  assert.equal((await auth.login(credentials)).status, 403);
  assert.equal(state.reads.length, 0);
  const mismatched = setup();
  mismatched.state.userHook = () => json({ ...mismatched.state.user, id: otherId });
  assert.equal((await mismatched.auth.login(credentials)).status, 403);
  assert.equal(mismatched.state.reads.length, 0);
});

test('canonical UUID normalization matches uppercase trusted account once without relaxing duplicates', async () => {
  const { auth } = setup({ factory: { accountsJson: JSON.stringify([{ ...account, authUserId: userId.toUpperCase() }]) } });
  assert.equal((await auth.login(credentials)).status, 200);
});

test('enabled MFA factors deny password-only login for all known types before employee read', async () => {
  for (const factor_type of ['totp', 'phone', 'webauthn']) {
    const { auth, state } = setup();
    state.user.factors = [{ ...factor, factor_type, status: 'verified' }];
    const result = await auth.login(credentials);
    assert.equal(result.status, 403);
    assert.equal(result.body.errorCode, 'STAFF_ACCESS_DENIED');
    assert.equal(result.body.authenticated, false);
    assert.match(result.setCookie, /Max-Age=0/);
    assert.equal(state.reads.length, 0);
  }
});

test('MFA enabled after login denies the next read and permanently discards its password-only session', async () => {
  const { auth, state } = setup();
  const result = await auth.login(credentials);
  state.user.factors = [{ ...factor, status: 'verified' }];
  assert.deepEqual(await auth.authorize(cookie(result)), failure(403, 'STAFF_ACCESS_DENIED'));
  assert.equal(state.reads.length, 1, 'MFA guard precedes the new staff membership read');
  state.user.factors = [];
  const count = state.calls.length;
  assert.deepEqual(await auth.authorize(cookie(result)), failure(401, 'STAFF_SESSION_EXPIRED'));
  assert.equal(state.calls.length, count);
});

test('missing, empty or valid unverified factors keep ordinary staff login usable', async () => {
  for (const factors of [undefined, [], [{ ...factor, friendly_name: 'synthetic-enrollment' }]]) {
    const { auth, state } = setup();
    state.user.factors = factors;
    const result = await auth.login(credentials);
    assert.equal(result.status, 200);
    assert.equal((await auth.authorize(cookie(result))).ok, true);
    assert.equal(JSON.stringify(result).includes('synthetic-enrollment'), false);
  }
});

test('malformed or unknown MFA arrays and factors deny both login and existing session reads', async () => {
  const malformed = [null, {}, 'unknown', [null], [[]], [{}],
    [{ ...factor, id: 'invalid' }], [{ ...factor, status: 'unknown' }], [{ ...factor, status: null }],
    [{ ...factor, factor_type: 'future-unknown-factor' }], [{ ...factor, factor_type: ['totp'] }],
    [{ ...factor, created_at: 'bad-date' }], [{ ...factor, updated_at: null }],
    [{ ...factor, friendly_name: {} }], [factor, { ...factor, id: factor.id.toUpperCase() }],
    Array.from({ length: 101 }, () => factor),
  ];
  for (const factors of malformed) {
    const { auth, state } = setup();
    const existing = await auth.login(credentials);
    state.user.factors = factors;
    assert.deepEqual(await auth.authorize(cookie(existing)), failure(403, 'STAFF_ACCESS_DENIED'));
    const deniedLogin = await auth.login(credentials);
    assert.equal(deniedLogin.status, 403);
    assert.equal(deniedLogin.body.errorCode, 'STAFF_ACCESS_DENIED');
    assert.equal(state.reads.length, 1);
  }
});

test('employee absence, transfer, wrong ID or invalid stored name denies login and later access', async () => {
  for (const patch of [null, { id: 'employee_999' }, { store_id: 'store_999' }, { name: '' }, { name: 'bad\nname' }]) {
    const { auth, state } = setup();
    const result = await auth.login(credentials);
    state.employee = patch === null ? null : { ...state.employee, ...patch };
    assert.deepEqual(await auth.authorize(cookie(result)), failure(403, 'STAFF_ACCESS_DENIED'));
    const calls = state.calls.length;
    assert.deepEqual(await auth.authorize(cookie(result)), failure(401, 'STAFF_SESSION_EXPIRED'));
    assert.equal(state.calls.length, calls, 'denied membership discards session');
  }
});

test('upstream Auth revocation destroys session before any employee read', async () => {
  const { auth, state } = setup();
  const result = await auth.login(credentials);
  state.userHook = () => json({ message: 'secret-upstream-error' }, 401);
  assert.deepEqual(await auth.authorize(cookie(result)), failure(401, 'STAFF_SESSION_EXPIRED'));
  assert.equal(state.reads.length, 1);
  state.userHook = null;
  assert.deepEqual(await auth.authorize(cookie(result)), failure(401, 'STAFF_SESSION_EXPIRED'));
});

test('token expiry, explicit expires_at and 30 minute lifetime are enforced without refresh', async () => {
  const variants = [
    { expiresIn: 60, duration: 60_000 },
    { expiresIn: 3600, duration: 1_800_000 },
    { expiresIn: 3600, expiresAt: Date.parse('2026-10-07T01:02:00Z') / 1000, duration: 120_000 },
  ];
  for (const variant of variants) {
    const { auth, state } = setup({ state: variant });
    const result = await auth.login(credentials);
    assert.equal(result.body.expiresAt, state.time + variant.duration);
    state.time += variant.duration;
    const count = state.calls.length;
    assert.deepEqual(await auth.authorize(cookie(result)), failure(401, 'STAFF_SESSION_EXPIRED'));
    assert.equal(state.calls.length, count);
  }
  const jwtExpiry = Date.parse('2026-10-07T01:01:30Z') / 1000;
  const token = 'eyJhbGciOiJSUzI1NiJ9.' + Buffer.from(JSON.stringify({ exp: jwtExpiry })).toString('base64url') + '.fixture';
  const { auth, state } = setup({ state: { token } });
  assert.equal((await auth.login(credentials)).body.expiresAt, state.time + 90_000);
});

test('logout synchronously destroys session and clears matching cookie with masked unauthenticated response', async () => {
  const { auth } = setup();
  const result = await auth.login(credentials);
  const loggedOut = auth.logout(cookie(result));
  assert.deepEqual(loggedOut.body, { authenticated: false, employee: null, expiresAt: null, errorCode: null });
  assert.equal(loggedOut.status, 200);
  assert.match(loggedOut.setCookie, /^__Host-kcm-staff-read=; Max-Age=0; Expires=.*; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
  assert.deepEqual(await auth.authorize(cookie(result)), failure(401, 'STAFF_SESSION_EXPIRED'));
});

test('subsequent login rotates and discards old session, including unsuccessful replacement', async () => {
  const { auth, state } = setup();
  const first = await auth.login(credentials);
  const second = await auth.login(credentials, cookie(first));
  assert.notEqual(cookie(first), cookie(second));
  assert.deepEqual(await auth.authorize(cookie(first)), failure(401, 'STAFF_SESSION_EXPIRED'));
  state.tokenHook = () => json({ error: 'invalid_grant', description: credentials.password }, 400);
  const failed = await auth.login(credentials, cookie(second));
  assert.equal(failed.status, 401);
  assert.equal(failed.body.errorCode, 'STAFF_LOGIN_FAILED');
  assert.equal(JSON.stringify(failed).includes(credentials.password), false);
  assert.deepEqual(await auth.authorize(cookie(second)), failure(401, 'STAFF_SESSION_EXPIRED'));
});

test('malformed inputs never submit credentials; normalized email rate limit resists casing changes and expires', async () => {
  const { auth, state } = setup();
  for (const input of [null, [], 1, 'unexpected', {}, { email: [] }, { email: 'bad', password: 'x' }, { ...credentials, password: '' }, { ...credentials, password: 'x'.repeat(1025) }]) {
    assert.equal((await auth.login(input)).status, 400);
  }
  assert.equal(state.calls.length, 0);
  state.tokenHook = () => json({ error: 'invalid_credentials' }, 400);
  for (let index = 0; index < 5; index++) assert.equal((await auth.login(credentials)).status, 401);
  assert.equal((await auth.login({ ...credentials, email: ' STAFF@EXAMPLE.TEST ' })).status, 429);
  assert.equal(state.calls.length, 5);
  state.time += 15 * 60_000;
  assert.equal((await auth.login(credentials)).status, 401);
});

test('global login cap works across unique email addresses and does not use request IP headers', async () => {
  const { auth, state } = setup();
  state.tokenHook = () => json({}, 400);
  for (let index = 0; index < 30; index++) {
    assert.equal((await auth.login({ ...credentials, email: `staff${index}@example.test`, ip: 'forged-IP-' + index })).status, 401);
  }
  const blocked = await auth.login({ ...credentials, email: 'different@example.test' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.errorCode, 'STAFF_RATE_LIMITED');
  assert.equal(state.calls.length, 30);
  state.time += 60_000;
  assert.equal((await auth.login({ ...credentials, email: 'different@example.test' })).status, 401);
});

test('Auth and provider failures have fixed safe 503 responses, block reads, and allow recovered sessions', async () => {
  const { auth, state } = setup();
  const result = await auth.login(credentials);
  for (const hook of [() => json({ token: 'do-not-forward' }, 500), () => new Response('invalid json'),
    () => Promise.reject(new Error(credentials.password)), () => new Response('{}', { status: 302, headers: { Location: 'https://evil.example.test/' } }),
    () => json({ padding: 'x'.repeat(128001) })]) {
    state.userHook = hook;
    assert.deepEqual(await auth.authorize(cookie(result)), failure(503, 'STAFF_AUTH_UNAVAILABLE'));
    assert.equal(state.reads.length, 1);
  }
  state.userHook = null;
  state.providerHook = () => ({ ok: false, code: 'some-secret-provider-error' });
  assert.deepEqual(await auth.authorize(cookie(result)), failure(503, 'STAFF_AUTH_UNAVAILABLE'));
  state.providerHook = () => { throw new Error('private failure'); };
  assert.deepEqual(await auth.authorize(cookie(result)), failure(503, 'STAFF_AUTH_UNAVAILABLE'));
  state.providerHook = null;
  assert.equal((await auth.authorize(cookie(result))).ok, true);
});

test('invalid token responses and unavailable token endpoint never generate usable session', async () => {
  for (const body of [null, [], {}, { access_token: 'bad\nheader', expires_in: 3600, user: { id: userId } },
    { access_token: 'synthetic', expires_in: 0, user: { id: userId } },
    { access_token: 'synthetic', expires_in: 3600, expires_at: 'invalid', user: { id: userId } },
    { access_token: 'bad.bad.bad', expires_in: 3600, user: { id: userId } }]) {
    const { auth, state } = setup();
    state.tokenHook = () => json(body);
    const result = await auth.login(credentials);
    assert.equal(result.status, 503);
    assert.equal(result.body.authenticated, false);
    assert.equal(state.reads.length, 0);
  }
  const { auth, state } = setup();
  state.tokenHook = () => json({ password: credentials.password }, 503);
  const result = await auth.login(credentials);
  assert.equal(result.body.errorCode, 'STAFF_AUTH_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes(credentials.password), false);
});

test('logout and expiry racing Auth verification cannot revive an in-flight session', async () => {
  for (const operation of ['logout', 'expire']) {
    const { auth, state } = setup();
    const loggedIn = await auth.login(credentials);
    let resolve;
    state.userHook = () => new Promise(done => { resolve = done; });
    const pending = auth.authorize(cookie(loggedIn));
    if (operation === 'logout') auth.logout(cookie(loggedIn)); else state.time += 30 * 60_000;
    resolve(json(state.user));
    assert.deepEqual(await pending, failure(401, 'STAFF_SESSION_EXPIRED'));
    assert.equal(state.reads.length, 1, 'logout/expiry during Auth prevents even the staff membership read');
  }
});

test('logout racing staff membership read also discards the final result', async () => {
  const { auth, state } = setup();
  const loggedIn = await auth.login(credentials);
  let resolve;
  let entered;
  const started = new Promise(done => { entered = done; });
  state.providerHook = () => new Promise(done => { resolve = done; entered(); });
  const pending = auth.authorize(cookie(loggedIn));
  await started;
  auth.logout(cookie(loggedIn));
  resolve({ ok: true, data: state.employee });
  assert.deepEqual(await pending, failure(401, 'STAFF_SESSION_EXPIRED'));
});

test('close clears all handles and aborts pending requests; no late login can issue cookie', async () => {
  const { auth, state } = setup();
  const result = await auth.login(credentials);
  let signal;
  state.tokenHook = (_url, init) => { signal = init.signal; return new Promise(() => {}); };
  const pending = auth.login({ ...credentials, email: 'second@example.test' });
  auth.close();
  assert.equal(signal.aborted, true);
  assert.equal((await pending).status, 503);
  assert.deepEqual(await auth.authorize(cookie(result)), failure(503, 'STAFF_AUTH_UNAVAILABLE'));
});

test('session capacity is bounded at 500; expiry pruning frees space without silently replacing valid sessions', async () => {
  const { auth, state } = setup();
  let first;
  for (let index = 0; index < 500; index++) {
    if (index > 0 && index % 30 === 0) state.time += 60_000;
    const result = await auth.login({ ...credentials, email: `staff${index}@example.test` });
    assert.equal(result.status, 200, 'synthetic session ' + index);
    first ??= result;
  }
  const full = await auth.login({ ...credentials, email: 'overflow@example.test' });
  assert.equal(full.status, 503);
  assert.equal((await auth.authorize(cookie(first))).ok, true);
  state.time += 30 * 60_000;
  assert.equal((await auth.login({ ...credentials, email: 'after-expiry@example.test' })).status, 200);
});

test('a hung Auth transport is aborted within the fixed timeout with a safe unavailable response', { timeout: 7000 }, async () => {
  const { auth, state } = setup();
  let signal;
  state.tokenHook = (_url, init) => { signal = init.signal; return new Promise(() => {}); };
  const result = await auth.login(credentials);
  assert.equal(signal.aborted, true);
  assert.equal(result.status, 503);
  assert.equal(result.body.errorCode, 'STAFF_AUTH_UNAVAILABLE');
});
