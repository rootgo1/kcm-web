/** The browser receives staff identity and expiry only. Session credentials stay in cookies. */
export interface StaffReadEmployee { employeeId: string; storeId: string; nameMasked: string }
export interface StaffReadLogin {
  authenticated: boolean; employee: StaffReadEmployee | null; expiresAt: number | null; errorCode: StaffReadErrorCode | null;
}
export interface StaffReadSession extends StaffReadLogin { required: boolean; configured: boolean }

const errorMessages = {
  STAFF_LOGIN_REQUIRED: '저장된 고객 자료를 조회하려면 직원 로그인이 필요합니다.',
  STAFF_SESSION_EXPIRED: '조회 로그인 시간이 만료되었습니다. 다시 로그인해 주세요.',
  STAFF_ACCESS_DENIED: '현재 직원 계정에는 이 매장의 고객 자료를 조회할 권한이 없습니다.',
  STAFF_AUTH_NOT_CONFIGURED: '직원 로그인 설정이 아직 준비되지 않았습니다. 관리자에게 문의해 주세요.',
  STAFF_AUTH_UNAVAILABLE: '직원 로그인을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  STAFF_LOGIN_FAILED: '이메일과 비밀번호를 확인해 주세요.',
  STAFF_RATE_LIMITED: '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.',
  STAFF_CONFIG_INVALID: '직원 로그인 설정을 확인할 수 없습니다. 관리자에게 문의해 주세요.',
} as const;
export type StaffReadErrorCode = keyof typeof errorMessages;
export const STAFF_READ_INVALIDATED_EVENT = 'kcm-staff-read-invalidated';
export function staffReadErrorCode(value: unknown): StaffReadErrorCode {
  return typeof value === 'string' && Object.hasOwn(errorMessages, value) ? value as StaffReadErrorCode : 'STAFF_AUTH_UNAVAILABLE';
}
export function staffReadErrorMessage(value: unknown): string { return errorMessages[staffReadErrorCode(value)]; }
export class StaffReadApiError extends Error {
  readonly code: StaffReadErrorCode;
  constructor(code: unknown) { const safe = staffReadErrorCode(code); super(safe); this.name = 'StaffReadApiError'; this.code = safe; }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const validId = (kind: string, value: unknown): value is string => typeof value === 'string' && value.length <= 128 && new RegExp(`^${kind}_[0-9]{3,}$`).test(value);
const invalid = (): never => { throw new StaffReadApiError('STAFF_AUTH_UNAVAILABLE'); };

export function parseStaffReadLogin(value: unknown): StaffReadLogin {
  if (!record(value) || typeof value.authenticated !== 'boolean'
    || !(value.errorCode === null || typeof value.errorCode === 'string' && Object.hasOwn(errorMessages, value.errorCode))) return invalid();
  if (!value.authenticated) {
    if (value.employee !== null || value.expiresAt !== null) return invalid();
    return { authenticated: false, employee: null, expiresAt: null, errorCode: value.errorCode as StaffReadErrorCode | null };
  }
  if (value.errorCode !== null || !record(value.employee) || !validId('employee', value.employee.employeeId)
    || !validId('store', value.employee.storeId) || typeof value.employee.nameMasked !== 'string'
    || !value.employee.nameMasked.trim() || value.employee.nameMasked.length > 128 || /[\u0000-\u001f\u007f]/.test(value.employee.nameMasked)
    || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0) return invalid();
  return { authenticated: true, employee: { employeeId: value.employee.employeeId, storeId: value.employee.storeId,
    nameMasked: value.employee.nameMasked }, expiresAt: value.expiresAt, errorCode: null };
}
export function parseStaffReadSession(value: unknown): StaffReadSession {
  if (!record(value) || typeof value.required !== 'boolean' || typeof value.configured !== 'boolean') return invalid();
  const login = parseStaffReadLogin(value);
  if (login.authenticated && !value.configured) return invalid();
  return { required: value.required, configured: value.configured, ...login };
}

export interface StaffReadClient {
  session(signal?: AbortSignal): Promise<StaffReadSession>;
  login(email: string, password: string, signal?: AbortSignal): Promise<StaffReadLogin>;
  logout(signal?: AbortSignal): Promise<StaffReadLogin>;
}
export function createStaffReadApi(fetchImpl: typeof fetch = fetch): StaffReadClient {
  async function request<T>(operation: 'session' | 'login' | 'logout', parse: (value: unknown) => T,
    signal?: AbortSignal, body?: { email: string; password: string } | Record<string, never>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`/api/staff-read/${operation}`, { method: operation === 'session' ? 'GET' : 'POST',
        signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new StaffReadApiError('STAFF_AUTH_UNAVAILABLE');
    }
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    let value: unknown;
    try { value = await response.json(); } catch { throw new StaffReadApiError('STAFF_AUTH_UNAVAILABLE'); }
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    if (response.status !== 200) {
      const code = record(value) ? value.errorCode : undefined;
      throw new StaffReadApiError(code ?? (response.status === 429 ? 'STAFF_RATE_LIMITED'
        : response.status === 403 ? 'STAFF_ACCESS_DENIED'
          : response.status === 401 ? operation === 'login' ? 'STAFF_LOGIN_FAILED' : 'STAFF_LOGIN_REQUIRED' : 'STAFF_AUTH_UNAVAILABLE'));
    }
    return parse(value);
  }
  return { session: signal => request('session', parseStaffReadSession, signal),
    login: (email, password, signal) => request('login', parseStaffReadLogin, signal, { email, password }),
    logout: signal => request('logout', parseStaffReadLogin, signal, {}) };
}
export const staffReadApi = createStaffReadApi();

export interface StaffReadState {
  phase: 'checking' | 'ready' | 'submitting' | 'signing-out' | 'logout-error' | 'error';
  session: StaffReadSession | null;
  errorCode: StaffReadErrorCode | null;
}
type ControllerOptions = { client?: StaffReadClient; now?: () => number; schedule?: (action: () => void, delay: number) => () => void };
/** Each operation removes the old identity before waiting; aborted or late responses cannot restore it. */
export function createStaffReadController({ client = staffReadApi, now = Date.now,
  schedule = (action, delay) => { const timer = setTimeout(action, delay); return () => clearTimeout(timer); } }: ControllerOptions = {}) {
  let state: StaffReadState = { phase: 'checking', session: null, errorCode: null };
  let revision = 0; let request: AbortController | null = null; let cancelExpiry: (() => void) | null = null;
  let pendingCheck: Promise<void> | null = null; let logoutRequested = false;
  const subscribers = new Set<() => void>();
  const publish = (next: StaffReadState) => { state = next; for (const listener of subscribers) listener(); };
  const cancel = () => { revision += 1; request?.abort(); request = null; cancelExpiry?.(); cancelExpiry = null; pendingCheck = null; };
  const begin = (phase: StaffReadState['phase']) => {
    cancel(); request = new AbortController();
    const context = { revision, controller: request };
    publish({ phase, session: null, errorCode: null }); return context;
  };
  const current = (context: { revision: number; controller: AbortController }) => context.revision === revision && !context.controller.signal.aborted;
  const errorCode = (error: unknown) => error instanceof StaffReadApiError ? error.code : 'STAFF_AUTH_UNAVAILABLE';
  const blocked = (code: StaffReadErrorCode, configured = true): StaffReadSession => ({ required: true, configured,
    authenticated: false, employee: null, expiresAt: null, errorCode: code });
  const invalidate = (code: unknown) => {
    const safe = staffReadErrorCode(code); cancel();
    publish({ phase: 'ready', session: blocked(safe, safe !== 'STAFF_AUTH_NOT_CONFIGURED' && safe !== 'STAFF_CONFIG_INVALID'), errorCode: safe });
  };
  const armExpiry = (session: StaffReadSession) => {
    if (!session.authenticated || session.expiresAt === null) return;
    const remaining = session.expiresAt - now();
    if (remaining <= 0) { invalidate('STAFF_SESSION_EXPIRED'); return; }
    cancelExpiry = schedule(() => {
      cancelExpiry = null;
      if (session.expiresAt! <= now()) invalidate('STAFF_SESSION_EXPIRED'); else armExpiry(session);
    }, Math.min(remaining, 2_147_483_647));
  };
  const accept = (session: StaffReadSession) => {
    // A failed logout must not silently reopen the old account on window focus.
    if (logoutRequested && session.authenticated) {
      publish({ phase: 'logout-error', session: null, errorCode: 'STAFF_AUTH_UNAVAILABLE' }); return;
    }
    if (!session.authenticated) logoutRequested = false;
    if (session.authenticated && session.expiresAt! <= now()) { invalidate('STAFF_SESSION_EXPIRED'); return; }
    publish({ phase: 'ready', session, errorCode: session.errorCode }); armExpiry(session);
  };
  const checkSession = (): Promise<void> => {
    if (pendingCheck) return pendingCheck;
    const context = begin('checking');
    const operation = (async () => {
      try { const session = await client.session(context.controller.signal); if (current(context)) accept(session); }
      catch (error) { if (current(context)) publish({ phase: logoutRequested ? 'logout-error' : 'error', session: null, errorCode: errorCode(error) }); }
    })();
    pendingCheck = operation;
    void operation.finally(() => { if (pendingCheck === operation) pendingCheck = null; });
    return operation;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
    checkSession,
    async login(email: string, password: string) {
      logoutRequested = false;
      const context = begin('submitting');
      try {
        const login = await client.login(email, password, context.controller.signal);
        if (current(context)) accept({ required: true, configured: true, ...login,
          errorCode: login.authenticated ? null : login.errorCode ?? 'STAFF_LOGIN_FAILED' });
      } catch (error) { if (current(context)) invalidate(errorCode(error)); }
    },
    async logout() {
      logoutRequested = true;
      const context = begin('signing-out');
      try {
        const login = await client.logout(context.controller.signal);
        if (!current(context)) return;
        if (login.authenticated) { publish({ phase: 'logout-error', session: null, errorCode: 'STAFF_AUTH_UNAVAILABLE' }); return; }
        logoutRequested = false;
        invalidate(login.errorCode ?? 'STAFF_LOGIN_REQUIRED');
      } catch (error) { if (current(context)) publish({ phase: 'logout-error', session: null, errorCode: errorCode(error) }); }
    },
    invalidate,
    clearForRecheck: () => { cancel(); publish({ phase: 'checking', session: null, errorCode: null }); },
    dispose: () => { cancel(); subscribers.clear(); },
  };
}
export function staffReadCanShowData(state: StaffReadState): boolean {
  return state.phase === 'ready' && state.session !== null && (!state.session.required || state.session.configured && state.session.authenticated);
}
