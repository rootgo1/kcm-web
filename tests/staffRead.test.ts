import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaffReadApi, createStaffReadController, parseStaffReadLogin, parseStaffReadSession, StaffReadApiError,
  staffReadCanShowData, staffReadErrorCode, staffReadErrorMessage, staffReadIdentityLabel, type StaffReadClient, type StaffReadLogin,
  type StaffReadSession } from '../src/services/staffReadApi.js';

// Synthetic responses only. No real accounts, browser credentials, or external requests.
const clock = 1_800_000_000_000;
const employee = { employeeId: 'employee_001', storeId: 'store_005', nameMasked: '테*트' };
const readAccount = { employeeId: null, storeId: 'store_005', nameMasked: '조회 계정' };
const loggedIn = (over: Partial<StaffReadLogin> = {}): StaffReadLogin => ({ authenticated: true, employee,
  expiresAt: clock + 60_000, errorCode: null, ...over });
const loggedOut = (over: Partial<StaffReadLogin> = {}): StaffReadLogin => ({ authenticated: false, employee: null,
  expiresAt: null, errorCode: null, ...over });
const session = (over: Partial<StaffReadSession> = {}): StaffReadSession => ({ required: true, configured: true, ...loggedIn(), ...over });
const invalid = (error: unknown) => { assert.ok(error instanceof StaffReadApiError); assert.equal(error.code, 'STAFF_AUTH_UNAVAILABLE'); return true; };
const fakeFetch = (implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => implementation as typeof fetch;
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(over: Partial<StaffReadClient> = {}) {
  let time = clock;
  const timers: { action: () => void; delay: number; active: boolean }[] = [];
  const client: StaffReadClient = { session: async () => session(), login: async () => loggedIn(), logout: async () => loggedOut(), ...over };
  const controller = createStaffReadController({ client, now: () => time, schedule: (action, delay) => {
    const timer = { action, delay, active: true }; timers.push(timer); return () => { timer.active = false; };
  } });
  return { controller, timers, setTime: (value: number) => { time = value; },
    expire: () => { const timer = [...timers].reverse().find(item => item.active); assert.ok(timer); timer.active = false; timer.action(); } };
}

test('직원 조회: 응답은 직원 ID·매장 ID·마스킹 이름·만료 시각만 재구성한다', () => {
  const result = parseStaffReadSession({ ...session(), access_token: 'synthetic-token-canary', refresh_token: 'synthetic-refresh-canary',
    email: 'private@example.invalid', employee: { ...employee, email: 'private@example.invalid', phone: 'private-phone-canary' } });
  assert.deepEqual(result, session()); assert.notEqual(result.employee, employee);
  assert.doesNotMatch(JSON.stringify(result), /canary|@|phone|token/);
  assert.deepEqual(parseStaffReadLogin(loggedOut()), loggedOut());
});

test('고객 조회 계정: 실제 직원 연결이 없는 승인 계정은 null ID를 유지하고 직원으로 표시하지 않는다', () => {
  const result = parseStaffReadSession(session({ employee: readAccount }));
  assert.deepEqual(result.employee, readAccount); assert.equal(result.employee?.employeeId, null);
  assert.deepEqual(parseStaffReadLogin(loggedIn({ employee: readAccount })).employee, readAccount);
  assert.deepEqual(staffReadIdentityLabel(readAccount), { title: '매장 고객 자료 조회 계정', details: 'store_005 · 조회 전용' });
  assert.deepEqual(staffReadIdentityLabel(employee), { title: '테*트 직원 · 고객 자료 조회', details: 'employee_001 · store_005' });
  assert.doesNotMatch(JSON.stringify(staffReadIdentityLabel(readAccount)), /직원|employee_|null/);
});

test('고객 조회 계정: null ID는 고정 조회 계정 표시와 유효한 매장 ID가 함께 있을 때만 허용한다', () => {
  for (const identity of [null, {}, { ...readAccount, employeeId: undefined }, { ...readAccount, employeeId: '' },
    { ...readAccount, employeeId: 0 }, { ...readAccount, employeeId: 'employee_demo' }, { ...readAccount, storeId: null },
    { ...readAccount, storeId: 'store_other' }, { ...readAccount, nameMasked: undefined }, { ...readAccount, nameMasked: '직원' },
    { ...readAccount, nameMasked: '조회 계정 ' }, { ...readAccount, nameMasked: '조회 계정\n' }]) {
    assert.throws(() => parseStaffReadLogin({ ...loggedIn(), employee: identity }), invalid);
  }
  assert.throws(() => parseStaffReadLogin({ ...loggedOut(), employee: readAccount }), invalid);
  assert.throws(() => parseStaffReadSession(session({ configured: false, employee: readAccount })), invalid);
});

test('고객 조회 계정: scope·접근 종류·권한 필드는 DTO에서 제거하고 프런트 접근 권한으로 사용하지 않는다', () => {
  const incoming = { ...session({ employee: readAccount }), scope: 'customers:write', accessKind: 'admin', authenticatedByScope: true,
    employee: { ...readAccount, scope: 'customers:read', accessKind: 'staff', role: 'admin' } };
  const result = parseStaffReadSession(incoming);
  assert.deepEqual(result, session({ employee: readAccount })); assert.doesNotMatch(JSON.stringify(result), /scope|accessKind|admin|role/);
  const noLogin = parseStaffReadSession({ required: true, configured: true, ...loggedOut(), scope: 'customers:read', accessKind: 'admin' });
  assert.equal(staffReadCanShowData({ phase: 'ready', session: noLogin, errorCode: null }), false);
  assert.throws(() => parseStaffReadSession({ ...incoming, authenticated: false }), invalid);
  assert.throws(() => parseStaffReadSession({ ...session(), employee: { storeId: 'store_005', scope: 'customers:read', accessKind: 'reader' } }), invalid);
});

test('직원 조회: 인증 응답의 필수 항목·타입·연결 ID·만료 시각 모순은 차단한다', () => {
  for (const value of [null, [], {}, { ...loggedIn(), authenticated: 'true' }, { ...loggedIn(), errorCode: 'unknown' },
    { ...loggedIn(), errorCode: 'STAFF_ACCESS_DENIED' }, { ...loggedIn(), employee: null },
    { ...loggedIn(), employee: { ...employee, employeeId: 'customer_001' } }, { ...loggedIn(), employee: { ...employee, storeId: 'store_bad' } },
    { ...loggedIn(), employee: { ...employee, nameMasked: '' } }, { ...loggedIn(), employee: { ...employee, nameMasked: 'secret\nvalue' } },
    ...[null, 0, -1, 1.5, '1800000000000', Number.NaN, Number.POSITIVE_INFINITY].map(expiresAt => ({ ...loggedIn(), expiresAt })),
    { ...loggedOut(), employee }, { ...loggedOut(), expiresAt: clock }]) assert.throws(() => parseStaffReadLogin(value), invalid);
  for (const value of [{ ...session(), required: 'true' }, { ...session(), configured: false }, { ...session(), configured: undefined }]) {
    assert.throws(() => parseStaffReadSession(value), invalid);
  }
});

test('직원 조회: 로컬·설정 누락·미인증 응답을 구분하고 알 수 없는 오류는 안전한 문구로 표시한다', () => {
  assert.deepEqual(parseStaffReadSession({ required: false, configured: false, ...loggedOut() }), { required: false, configured: false, ...loggedOut() });
  assert.deepEqual(parseStaffReadSession({ required: true, configured: false, ...loggedOut({ errorCode: 'STAFF_AUTH_NOT_CONFIGURED' }) }),
    { required: true, configured: false, ...loggedOut({ errorCode: 'STAFF_AUTH_NOT_CONFIGURED' }) });
  for (const value of ['unknown', '__proto__', 'constructor', 'toString', '<private raw error>', null]) {
    assert.equal(staffReadErrorCode(value), 'STAFF_AUTH_UNAVAILABLE'); assert.doesNotMatch(staffReadErrorMessage(value), /private|unknown|proto/);
  }
});

test('직원 조회: 고정 같은 출처 경로와 쿠키를 사용하고 로그인 비밀번호는 요청 본문에만 둔다', async () => {
  const calls: { path: string; init: RequestInit }[] = [];
  const api = createStaffReadApi(fakeFetch(async (path, init = {}) => {
    calls.push({ path: String(path), init });
    return Response.json(String(path).endsWith('/session') ? session() : String(path).endsWith('/login') ? loggedIn() : loggedOut());
  }));
  const controller = new AbortController();
  assert.deepEqual(await api.session(controller.signal), session());
  assert.deepEqual(await api.login('staff@example.invalid', 'synthetic-password-canary', controller.signal), loggedIn());
  assert.deepEqual(await api.logout(controller.signal), loggedOut());
  assert.deepEqual(calls.map(call => call.path), ['/api/staff-read/session', '/api/staff-read/login', '/api/staff-read/logout']);
  assert.deepEqual(calls.map(call => call.init.method), ['GET', 'POST', 'POST']);
  for (const call of calls) {
    assert.equal(call.init.credentials, 'same-origin'); assert.equal(call.init.cache, 'no-store'); assert.equal(call.init.redirect, 'error');
    assert.equal(call.init.signal, controller.signal); assert.equal(new Headers(call.init.headers).get('Authorization'), null);
    assert.doesNotMatch(call.path + JSON.stringify(call.init.headers), /password|canary|token/);
  }
  assert.equal(calls[0].init.body, undefined); assert.deepEqual(JSON.parse(String(calls[1].init.body)), { email: 'staff@example.invalid', password: 'synthetic-password-canary' });
  assert.equal(calls[2].init.body, '{}');
});

test('직원 조회: 401·403·429·503은 성공 DTO처럼 보여도 인증으로 수용하지 않는다', async () => {
  for (const [status, expected] of [[401, 'STAFF_LOGIN_FAILED'], [403, 'STAFF_ACCESS_DENIED'], [429, 'STAFF_RATE_LIMITED'], [503, 'STAFF_AUTH_UNAVAILABLE']] as const) {
    const api = createStaffReadApi(fakeFetch(async () => Response.json(loggedIn(), { status })));
    await assert.rejects(api.login('staff@example.invalid', 'synthetic-only'), error => error instanceof StaffReadApiError && error.code === expected);
  }
  const api = createStaffReadApi(fakeFetch(async () => Response.json({ errorCode: 'STAFF_SESSION_EXPIRED', raw: 'private-canary' }, { status: 401 })));
  await assert.rejects(api.session(), error => error instanceof StaffReadApiError && error.code === 'STAFF_SESSION_EXPIRED');
});

test('직원 조회: 비정상 JSON·알 수 없는 오류·다른 성공 상태·통신 실패는 원문을 노출하지 않는다', async () => {
  for (const response of [new Response('private-canary', { status: 502 }), Response.json({ errorCode: 'private-canary' }, { status: 403 }),
    Response.json(loggedIn(), { status: 201 }), Response.json({ authenticated: true }, { status: 200 })]) {
    const api = createStaffReadApi(fakeFetch(async () => response)); await assert.rejects(api.login('synthetic@example.invalid', 'synthetic'), invalid);
  }
  const api = createStaffReadApi(fakeFetch(async () => { throw new Error('private-canary'); })); await assert.rejects(api.session(), invalid);
});

test('직원 조회: 취소된 응답은 JSON이 정상이어도 재사용하지 않는다', async () => {
  const pending = deferred<Response>(); const controller = new AbortController();
  const api = createStaffReadApi(fakeFetch(async () => pending.promise)); const result = api.session(controller.signal);
  controller.abort(); pending.resolve(Response.json(session())); await assert.rejects(result, error => error instanceof DOMException && error.name === 'AbortError');
});

test('직원 조회: 확인 전·확인 중·오류에는 자료를 허용하지 않고 로컬 예외만 그대로 통과한다', async () => {
  const first = fixture(); assert.equal(staffReadCanShowData(first.controller.getSnapshot()), false);
  await first.controller.checkSession(); assert.equal(staffReadCanShowData(first.controller.getSnapshot()), true);
  const local = fixture({ session: async () => ({ required: false, configured: false, ...loggedOut() }) });
  await local.controller.checkSession(); assert.equal(staffReadCanShowData(local.controller.getSnapshot()), true);
  const missing = fixture({ session: async () => ({ required: true, configured: false, ...loggedOut({ errorCode: 'STAFF_AUTH_NOT_CONFIGURED' }) }) });
  await missing.controller.checkSession(); assert.equal(staffReadCanShowData(missing.controller.getSnapshot()), false);
  const denied = fixture({ session: async () => { throw new StaffReadApiError('STAFF_ACCESS_DENIED'); } });
  await denied.controller.checkSession(); assert.equal(staffReadCanShowData(denied.controller.getSnapshot()), false); assert.equal(denied.controller.getSnapshot().session, null);
});

test('직원 조회: 동시에 발생한 focus·visibility 확인은 하나의 요청으로 합친다', async () => {
  const pending = deferred<StaffReadSession>(); let count = 0;
  const f = fixture({ session: async () => { count += 1; return pending.promise; } });
  const first = f.controller.checkSession(); const second = f.controller.checkSession();
  assert.equal(first, second); assert.equal(count, 1); pending.resolve(session()); await first;
  assert.equal(staffReadCanShowData(f.controller.getSnapshot()), true);
});

test('직원 조회: 새 확인이 시작되면 이전 직원 정보·자료를 즉시 제거한다', async () => {
  let next: Promise<StaffReadSession> = Promise.resolve(session()); const f = fixture({ session: async () => next });
  await f.controller.checkSession(); const pending = deferred<StaffReadSession>(); next = pending.promise;
  const checking = f.controller.checkSession(); assert.equal(f.controller.getSnapshot().session, null); assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false);
  pending.resolve({ required: true, configured: true, ...loggedOut({ errorCode: 'STAFF_LOGIN_REQUIRED' }) }); await checking;
  assert.equal(f.controller.getSnapshot().session?.employee, null); assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false);
});

