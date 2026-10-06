/** Shared frontend/Node policy. Per-call results only; no previous customer score. */
export const RISK_RULE = Object.freeze({
  version: 'call-risk-v5', min: 0, max: 99, profanityFloor: 20, explicitHarmThreatFloor: 60,
  threatFloors: Object.freeze([
    Object.freeze({ count: 1, score: 40 }),
    Object.freeze({ count: 2, score: 60 }),
    Object.freeze({ count: 3, score: 80 }),
  ]),
});
export const RISK_BANDS = /** @type {const} */ ([
  { grade: 'normal', label: '정상', level: 1, min: 0 },
  { grade: 'caution', label: '주의', level: 2, min: 20 },
  { grade: 'boundary', label: '경계', level: 3, min: 40 },
  { grade: 'danger', label: '위험', level: 4, min: 60 },
  { grade: 'critical', label: '매우 위험', level: 5, min: 80 },
]);
export const SCORE_TABLES = /** @type {const} */ ({
  profanity: [[0, 0], [1, 3], [2, 6], [4, 10], [7, 15]],
  threat: [[0, 0], [1, 20], [2, 30], [3, 40]],
  blame: [[0, 0], [1, 4], [2, 8], [4, 14], [7, 20]],
  sexual: [[0, 0], [1, 5], [2, 10], [3, 15]],
  shouting: [[0, 0], [1, 2], [2, 5], [3, 8], [5, 10]],
});
/** @param {unknown} value @returns {value is number} */
export const validCount = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
/** @param {unknown} score */
export function riskBand(score) {
  if (!validCount(score) || score > RISK_RULE.max) return null;
  return [...RISK_BANDS].reverse().find(band => score >= band.min) ?? null;
}
/** @param {keyof typeof SCORE_TABLES} kind @param {unknown} count @returns {number} */
export function signalScore(kind, count) {
  if (!validCount(count)) throw new RangeError('분석 횟수 누락·오류');
  return [...SCORE_TABLES[kind]].reverse().find(([minimum]) => count >= minimum)?.[1] ?? 0;
}
/** @typedef {{profanity_count:number, threat_count:number, blame_count:number, sexual_count:number, shouting_count:number}} RiskSignals */
/** @typedef {{explicitHarmThreat?: boolean}} RiskContext */
/** @param {RiskSignals} signals @param {RiskContext} [context] */
export function calculateCallRisk(signals, context = {}) {
  if (!context || typeof context !== 'object' || Array.isArray(context)
    || Object.keys(context).some(key => key !== 'explicitHarmThreat')
    || (context.explicitHarmThreat !== undefined && typeof context.explicitHarmThreat !== 'boolean')) {
    throw new RangeError('위협 근거 누락·오류');
  }
  if (context.explicitHarmThreat === true && (!validCount(signals.threat_count) || signals.threat_count < 1)) {
    throw new RangeError('명확한 위해 위협 근거·횟수 불일치');
  }
  const scores = {
    profanity_score: signalScore('profanity', signals.profanity_count),
    threat_score: signalScore('threat', signals.threat_count),
    blame_score: signalScore('blame', signals.blame_count),
    sexual_score: signalScore('sexual', signals.sexual_count),
    shouting_score: signalScore('shouting', signals.shouting_count),
  };
  const raw_score = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const count_threat_floor = [...RISK_RULE.threatFloors].reverse().find(rule => signals.threat_count >= rule.count)?.score ?? 0;
  const threat_floor = Math.max(count_threat_floor, context.explicitHarmThreat === true ? RISK_RULE.explicitHarmThreatFloor : 0);
  // Preserve item scores and result fields; any profanity raises only the final minimum.
  const profanity_floor = signals.profanity_count >= 1 ? RISK_RULE.profanityFloor : 0;
  const adjusted_score = Math.max(raw_score, threat_floor, profanity_floor);
  const risk_score = Math.min(adjusted_score, RISK_RULE.max);
  const band = riskBand(risk_score);
  if (!band) throw new RangeError('점수 계산 오류');
  return { signals: { ...signals }, scores, raw_score, adjusted_score, threat_floor, risk_score,
    risk_level: band.label, rule_version: RISK_RULE.version };
}
