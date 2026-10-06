import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCallRisk, riskBand, signalScore, RISK_RULE } from '../src/lib/riskPolicy.js';
const zero = { profanity_count: 0, threat_count: 0, blame_count: 0, sexual_count: 0, shouting_count: 0 };
for (const [kind, rows] of Object.entries({
  profanity: [[0,0],[1,3],[2,6],[3,6],[4,10],[6,10],[7,15],[10000,15]],
  threat: [[0,0],[1,20],[2,30],[3,40],[10000,40]],
  blame: [[0,0],[1,4],[2,8],[3,8],[4,14],[6,14],[7,20]],
  sexual: [[0,0],[1,5],[2,10],[3,15]],
  shouting: [[0,0],[1,2],[2,5],[3,8],[4,8],[5,10]],
})) for (const [count, points] of rows) test(kind + ' score table: ' + count, () => {
  assert.equal(signalScore(kind as Parameters<typeof signalScore>[0], count), points);
});
for (const [score, label] of [[0,'정상'],[19,'정상'],[20,'주의'],[39,'주의'],[40,'경계'],[59,'경계'],[60,'위험'],[79,'위험'],[80,'매우 위험'],[99,'매우 위험']] as const) {
  test('common grade boundary ' + score, () => assert.equal(riskBand(score)?.label, label));
}
test('invalid scores/counts are rejected, never treated as zero', () => {
  for (const value of [-1, 0.5, NaN, Infinity, null, undefined, '0']) {
    for (const key of Object.keys(zero)) assert.throws(() => calculateCallRisk({ ...zero, [key]: value }));
  }
  for (const score of [-1,100,1.5,NaN,Infinity,null,undefined,'0']) assert.equal(riskBand(score), null);
});
test('policy example keeps raw 39 but one threat raises final score to 40', () => {
  const result = calculateCallRisk({ profanity_count: 2, threat_count: 1, blame_count: 3, sexual_count: 0, shouting_count: 2 });
  assert.deepEqual(result.scores, { profanity_score: 6, threat_score: 20, blame_score: 8, sexual_score: 0, shouting_score: 5 });
  assert.equal(result.raw_score, 39); assert.equal(result.threat_floor, 40); assert.equal(result.adjusted_score, 40);
  assert.equal(result.risk_score, 40); assert.equal(result.risk_level, '경계');
});
test('threat floors are 40 for one, 60 for two and 80 for three or more without changing raw scores', () => {
  for (const [count, raw, final] of [[1,20,40],[2,30,60],[3,40,80],[10,40,80]]) {
    const result = calculateCallRisk({ ...zero, threat_count: count });
    assert.equal(result.raw_score, raw); assert.equal(result.threat_floor, final); assert.equal(result.adjusted_score, final); assert.equal(result.risk_score, final);
    assert.equal(result.risk_level, count === 1 ? '경계' : count === 2 ? '위험' : '매우 위험');
  }
  const max = calculateCallRisk({ profanity_count: 7, threat_count: 3, blame_count: 7, sexual_count: 3, shouting_count: 5 });
  assert.equal(max.raw_score, 100); assert.equal(max.risk_score, 99); assert.equal(max.risk_level, '매우 위험');
});
test('a quiet call is zero with no historical deduction and no input mutation', () => {
  const before = { ...zero }; const result = calculateCallRisk(zero);
  assert.equal(result.risk_score, 0); assert.deepEqual(zero, before);
  assert.ok(!('before' in result) && !('discount' in result) && !('actualDelta' in result));
});

test('profanity counts of one or more reach the 20-point final floor without changing item points', () => {
  for (const [count, raw] of [[1,3],[2,6],[3,6],[4,10],[6,10],[7,15],[10000,15]]) {
    const result = calculateCallRisk({ ...zero, profanity_count: count });
    assert.equal(result.scores.profanity_score, raw);
    assert.equal(result.raw_score, raw); assert.equal(result.adjusted_score, 20);
    assert.equal(result.threat_floor, 0); assert.equal(result.risk_score, 20); assert.equal(result.risk_level, '주의');
    assert.equal(result.rule_version, 'call-risk-v4');
  }
  assert.equal(RISK_RULE.profanityFloor, 20);
  assert.deepEqual(Object.keys(calculateCallRisk(zero)).sort(), ['signals','scores','raw_score','adjusted_score','threat_floor','risk_score','risk_level','rule_version'].sort());
});

test('composite raw scores below, at and above 20 apply the profanity minimum without replacing larger sums', () => {
  const cases = [
    { signals: { ...zero, profanity_count: 2, blame_count: 2, sexual_count: 1 }, raw: 19, final: 20 },
    { signals: { ...zero, profanity_count: 1, blame_count: 1, sexual_count: 1, shouting_count: 3 }, raw: 20, final: 20 },
    { signals: { ...zero, profanity_count: 4, blame_count: 1, sexual_count: 1, shouting_count: 1 }, raw: 21, final: 21 },
    { signals: { ...zero, blame_count: 4, sexual_count: 1 }, raw: 19, final: 19 },
  ];
  for (const { signals, raw, final } of cases) {
    const result = calculateCallRisk(signals);
    assert.equal(result.raw_score, raw); assert.equal(result.adjusted_score, final); assert.equal(result.risk_score, final);
    assert.equal(result.risk_level, final < 20 ? '정상' : '주의');
  }
});

