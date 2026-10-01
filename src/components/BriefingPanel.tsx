import type { Appointment } from '../types';
import { statusLabels } from '../lib/domain';
import { Icon } from './Icon';
export function BriefingPanel({ appointment, onReview, onDetails }: { appointment?: Appointment; onReview: (id: string) => void; onDetails: () => void }) {
  return <section className="card briefing-card" aria-label="선택한 고객의 사전 브리핑">
    <div className="card-heading"><div className="title-with-icon"><span className="small-icon red"><Icon name="sparkles" size={18}/></span><h2>사전 브리핑</h2></div><span className="small-badge">샘플 요약</span></div>
    {!appointment ? <div className="state-message"><Icon name="users" size={32}/><h3>예약을 선택해 주세요</h3><p>예약 목록에서 고객을 선택하면<br/>상담 준비에 필요한 정보가 나타납니다.</p></div> : <>
      <div className="briefing-customer"><span className="avatar avatar-large">{appointment.customerName.slice(0, 1)}</span><div><div className="customer-name">{appointment.customerName}<span>고객</span><span className={`status-pill ${appointment.status}`}>{statusLabels[appointment.status]}</span></div><p>{appointment.phoneMasked} <span>·</span> {appointment.time} 방문</p></div></div>
      <div className="briefing-facts"><div><span>상담 목적</span><strong>{appointment.purpose}</strong></div><div><span>희망 단말기</span><strong>{appointment.device}</strong></div><div><span>월 예산</span><strong>{appointment.budget}</strong></div></div>
      {appointment.briefing.status === 'ready' ? <>
        <div className="briefing-summary"><span className="eyebrow"><Icon name="sparkles" size={14}/>상담 핵심 요약</span><p>{appointment.briefing.summary}</p></div>
        <div className="preference"><Icon name="message" size={16}/><span>{appointment.briefing.preference}</span></div>
        <div className="briefing-checklist"><h3>상담 전 확인 사항</h3>{appointment.briefing.checklist.map(item => <div key={item}><span className="check-circle"><Icon name="check" size={11}/></span><span>{item}</span></div>)}</div>
        <div className="briefing-actions"><button className={`button ${appointment.reviewed ? 'button-completed' : 'button-primary'}`} disabled={appointment.reviewed} onClick={() => onReview(appointment.id)}><Icon name="check" size={16}/>{appointment.reviewed ? '확인 완료' : '브리핑 확인 완료'}</button><button className="button button-secondary" onClick={onDetails}>상세 보기<Icon name="arrow" size={16}/></button></div>
        <p className="microcopy">샘플 요약입니다. 확인 상태는 새로고침 시 초기화됩니다.</p>
      </> : <div className={`state-message briefing-state ${appointment.briefing.status}`}><Icon name={appointment.briefing.status === 'processing' ? 'clock' : 'alert'} size={28}/><h3>{appointment.briefing.status === 'processing' ? '브리핑을 준비하는 상태입니다' : '브리핑 확인이 필요한 상태입니다'}</h3><p>{appointment.briefing.status === 'processing' ? '분석 중 화면을 보여주는 샘플입니다. 실제 작업이 실행 중인 것은 아닙니다.' : '실패 상태를 보여주는 샘플입니다. 재분석 기능은 n8n 연동 후 구현합니다.'}</p><span className="small-badge">상태 표시 예시</span></div>}
    </>}
  </section>;
}