test('직원 조회: 이전 세션 응답이 다른 계정 로그인 뒤에 도착해도 덮어쓰지 않는다', async () => {
  const pending = deferred<StaffReadSession>(); let oldSignal: AbortSignal | undefined;
  const other = { employeeId: 'employee_002', storeId: 'store_005', nameMasked: '다*원' };
  const f = fixture({ session: async signal => { oldSignal = signal; return pending.promise; }, login: async () => loggedIn({ employee: other }) });
  const checking = f.controller.checkSession(); await f.controller.login('other@example.invalid', 'synthetic-password-canary');
  assert.equal(oldSignal?.aborted, true); pending.resolve(session()); await checking;
  assert.deepEqual(f.controller.getSnapshot().session?.employee, other); assert.doesNotMatch(JSON.stringify(f.controller.getSnapshot()), /@|password|canary/);
});

test('직원 조회: 실패한 계정 전환은 이전 계정 자료를 복원하지 않는다', async () => {
  const f = fixture({ login: async () => { throw new StaffReadApiError('STAFF_LOGIN_FAILED'); } }); await f.controller.checkSession();
  await f.controller.login('other@example.invalid', 'synthetic-password-canary');
  assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false); assert.equal(f.controller.getSnapshot().session?.employee, null);
  assert.equal(f.controller.getSnapshot().errorCode, 'STAFF_LOGIN_FAILED'); assert.doesNotMatch(JSON.stringify(f.controller.getSnapshot()), /@|password|canary/);
});

