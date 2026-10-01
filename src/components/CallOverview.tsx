import { useState } from 'react';
import type { CallDemoState } from '../types';
import { analysisStatusLabels, callRisk, callStatusLabels, filterCalls, RISK_BANDS, RISK_SCORE_RANGE, type CallRiskFilter, type CallStatusFilter } from '../lib/callRisk';
import { Icon } from './Icon';
import { CallBriefing } from './CallBriefing';
import { latestSupport, supportStatusLabels, type SupportHandler } from '../lib/callSupport';
import { nextCallBlocker } from '../lib/callWorkflow';
import type { CallResultActions } from './CallResultPanel';
import { maskCustomerName } from '../lib/customerName';
import { callRiskLabel } from '../lib/callPresentation';

export function CallOverview({ state, onStart, onSupport, onDraft, onComplete, onNext }: { state: CallDemoState; onStart: (id: string) => void; onSupport: SupportHandler; onNext: (id: string) => void } & CallResultActions) {
  const calls = state.calls;
  const [status, setStatus] = useState<CallStatusFilter>('all');
  const [risk, setRisk] = useState<CallRiskFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = filterCalls(calls, status, risk);
  const selected = calls.find(call => call.id === selectedId);
  return <>
    <section className="card appointments-card call-overview" aria-label="현재 통화 현황">
      <div className="card-heading"><div className="title-with-icon"><span className="small-icon gray"><Icon name="phone" size={18}/></span><h2>통화 현황</h2></div></div>
      <div className="call-filters">
        <label>상담 상태<select value={status} onChange={event => setStatus(event.target.value as CallStatusFilter)}><option value="all">전체 상담 상태</option>{Object.entries(callStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>통화 위험 등급<select value={risk} onChange={event => setRisk(event.target.value as CallRiskFilter)}><option value="all">전체 위험 등급</option>{RISK_BANDS.map(band => <option value={band.grade} key={band.grade}>{band.label}</option>)}<option value="unavailable">미확정·확인 필요</option></select></label>
      </div>
      <div className="table-scroll" role="region" aria-label="통화 목록 표 · 좁은 화면에서 좌우 스크롤" tabIndex={0}><table className="appointment-table call-table"><caption className="sr-only">KT 상담 전화의 현재 상태와 통화별 최종 위험도와 현재 위협 경고 예시</caption><thead><tr><th scope="col">통화 ID</th><th scope="col">고객 표시명</th><th scope="col">문의 유형</th><th scope="col">상담 상태</th><th scope="col">관리자 지원</th><th scope="col">분석 상태</th><th scope="col">대응 경고·최종 위험도</th><th scope="col">브리핑</th></tr></thead><tbody>{items.map(call => {
        const risk = callRisk(call);
        const support = latestSupport(call);
        const actionLabel = call.status === 'completed' ? '완료 기록 보기' : call.status === 'staff_consulting' ? '상담 이어보기' : '브리핑 보기';
        return <tr key={call.id}><td><strong>{call.id}</strong></td><td>{maskCustomerName(call.customerLabel)}</td><td>{call.inquiryType}</td><td><span className="status-pill neutral">{callStatusLabels[call.status]}</span></td><td>{support && <span className="small-badge call-support-badge" aria-label={`관리자 지원: ${supportStatusLabels[support.status]}`}>{supportStatusLabels[support.status]}</span>}</td><td>{analysisStatusLabels[call.analysis.status]}</td><td><span className={`risk-badge risk-${risk.grade ?? 'unavailable'}`}>{callRiskLabel(call, true)}</span></td><td><button className="text-button" aria-label={`${call.id} ${actionLabel}`} onClick={() => setSelectedId(call.id)}>{actionLabel}<Icon name="chevron" size={13}/></button></td></tr>;
      })}</tbody></table></div>
      {items.length === 0 && <div className="empty-search" role="status"><Icon name="search" size={26}/><strong>조건에 맞는 통화가 없습니다</strong><p>상담 상태나 위험 등급을 변경해 주세요.</p><button className="text-button" onClick={() => { setStatus('all'); setRisk('all'); }}>통화 필터 초기화</button></div>}
      <details className="call-criteria"><summary>임시 위험 등급 기준</summary><p>{RISK_BANDS.map((band, index) => `${band.label}: ${band.min}점 이상 ${RISK_BANDS[index + 1] ? `${RISK_BANDS[index + 1].min}점 미만` : `${RISK_SCORE_RANGE.max}점 이하`}`).join(' · ')}</p><p>통화 중에는 명확한 위협만 매우 위험으로 경고합니다. 종합 점수와 등급은 통화 종료 후 확정합니다. 각 통화는 0점부터 독립 계산하며 과거 점수를 합산하지 않습니다.</p></details>
    </section>
    {selected && <CallBriefing key={selected.id} call={selected} calls={calls} customer={state.customers.find(customer => customer.id === selected.customerId)} nextCall={nextCallBlocker(calls, selected)} onStart={onStart} onSupport={onSupport} onDraft={onDraft} onComplete={onComplete} onNext={onNext} onOpen={setSelectedId} onClose={() => setSelectedId(null)}/>}
  </>;
}
