import type { LiveCall, LiveTextRisk } from './types';
import { formatRiskScore } from '../lib/riskScoring';
import { deliveryLabel } from './livePresentation';
import { liveFinalizationNotice } from './liveNotices';

/** Server results only. No combined numeric score is presented during a live call. */
export function LiveRiskSignals({ call }: { call: LiveCall }) {
  const analysis = call.risk_analysis, audio = call.audio_signal, final = call.final_result;
  return <section className="live-risk-signals" aria-label="현재 감지 신호">
    <div className="live-risk-heading"><h3>{call.status === 'ended' ? '통화 종료 신호' : '현재 감지 신호'}</h3></div>
    <dl className="live-risk-counts">
      <div><dt>욕설</dt><dd>{analysis ? analysis.profanityCount + '회' : '—'}</dd></div>
      <div><dt>위협 발언</dt><dd>{analysis ? analysis.threatCount + '회' : '—'}</dd></div>
      <div><dt>비난 표현</dt><dd>{analysis ? analysis.blameCount + '회' : '—'}</dd></div>
      <div><dt>선정적 표현</dt><dd>{analysis ? analysis.sexualCount + '회' : '—'}</dd></div>
      <div><dt>고성</dt><dd>{audio?.available ? audio.shouting_count + '회' : '— / 측정 대기'}{audio?.is_shouting && <span className="live-signal-badge threat">현재 고성</span>}</dd></div>
    </dl>
    {analysis?.threatDetected && call.status !== 'ended' && <div className="live-threat-warning" role="alert"><span>현재 통화 대응 경고</span><strong>매우 위험 / 5단계</strong></div>}
    {!analysis && <p className="live-risk-note" role="status">분석 정보를 기다리고 있습니다. 대화는 계속 표시됩니다.</p>}
    {audio && !audio.coverage_complete && <p className="live-risk-note">일부 음성 구간 미측정 · 고성은 관측된 구간만 반영하며 최종 점수는 보류합니다.</p>}
    {call.status === 'ended' ? final ? <div className="live-final-risk">
      <h3>이 통화 최종 위험도</h3><strong>{formatRiskScore(final.risk_score)}</strong>
      <p className="live-risk-note">항목 합계 {final.raw_score}점 · 위협 보정 {final.threat_floor ? '최소 ' + final.threat_floor + '점' : '없음'}{final.adjusted_score > 99 && ' · 99점 상한 적용'}</p>
      <dl className="live-risk-counts">{(['profanity', 'threat', 'blame', 'sexual', 'shouting'] as const).map((key, index) => <div key={key}><dt>{['욕설', '위협 발언', '비난 표현', '선정적 표현', '고성'][index]}</dt><dd>{final.scores[(key + '_score') as keyof typeof final.scores]}점</dd></div>)}</dl>
      <details hidden aria-hidden="true"><summary>확정 위험 결과</summary><pre>{JSON.stringify(final, null, 2)}</pre></details>
    </div> : <p className="live-risk-note" role="status">{liveFinalizationNotice(call.finalization_reason)}</p>
      : <p className="live-risk-note">수신된 고객 발화는 정정될 수 있습니다. 종합 점수는 통화 종료와 고성 최종 수신 후 확정합니다.</p>}
    {call.status === 'ended' && <p className="live-delivery-state" role="status">{deliveryLabel(call)}{call.webhook_delivery?.status === 'failed' && ' · 서버 환경설정과 n8n 실행 내역을 확인해 주세요. 자동 재전송은 하지 않습니다.'}</p>}
  </section>;
}
export function LiveTurnBadges({ analysis }: { analysis: LiveTextRisk | undefined }) {
  if (!analysis || !(analysis.profanityCount || analysis.threatCount || analysis.blameCount || analysis.sexualCount)) return null;
  return <div className="live-turn-signals" aria-label="이 고객 발화의 감지 신호">
    {analysis.profanityCount > 0 && <span className="live-signal-badge profanity">욕설 감지</span>}
    {analysis.threatCount > 0 && <span className="live-signal-badge threat">위협 발언</span>}
    {analysis.blameCount > 0 && <span className="live-signal-badge blame">비난 표현</span>}
    {analysis.sexualCount > 0 && <span className="live-signal-badge sexual">선정적 표현</span>}
  </div>;
}