test('직원 조회: 만료 타이머는 권한과 직원 정보를 즉시 제거하고 이미 만료된 응답도 거절한다', async () => {
  const f = fixture(); await f.controller.checkSession(); assert.equal(f.timers[0].delay, 60_000);
  f.setTime(clock + 60_000); f.expire(); assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false);
  assert.equal(f.controller.getSnapshot().session?.employee, null); assert.equal(f.controller.getSnapshot().errorCode, 'STAFF_SESSION_EXPIRED');
  const old = fixture({ session: async () => session({ expiresAt: clock - 1 }) }); await old.controller.checkSession();
  assert.equal(staffReadCanShowData(old.controller.getSnapshot()), false); assert.equal(old.controller.getSnapshot().errorCode, 'STAFF_SESSION_EXPIRED');
});

test('직원 조회: 긴 만료 시간은 타이머 상한을 지키고 중간 타이머에서 로그인 상태를 유지한다', async () => {
  const f = fixture({ session: async () => session({ expiresAt: clock + 2_147_483_647 + 1_000 }) }); await f.controller.checkSession();
  assert.equal(f.timers[0].delay, 2_147_483_647); f.setTime(clock + 2_147_483_647); f.expire();
  assert.equal(staffReadCanShowData(f.controller.getSnapshot()), true); assert.equal(f.timers[1].delay, 1_000);
});

