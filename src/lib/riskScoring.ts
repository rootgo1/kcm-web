import type { CallAnalysis, ScoreCalculation } from '../types.js';
import { calculateCallRisk, RISK_RULE, riskBand, validCount } from './riskPolicy.js';
export { RISK_RULE, RISK_BANDS, riskBand, validCount, SCORE_TABLES, signalScore } from './riskPolicy.js';
export const RISK_SCORE_RANGE = { min: RISK_RULE.min, max: RISK_RULE.max };
export function calculateRisk(input: CallAnalysis): { value: ScoreCalculation | null; error: string } {
  const values = [input.profanityCount, input.threatCount, input.blameCount, input.sexualCount, input.shoutingCount];
  if (!values.every(validCount)) return { value: null, error: '분석 횟수 누락·오류' };
  return { value: calculateCallRisk({ profanity_count: input.profanityCount!, threat_count: input.threatCount!,
    blame_count: input.blameCount!, sexual_count: input.sexualCount!, shouting_count: input.shoutingCount! }), error: '' };
}
export function formatRiskScore(score: unknown): string {
  const band = riskBand(score);
  return band ? `${score}점 / ${band.label} / ${band.level}단계` : '— / 점수 확인 필요';
}
