import { useEffect, useRef, useState } from 'react';
import { createLiveBriefingController, liveBriefingErrorMessage, type LiveBriefingState } from '../services/liveBriefingApi';
import { formatRealDataDate } from '../services/realDataApi';
import { isDemoDisplayCustomer, storedCustomerDisplayName } from '../lib/customerName';

const stageLabels = { AI: 'AI 상담', PHONE: '전화 상담', VISIT: '방문 상담' } as const;
const countLabels = [
  ['profanityCount', '욕설'], ['threatCount', '위협'], ['blameCount', '비난'],
  ['sexualCount', '선정적 표현'], ['shoutingCount', '고성'],
] as const;

/** Saved history only; this component never uses or recalculates the current call's risk. */
export function LiveCallBriefing({ callId, customerId }: { callId: string; customerId: string | null }) {
  const controller = useRef<ReturnType<typeof createLiveBriefingController> | null>(null);
  const [received, setReceived] = useState<LiveBriefingState>({ callId, customerId, status: customerId ? 'loading' : 'missing-customer' });
  useEffect(() => {
    const next = createLiveBriefingController(setReceived); controller.current = next;
    next.select(callId, customerId);
    return () => { next.dispose(); if (controller.current === next) controller.current = null; };
  }, [callId, customerId]);
  // A newly selected identity must not paint the previous customer's response before its effect runs.
  const state: LiveBriefingState = received.callId === callId && received.customerId === customerId ? received
    : { callId, customerId, status: customerId ? 'loading' : 'missing-customer' };
  const data = state.status === 'ready' ? state.data : null;
  const previous = data?.previousRisk;
  const recent = data?.recentConsultation;
  return <aside className="live-briefing" aria-label="고객 사전 브리핑" aria-busy={state.status === 'loading'} tabIndex={0}>
    <div className="live-briefing-heading"><div><h3>고객 사전 브리핑</h3><p>통화 시작 전의 완료 상담 기준</p></div>
      <button className="button button-secondary live-briefing-reload" disabled={!customerId || state.status === 'loading'} onClick={() => controller.current?.reload()}>다시 조회</button>
    </div>
    {state.status === 'missing-customer' && <p className="live-briefing-state" role="status">고객이 확인되지 않아 사전 브리핑을 조회하지 않았습니다.</p>}
    {state.status === 'loading' && <p className="live-briefing-state" role="status">사전 브리핑을 불러오는 중입니다.</p>}
    {state.status === 'error' && <div className="live-briefing-state" role="status"><strong>사전 브리핑을 불러오지 못했습니다.</strong><p>{liveBriefingErrorMessage(state.errorCode)}</p></div>}
    {data && <>
      <div className="live-briefing-customer"><strong>{storedCustomerDisplayName(data.customer.nameMasked, data.customer.id)}</strong>{!isDemoDisplayCustomer(data.customer.id) && <span className="live-identifier">{data.customer.id}</span>}</div>
      {isDemoDisplayCustomer(data.customer.id) && <details className="live-call-id"><summary>고객 식별 정보</summary><code>고객: {data.customer.id}</code></details>}
      {!data.privacyConsent ? <p className="live-briefing-state" role="status">고객 개인정보 동의 확인이 필요합니다.</p> : <>
        <dl className="live-briefing-products">
          <div><dt>현재 상품</dt><dd>{data.currentProduct ? <>{data.currentProduct.name}<small>{data.currentProduct.storageGb}GB · {data.currentProduct.color}</small></> : '등록된 상품이 없습니다.'}</dd></div>
          <div><dt>현재 요금제</dt><dd>{data.currentPlan ? <>{data.currentPlan.name}<small>월 {data.currentPlan.monthlyFee.toLocaleString('ko-KR')}원</small></> : '등록된 요금제가 없습니다.'}</dd></div>
        </dl>
        <section className="live-briefing-section"><h4>이전 완료 상담</h4>
          {recent ? <>
            <p className="live-briefing-purpose">{recent.purpose || '확인할 수 있는 상담 목적이 없습니다.'}</p>
            <p className="live-briefing-date">이전 상담 종료 <time dateTime={recent.endedAt}>{formatRealDataDate(recent.endedAt)}</time></p>
            {recent.summary ? <><p className="live-briefing-summary-preview">{recent.summary}</p><details className="live-briefing-summary"><summary>전체 요약 보기</summary><p>{recent.summary}</p></details></>
              : <p className="live-briefing-note">확인할 수 있는 상담 요약이 없습니다.</p>}
          </> : <p className="live-briefing-note">이전 저장 상담 이력이 없습니다.</p>}
        </section>
        <section className="live-briefing-section"><h4>이전 통화 위험도</h4>
          {previous ? <>
            <p className="live-briefing-risk"><strong>{previous.score}점 · {previous.level}</strong><span>{stageLabels[previous.stage]} 기록</span></p>
            <dl className="live-briefing-counts">{countLabels.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{previous[key] === null ? '확인되지 않음' : previous[key] + '회'}</dd></div>)}</dl>
          </> : <p className="live-briefing-note">이전 위험 기록이 없습니다.</p>}
          <p className="live-briefing-note">이번 통화 결과와 별도로 조회한 이전 기록입니다.</p>
        </section>
        <section className="live-briefing-section"><h4>응대 유의사항</h4><ul className="live-briefing-guidance">{data.guidance.map((line, index) => <li key={index}>{line}</li>)}</ul></section>
      </>}
    </>}
  </aside>;
}