test('직원 조회: 권한 거부 이벤트는 진행 중 로그인·확인을 취소하고 늦은 성공을 무시한다', async () => {
  const pending = deferred<StaffReadLogin>(); let signal: AbortSignal | undefined;
  const f = fixture({ login: async (_email, _password, givenSignal) => { signal = givenSignal; return pending.promise; } });
  const loggingIn = f.controller.login('synthetic@example.invalid', 'synthetic'); f.controller.invalidate('STAFF_ACCESS_DENIED');
  assert.equal(signal?.aborted, true); pending.resolve(loggedIn()); await loggingIn;
  assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false); assert.equal(f.controller.getSnapshot().session?.employee, null);
  assert.equal(f.controller.getSnapshot().errorCode, 'STAFF_ACCESS_DENIED');
});

test('직원 조회: 로그아웃 요청을 기다리기 전에 자료를 제거하고 이전 확인 응답을 무시한다', async () => {
  const pendingSession = deferred<StaffReadSession>(); const pendingLogout = deferred<StaffReadLogin>(); let count = 0;
  const f = fixture({ session: async () => ++count === 1 ? session() : pendingSession.promise, logout: async () => pendingLogout.promise });
  await f.controller.checkSession(); const checking = f.controller.checkSession(); const loggingOut = f.controller.logout();
  assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false); assert.equal(f.controller.getSnapshot().session, null);
  pendingSession.resolve(session()); await checking; assert.equal(f.controller.getSnapshot().phase, 'signing-out');
  pendingLogout.resolve(loggedOut()); await loggingOut; assert.equal(f.controller.getSnapshot().session?.employee, null);
  assert.equal(f.controller.getSnapshot().errorCode, 'STAFF_LOGIN_REQUIRED');
});

