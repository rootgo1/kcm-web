import { useState } from 'react';
import type { DemoCall } from '../types';
import { callOutcomes, validateCallResult, type DraftHandler } from '../lib/callWorkflow';
import { isOpenSupport } from '../lib/callSupport';
import { uiText } from '../lib/uiText';

export interface CallResultActions { onDraft: DraftHandler; onComplete: (id: string) => void }
export function CallResultPanel({ call, onDraft, onComplete }: { call: DemoCall } & CallResultActions) {
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  if (call.status === 'completed') return <section aria-label="완료 상담 결과">
    <h3 className="section-label">상담 완료 / {call.result?.outcome ? callOutcomes[call.result.outcome] : '기록 확인 필요'}</h3>
    <dl className="consultation-result">
      <div><dt>처리 내용</dt><dd>{call.result?.content ?? '기록 확인 필요'}</dd></div>
      <div><dt>후속 조치 메모</dt><dd>{call.result?.followUp || '없음'}</dd></div>
      <div><dt>작성자</dt><dd>{uiText(call.completedBy ?? '')}</dd></div>
      <div><dt>최초 상담 완료 (한국 시간)</dt><dd><time dateTime={call.completedAt ?? undefined}>{call.completedAt && new Date(call.completedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}</time></dd></div>
    </dl><p className="muted-text">완료 결과는 조회만 가능합니다. 점수 반영과 기존 관리자 지원 처리는 별도로 진행됩니다.</p>
  </section>;
  if (call.status !== 'staff_consulting') return <section aria-label="상담 결과 기록"><h3 className="section-label">상담 결과 기록</h3><p className="muted-text">직원 상담 시작 후 기록할 수 있습니다.</p></section>;
  const missingStart = !call.startedAt || !Number.isFinite(Date.parse(call.startedAt));
  return <section aria-label="상담 결과 기록">
    <h3 className="section-label">상담 결과 기록</h3>
    <p className="muted-text">처리 결과와 후속 조치 내용을 기록해 주세요.</p>
    {missingStart && <p className="field-error" role="alert">최초 직원 상담 시작 시각이 없어 완료할 수 없습니다. 현재 시각으로 보충하지 않습니다.</p>}
    <form noValidate onSubmit={event => { event.preventDefault(); const message = validateCallResult(call.draft); setError(message); if (!message && !missingStart) setConfirming(true); }}>
      <fieldset disabled={confirming} className="call-result-fields">
        <div className="consultation-field"><label htmlFor="call-outcome">문의 처리 결과 <span>필수</span></label><select id="call-outcome" required value={call.draft.outcome} onChange={event => { onDraft(call.id, 'outcome', event.target.value); setError(''); }}><option value="">선택해 주세요</option>{Object.entries(callOutcomes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
        <div className="consultation-field"><label htmlFor="call-result-content">처리 내용 <span>필수 · {call.draft.content.length}/1,000자</span></label><textarea id="call-result-content" rows={4} maxLength={1000} required value={call.draft.content} onChange={event => { onDraft(call.id, 'content', event.target.value); setError(''); }}/></div>
        <div className="consultation-field"><label htmlFor="call-follow-up">후속 조치 메모 <span>{call.draft.outcome === 'resolved' ? '선택' : '추가 확인 필요·미해결 시 필수'} · {call.draft.followUp.length}/300자</span></label><textarea id="call-follow-up" rows={3} maxLength={300} value={call.draft.followUp} onChange={event => { onDraft(call.id, 'followUp', event.target.value); setError(''); }}/></div>
        {error && <p role="alert" className="field-error">{error}</p>}
        <button type="submit" className="button button-primary" disabled={missingStart}>상담 완료</button>
      </fieldset>
    </form>
    {confirming && <div className="support-simulation" role="group" aria-label="상담 완료 최종 확인">
      <h4>상담 완료 확인 · {call.id}</h4><p>문의 처리 결과: {call.draft.outcome && callOutcomes[call.draft.outcome]}</p>
      <p>입력한 결과로 상담 기록을 완료합니다. 최종 위험도는 분석 결과가 준비되면 확정되며, 확인이 필요하면 대기 상태로 남습니다.</p>
      <p className="microcopy">이 화면의 완료 처리는 실제 전화 연결을 종료하지 않습니다.</p>
      {call.supportRequests.some(isOpenSupport) && <p>미완료 관리자 지원 요청은 상담 완료 후에도 유지되며 별도로 처리할 수 있습니다.</p>}
      <div className="support-actions"><button className="button button-secondary" onClick={() => setConfirming(false)}>계속 작성</button><button className="button button-primary" onClick={() => onComplete(call.id)}>완료 확정</button></div>
    </div>}
  </section>;
}
