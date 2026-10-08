import test from 'node:test';
import assert from 'node:assert/strict';
import { liveRiskEstimate } from '../src/live/livePresentation.js';
import { calculateCallRisk, riskBand } from '../src/lib/riskPolicy.js';
import type { LiveCall } from '../src/live/types.js';
import { parseLiveEvent } from '../src/live/liveCalls.js';

function fixture(threats = 2, profanity = 5, explicitHarm = true): LiveCall {
  const signals = [
    ...Array.from({ length: profanity }, () => ({ type: 'profanity' as const, matchedText: '가림', reason: '검증 신호' })),
    ...Array.from({ length: threats }, () => ({ type: 'threat' as const, matchedText: '검증 위협', reason: '검증 신호', explicitHarm })),
  ];
  return { call_id: 'isolated_call', status: 'live', started_at: '2026-10-08T00:00:00Z', ended_at: null,
    updated_at: '2026-10-08T00:01:00Z', error: null,
    messages: [{ turn_id: 'user_1', role: 'user', content: '격리 검증 발화', start_sec: 1, end_sec: null }],
    risk_analysis: { ruleVersion: 'local-text-rules-v8', analyzedUserTurns: 1, profanityCount: profanity,
      threatCount: threats, threatDetected: threats > 0, blameCount: 0, sexualCount: 0,
      analysisByTurn: { user_1: { profanityCount: profanity, threatCount: threats, threatDetected: threats > 0,
        blameCount: 0, sexualCount: 0, signals } } },
    audio_signal: { sequence: 1, shouting_count: 0, is_shouting: false, available: true, coverage_complete: true, closed: false },
  };
}

test('live estimate: filmed five profanities and two threats display the same 60-point level as the final policy', () => {
  const call = fixture(), before = structuredClone(call), value = liveRiskEstimate(call)!;
  assert.equal(value.risk_score, 60);
  assert.equal(riskBand(value.risk_score)?.level, 4);
  assert.deepEqual(value, calculateCallRisk(value.signals, { explicitHarmThreat: true }));
  assert.deepEqual(call, before);
  assert.equal(call.final_result, undefined);
  assert.equal(call.webhook_delivery, undefined);
});

for (const [count, explicitHarm, score, level] of [[1, false, 40, 3], [1, true, 60, 4], [2, false, 60, 4], [3, false, 80, 5]] as const) {
  test(`live estimate: ${count} threats, explicit harm ${explicitHarm} use ${score} points / level ${level}`, () => {
    const value = liveRiskEstimate(fixture(count, 0, explicitHarm))!;
    assert.equal(value.risk_score, score);
    assert.equal(riskBand(value.risk_score)?.level, level);
  });
}

test('live estimate: corrections replace the current signal counts instead of keeping the highest earlier grade', () => {
  assert.deepEqual([fixture(3, 0, false), fixture(2, 0, false), fixture(0, 0, false)]
    .map(call => liveRiskEstimate(call)?.risk_score), [80, 60, 0]);
});

test('live estimate: missing text or unmeasured audio never invent a zero-count score', () => {
  const call = fixture();
  assert.equal(liveRiskEstimate({ ...call, risk_analysis: null }), null);
  assert.equal(liveRiskEstimate({ ...call, risk_analysis: { ...call.risk_analysis!, analyzedUserTurns: 0, analysisByTurn: {} } }), null);
  assert.equal(liveRiskEstimate({ ...call, audio_signal: null }), null);
  assert.equal(liveRiskEstimate({ ...call, audio_signal: { ...call.audio_signal!, available: false } }), null);
});

test('live estimate: only observed partial audio counts are included without completing coverage or finalizing', () => {
  const call = fixture(0, 0, false);
  call.audio_signal = { ...call.audio_signal!, coverage_complete: false, shouting_count: 2 };
  const before = structuredClone(call), value = liveRiskEstimate(call)!;
  assert.equal(value.signals.shouting_count, 2);
  assert.equal(value.scores.shouting_score, 5);
  assert.deepEqual(call, before);
});

test('live estimate: ended calls use the server final result or pending state, never a live estimate', () => {
  const call = fixture(), value = liveRiskEstimate(call)!;
  const ended: LiveCall = { ...call, status: 'ended', ended_at: '2026-10-08T00:02:00Z' };
  assert.equal(liveRiskEstimate(ended), null);
  ended.final_result = { ...value, call_id: call.call_id, customer_id: null, completed_at: ended.ended_at! };
  const before = structuredClone(ended);
  assert.equal(liveRiskEstimate(ended), null);
  assert.deepEqual(ended, before);
  assert.equal(liveRiskEstimate({ ...call, status: 'error' }), null);
  assert.equal(liveRiskEstimate({ ...call, status: 'connecting' })?.risk_score, 60);
});

test('live estimate: invalid counts are withheld and never clamped or converted to zero', () => {
  for (const invalid of [-1, 1.5, NaN, Infinity, undefined]) {
    const call = fixture();
    call.audio_signal!.shouting_count = invalid as number;
    assert.equal(liveRiskEstimate(call), null);
    call.audio_signal!.shouting_count = 0;
    call.risk_analysis!.threatCount = invalid as number;
    assert.equal(liveRiskEstimate(call), null);
  }
});

test('live estimate: item sum and 99-point cap match the final policy without changing other calls', () => {
  const call = fixture(3, 7, false), other = fixture(1, 0, false), before = structuredClone(other);
  call.risk_analysis!.blameCount = 7;
  call.risk_analysis!.sexualCount = 3;
  call.audio_signal!.shouting_count = 5;
  const value = liveRiskEstimate(call)!;
  assert.equal(value.raw_score, 100);
  assert.equal(value.risk_score, 99);
  assert.equal(riskBand(value.risk_score)?.level, 5);
  assert.deepEqual(other, before);
  assert.equal(liveRiskEstimate(other)?.risk_score, 40);
});

test('live estimate: validated USER harm evidence survives the SSE parser with the same 60-point floor', () => {
  const parsed = parseLiveEvent(JSON.stringify({ type: 'transcript', ...fixture(1, 0, true) }));
  assert.ok(parsed && parsed.type !== 'snapshot');
  assert.equal(liveRiskEstimate(parsed)?.risk_score, 60);
});

test('live estimate: Agent-only or malformed harm evidence rejected by the parser cannot create a grade', () => {
  const agent = fixture(1, 0, true);
  agent.messages[0].role = 'agent';
  const malformed = fixture(1, 0, true);
  malformed.risk_analysis!.analysisByTurn.user_1.signals[0].explicitHarm = 'true' as unknown as boolean;
  for (const call of [agent, malformed]) {
    const parsed = parseLiveEvent(JSON.stringify({ type: 'transcript', ...call }));
    assert.ok(parsed && parsed.type !== 'snapshot');
    assert.equal(parsed.risk_analysis, null);
    assert.equal(liveRiskEstimate(parsed), null);
    assert.equal(parsed.messages.length, 1);
  }
});