test('직원 조회: 로그아웃 통신 실패 후 focus 확인이 이전 계정을 다시 열지 않는다', async () => {
  let fail = true; const f = fixture({ logout: async () => { if (fail) throw new StaffReadApiError('STAFF_AUTH_UNAVAILABLE'); return loggedOut(); } });
  await f.controller.checkSession(); await f.controller.logout(); assert.equal(f.controller.getSnapshot().phase, 'logout-error');
  await f.controller.checkSession(); assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false); assert.equal(f.controller.getSnapshot().phase, 'logout-error');
  fail = false; await f.controller.logout(); assert.equal(f.controller.getSnapshot().errorCode, 'STAFF_LOGIN_REQUIRED');
  await f.controller.login('synthetic@example.invalid', 'synthetic'); assert.equal(staffReadCanShowData(f.controller.getSnapshot()), true);
});

test('직원 조회: 숨김·컴포넌트 정리 뒤 늦은 응답은 무시하고 StrictMode 재시작이 가능하다', async () => {
  const pending = deferred<StaffReadSession>(); let usePending = true;
  const f = fixture({ session: async () => usePending ? pending.promise : session() });
  const checking = f.controller.checkSession(); f.controller.clearForRecheck(); f.controller.dispose(); pending.resolve(session()); await checking;
  assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false); assert.equal(f.controller.getSnapshot().session, null);
  usePending = false; await f.controller.checkSession(); assert.equal(staffReadCanShowData(f.controller.getSnapshot()), true);
  f.controller.clearForRecheck(); assert.equal(f.controller.getSnapshot().session, null); assert.equal(f.timers.every(timer => !timer.active), true);
});

test('직원 조회: 오류 무효화의 알 수 없는 코드도 자료를 닫고 구성 오류에는 로그인 폼 권한이 없다', async () => {
  const f = fixture(); await f.controller.checkSession(); f.controller.invalidate('<private-canary>');
  assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false); assert.equal(f.controller.getSnapshot().errorCode, 'STAFF_AUTH_UNAVAILABLE');
  f.controller.invalidate('STAFF_CONFIG_INVALID'); assert.equal(f.controller.getSnapshot().session?.configured, false);
  assert.equal(f.controller.getSnapshot().session?.employee, null);
});

test('고객 조회 계정: null ID 계정도 만료·로그아웃 후 정보와 자료를 즉시 제거한다', async () => {
  const f = fixture({ session: async () => session({ employee: readAccount }), login: async () => loggedIn({ employee: readAccount }) });
  await f.controller.checkSession(); assert.equal(staffReadCanShowData(f.controller.getSnapshot()), true);
  assert.deepEqual(f.controller.getSnapshot().session?.employee, readAccount);
  f.setTime(clock + 60_000); f.expire(); assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false);
  assert.equal(f.controller.getSnapshot().session?.employee, null); assert.equal(f.controller.getSnapshot().errorCode, 'STAFF_SESSION_EXPIRED');
  f.setTime(clock); await f.controller.login('synthetic-reader@example.invalid', 'synthetic-password-canary');
  assert.equal(staffReadCanShowData(f.controller.getSnapshot()), true); await f.controller.logout();
  assert.equal(staffReadCanShowData(f.controller.getSnapshot()), false); assert.equal(f.controller.getSnapshot().session?.employee, null);
  assert.doesNotMatch(JSON.stringify(f.controller.getSnapshot()), /@|password|canary|scope|accessKind/);
});
