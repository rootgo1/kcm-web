import type { Appointment, ConsultationResult } from '../types';
import { consultationTime, followUpLabels, outcomeLabels } from '../lib/consultation';
import { statusLabels } from '../lib/domain';

export function ConsultationResultView({ result }: { result: ConsultationResult | null | undefined }) {
  if (!result) return <p className="muted-text">기록 없음</p>;
  return <dl className="consultation-result">
    <div><dt>상담 요약</dt><dd>{result.summary || '미입력'}</dd></div>
    <div><dt>결과 구분</dt><dd>{result.outcome ? outcomeLabels[result.outcome] : '미선택'}</dd></div>
    <div><dt>후속 연락</dt><dd>{followUpLabels[result.followUp]}</dd></div>
    <div><dt>후속 연락 메모</dt><dd>{result.followUpMemo || '없음'}</dd></div>
  </dl>;
}

export function ConsultationPanel({ appointment, starting, onStart, onEdit }: {
  appointment: Appointment | undefined; starting: boolean; onStart: (id: string) => void; onEdit: (id: string) => void;
}) {
  if (!appointment) return null;
  const record = appointment.consultation;
  const completed = appointment.status === 'completed';
  return <section className="card consultation-card" aria-label="선택한 고객의 상담 처리">
    <div className="card-heading"><h2>상담 처리</h2><span className={`status-pill ${appointment.status}`}>{statusLabels[appointment.status]}</span></div>
    <div className="consultation-body">
      <p className="consultation-customer"><strong>{appointment.customerName}</strong> · {appointment.time} 예약</p>
      {appointment.briefing.status !== 'ready' ? <p className="muted-text">브리핑이 {appointment.briefing.status === 'processing' ? '준비 중' : '확인 필요 상태'}입니다. 상담 처리는 가능합니다.</p> : !appointment.reviewed && <p className="muted-text">아직 확인하지 않은 사전 브리핑이 있습니다.</p>}
      {appointment.status === 'reserved' ? <button className="button button-primary" disabled={starting} onClick={() => onStart(appointment.id)}>상담 시작</button> : <>
        <div className="consultation-times"><span>상담 시작: {consultationTime(record?.startedAt)}</span>{completed && <span>최초 상담 완료: {consultationTime(record?.completedAt)}</span>}</div>
        <ConsultationResultView result={record?.result}/>
        <button className="button button-primary" onClick={() => onEdit(appointment.id)}>{completed ? '결과 수정' : '상담 결과 작성'}</button>
      </>}
      {!!record?.history.length && <details className="consultation-history"><summary>결과 반영·수정 이력 ({record.history.length}건)</summary><ol>
        {record.history.map(entry => <li key={entry.id}>
          <strong>{entry.kind === 'completed' ? '최초 상담 완료' : '완료 기록 수정'}</strong>
          <p>{entry.actor.name} {entry.actor.position} (샘플 사용자)<br/><time dateTime={entry.at}>{consultationTime(entry.at)}</time></p>
          <details><summary>변경 전후 내용</summary><h3>변경 전</h3><ConsultationResultView result={entry.before}/><h3>변경 후</h3><ConsultationResultView result={entry.after}/></details>
        </li>)}
      </ol></details>}
      <p className="microcopy">샘플 기록은 이 탭에서만 유지됩니다. 새로고침·탭 닫기·샘플 초기화 시 사라집니다.</p>
    </div>
  </section>;
}
