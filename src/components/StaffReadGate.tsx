import { useEffect, useId, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { createStaffReadController, staffReadCanShowData, STAFF_READ_INVALIDATED_EVENT, staffReadErrorMessage } from '../services/staffReadApi.js';
import './staff-read.css';

/** Only the saved-customer panel is gated; the existing workspace profile stays unchanged. */
export function StaffReadGate({ children }: { children: ReactNode }) {
  const [standalone] = useState(() => document.documentElement.dataset.kcmStandalone === 'true');
  const [controller] = useState(() => createStaffReadController());
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const formId = useId();
  useEffect(() => {
    if (standalone) return;
    void controller.checkSession();
    const recheck = () => {
      if (document.visibilityState === 'hidden') return;
      const phase = controller.getSnapshot().phase;
      if (phase !== 'submitting' && phase !== 'signing-out') void controller.checkSession();
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        const phase = controller.getSnapshot().phase;
        if (phase !== 'submitting' && phase !== 'signing-out') controller.clearForRecheck();
      } else recheck();
    };
    const invalidated = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      const code = typeof detail === 'object' && detail !== null && 'code' in detail ? detail.code : undefined;
      setEmail(''); setPassword(''); controller.invalidate(code);
    };
    window.addEventListener('focus', recheck); document.addEventListener('visibilitychange', visibility);
    window.addEventListener(STAFF_READ_INVALIDATED_EVENT, invalidated);
    return () => {
      window.removeEventListener('focus', recheck); document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener(STAFF_READ_INVALIDATED_EVENT, invalidated); controller.dispose();
    };
  }, [controller, standalone]);
  useEffect(() => {
    if (state.errorCode && state.errorCode !== 'STAFF_LOGIN_FAILED' && state.errorCode !== 'STAFF_RATE_LIMITED') {
      setEmail(''); setPassword('');
    }
  }, [state.errorCode]);

  if (standalone) return <>{children}</>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.phase !== 'ready' || !state.session?.configured || state.session.authenticated) return;
    const submittedPassword = password; setPassword('');
    void controller.login(email.trim(), submittedPassword);
  };
  const logout = () => { setEmail(''); setPassword(''); void controller.logout(); };
  if (staffReadCanShowData(state)) return <>
    {state.session?.authenticated && state.session.employee && <section className="staff-read-identity" aria-label="고객 자료 조회 로그인">
      <div><strong>{state.session.employee.nameMasked} 직원 · 고객 자료 조회</strong><p>{state.session.employee.employeeId} · {state.session.employee.storeId}</p></div>
      <button type="button" className="button button-secondary" onClick={logout}>고객 자료 조회 로그아웃</button>
    </section>}
    {children}
  </>;
  const busy = state.phase === 'checking' || state.phase === 'submitting' || state.phase === 'signing-out';
  const unconfigured = state.session?.required && !state.session.configured;
  return <section className="card staff-read-gate" aria-label="직원 고객 자료 조회 로그인">
    <div className="card-heading"><h2>저장된 고객 자료 조회</h2></div>
    <div className="staff-read-content">
      {busy ? <p className="staff-read-status" role="status">{state.phase === 'submitting' ? '직원 로그인을 확인하고 있습니다.' : state.phase === 'signing-out' ? '고객 자료 조회 로그아웃을 처리하고 있습니다.' : '직원 조회 권한을 확인하고 있습니다.'}</p>
        : unconfigured || state.phase === 'error' || state.phase === 'logout-error' ? <>
          <p className="staff-read-status" role="status">{staffReadErrorMessage(state.errorCode ?? (unconfigured ? 'STAFF_AUTH_NOT_CONFIGURED' : 'STAFF_AUTH_UNAVAILABLE'))}</p>
          {state.phase === 'logout-error' && <p className="staff-read-description">고객 자료는 닫았습니다. 로그인 세션 종료를 다시 확인해 주세요.</p>}
          <button type="button" className="button button-secondary" onClick={() => { setPassword(''); if (state.phase === 'logout-error') void controller.logout(); else void controller.checkSession(); }}>{state.phase === 'logout-error' ? '조회 로그아웃 다시 시도' : '다시 확인'}</button>
        </> : <>
          <p className="staff-read-description">현재 매장의 저장 고객과 상담 요약은 권한이 있는 직원만 조회할 수 있습니다.</p>
          <form className="staff-read-form" onSubmit={submit}>
            <label htmlFor={`${formId}-email`}>직원 이메일</label>
            <input id={`${formId}-email`} name="email" type="email" autoComplete="username" required maxLength={254}
              value={email} onChange={event => setEmail(event.target.value)} spellCheck={false} autoCapitalize="none" aria-describedby={state.errorCode ? `${formId}-error` : undefined}/>
            <label htmlFor={`${formId}-password`}>비밀번호</label>
            <input id={`${formId}-password`} name="password" type="password" autoComplete="current-password" required maxLength={1024}
              value={password} onChange={event => setPassword(event.target.value)} aria-describedby={state.errorCode ? `${formId}-error` : undefined}/>
            {state.errorCode && <p className="staff-read-error" id={`${formId}-error`} role="alert">{staffReadErrorMessage(state.errorCode)}</p>}
            <button type="submit" className="button button-primary">직원 로그인</button>
          </form>
          <p className="staff-read-description">이 로그인은 저장된 고객 자료 조회에 사용됩니다.</p>
        </>}
    </div>
  </section>;
}
