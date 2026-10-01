import type { CallAnalysis, CallEvidence, CallRiskGrade, CallSignal, CallStatus, DemoCall } from '../types.js';
import { isOpenSupport } from './callSupport.js';
import { calculateRisk, formatRiskScore, riskBand } from './riskScoring.js';
export { riskBand, RISK_BANDS, RISK_SCORE_RANGE } from './riskScoring.js';

export const callStatusLabels: Record<CallStatus, string> = {
  ai_responding: 'AI 응대 중', waiting: '직원 연결 대기', staff_consulting: '직원 상담 중', completed: '상담 완료', ended: '통화 종료',
};
export const analysisStatusLabels = { completed: '분석 완료', processing: '분석 중', failed: '분석 실패', not_analyzed: '미분석' } as const;
export const signalLabels: Record<CallSignal, string> = { profanity: '욕설', threat: '위협 발언', blame: '비난 표현', sexual: '선정적 표현', shouting: '고성' };
export type CallStatusFilter = 'all' | CallStatus;
export type CallRiskFilter = 'all' | CallRiskGrade | 'unavailable';

export function analysisEvidenceError(analysis: CallAnalysis): string {
  if (!analysis.signals) return '';
  for (const signal of Object.keys(signalLabels) as CallSignal[]) {
    const evidence = signalEvidence(analysis, signal);
    if (evidence && evidence.length !== analysis[signal === 'shouting' ? 'shoutingCount' : signal === 'profanity' ? 'profanityCount' : signal === 'threat' ? 'threatCount' : signal === 'blame' ? 'blameCount' : 'sexualCount']) return '분석 횟수·근거 불일치';
  }
  return '';
}
export const hasConfirmedThreat = (analysis: CallAnalysis) => (analysis.threatCount ?? 0) > 0 || (signalEvidence(analysis, 'threat')?.length ?? 0) > 0;

/** Calculation is available for finalization, never shown as a live combined score. */
export function scorePreview(call: DemoCall) {
  if (call.scoreRecord) return { value: call.scoreRecord, error: '' };
  if (call.analysis.status !== 'completed') return { value: null, error: analysisStatusLabels[call.analysis.status] + ' · 최종 분석 결과 대기' };
  if (call.analysis.phase !== 'final') return { value: null, error: '부분 분석 · 최종 분석 결과 대기' };
  const evidenceError = analysisEvidenceError(call.analysis);
  if (evidenceError) return { value: null, error: evidenceError };
  return calculateRisk(call.analysis);
}
export function callRisk(call: DemoCall): { grade: CallRiskGrade | null; score: number | null; text: string; reason: string } {
  if (call.scoreRecord) {
    const score = call.scoreRecord.risk_score;
    return { grade: riskBand(score)?.grade ?? null, score, text: '확정 ' + formatRiskScore(score), reason: '이 통화의 독립 최종 점수' };
  }
  if (hasConfirmedThreat(call.analysis)) return { grade: 'critical', score: null, text: '위협 감지 · 매우 위험 / 5단계', reason: '현재 대응 경고 · 통화 종료 후 점수 확정' };
  return { grade: null, score: null, text: '통화 종료 후 확정', reason: '진행 중에는 감지 신호만 표시합니다.' };
}
export function signalEvidence(analysis: CallAnalysis, signal: CallSignal): CallEvidence[] | null {
  const evidence = analysis.status === 'completed' ? analysis.signals?.[signal] ?? null : null;
  // 동일 항목의 같은 발생 ID는 한 번 표시합니다. 다른 신호 항목은 독립적입니다.
  return evidence && evidence.filter((item, index) => evidence.findIndex(other => (other.id ?? `${other.atSeconds}:${other.text ?? other.maskedText}`) === (item.id ?? `${item.atSeconds}:${item.text ?? item.maskedText}`)) === index);
}
export function evidenceText(signal: CallSignal, evidence: CallEvidence): string {
  return signal === 'profanity' ? evidence.maskedText || '[욕설 가림]' : evidence.text || '근거 발언 없음';
}
export function callTime(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function getCallMetrics(calls: readonly DemoCall[]) {
  return {
    aiResponding: calls.filter(call => call.status === 'ai_responding').length,
    waiting: calls.filter(call => call.status === 'waiting').length,
    dangerous: calls.filter(call => {
      const grade = callRisk(call).grade;
      return (call.status === 'waiting' || call.status === 'staff_consulting') && (grade === 'danger' || grade === 'critical');
    }).length,
    pendingSupport: calls.reduce((count, call) => count + call.supportRequests.filter(isOpenSupport).length, 0),
  };
}
export function filterCalls(calls: readonly DemoCall[], status: CallStatusFilter, risk: CallRiskFilter): DemoCall[] {
  return calls.filter(call => {
    const grade = callRisk(call).grade;
    return (status === 'all' || call.status === status) && (risk === 'all' || (risk === 'unavailable' ? grade === null : grade === risk));
  });
}
