/** Server-only staff sessions. Auth identities never obtain scope from user metadata. */
import { createHash, randomBytes } from 'node:crypto';
import { isStoredTimestamp, maskStoredName } from './real-data.mjs';

/** @typedef {{employeeId:string|null, storeId:string, nameMasked:string}} Identity */
/** @typedef {{authUserId:string, employeeId:string, storeId:string}} EmployeeAccount */
/** @typedef {{authUserId:string, storeId:string, scope:'customers:read'}} StoreReadAccount */
/** @typedef {EmployeeAccount|StoreReadAccount} Account */
/** @typedef {{accessToken:string, authUserId:string, expiresAt:number}} Session */
/** @typedef {{ok:true, identity:Identity, expiresAt:number}|{ok:false,status:number,errorCode:string}} Authorization */
/** @typedef {{status:number,body:{authenticated:boolean,employee:Identity|null,expiresAt:number|null,errorCode:string|null},setCookie?:string}} LoginResult */
/** @typedef {Pick<ReturnType<import('./real-data.mjs').createSupabaseReadProvider>, 'readOne'>} Provider */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPLOYEE = /^employee_[0-9]{3,100}$/;
const STORE = /^store_[0-9]{3,100}$/;
const SESSION_MS = 30 * 60_000;
const REQUEST_MS = 5_000;
const MAX_SESSIONS = 500;
const EMAIL_WINDOW_MS = 15 * 60_000;
const GLOBAL_WINDOW_MS = 60_000;
const object = (/** @type {unknown} */ value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (/** @type {string} */ value) => createHash('sha256').update(value).digest('hex');
const denied = (/** @type {number} */ status, /** @type {string} */ errorCode) => /** @type {const} */ ({ ok: false, status, errorCode });
const unavailable = () => denied(503, 'STAFF_AUTH_UNAVAILABLE');

/** Explicit auth-only configuration; never fall back to a read, secret, or service-role key. */
export function staffReadAuthConfig(/** @type {NodeJS.ProcessEnv} */ env = process.env) {
  return {
    supabaseUrl: (env.SUPABASE_URL?.trim() ?? '').replace(/\/+$/, ''),
    publishableKey: env.SUPABASE_AUTH_PUBLISHABLE_KEY?.trim() ?? '',
    accountsJson: env.STAFF_READ_ACCOUNTS_JSON?.trim() ?? '',
  };
}

/** Validate the whole trusted allowlist before enabling any login. */
function accounts(/** @type {string} */ json) {
  if (json.length > 50_000) throw new Error();
  const rows = JSON.parse(json);
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error();
  const map = new Map();
  const employees = new Set();
  for (const row of rows) {
    if (!object(row) || typeof row.authUserId !== 'string' || !UUID.test(row.authUserId)
      || typeof row.storeId !== 'string' || !STORE.test(row.storeId)) throw new Error();
    const shape = Object.keys(row).sort().join(',');
    const employeeAccount = shape === 'authUserId,employeeId,storeId';
    const storeReadAccount = shape === 'authUserId,scope,storeId';
    if (employeeAccount ? typeof row.employeeId !== 'string' || !EMPLOYEE.test(row.employeeId)
      : !storeReadAccount || row.scope !== 'customers:read') throw new Error();
    const userId = row.authUserId.toLowerCase();
    if (map.has(userId) || employeeAccount && employees.has(row.employeeId)) throw new Error();
    if (employeeAccount) {
      employees.add(row.employeeId);
      map.set(userId, /** @type {EmployeeAccount} */ ({ authUserId: userId, employeeId: row.employeeId, storeId: row.storeId }));
    } else {
      map.set(userId, /** @type {StoreReadAccount} */ ({ authUserId: userId, storeId: row.storeId, scope: 'customers:read' }));
    }
  }
  return /** @type {Map<string,Account>} */ (map);
}

/** MFA challenges are unsupported, so an enabled factor cannot degrade to password-only access. */
function hasNoEnabledMfa(/** @type {unknown} */ factors) {
  if (factors === undefined) return true;
  if (!Array.isArray(factors) || factors.length > 100) return false;
  const seen = new Set();
  for (const factor of factors) {
    // Official auth-js Factor fields: id, factor_type, status, created_at, updated_at.
    // Unknown factor types/statuses fail closed rather than inventing an MFA policy.
    if (!object(factor) || typeof factor.id !== 'string' || !UUID.test(factor.id)
      || !['totp', 'phone', 'webauthn'].includes(factor.factor_type) || factor.status !== 'unverified'
      || !isStoredTimestamp(factor.created_at) || !isStoredTimestamp(factor.updated_at)
      || factor.friendly_name !== undefined && (typeof factor.friendly_name !== 'string' || factor.friendly_name.length > 200)
      || seen.has(factor.id.toLowerCase())) return false;
    seen.add(factor.id.toLowerCase());
  }
  return true;
}

/** Bound an upstream response before parsing; neither errors nor arbitrary fields are forwarded. */
async function readJson(/** @type {Response} */ response) {
  if (!response.body) throw new Error();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128_000) throw new Error();
      chunks.push(value);
    }
    return /** @type {Record<string,any>} */ (JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } finally { await reader.cancel().catch(() => {}); }
}

