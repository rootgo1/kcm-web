import type { Appointment } from '../types';
import { statusLabels } from '../lib/domain';
import { Icon } from './Icon';
export function BriefingPanel({ appointment, onReview, onDetails }: { appointment?: Appointment; onReview: (id: string) => void; onDetails: () => void }) {
  return <section className="card briefing-card" aria-label="선택한 고객의 사전 브리핑">
    <div className="card-heading"><div className="title-with-icon"><span className="small-icon red"><Icon name="sparkles" size={18}/></span><h2>사전 브리핑</h2></div></div>
    {!appointment ? <div className="state-message"><Icon name="users" size={32}/><h3>예약을 선택해 주세요</h3><p>예약 목록에서 고객을 선택하면<br/>상담 준비에 필요한 정보가 나타납니다.</p></div> : <>
      <div className="briefing-customer"><span className="avatar avatar-large">{appointment.customerName.slice(0, 1)}</span><div><div className="customer-name">{appointment.customerName}<span>고객</span><span className={`status-pill ${appointment.status}`}>{statusLabels[appointment.status]}</span></div><p>{appointment.phoneMasked} <span>·</span> {appointment.time} 방문</p></div></div>
      <div className="briefing-facts"><div><span>상담 목적</span><strong>{appointment.purpose}</strong></div><div><span>희망 단말기</span><strong>{appointment.device}</strong></div><div><span>월 예산</span><strong>{appointment.budget}</strong></div></div>
      {appointment.briefing.status === 'ready' ? <>
        <div className="briefing-summary"><span className="eyebrow"><Icon name="sparkles" size={14}/>상담 핵심 요약</span><p>{appointment.briefing.summary}</p></div>
        <div className="preference"><Icon name="message" size={16}/><span>{appointment.briefing.preference}</span></div>
        <div className="briefing-checklist"><h3>상담 전 확인 사항</h3>{appointment.briefing.checklist.map(item => <div key={item}><span className="check-circle"><Icon name="check" size={11}/></span><span>{item}</span></div>)}</div>
        <div className="briefing-actions"><button className={`button ${appointment.reviewed ? 'button-completed' : 'button-primary'}`} disabled={appointment.reviewed} onClick={() => onReview(appointment.id)}><Icon name="check" size={16}/>{appointment.reviewed ? '확인 완료' : '브리핑 확인 완료'}</button><button className="button button-secondary" onClick={onDetails}>상세 보기<Icon name="arrow" size={16}/></button></div>
        <p className="microcopy">상담 전에 요약과 고객 요청을 확인해 주세요.</p>
      </> : <div className={`state-message briefing-state ${appointment.briefing.status}`}><Icon name={appointment.briefing.status === 'processing' ? 'clock' : 'alert'} size={28}/><h3>{appointment.briefing.status === 'processing' ? '브리핑 준비 중' : '브리핑 확인 필요'}</h3><p>{appointment.briefing.status === 'processing' ? '현재 준비 상태에서는 요약을 확인할 수 없습니다. 예약 정보를 확인하고 상담을 시작할 수 있습니다.' : '요약 정보를 확인할 수 없습니다. 고객의 상담 목적과 요청 사항을 직접 확인해 주세요.'}</p><button className="button button-secondary" onClick={onDetails}>예약 상세 보기<Icon name="arrow" size={16}/></button></div>}
    </>}
  </section>;
}
