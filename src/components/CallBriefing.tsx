import type { CallSignal, CustomerRisk, DemoCall } from '../types';
import { analysisStatusLabels, callStatusLabels, callTime, evidenceText, signalEvidence, signalLabels } from '../lib/callRisk';
import { Modal } from './Modal';
import { CallSupportPanel } from './CallSupportPanel';
import type { SupportHandler } from '../lib/callSupport';
import { CallRiskDetails } from './CallRiskDetails';
import { CallResultPanel, type CallResultActions } from './CallResultPanel';
import { maskCustomerName } from '../lib/customerName';
import { uiText } from '../lib/uiText';

export function CallBriefing({ call, customer, calls, nextCall, onStart, onSupport, onDraft, onComplete, onNext, onOpen, onClose }: { call: DemoCall; customer?: CustomerRisk; calls: readonly DemoCall[]; nextCall?: DemoCall; onStart: (id: string) => void; onSupport: SupportHandler; onNext: (id: string) => void; onOpen: (id: string) => void; onClose: () => void } & CallResultActions) {
  const analyzed = call.analysis.status === 'completed';
  return <Modal title={`${call.id} · ${call.status === 'completed' ? '완료 기록 보기' : call.status === 'staff_consulting' ? '상담 이어보기' : '상담 사전 브리핑'}`} onClose={onClose} wide>
    <div className="call-briefing">
      <div className="detail-meta"><span>{maskCustomerName(call.customerLabel)}</span><span>{uiText(call.inquiryType)}</span><span>{callStatusLabels[call.status]}</span></div>
      <section className="call-consultation" aria-label="통화 상담 시작 정보">
        <div role="status">
          <h3 className="section-label">{callStatusLabels[call.status]}</h3>
          {call.startedAt && <p>최초 상담 시작 (한국 시간): <time dateTime={call.startedAt}>{new Date(call.startedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}</time></p>}
        </div>
        <button className={`button ${call.status === 'waiting' ? 'button-primary' : 'button-secondary'}`} disabled={call.status !== 'waiting'} aria-describedby="call-start-notice" onClick={() => onStart(call.id)}>{call.status === 'staff_consulting' ? '상담 중' : '상담 시작'}</button>
        <p id="call-start-notice" className="muted-text">{call.status === 'ai_responding' ? 'AI 응대 중에는 직원 상담을 시작할 수 없습니다.' : call.status === 'ended' || call.status === 'completed' ? '완료·종료된 통화는 다시 시작할 수 없습니다.' : call.status === 'staff_consulting' ? '최초 시작 시각을 유지하며 이 통화의 브리핑을 이어서 확인할 수 있습니다.' : '브리핑과 감지 신호를 확인한 뒤 상담을 시작하세요. 분석 결과와 관계없이 상담을 시작할 수 있습니다.'}</p>
      </section>
      <section aria-label="문의 내용 요약"><h3 className="section-label">문의 내용 요약</h3><p>{analyzed ? uiText(call.analysis.summary ?? '') || '요약 정보가 없습니다.' : `${analysisStatusLabels[call.analysis.status]} 상태로 요약이 아직 없습니다.`}</p></section>
      <CallResultPanel call={call} onDraft={onDraft} onComplete={onComplete}/>
      <CallRiskDetails call={call} customer={customer} calls={calls}/>
      {call.status === 'completed' && <section className="support-simulation" aria-label="동일 고객 후속 상담 기록">
        <h3 className="section-label">동일 고객 후속 상담</h3>
        <p className="microcopy">후속 문의를 위한 상담 기록을 준비합니다. 실제 전화 연결이나 예약은 생성하지 않습니다.</p>
        {nextCall ? <><p>같은 고객의 진행 중이거나 위험도 확인이 필요한 통화 {nextCall.id}가 있습니다. 해당 기록을 먼저 확인해 주세요.</p><button className="button button-secondary" onClick={() => onOpen(nextCall.id)}>{nextCall.id} 통화 보기</button></> : <><button className="button button-secondary" disabled={!call.scoreRecord} onClick={() => onNext(call.id)}>후속 상담 기록 준비</button>{!call.scoreRecord && <p className="muted-text">현재 통화의 최종 위험도가 확인되면 준비할 수 있습니다.</p>}</>}
      </section>}
      <CallSupportPanel call={call} onSupport={onSupport}/>
      <section aria-label="통화 위험 신호 근거"><h3 className="section-label">신호별 근거</h3><p className="muted-text">횟수를 선택해 감지 시점과 근거를 확인하세요. 욕설은 가림 처리됩니다.</p>
        {(Object.keys(signalLabels) as CallSignal[]).map(signal => {
          const evidence = signalEvidence(call.analysis, signal);
          return <details className="call-signal" key={signal}><summary>{signalLabels[signal]} <strong>{evidence === null ? `— / ${analysisStatusLabels[call.analysis.status]}` : `${evidence.length}회`}</strong></summary>
            {evidence === null ? <p className="muted-text">{analyzed ? '신호 분석 결과가 없습니다.' : `${analysisStatusLabels[call.analysis.status]} 상태로 횟수와 근거를 표시할 수 없습니다.`}</p> : evidence.length === 0 ? <p className="muted-text">해당 신호의 근거 발언이 없습니다 (0회).</p> : <ol className="call-evidence">{evidence.map((item, index) => <li key={`${item.atSeconds}-${index}`}><time>{callTime(item.atSeconds)}</time><span>{uiText(evidenceText(signal, item))}</span></li>)}</ol>}
          </details>;
        })}
      </section>
      <section><h3 className="section-label">AI가 안내·처리한 내용</h3>{call.aiActions.length ? <ul className="call-action-list">{call.aiActions.map(action => <li key={action}>{uiText(action)}</li>)}</ul> : <p className="muted-text">안내·처리 기록이 없습니다.</p>}</section>
      <section><h3 className="section-label">직원 권장 대응</h3>
        {analyzed && call.analysis.recommendedActions.length ? <ul className="call-action-list">{call.analysis.recommendedActions.map(action => <li key={action}>{action}</li>)}</ul> : <p className="muted-text">권장 대응 분석 결과가 없습니다.</p>}
      </section>
      <section><h3 className="section-label">권장 첫 응대 문구</h3><blockquote className="call-opening">{analyzed && call.analysis.openingLine ? `“${call.analysis.openingLine}”` : '응대 문구 분석 결과가 없습니다.'}</blockquote></section>
      <p className="microcopy">상담 기록은 새로고침하면 초기화되며 이 화면에서 전화 연결을 제어하지 않습니다.</p>
      <div className="modal-actions"><button className="button button-secondary" onClick={onClose}>브리핑 닫기</button></div>
    </div>
  </Modal>;
}
