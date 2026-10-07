import { useEffect, useRef, useState } from 'react';
import type { CallDemoState, CallSignal } from '../types';
import { CallBriefing } from '../components/CallBriefing';
import { CallSupportPanel } from '../components/CallSupportPanel';
import type { CallResultActions } from '../components/CallResultPanel';
import { Icon } from '../components/Icon';
import { analysisStatusLabels, callRisk, callStatusLabels, signalEvidence, signalLabels } from '../lib/callRisk';
import { canRequestSupport, isOpenSupport, latestSupport, supportStatusLabels, type SupportHandler } from '../lib/callSupport';
import { nextCallBlocker } from '../lib/callWorkflow';
import { maskCustomerName } from '../lib/customerName';
import { uiText } from '../lib/uiText';
import { CALLS_PER_PAGE, paginateCalls } from '../lib/callPagination';

type Props = { state: CallDemoState; onStart: (id: string) => void; onSupport: SupportHandler; onNext: (id: string) => void } & CallResultActions;
export function SupportPage({ state, onStart, onSupport, onDraft, onComplete, onNext }: Props) {
  const [filter, setFilter] = useState<'all' | 'active' | 'recent' | 'support'>('all');
  const [selectedId, setSelectedId] = useState(() => state.calls.find(call => call.supportRequests.some(isOpenSupport))?.id ?? state.calls[0]?.id);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideRef = useRef<HTMLElement>(null);
  const selected = state.calls.find(call => call.id === selectedId) ?? state.calls[0];
  const detail = state.calls.find(call => call.id === detailId);
  const calls = state.calls.filter(call => filter === 'all' || (filter === 'support' ? call.supportRequests.some(isOpenSupport) : filter === 'recent' ? call.status === 'completed' || call.status === 'ended' : call.status !== 'completed' && call.status !== 'ended'));
  const pagination = paginateCalls(calls, page);
  useEffect(() => { setPage(pagination.page); }, [pagination.page]);
  const choose = (id: string) => { setSelectedId(id); setGuideOpen(true); guideRef.current?.focus(); };
  return <>
    <div className="page-heading"><div><span className="eyebrow">상담업무</span><h1>상담지원</h1><p>통화 위험 신호와 대응 가이드를 확인하고 관리자 지원을 요청하세요.</p></div></div>
    <section className="card appointments-card support-list-card" aria-label="상담지원 통화 목록">
      <div className="card-heading"><div className="title-with-icon"><span className="small-icon red"><Icon name="shield" size={18}/></span><h2>현재·최근 통화</h2></div>
        <div className="call-filters"><label htmlFor="support-filter">통화 범위</label><select id="support-filter" value={filter} onChange={event => { setFilter(event.target.value as typeof filter); setPage(1); }}><option value="all">전체 통화</option><option value="active">현재 통화</option><option value="recent">완료·종료 통화</option><option value="support">미완료 지원 요청</option></select></div>
      </div>
      <div className="table-scroll" role="region" aria-label="상담지원 목록 · 좌우 스크롤" tabIndex={0}><table className="appointment-table support-call-table"><thead><tr><th scope="col">고객 / 통화</th><th scope="col">문의 유형</th><th scope="col">상담 상태</th><th scope="col">위험도·현재 경고</th><th scope="col">감지 신호</th><th scope="col">관리자 지원</th><th scope="col">상담·지원</th></tr></thead><tbody>
        {pagination.items.map(call => { const risk = callRisk(call), support = latestSupport(call); return <tr key={call.id} className={selected?.id === call.id ? 'is-selected' : ''}>
          <td><strong>{maskCustomerName(call.customerLabel)}</strong><small className="muted-text">{call.id}</small></td><td>{uiText(call.inquiryType)}</td><td><span className="status-pill neutral">{callStatusLabels[call.status]}</span><small className="muted-text">{analysisStatusLabels[call.analysis.status]}</small></td>
          <td><span className={`risk-badge risk-${risk.grade ?? 'unavailable'}`}>{risk.text}</span></td>
          <td><div className="support-signal-summary">{(Object.keys(signalLabels) as CallSignal[]).map(signal => <span className="small-badge" key={signal}>{signalLabels[signal]} {signalEvidence(call.analysis, signal)?.length ?? '—'}</span>)}</div></td>
          <td>{support ? <span className="small-badge">{supportStatusLabels[support.status]}</span> : <span className="muted-text">—</span>}</td>
          <td><div className="support-actions"><button className="text-button" aria-label={`${call.id} 상담 상세 보기`} onClick={() => { setSelectedId(call.id); setDetailId(call.id); }}>상담 상세<Icon name="chevron" size={13}/></button><button className="text-button" aria-label={`${call.id} ${support ? '지원 상태 확인' : '관리자 지원 요청'}`} disabled={!support && !canRequestSupport(call)} onClick={() => choose(call.id)}>{support ? '지원 상태' : '지원 요청'}</button></div></td>
        </tr>; })}
      </tbody></table></div>
      {calls.length === 0 && <div className="empty-search" role="status"><strong>조건에 맞는 통화가 없습니다.</strong><button className="text-button" onClick={() => { setFilter('all'); setPage(1); }}>전체 통화 보기</button></div>}
      {pagination.totalPages > 1 && <nav className="call-pagination workflow-pagination" aria-label="상담지원 목록 페이지">
        <span className="workflow-pagination-count">{(pagination.page - 1) * CALLS_PER_PAGE + 1}–{Math.min(pagination.page * CALLS_PER_PAGE, calls.length)} / {calls.length}건</span>
        <button type="button" aria-label="이전 상담지원 페이지" disabled={pagination.page === 1} onClick={() => setPage(pagination.page - 1)}><Icon name="chevron" className="previous-chevron" size={16}/></button>
        <span role="status" aria-live="polite" aria-atomic="true">{pagination.page} / {pagination.totalPages}</span>
        <button type="button" aria-label="다음 상담지원 페이지" disabled={pagination.page === pagination.totalPages} onClick={() => setPage(pagination.page + 1)}><Icon name="chevron" size={16}/></button>
      </nav>}
    </section>
    {selected && <section className="card support-guide-card" ref={guideRef} tabIndex={-1} aria-label={`${selected.id} 대응 가이드·관리자 지원`}>
      <div className="card-heading"><div><h2>{maskCustomerName(selected.customerLabel)} · {selected.id} 대응 가이드</h2><p className="muted-text">{uiText(selected.inquiryType)} · {callStatusLabels[selected.status]}</p></div><div className="support-actions"><button type="button" className="button button-secondary" aria-expanded={guideOpen} aria-controls="support-guide-content" onClick={() => setGuideOpen(open => !open)}>{guideOpen ? '가이드·지원 접기' : '가이드·지원 펼치기'}<Icon name="chevronDown" className={guideOpen ? 'support-guide-chevron is-open' : 'support-guide-chevron'} size={14}/></button><button className="button button-secondary" onClick={() => setDetailId(selected.id)}>선택 통화 상세 보기</button></div></div>
      <div id="support-guide-content" className="support-guide-grid" hidden={!guideOpen}><section aria-label="AI 권장 대응 가이드"><h3 className="section-label">AI 권장 대응 가이드</h3>
        {selected.analysis.status === 'completed' && selected.analysis.recommendedActions.length ? <ul className="call-action-list">{selected.analysis.recommendedActions.map(action => <li key={action}>{action}</li>)}</ul> : <p className="muted-text">{analysisStatusLabels[selected.analysis.status]} · 대응 가이드가 아직 없습니다.</p>}
        <h3 className="section-label">권장 첫 응대</h3><blockquote className="call-opening">{selected.analysis.status === 'completed' && selected.analysis.openingLine || '첫 응대 문구 분석 결과를 기다리고 있습니다.'}</blockquote>
        <p className="microcopy">대응 가이드는 직원 판단을 돕기 위한 참고 정보입니다.</p>
      </section><div>{!detail && <CallSupportPanel key={selected.id} call={selected} onSupport={onSupport}/>}</div></div>
    </section>}
    {detail && <CallBriefing key={detail.id} call={detail} calls={state.calls} customer={state.customers.find(customer => customer.id === detail.customerId)} nextCall={nextCallBlocker(state.calls, detail)} onStart={onStart} onSupport={onSupport} onDraft={onDraft} onComplete={onComplete} onNext={onNext} onOpen={setDetailId} onClose={() => setDetailId(null)}/>}
  </>;
}