/**
 * All cookies contain only a random handle. Access tokens exist exclusively in this process.
 * REST shapes follow official auth-js GoTrueClient signInWithPassword/_getUser and lib/fetch.ts.
 * https://github.com/supabase/auth-js/blob/master/src/GoTrueClient.ts
 * https://supabase.com/docs/reference/javascript/auth-getuser
 * @param {{supabaseUrl?:string,publishableKey?:string,accountsJson?:string,homeStoreId?:string|null,provider?:Provider,secure?:boolean,fetchImpl?:typeof fetch,now?:()=>number}} options
 */
export function createStaffReadAuth({ supabaseUrl = '', publishableKey = '', accountsJson = '', homeStoreId = '', provider, secure = false, fetchImpl = fetch, now = Date.now } = {}) {
  let origin = '';
  let configError = '';
  const fixedHomeStoreId = typeof homeStoreId === 'string' ? homeStoreId : '';
  /** @type {Map<string,Account>} */
  let accountMap = new Map();
  if (!supabaseUrl || !publishableKey || !accountsJson || !fixedHomeStoreId || !provider) configError = 'STAFF_AUTH_NOT_CONFIGURED';
  else {
    try {
      const url = new URL(supabaseUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^\/?$/.test(url.pathname)
        || !/^sb_publishable_[A-Za-z0-9_-]{1,500}$/.test(publishableKey) || !STORE.test(fixedHomeStoreId)
        || typeof provider.readOne !== 'function') throw new Error();
      origin = url.origin;
      accountMap = accounts(accountsJson);
    } catch { configError = 'STAFF_CONFIG_INVALID'; }
  }
  const cookieName = secure ? '__Host-kcm-staff-read' : 'kcm-staff-read';
  const cookieFlags = '; Path=/; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : '');
  const clearCookie = cookieName + '=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT' + cookieFlags;
  /** @type {Map<string,Session>} */
  const sessions = new Map();
  /** @type {Set<AbortController>} */
  const controllers = new Set();
  /** @type {number[]} */
  let globalAttempts = [];
  /** @type {Map<string,number[]>} */
  const emailAttempts = new Map();
  let closed = false;

  /** Missing, duplicate and malformed cookie values never resolve a session. */
  function cookieHandle(/** @type {string|undefined} */ cookie) {
    if (typeof cookie !== 'string' || cookie.length > 16_384) return { present: !!cookie, handle: null };
    const values = cookie.split(';').map(part => part.trim()).filter(part => part.split('=', 1)[0] === cookieName);
    if (!values.length) return { present: false, handle: null };
    if (values.length !== 1) return { present: true, handle: null };
    const value = values[0].slice(cookieName.length + 1);
    return { present: true, handle: /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null };
  }
  function discard(/** @type {string|undefined} */ cookie) {
    const parsed = cookieHandle(cookie);
    if (parsed.handle) sessions.delete(hash(parsed.handle));
  }
  function prune() {
    const time = now();
    for (const [key, session] of sessions) if (session.expiresAt <= time) sessions.delete(key);
    globalAttempts = globalAttempts.filter(timeStamp => timeStamp > time - GLOBAL_WINDOW_MS);
    for (const [key, stamps] of emailAttempts) {
      const live = stamps.filter(timeStamp => timeStamp > time - EMAIL_WINDOW_MS);
      if (live.length) emailAttempts.set(key, live); else emailAttempts.delete(key);
    }
  }
  function rateAllowed(/** @type {string} */ email) {
    prune();
    const key = hash(email);
    const attempts = emailAttempts.get(key) ?? [];
    // Global cap also bounds email hash storage (at most 450 active entries).
    if (globalAttempts.length >= 30 || attempts.length >= 5) return false;
    globalAttempts.push(now());
    attempts.push(now());
    emailAttempts.set(key, attempts);
    return true;
  }

  /** @returns {Promise<{ok:true,data:Record<string,any>}|{ok:false,status:number}>} */
  async function request(/** @type {string} */ path, /** @type {RequestInit} */ init) {
    if (closed) return { ok: false, status: 503 };
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), REQUEST_MS);
    /** @type {(()=>void)|undefined} */
    let onAbort;
    /** @type {Promise<never>} */
    const aborted = new Promise((_resolve, reject) => {
      onAbort = () => reject(new Error('STAFF_AUTH_UNAVAILABLE'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const work = (async () => {
        const response = await fetchImpl(origin + path, { ...init, signal: controller.signal, redirect: 'manual' });
        if (!response.ok || response.redirected) {
          void response.body?.cancel().catch(() => {});
          return /** @type {const} */ ({ ok: false, status: response.redirected ? 503 : response.status });
        }
        const data = await readJson(response);
        return object(data) ? /** @type {const} */ ({ ok: true, data }) : /** @type {const} */ ({ ok: false, status: 503 });
      })();
      return await Promise.race([work, aborted]);
    } catch { return { ok: false, status: 503 }; }
    finally {
      clearTimeout(timer);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      controllers.delete(controller);
    }
  }

  /** Auth is verified every time, then the explicit account kind chooses its DB scope check. */
  async function verifiedIdentity(/** @type {string} */ token, /** @type {string} */ expectedUserId, /** @type {()=>boolean} */ isLive = () => !closed) {
    const result = await request('/auth/v1/user', {
      method: 'GET', headers: { apikey: publishableKey, Authorization: 'Bearer ' + token, Accept: 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
    });
    if (!result.ok) return result.status === 401 || result.status === 403 ? denied(401, 'STAFF_SESSION_EXPIRED') : unavailable();
    if (!isLive()) return denied(401, 'STAFF_SESSION_EXPIRED');
    const user = result.data;
    if (typeof user.id !== 'string' || !UUID.test(user.id) || user.id.toLowerCase() !== expectedUserId
      || user.is_anonymous !== false || typeof user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(user.email_confirmed_at))
      || !hasNoEnabledMfa(user.factors)
      || user.banned_until != null && (typeof user.banned_until !== 'string' || !Number.isFinite(Date.parse(user.banned_until))
        || Date.parse(user.banned_until) > now())) return denied(403, 'STAFF_ACCESS_DENIED');
    const account = accountMap.get(user.id.toLowerCase());
    if (!account || account.storeId !== fixedHomeStoreId) return denied(403, 'STAFF_ACCESS_DENIED');
    try {
      if ('scope' in account) {
        // This server-approved capability is limited by the existing two customer GET routes.
        // It represents a read account, not a fabricated employee or employee-membership fallback.
        const store = await provider?.readOne('stores', {
          select: 'id,name', filters: { id: 'eq.' + fixedHomeStoreId }, limit: 1,
        });
        if (!store?.ok) return unavailable();
        const row = store.data;
        if (!row || row.id !== fixedHomeStoreId || typeof row.name !== 'string'
          || !row.name.trim() || row.name.length > 200 || /[\r\n\u0000]/.test(row.name)) return denied(403, 'STAFF_ACCESS_DENIED');
        return { ok: /** @type {const} */ (true), identity: { employeeId: null, storeId: fixedHomeStoreId, nameMasked: '조회 계정' } };
      }
      const employee = await provider?.readOne('employees', {
        select: 'id,store_id,name', filters: { id: 'eq.' + account.employeeId, store_id: 'eq.' + fixedHomeStoreId }, limit: 1,
      });
      if (!employee?.ok) return unavailable();
      const row = employee.data;
      if (!row || row.id !== account.employeeId || row.store_id !== fixedHomeStoreId || typeof row.name !== 'string'
        || !row.name.trim() || row.name.length > 200 || /[\r\n\u0000]/.test(row.name)) return denied(403, 'STAFF_ACCESS_DENIED');
      return { ok: /** @type {const} */ (true), identity: { employeeId: account.employeeId, storeId: fixedHomeStoreId, nameMasked: maskStoredName(row.name) } };
    } catch { return unavailable(); }
  }

  function loginFailure(/** @type {number} */ status, /** @type {string} */ errorCode) {
    return { status, body: { authenticated: false, employee: null, expiresAt: null, errorCode }, setCookie: clearCookie };
  }
  /** @param {unknown} credentials @param {string} [oldCookie] @returns {Promise<LoginResult>} */
  async function login(credentials = {}, oldCookie) {
    discard(oldCookie);
    if (configError || closed) return loginFailure(503, configError || 'STAFF_AUTH_UNAVAILABLE');
    if (!object(credentials)) return loginFailure(400, 'STAFF_LOGIN_FAILED');
    const { email, password } = /** @type {Record<string,unknown>} */ (credentials);
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
      || typeof password !== 'string' || !password.length || password.length > 1024) return loginFailure(400, 'STAFF_LOGIN_FAILED');
    if (!rateAllowed(normalized)) return loginFailure(429, 'STAFF_RATE_LIMITED');
    const time = now();
    const result = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: publishableKey, Accept: 'application/json', 'Content-Type': 'application/json;charset=UTF-8', 'X-Supabase-Api-Version': '2024-01-01' },
      body: JSON.stringify({ email: normalized, password }),
    });
    if (!result.ok) return loginFailure([400, 401, 403, 422].includes(result.status) ? 401 : 503,
      [400, 401, 403, 422].includes(result.status) ? 'STAFF_LOGIN_FAILED' : 'STAFF_AUTH_UNAVAILABLE');
    const data = result.data;
    if (typeof data.access_token !== 'string' || !data.access_token.length || data.access_token.length > 16_000 || /[\r\n]/.test(data.access_token)
      || !object(data.user) || typeof data.user.id !== 'string' || !UUID.test(data.user.id)
      || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) return loginFailure(503, 'STAFF_AUTH_UNAVAILABLE');
    let expiresAt = Math.min(time + SESSION_MS, time + data.expires_in * 1000);
    if (data.expires_at !== undefined) {
      if (typeof data.expires_at !== 'number' || !Number.isFinite(data.expires_at) || data.expires_at <= 0) return loginFailure(503, 'STAFF_AUTH_UNAVAILABLE');
      expiresAt = Math.min(expiresAt, data.expires_at * 1000);
    }
    // JWT expiry is only an additional upper bound; GET /user is the authenticity check.
    if (data.access_token.split('.').length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64url').toString('utf8'));
        if (!object(payload) || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) throw new Error();
        expiresAt = Math.min(expiresAt, payload.exp * 1000);
      } catch { return loginFailure(503, 'STAFF_AUTH_UNAVAILABLE'); }
    }
    const authUserId = data.user.id.toLowerCase();
    const verification = await verifiedIdentity(data.access_token, authUserId, () => !closed && expiresAt > now());
    if (!verification.ok) return loginFailure(verification.status, verification.errorCode);
    prune();
    if (closed || expiresAt <= now() || sessions.size >= MAX_SESSIONS) return loginFailure(503, 'STAFF_AUTH_UNAVAILABLE');
    const handle = randomBytes(32).toString('base64url');
    sessions.set(hash(handle), { accessToken: data.access_token, authUserId, expiresAt });
    return { status: 200, body: { authenticated: true, employee: verification.identity, expiresAt, errorCode: null },
      setCookie: cookieName + '=' + handle + '; Max-Age=' + Math.floor((expiresAt - now()) / 1000) + cookieFlags };
  }

  /** @param {string} [cookie] @returns {Promise<Authorization>} */
  async function authorize(cookie) {
    if (configError || closed) return denied(503, configError || 'STAFF_AUTH_UNAVAILABLE');
    const parsed = cookieHandle(cookie);
    if (!parsed.present) return denied(401, 'STAFF_LOGIN_REQUIRED');
    if (!parsed.handle) return denied(401, 'STAFF_SESSION_EXPIRED');
    const key = hash(parsed.handle);
    const session = sessions.get(key);
    if (!session || session.expiresAt <= now()) { sessions.delete(key); return denied(401, 'STAFF_SESSION_EXPIRED'); }
    const verification = await verifiedIdentity(session.accessToken, session.authUserId,
      () => !closed && sessions.get(key) === session && session.expiresAt > now());
    // A logout or expiry while an upstream request runs cannot resurrect a session.
    if (closed || sessions.get(key) !== session || session.expiresAt <= now()) { sessions.delete(key); return denied(401, 'STAFF_SESSION_EXPIRED'); }
    if (!verification.ok) {
      if (verification.status !== 503) sessions.delete(key);
      return verification;
    }
    return { ok: true, identity: verification.identity, expiresAt: session.expiresAt };
  }
  function logout(/** @type {string|undefined} */ cookie) {
    discard(cookie);
    return { status: 200, body: { authenticated: false, employee: null, expiresAt: null, errorCode: null }, setCookie: clearCookie };
  }
  function close() {
    closed = true;
    sessions.clear();
    emailAttempts.clear();
    globalAttempts = [];
    for (const controller of controllers) controller.abort();
  }
  return { configured: !configError, configError: configError || null, login, authorize, logout, close };
}
