import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCallRisk, riskBand, signalScore } from '../src/lib/riskPolicy.js';
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
test('policy example: 2 profanity, 1 threat, 3 blame, 0 sexual, 2 shouting = 39', () => {
  const result = calculateCallRisk({ profanity_count: 2, threat_count: 1, blame_count: 3, sexual_count: 0, shouting_count: 2 });
  assert.deepEqual(result.scores, { profanity_score: 6, threat_score: 20, blame_score: 8, sexual_score: 0, shouting_score: 5 });
  assert.equal(result.raw_score, 39); assert.equal(result.risk_score, 39); assert.equal(result.risk_level, '주의');
});
test('threat floor is 40 for two and 60 for three; one threat has no artificial floor', () => {
  for (const [count, raw, final] of [[1,20,20],[2,30,40],[3,40,60],[10,40,60]]) {
    const result = calculateCallRisk({ ...zero, threat_count: count });
    assert.equal(result.raw_score, raw); assert.equal(result.risk_score, final);
  }
  const max = calculateCallRisk({ profanity_count: 7, threat_count: 3, blame_count: 7, sexual_count: 3, shouting_count: 5 });
  assert.equal(max.raw_score, 100); assert.equal(max.risk_score, 99); assert.equal(max.risk_level, '매우 위험');
});
test('a quiet call is zero with no historical deduction and no input mutation', () => {
  const before = { ...zero }; const result = calculateCallRisk(zero);
  assert.equal(result.risk_score, 0); assert.deepEqual(zero, before);
  assert.ok(!('before' in result) && !('discount' in result) && !('actualDelta' in result));
});
