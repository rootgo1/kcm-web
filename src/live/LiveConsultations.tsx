import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';
import { applyLiveEvent, isNearConversationBottom, liveStatusLabels, subscribeLiveCalls, type LiveConnection } from './liveCalls';
import type { LiveCall } from './types';
import { LiveRiskSignals, LiveTurnBadges } from './LiveRiskSignals';
import { deliveryLabel, liveCustomerHistory } from './livePresentation';
import { formatRiskScore } from '../lib/riskScoring';
import './live-calls.css';

function clock(at: string | null) {
  return at ? new Date(at).toLocaleTimeString('ko-KR', { hour12: false }) : '—';
}

function LiveConversation({ call, connection, onClose }: { call: LiveCall; connection: LiveConnection; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [unread, setUnread] = useState(false);
  useLayoutEffect(() => {
    const region = scrollRef.current;
    if (!region) return;
    if (following.current) region.scrollTop = region.scrollHeight;
    else setUnread(true);
  }, [call.messages]);
  return <Modal title="실시간 AI 상담" eyebrow="KCM · Retell 실시간 통화" onClose={onClose} wide>
    <div className="live-conversation">
      <div className="live-conversation-meta">
        <strong>{call.customer_id || '고객 확인 전'}</strong><span className={`live-badge ${call.status}`}>{liveStatusLabels[call.status]}</span>
        <span>{call.status === 'live' ? '통화 진행 중' : call.status === 'ended' ? '통화 종료' : call.status === 'error' ? '통화 상태 확인 필요' : 'Monitor 연결을 기다리고 있습니다.'}</span>
      </div>
      <p className="live-small">시작 <time dateTime={call.started_at ?? undefined}>{clock(call.started_at)}</time>{call.ended_at && <> · 종료 <time dateTime={call.ended_at}>{clock(call.ended_at)}</time></>}</p>
      <details className="live-call-id"><summary>통화 식별 정보</summary><code>통화: {call.call_id}</code><code>상담: {call.consultation_id || '확인 필요'}</code><code>고객: {call.customer_id || '미식별'}</code><code>매장: {call.store_id || '미설정'}</code></details>
      {connection === 'reconnecting' && <p className="live-connection-note" role="status">실시간 상담 연결을 다시 시도하고 있습니다. 마지막 수신 대화를 표시합니다.</p>}
      {call.error && <p className="live-connection-note" role="status">{call.error}</p>}
      <LiveRiskSignals call={call}/>
      <div className="live-messages" ref={scrollRef} role="region" aria-label="고객과 KCM AI 대화" tabIndex={0}
        onScroll={() => { const node = scrollRef.current; if (node) { following.current = isNearConversationBottom(node.scrollTop, node.clientHeight, node.scrollHeight); if (following.current) setUnread(false); } }}>
        {call.messages.length === 0 ? <p className="live-empty">{call.status === 'ended' ? '수신된 대화가 없습니다.' : '대화를 기다리고 있습니다.'}</p> : call.messages.map(message => <div className={`live-message ${message.role}`} key={message.turn_id} data-turn-id={message.turn_id}>
          <div className="live-speaker"><strong>{message.role === 'user' ? '고객' : 'KCM AI'}</strong>{message.start_sec !== null && <span>{Math.floor(message.start_sec / 60)}:{String(Math.floor(message.start_sec % 60)).padStart(2, '0')}</span>}</div>
          <p>{message.content}</p>
          {message.role === 'user' && <LiveTurnBadges analysis={call.risk_analysis?.analysisByTurn[message.turn_id]}/>}
        </div>)}
      </div>
      {unread && <button className="button button-secondary live-new-message" onClick={() => { following.current = true; if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; setUnread(false); }}>최신 대화 보기</button>}
      <p className="live-small">화면의 대화는 현재 서버 메모리에서 조회합니다. 서버 재시작 시 화면 이력은 사라지며, 외부 저장 결과는 n8n에서 별도로 확인합니다.</p>
      <div className="modal-actions"><button className="button button-secondary" onClick={onClose}>실시간 상담 닫기</button></div>
    </div>
  </Modal>;
}

/** Independent of demo calls, metrics, reservations and their reset/save policy. */
export function LiveConsultations({ view = 'intake' }: { view?: 'intake' | 'history' }) {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reconnectVersion, setReconnectVersion] = useState(0);
  useEffect(() => {
    // The standalone employee HTML deliberately has no backend dependency.
    if (document.documentElement.dataset.kcmStandalone === 'true') return;
    setConnection('connecting');
    try { return subscribeLiveCalls(event => setCalls(current => applyLiveEvent(current, event)), setConnection); }
    catch { setConnection('reconnecting'); }
  }, [reconnectVersion]);
  const selected = calls.find(call => call.call_id === selectedId);
  const active = calls.filter(call => call.status === 'live' || call.status === 'connecting');
  const recent = calls.filter(call => call.status === 'ended' || call.status === 'error').at(-1);
  const displayed = [...active, ...(recent ? [recent] : [])];
  const history = calls.filter(call => call.status === 'ended' && call !== recent);
  if (!calls.length && connection !== 'reconnecting' && view === 'intake') return null;
  return <>
    {connection === 'reconnecting' && <p className="live-connection-note" role="status">실시간 상담 연결을 다시 시도하고 있습니다. <button className="text-button" onClick={() => setReconnectVersion(value => value + 1)}>다시 연결</button></p>}
    {view === 'history' && <section className="card live-customer-history" aria-label="고객별 실시간 통화 이력">
      <div className="card-heading"><h2>고객별 통화 이력</h2><span className="small-badge">현재 서버 수신 기록</span></div>
      <p className="live-small">고객 ID로 통화를 구분합니다. 이름·연락처와 서버 재시작 이전의 DB 이력은 아직 조회하지 않습니다. 각 통화 위험도는 독립 기록이며 합산하지 않습니다.</p>
      {calls.length === 0 && <div className="live-empty" role="status"><strong>현재 수신한 통화 이력이 없습니다.</strong><p>고객용 AI 상담이 연결되면 고객 ID와 통화별 기록을 여기에서 확인할 수 있습니다.</p></div>}
      {liveCustomerHistory(calls).map(group => <section className="live-customer-group" key={group.key} aria-label={group.customerId || '고객 미식별 통화 ' + group.calls[0].call_id}>
        <h3>{group.customerId || '고객 미식별 · 통화별 개별 표시'}</h3>
        <p className="live-small">최근 완료 통화 위험도: {group.latestCompleted?.final_result ? formatRiskScore(group.latestCompleted.final_result.risk_score) : group.latestCompleted ? '점수 확정 보류' : '완료 통화 없음'}</p>
        {group.calls.map(call => <div className="live-intake-row" key={call.call_id}>
          <div><strong>{call.call_id}</strong><span className={`live-badge ${call.status}`}>{liveStatusLabels[call.status]}</span>
            <p>{call.final_result ? formatRiskScore(call.final_result.risk_score) : call.status === 'ended' ? '최종 위험도 확정 보류' : '종료 후 위험도 확정'} · {clock(call.ended_at ?? call.started_at)}</p>
            {call.status === 'ended' && <p>{deliveryLabel(call)}</p>}
          </div><button className="button button-secondary" onClick={() => setSelectedId(call.call_id)}>통화 기록 보기<span className="sr-only"> {call.call_id}</span></button>
        </div>)}
      </section>)}
    </section>}
    {view === 'intake' && displayed.length > 0 && <section className="card live-intake" aria-label="실시간 AI 상담 인입">
      <div className="card-heading"><div className="title-with-icon"><span className="small-icon red"><Icon name="activity" size={17}/></span><h2>실시간 AI 상담</h2></div></div>
      {displayed.map(call => <div className="live-intake-row" key={call.call_id}>
        <div><strong>{call.customer_id || '고객 확인 전'}</strong><span className={`live-badge ${call.status}`}>{liveStatusLabels[call.status]}</span>
          <p>{call.status === 'live' ? '실시간 상담이 진행 중입니다.' : call.status === 'ended' ? '마지막 종료 통화의 대화를 확인할 수 있습니다.' : call.status === 'error' ? '마지막 수신 대화를 확인할 수 있습니다.' : '통화 연결 상태를 확인하고 있습니다.'}</p>
          {displayed.length > 1 && <small className="live-short-id">통화 …{call.call_id.slice(-8)}</small>}
        </div>
        <button className="button button-secondary" onClick={() => setSelectedId(call.call_id)}>실시간 상담 보기</button>
      </div>)}
      {history.length > 0 && <details className="live-call-id"><summary>이전 종료 통화 기록 ({history.length}건)</summary>
        {history.map(call => <div className="live-intake-row" key={call.call_id}><span>{clock(call.ended_at)} · …{call.call_id.slice(-8)} · {call.final_result ? call.final_result.risk_score + '점 / ' + call.final_result.risk_level : '점수 보류'}</span><button className="text-button" onClick={() => setSelectedId(call.call_id)}>종료 기록 보기</button></div>)}
      </details>}
    </section>}
    {selected && <LiveConversation key={selected.call_id} call={selected} connection={connection} onClose={() => setSelectedId(null)}/>}
  </>;
}
