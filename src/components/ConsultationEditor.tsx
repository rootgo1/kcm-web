import { useCallback, useEffect, useRef, useState } from 'react';
import type { Appointment, ConsultationResult } from '../types';
import { consultationTime, emptyResult, followUpLabels, outcomeLabels, sameResult, validateConsultation, type ConsultationErrors, type ConsultationSaveMode } from '../lib/consultation';
import { Modal } from './Modal';

export type LeaveGuard = (leave: () => void) => void;
export function ConsultationEditor({ appointment, onClose, onSave, registerGuard }: {
  appointment: Appointment; onClose: () => void;
  onSave: (id: string, result: ConsultationResult, mode: ConsultationSaveMode) => string | undefined;
  registerGuard: (guard: LeaveGuard | null) => void;
}) {
  const [initial] = useState(() => ({ ...(appointment.consultation?.result ?? emptyResult()) }));
  const [result, setResult] = useState(initial);
  const [errors, setErrors] = useState<ConsultationErrors>({});
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const leaveRef = useRef<(() => void) | null>(null);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const dirty = !sameResult(initial, result);
  const completed = appointment.status === 'completed';
  const requestLeave = useCallback<LeaveGuard>(leave => {
    if (!dirty) { leave(); return; }
    leaveRef.current = leave;
    setConfirming(true);
  }, [dirty]);
  useEffect(() => { registerGuard(requestLeave); return () => registerGuard(null); }, [registerGuard, requestLeave]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  useEffect(() => { if (confirming) continueRef.current?.focus(); }, [confirming]);
  const continueEditing = () => {
    setConfirming(false); leaveRef.current = null;
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus());
  };
  const change = <K extends keyof ConsultationResult>(key: K, value: ConsultationResult[K]) => {
    setResult(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); setNotice('');
  };
  const save = (mode: ConsultationSaveMode) => {
    if (submitting.current) return;
    submitting.current = true;
    const nextErrors = validateConsultation(result, mode);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      submitting.current = false;
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const failure = onSave(appointment.id, result, mode);
    if (failure) { setNotice(failure); submitting.current = false; }
  };
  return <Modal title={confirming ? '작성 중인 변경을 버릴까요?' : `${appointment.customerName} 고객 · ${completed ? '완료 결과 수정' : '상담 결과 작성'}`}
    onClose={() => confirming ? continueEditing() : requestLeave(onClose)} wide>
    {confirming ? <div className="consultation-discard">
      <p className="modal-lead">아직 반영하지 않은 입력이 있습니다. 변경을 버리면 마지막으로 반영한 기록은 유지됩니다.</p>
      <div className="modal-actions"><button ref={continueRef} className="button button-secondary" onClick={continueEditing}>계속 작성</button><button className="button button-primary" onClick={() => { const leave = leaveRef.current; leaveRef.current = null; leave?.(); }}>변경 버리기</button></div>
    </div> : <form className="consultation-form" ref={formRef} noValidate onSubmit={event => { event.preventDefault(); save(completed ? 'amend' : 'complete'); }}>
      <p className="muted-text">{completed ? `최초 완료 시각은 ${consultationTime(appointment.consultation?.completedAt)}입니다. 수정 내용은 이력에 남습니다.` : '상담 요약과 결과 구분을 입력해 주세요. 작성 중인 내용은 초안으로 저장할 수 있습니다.'}</p>
      <div className="consultation-field"><label htmlFor="consultation-summary">상담 요약 <span>완료 시 필수 · {result.summary.length}/1,000자</span></label>
        <textarea id="consultation-summary" rows={4} value={result.summary} onChange={event => change('summary', event.target.value)} aria-invalid={!!errors.summary} aria-describedby={errors.summary ? 'summary-error' : undefined}/>
        {errors.summary && <p id="summary-error" className="field-error" role="alert">{errors.summary}</p>}
      </div>
      <div className="consultation-field"><label htmlFor="consultation-outcome">결과 구분 <span>완료 시 필수</span></label>
        <select id="consultation-outcome" value={result.outcome} onChange={event => change('outcome', event.target.value as ConsultationResult['outcome'])} aria-invalid={!!errors.outcome} aria-describedby={errors.outcome ? 'outcome-error' : undefined}>
          <option value="">선택해 주세요</option>{Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>{errors.outcome && <p id="outcome-error" className="field-error" role="alert">{errors.outcome}</p>}
      </div>
      <div className="consultation-field"><label htmlFor="consultation-followup">후속 연락 여부</label>
        <select id="consultation-followup" value={result.followUp} onChange={event => change('followUp', event.target.value as ConsultationResult['followUp'])} aria-invalid={!!errors.followUp} aria-describedby={errors.followUp ? 'followup-error' : undefined}>
          {Object.entries(followUpLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>{errors.followUp && <p id="followup-error" className="field-error" role="alert">{errors.followUp}</p>}
      </div>
      <div className="consultation-field"><label htmlFor="consultation-memo">후속 연락 메모 <span>선택 · {result.followUpMemo.length}/500자</span></label>
        <textarea id="consultation-memo" rows={2} value={result.followUpMemo} onChange={event => change('followUpMemo', event.target.value)} aria-invalid={!!errors.followUpMemo} aria-describedby={errors.followUpMemo ? 'memo-error' : undefined}/>
        {errors.followUpMemo && <p id="memo-error" className="field-error" role="alert">{errors.followUpMemo}</p>}
      </div>
      {notice && <p className="field-error" role="alert">{notice}</p>}
      <p className="microcopy">상담 기록은 새로고침하면 초기화되며 고객에게 연락을 보내지 않습니다.</p>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => requestLeave(onClose)}>취소</button>
        {!completed && <button type="button" className="button button-secondary" onClick={() => save('draft')}>초안 저장</button>}
        <button type="submit" className="button button-primary">{completed ? '수정 내용 반영' : '상담 완료'}</button>
      </div>
    </form>}
  </Modal>;
}
