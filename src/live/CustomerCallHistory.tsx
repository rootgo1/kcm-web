import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { CALLS_PER_PAGE } from '../lib/callPagination';
import { formatRiskScore } from '../lib/riskScoring';
import { customerCallHistory, type CustomerHistoryStatus } from './customerHistory';
import { liveStatusLabels } from './liveCalls';
import { deliveryLabel } from './livePresentation';
import type { LiveCall } from './types';
import { isDemoDisplayCustomer, liveCustomerDisplayName } from '../lib/customerName';

function endedTime(at: string | null) {
  if (!at) return null;
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : {
    date: date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    time: date.toLocaleTimeString('en-GB', { hour12: false }),
  };
}

export function CustomerCallHistory({ calls, onSelect }: { calls: readonly LiveCall[]; onSelect: (callId: string) => void }) {
  const [customerKey, setCustomerKey] = useState('');
  const [status, setStatus] = useState<CustomerHistoryStatus>('all');
  const [page, setPage] = useState(1);
  const { groups, selectedGroup, filtered, pagination } = customerCallHistory(calls, customerKey, status, page);
  useEffect(() => { setPage(pagination.page); }, [pagination.page]);
  const latest = selectedGroup?.latestCompleted;
  return <section className="card live-customer-history customer-call-history" aria-label="고객별 실시간 통화 이력">
    <div className="card-heading"><h2>고객별 통화 이력</h2>
    <div className="customer-history-filters">
      <label><span>고객 선택</span><select value={customerKey} onChange={event => { setCustomerKey(event.target.value); setPage(1); }}>
        <option value="">전체 고객</option>
        {groups.map(group => <option value={group.key} key={group.key}>{liveCustomerDisplayName(group.customerId, `미식별 통화 · ${group.calls[0].call_id}`)}</option>)}
      </select></label>
      <label><span>상담 상태</span><select value={status} onChange={event => { setStatus(event.target.value as CustomerHistoryStatus); setPage(1); }}>
        <option value="all">전체 상태</option>
        {(['connecting', 'live', 'ended', 'error'] as const).map(value => <option key={value} value={value}>{liveStatusLabels[value]}</option>)}
      </select></label>
      <span className="customer-history-count" role="status" aria-live="polite">조회 {filtered.length} / {calls.length}건</span>
    </div>
    </div>
    <div className="customer-history-latest">
      {selectedGroup ? <><span>{selectedGroup.customerId ? '고객 최근 완료 통화 위험도' : '미식별 통화 위험도'}</span><strong>{latest?.final_result ? formatRiskScore(latest.final_result.risk_score) : latest ? '점수 확정 보류' : '완료 통화 없음'}</strong></> : <span>고객을 선택하면 최근 완료 통화 위험도를 확인할 수 있습니다.</span>}
    </div>
    {filtered.length > 0 ? <div className="customer-history-scroll" role="region" aria-label="고객별 통화 목록 · 좌우 스크롤" tabIndex={0}>
      <table className="customer-history-table"><thead><tr><th scope="col">고객 / 식별 정보</th><th scope="col">상담 상태</th><th scope="col">이번 통화 위험도</th><th scope="col">종료 시각</th><th scope="col">전송 상태</th><th scope="col">기록</th></tr></thead><tbody>
        {pagination.items.map(call => { const ended = endedTime(call.ended_at); return <tr key={call.call_id}>
          <td className="customer-history-identifiers"><span title={liveCustomerDisplayName(call.customer_id, '미식별')}>{liveCustomerDisplayName(call.customer_id, '미식별 고객')}</span>
            {isDemoDisplayCustomer(call.customer_id) ? <details className="live-call-id"><summary>통화 식별 정보</summary><code>통화: {call.call_id}</code><code>상담: {call.consultation_id || '확인 필요'}</code><code>고객: {call.customer_id}</code></details>
              : <><span title={call.call_id}>통화: {call.call_id}</span><span className="sr-only">상담: {call.consultation_id || '확인 필요'}</span></>}
          </td>
          <td><span className={`live-badge ${call.status}`}>{liveStatusLabels[call.status]}</span></td>
          <td className="customer-history-score">{call.final_result ? <strong>{formatRiskScore(call.final_result.risk_score)}</strong> : <span>{call.status === 'ended' ? '최종 위험도 확정 보류' : '종료 후 위험도 확정'}</span>}</td>
          <td className="customer-history-time">{ended ? <time dateTime={call.ended_at!}><span>{ended.date}</span><span>{ended.time}</span></time> : <span>{call.status === 'live' ? '진행 중' : call.status === 'error' || call.status === 'ended' ? '종료 확인 필요' : '종료 전'}</span>}</td>
          <td className="customer-history-delivery">{call.status === 'ended' || call.final_result ? deliveryLabel(call) : '종료 후 전송 확인'}</td>
          <td><button type="button" className="text-button customer-history-detail" onClick={() => onSelect(call.call_id)}>상세 보기<span className="sr-only"> {call.call_id}</span><Icon name="chevron" size={13}/></button></td>
        </tr>; })}
      </tbody></table>
    </div> : <div className="live-empty customer-history-empty" role="status"><strong>{calls.length === 0 ? '현재 수신한 통화 이력이 없습니다.' : '선택한 조건의 통화 이력이 없습니다.'}</strong>{calls.length === 0 && <p>고객용 AI 상담이 연결되면 고객 ID와 통화별 기록을 확인할 수 있습니다.</p>}</div>}
    {pagination.totalPages > 1 && <nav className="call-pagination customer-history-pagination" aria-label="고객별 통화 이력 페이지">
      <span className="customer-history-page-count">{(pagination.page - 1) * CALLS_PER_PAGE + 1}–{Math.min(pagination.page * CALLS_PER_PAGE, filtered.length)} / {filtered.length}건</span>
      <button type="button" aria-label="이전 통화 이력 페이지" disabled={pagination.page === 1} onClick={() => setPage(pagination.page - 1)}><Icon name="chevron" className="previous-chevron" size={16}/></button>
      <span role="status" aria-live="polite" aria-atomic="true"><span className="sr-only">현재 페이지 </span>{pagination.page} / {pagination.totalPages}</span>
      <button type="button" aria-label="다음 통화 이력 페이지" disabled={pagination.page === pagination.totalPages} onClick={() => setPage(pagination.page + 1)}><Icon name="chevron" size={16}/></button>
    </nav>}
    <details className="live-call-id customer-history-scope"><summary>조회 범위</summary><p className="live-small">현재 수신한 기록만 표시하며 서비스 재시작 전의 이력은 조회하지 않습니다. 통화별 위험도는 독립 기록이며 합산하지 않습니다. n8n 수신 응답만으로 DB 저장 성공을 확인할 수 없습니다.</p></details>
  </section>;
}
