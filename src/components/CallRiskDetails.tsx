import type { CustomerRisk, DemoCall } from '../types';
import { analysisStatusLabels, callRisk, hasConfirmedThreat } from '../lib/callRisk';
import { formatRiskScore, validCount } from '../lib/riskScoring';
import { customerRiskHistory, latestCompletedCustomerCall, scorePendingReason } from '../lib/callWorkflow';

export function CallRiskDetails({ call, customer, calls }: { call: DemoCall; customer?: CustomerRisk; calls: readonly DemoCall[] }) {
  const risk = callRisk(call);
  const final = call.scoreRecord;
  const history = customerRiskHistory(calls, call.customerId);
  const latestCall = latestCompletedCustomerCall(calls, call.customerId);
  const latest = latestCall?.scoreRecord;
  const available = call.analysis.status === 'completed';
  const counts = [
    ['욕설', call.analysis.profanityCount, final?.scores.profanity_score],
    ['위협 발언', call.analysis.threatCount, final?.scores.threat_score],
    ['비난 표현', call.analysis.blameCount, final?.scores.blame_score],
    ['선정적 표현', call.analysis.sexualCount, final?.scores.sexual_score],
    ['고성', call.analysis.shoutingCount, final?.scores.shouting_score],
  ] as const;
  return <section aria-label="통화 분석 결과">
    <h3 className="section-label">통화별 위험 신호·최종 점수</h3>
    <div className="call-risk-line"><strong className={'risk-badge risk-' + (risk.grade ?? 'unavailable')}>{risk.text}</strong><span className="small-badge">{analysisStatusLabels[call.analysis.status]}</span></div>
    {hasConfirmedThreat(call.analysis) && !final && <p className="call-threat" role="alert">위협 감지 · 매우 위험 / 5단계 — 현재 대응 경고이며 종료 후 최종 점수와 구분합니다.</p>}
    <p className="muted-text">모든 통화는 0점에서 독립 계산합니다. 진행 중에는 종합 점수를 표시하지 않습니다.</p>
    <dl className="consultation-result call-score-details">
      {counts.map(([label, count, score]) => <div key={label}><dt>{label}</dt><dd>{available && validCount(count) ? count + '회' : '— / 분석 확인 필요'}{final && ' · ' + score + '점'}</dd></div>)}
      {final && <>
        <div><dt>항목 점수 합계</dt><dd>{final.raw_score}점</dd></div>
        <div><dt>위협 최소점수 보정</dt><dd>{final.threat_floor ? '최소 ' + final.threat_floor + '점 적용' : '없음'} · 보정 후 {final.adjusted_score}점</dd></div>
        <div><dt>이 통화 최종 위험도</dt><dd>{formatRiskScore(final.risk_score)}{final.adjusted_score > 99 && ' · 99점 상한 적용'}</dd></div>
        <div><dt>최초 확정 시각</dt><dd><time dateTime={final.appliedAt}>{new Date(final.appliedAt).toLocaleString('ko-KR')}</time> · {final.rule_version}</dd></div>
      </>}
    </dl>
    <p className="support-notice" role="status">{scorePendingReason(call)}</p>
    <h3 className="section-label">최근 통화 위험도</h3>
    <p>{latest ? formatRiskScore(latest.risk_score) : latestCall ? '최근 완료 통화 점수 확정 대기' : !customer || customer.historyStatus === 'unknown' ? '고객 이력 확인 필요' : '완료된 통화 위험 기록 없음'}</p>
    <p className="muted-text">가장 최근 완료 통화의 과거 참고정보입니다. 현재 통화에 합산하지 않습니다.</p>
    <details className="call-criteria"><summary>통화별 위험 이력 ({history.length}건)</summary>
      {history.length ? <ol className="call-action-list">{history.map(record => <li key={record.call_id}><strong>{record.call_id}</strong> · <time dateTime={record.completedAt}>{new Date(record.completedAt).toLocaleString('ko-KR')}</time> · {formatRiskScore(record.risk_score)}</li>)}</ol> : <p>확정된 통화 이력이 없습니다.</p>}
    </details>
    <p className="microcopy">위험도는 응대 참고 정보이며 점수만으로 통화를 차단하거나 종료하지 않습니다.</p>
  </section>;
}