test('threat floors remain stronger than profanity floor and the 99-point cap stays last', () => {
  for (const [threatCount, raw, final] of [[1,23,40],[2,33,60],[3,43,80]]) {
    const result = calculateCallRisk({ ...zero, profanity_count: 1, threat_count: threatCount });
    assert.equal(result.raw_score, raw); assert.equal(result.adjusted_score, final); assert.equal(result.risk_score, final);
    assert.equal(result.threat_floor, final);
  }
  const capped = calculateCallRisk({ profanity_count: 7, threat_count: 3, blame_count: 7, sexual_count: 3, shouting_count: 5 });
  assert.equal(capped.raw_score, 100); assert.equal(capped.adjusted_score, 100); assert.equal(capped.risk_score, 99);
});

test('a corrected profanity count removes its floor without mutating the original or carrying it to another call', () => {
  const original = { ...zero, profanity_count: 1 };
  const before = { ...original }; const flagged = calculateCallRisk(original);
  const corrected = calculateCallRisk({ ...original, profanity_count: 0 });
  assert.equal(flagged.risk_score, 20); assert.equal(flagged.raw_score, 3);
  assert.equal(corrected.raw_score, 0); assert.equal(corrected.adjusted_score, 0); assert.equal(corrected.risk_score, 0);
  assert.equal(calculateCallRisk(zero).risk_score, 0); assert.deepEqual(original, before);
  original.profanity_count = 0; assert.equal(flagged.signals.profanity_count, 1); assert.equal(flagged.risk_score, 20);
});

test('raw scores around each threat floor keep the larger score and retain the separate threshold', () => {
  const cases = [
    { signals: { ...zero, threat_count: 1, profanity_count: 2, blame_count: 3, shouting_count: 2 }, raw: 39, floor: 40, final: 40 },
    { signals: { ...zero, threat_count: 1, profanity_count: 4, blame_count: 2, shouting_count: 1 }, raw: 40, floor: 40, final: 40 },
    { signals: { ...zero, threat_count: 1, profanity_count: 2, blame_count: 2, sexual_count: 1, shouting_count: 1 }, raw: 41, floor: 40, final: 41 },
    { signals: { ...zero, threat_count: 2, profanity_count: 4, blame_count: 4, sexual_count: 1 }, raw: 59, floor: 60, final: 60 },
    { signals: { ...zero, threat_count: 2, profanity_count: 7, sexual_count: 3 }, raw: 60, floor: 60, final: 60 },
    { signals: { ...zero, threat_count: 2, profanity_count: 7, blame_count: 4, shouting_count: 1 }, raw: 61, floor: 60, final: 61 },
    { signals: { ...zero, threat_count: 3, profanity_count: 7, blame_count: 4, sexual_count: 2 }, raw: 79, floor: 80, final: 80 },
    { signals: { ...zero, threat_count: 3, profanity_count: 7, blame_count: 7, sexual_count: 1 }, raw: 80, floor: 80, final: 80 },
    { signals: { ...zero, threat_count: 3, profanity_count: 7, blame_count: 4, sexual_count: 2, shouting_count: 1 }, raw: 81, floor: 80, final: 81 },
  ];
  for (const { signals, raw, floor, final } of cases) {
    const result = calculateCallRisk(signals);
    assert.equal(result.raw_score, raw); assert.equal(result.threat_floor, floor); assert.equal(result.adjusted_score, final); assert.equal(result.risk_score, final);
  }
  assert.ok(Object.isFrozen(RISK_RULE.threatFloors) && RISK_RULE.threatFloors.every(Object.isFrozen));
});

test('zero threats retain the previous profanity, blame, sexual and shouting results', () => {
  for (const { signals, raw, final } of [
    { signals: zero, raw: 0, final: 0 },
    { signals: { ...zero, profanity_count: 1 }, raw: 3, final: 20 },
    { signals: { ...zero, profanity_count: 2, blame_count: 3, shouting_count: 2 }, raw: 19, final: 20 },
    { signals: { ...zero, blame_count: 4, sexual_count: 1 }, raw: 19, final: 19 },
    { signals: { ...zero, profanity_count: 7, blame_count: 7, sexual_count: 3, shouting_count: 5 }, raw: 60, final: 60 },
    { signals: { ...zero, shouting_count: 5 }, raw: 10, final: 10 },
  ]) {
    const result = calculateCallRisk(signals);
    assert.equal(result.raw_score, raw); assert.equal(result.threat_floor, 0); assert.equal(result.risk_score, final);
  }
});

test('corrected threat counts lower only the current call floor without changing earlier results or raw tables', () => {
  const snapshots = [3,2,1,0].map(threat_count => calculateCallRisk({ ...zero, threat_count }));
  assert.deepEqual(snapshots.map(result => result.raw_score), [40,30,20,0]);
  assert.deepEqual(snapshots.map(result => result.threat_floor), [80,60,40,0]);
  assert.deepEqual(snapshots.map(result => result.risk_score), [80,60,40,0]);
  assert.deepEqual(snapshots.map(result => result.signals.threat_count), [3,2,1,0]);
  assert.equal(calculateCallRisk(zero).risk_score, 0); assert.equal(snapshots[0].risk_score, 80);
});
