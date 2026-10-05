import { useState } from 'react';
import type { CallSupportRequest, DemoCall, SupportReason } from '../types';
import { workspaceMock } from '../data/workspaceMockData';
import { canRequestSupport, isOpenSupport, latestSupport, SUPPORT_TEXT_LIMIT, supportReasons, supportStatusLabels, validateSupportContent, validateSupportRequest, type SupportHandler } from '../lib/callSupport';
import { uiText } from '../lib/uiText';

function SupportRecord({ request }: { request: CallSupportRequest }) {
  const times = [
    { label: '요청', at: request.requestedAt, actor: request.requestedBy },
    { label: '확인', at: request.acknowledgedAt, actor: request.acknowledgedBy },
    { label: '지원 완료', at: request.completedAt, actor: request.completedBy },
  ];
  return <div className="support-record">
    <p className="muted-text">{request.callId} · {supportStatusLabels[request.status]}</p>
    <dl className="consultation-result">
      <div><dt>요청 사유</dt><dd>{supportReasons[request.reason]}</dd></div>
      <div><dt>추가 메모</dt><dd>{(request.id === 'DEMO-S-C004-1' ? uiText(request.memo) : request.memo) || '없음'}</dd></div>
      {request.content !== null && <div><dt>관리자 지원 내용</dt><dd>{request.content}</dd></div>}
    </dl>
    <div className="consultation-times">{times.filter(item => item.at).map(item => <p key={item.label}>{item.label}: <time dateTime={item.at!}>{new Date(item.at!).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}</time> (한국 시간) · {uiText(item.actor ?? '')}</p>)}</div>
  </div>;
}

function SupportCompletion({ callId, request, onSupport }: { callId: string; request: CallSupportRequest; onSupport: SupportHandler }) {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  return <form noValidate onSubmit={event => {
    event.preventDefault();
    const message = validateSupportContent(content); setError(message);
    if (!message) onSupport(callId, { type: 'complete', requestId: request.id, content, actor: '데모 관리자' });
  }}>
    <div className="consultation-field"><label htmlFor="support-content">관리자 지원 내용 <span>필수 · {content.length}/{SUPPORT_TEXT_LIMIT}자</span></label>
      <textarea id="support-content" rows={3} required maxLength={SUPPORT_TEXT_LIMIT} value={content} onChange={event => setContent(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'support-content-error' : 'support-content-notice'}/>
      {error && <p id="support-content-error" className="field-error" role="alert">{error}</p>}
    </div>
    <p id="support-content-notice" className="muted-text">관리자 지원 기록입니다. 고객 상담 결과나 상담 완료로 반영되지 않습니다.</p>
    <button className="button button-secondary" type="submit">지원 완료</button>
  </form>;
}

export function CallSupportPanel({ call, onSupport }: { call: DemoCall; onSupport: SupportHandler }) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState<SupportReason | ''>('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const current = latestSupport(call);
  const open = call.supportRequests.some(isOpenSupport);
  const eligible = canRequestSupport(call);
  const previous = call.supportRequests.filter(item => item.status === 'completed' && item.id !== current?.id);
  return <section className="call-support" aria-label="관리자 지원 요청·처리">
    <div className="call-risk-line"><h3 className="section-label">관리자 지원</h3><span className="small-badge" role="status">{supportStatusLabels[current?.status ?? 'none']}</span></div>
    {current && <SupportRecord request={current}/>}
    {current?.status === 'pending' && <p className="support-notice" role="status">지원 요청이 등록되었습니다.</p>}
    {current?.status === 'completed' && <p className="support-notice" role="status">지원이 완료되었습니다.</p>}
    {open ? <p className="muted-text">미완료 요청이 있습니다. 지원 완료 전에는 추가 요청할 수 없습니다.</p> : editing && eligible ? <form className="support-request-form" noValidate onSubmit={event => {
      event.preventDefault();
      const message = validateSupportRequest(reason, memo); setError(message);
      if (message) return;
      onSupport(call.id, { type: 'request', requestId: `${call.id}-S-${crypto.randomUUID()}`, reason, memo, actor: `${workspaceMock.employee.name} ${workspaceMock.employee.position} (데모 직원)` });
      setEditing(false);
    }}>
      <div className="consultation-field"><label htmlFor="support-reason">요청 사유 <span>필수</span></label><select id="support-reason" required value={reason} onChange={event => setReason(event.target.value as SupportReason | '')} aria-invalid={Boolean(error && !reason)} aria-describedby={error ? 'support-request-error' : undefined}><option value="">선택해 주세요</option>{Object.entries(supportReasons).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      <div className="consultation-field"><label htmlFor="support-memo">추가 메모 <span>선택 · {memo.length}/{SUPPORT_TEXT_LIMIT}자</span></label><textarea id="support-memo" rows={3} maxLength={SUPPORT_TEXT_LIMIT} value={memo} onChange={event => setMemo(event.target.value)}/></div>
      {error && <p id="support-request-error" className="field-error" role="alert">{error}</p>}
      <div className="support-actions"><button className="button button-secondary" type="button" onClick={() => { setEditing(false); setError(''); }}>취소</button><button className="button button-primary" type="submit">지원 요청 등록</button></div>
    </form> : <button className="button button-secondary" disabled={!eligible} aria-describedby="support-availability" onClick={() => { setReason(''); setMemo(''); setError(''); setEditing(true); }}>{current?.status === 'completed' ? '다시 지원 요청' : '관리자 지원 요청'}</button>}
    <p id="support-availability" className="muted-text">{call.status === 'ai_responding' ? '직원 연결 대기 이후 요청할 수 있습니다' : call.status === 'completed' || call.status === 'ended' ? '완료·종료된 통화에는 새 지원 요청·재요청을 할 수 없습니다. 기존 미완료 요청은 계속 처리할 수 있습니다.' : '위험 등급이나 분석 결과와 관계없이 직원 판단으로 요청할 수 있습니다.'}</p>
    {current && isOpenSupport(current) && <div className="support-simulation" aria-label="관리자 지원 처리">
      <h4>관리자 지원 처리</h4>
      {current.status === 'pending' ? <button className="button button-secondary" onClick={() => onSupport(call.id, { type: 'acknowledge', requestId: current.id, actor: '데모 관리자' })}>관리자 확인</button> : <SupportCompletion key={current.id} callId={call.id} request={current} onSupport={onSupport}/>}
    </div>}
    {previous.length > 0 && <details className="consultation-history"><summary>이전 지원 완료 이력 ({previous.length}건)</summary><ol>{previous.map(request => <li key={request.id}><SupportRecord request={request}/></li>)}</ol></details>}
    <p className="microcopy">지원 처리 기록은 새로고침하면 초기화되며 실제 관리자 알림은 보내지 않습니다.</p>
  </section>;
}
