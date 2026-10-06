import { calculateCallRisk } from '../src/lib/riskPolicy.js';
import './livePresentation.test.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLiveEvent, isNearConversationBottom, parseLiveEvent, subscribeLiveCalls } from '../src/live/liveCalls.js';
import type { LiveCall, LiveCallsEvent, LiveRiskAnalysis } from '../src/live/types.js';

const call = (id = 'call_one'): LiveCall => ({ call_id: id, status: 'live', started_at: '2026-10-01T02:00:00Z', ended_at: null, updated_at: '2026-10-01T02:00:00Z', messages: [], error: null });
const message = (id: string, content: string) => ({ turn_id: id, role: 'user' as const, content, start_sec: 1, end_sec: null });

test('live UI: empty initial snapshot stays empty, and new call appears independently', () => {
  let state = applyLiveEvent([], { type: 'snapshot', calls: [] });
  assert.equal(state.length, 0);
  state = applyLiveEvent(state, { type: 'call_started', ...call() });
  assert.equal(state.length, 1);
  assert.equal(state[0].status, 'live');
});

test('live UI: full snapshots replace messages, including shorter corrections, instead of appending', () => {
  let state = [call()];
  for (const content of ['요금제를', '요금제를 변경하고 싶어요.', '요금 문의입니다.']) {
    state = applyLiveEvent(state, { type: 'transcript', ...call(), messages: [message('user_1', content)] });
    assert.equal(state[0].messages.length, 1);
    assert.equal(state[0].messages[0].content, content);
  }
  state = applyLiveEvent(state, { type: 'transcript', ...call(), messages: [message('user_1', '요금 문의입니다.'), { ...message('agent_1', '도와드리겠습니다.'), role: 'agent' }] });
  assert.deepEqual(state[0].messages.map(item => item.role), ['user', 'agent']);
  assert.equal(state[0].messages.length, 2);
});

test('live UI: call IDs stay isolated and ended call keeps its final conversation', () => {
  const other = call('call_other');
  const state = applyLiveEvent([call(), other], { type: 'call_ended', ...call(), status: 'ended', ended_at: '2026-10-01T02:01:00Z', messages: [message('user_1', '마지막 대화')] });
  assert.equal(state[1], other);
  assert.equal(state[0].status, 'ended');
  assert.equal(state[0].messages[0].content, '마지막 대화');
  assert.equal(applyLiveEvent(state, { type: 'snapshot', calls: [] }).length, 0); // server restart
});

test('live UI: refresh/reconnect snapshot restores current state and never duplicates calls', () => {
  const snapshot: LiveCallsEvent = { type: 'snapshot', calls: [{ ...call(), messages: [message('user_1', '현재 대화')] }] };
  let state = applyLiveEvent([], snapshot);
  state = applyLiveEvent(state, snapshot);
  assert.equal(state.length, 1);
  assert.equal(state[0].messages.length, 1);
});

test('live UI: malformed events, unknown roles, duplicate turn IDs and NaN timing are rejected', () => {
  assert.equal(parseLiveEvent('not json'), null);
  assert.equal(parseLiveEvent(JSON.stringify({ type: 'unknown', ...call() })), null);
  assert.equal(parseLiveEvent(JSON.stringify({ type: 'snapshot', calls: [call(), call()] })), null);
  assert.equal(parseLiveEvent(JSON.stringify({ type: 'transcript', ...call(), messages: [message('x', 'a'), message('x', 'b')] })), null);
  assert.equal(parseLiveEvent(JSON.stringify({ type: 'transcript', ...call(), messages: [{ ...message('x', 'a'), role: 'tool' }] })), null);
  assert.equal(parseLiveEvent(JSON.stringify({ type: 'transcript', ...call(), messages: [{ ...message('x', 'a'), start_sec: -1 }] })), null);
  assert.ok(parseLiveEvent(JSON.stringify({ type: 'transcript', ...call(), messages: [message('x', '<img onerror=alert(1)>')] })));
});

test('live UI: EventSource automatically reconnects without additional sources; disposal removes listeners', () => {
  class Source extends EventTarget { closed = false; close() { this.closed = true; } }
  const source = new Source();
  let instances = 0, received = 0;
  const connections: string[] = [];
  const cleanup = subscribeLiveCalls(() => received++, status => connections.push(status), () => { instances++; return source; });
  source.dispatchEvent(new MessageEvent('snapshot', { data: JSON.stringify({ type: 'snapshot', calls: [call()] }) }));
  source.dispatchEvent(new Event('error')); source.dispatchEvent(new Event('error'));
  source.dispatchEvent(new MessageEvent('snapshot', { data: JSON.stringify({ type: 'snapshot', calls: [call()] }) }));
  assert.equal(instances, 1);
  assert.equal(received, 2);
  assert.deepEqual(connections, ['connected', 'reconnecting', 'reconnecting', 'connected']);
  cleanup(); cleanup();
  source.dispatchEvent(new MessageEvent('snapshot', { data: JSON.stringify({ type: 'snapshot', calls: [] }) }));
  source.dispatchEvent(new Event('error'));
  assert.equal(received, 2);
  assert.equal(source.closed, true);
  assert.equal(connections.length, 4);
});

test('live UI: auto-follow applies near the bottom, not while reading earlier conversation', () => {
  assert.equal(isNearConversationBottom(690, 300, 1000), true);
  assert.equal(isNearConversationBottom(0, 300, 1000), false);
  assert.equal(isNearConversationBottom(0, 300, 200), true);
});

const risk = (threat = true): LiveRiskAnalysis => ({ ruleVersion: 'local-text-rules-v2', analyzedUserTurns: 1, profanityCount: 0, blameCount: 0, sexualCount: 0,
  threatCount: threat ? 1 : 0, threatDetected: threat,
  analysisByTurn: { user_1: { profanityCount: 0, blameCount: 0, sexualCount: 0, threatCount: threat ? 1 : 0, threatDetected: threat,
    signals: threat ? [{ type: 'threat', matchedText: '너 찾아간다', reason: '상대방을 지목한 위협적 방문 의사' }] : [] } } });

test('live UI risk: same snapshot replaces transcript and server findings; no incremental scoring', () => {
  const first = parseLiveEvent(JSON.stringify({ type: 'transcript', ...call(), messages: [message('user_1', '내가 너 찾아간다.')], risk_analysis: risk() }));
  assert.ok(first);
  let state = applyLiveEvent([], first);
  assert.equal(state[0].risk_analysis?.threatDetected, true);
  const corrected = parseLiveEvent(JSON.stringify({ type: 'transcript', ...call(), messages: [message('user_1', '내일 매장에 찾아가겠습니다.')], risk_analysis: risk(false) }));
  assert.ok(corrected); state = applyLiveEvent(state, corrected);
  assert.equal(state[0].messages.length, 1); assert.equal(state[0].risk_analysis?.threatCount, 0);
  assert.equal(state[0].risk_analysis?.threatDetected, false);
});

test('live UI risk: older/malformed analysis never hides or breaks valid transcript', () => {
  for (const analysis of [undefined, null, { ...risk(), threatCount: -1 }, { ...risk(), threatCount: 10 }, { ...risk(), threatDetected: false }, { ...risk(), analysisByTurn: {} }]) {
    const event = parseLiveEvent(JSON.stringify({ type: 'snapshot', calls: [{ ...call(), messages: [message('user_1', '대화 유지')], risk_analysis: analysis }] }));
    assert.ok(event && event.type === 'snapshot');
    assert.equal(event.calls[0].messages[0].content, '대화 유지');
    assert.equal(event.calls[0].risk_analysis, null);
  }
});

test('live UI risk: findings for an AGENT or unknown turn are not displayed as customer signals', () => {
  const event = parseLiveEvent(JSON.stringify({ type: 'transcript', ...call(), messages: [{ ...message('user_1', '위협 문구 설명'), role: 'agent' }], risk_analysis: risk() }));
  assert.ok(event && event.type === 'transcript');
  assert.equal(event.messages.length, 1); assert.equal(event.risk_analysis, null);
});
test('live UI: valid finalized payload appears only after end, malformed scores stay unavailable',()=>{
  const result={...calculateCallRisk({profanity_count:2,threat_count:1,blame_count:3,sexual_count:0,shouting_count:2}),call_id:'call_one',customer_id:null,completed_at:'2026-10-01T02:01:00Z'};
  const ended={...call(),status:'ended',ended_at:result.completed_at,final_result:result};
  const valid=parseLiveEvent(JSON.stringify({type:'risk_finalized',...ended}));
  assert.ok(valid && valid.type==='risk_finalized');assert.equal(valid.final_result?.raw_score,39);assert.equal(valid.final_result?.risk_score,40);assert.equal(valid.final_result?.risk_level,'경계');
  const live=parseLiveEvent(JSON.stringify({type:'transcript',...call(),final_result:result}));
  assert.ok(live && live.type==='transcript');assert.equal(live.final_result,null);
  for(const final_result of [{...result,risk_score:99},{...result,risk_level:'정상'},{...result,call_id:'other'},{...result,signals:{...result.signals,shouting_count:null}}]){
    const bad=parseLiveEvent(JSON.stringify({type:'call_ended',...ended,final_result}));
    assert.ok(bad && bad.type==='call_ended');assert.equal(bad.final_result,null);
  }
});
test('live UI: profanity floor accepts 20 caution and rejects an unadjusted normal score',()=>{
  const result={...calculateCallRisk({profanity_count:1,threat_count:0,blame_count:0,sexual_count:0,shouting_count:0}),call_id:'call_one',customer_id:null,completed_at:'2026-10-01T02:01:00Z'};
  const ended={...call(),status:'ended',ended_at:result.completed_at,messages:[message('u1','씨발')],final_result:result};
  const valid=parseLiveEvent(JSON.stringify({type:'risk_finalized',...ended}));
  assert.ok(valid && valid.type==='risk_finalized');
  assert.equal(valid.final_result?.scores.profanity_score,3);
  assert.equal(valid.final_result?.risk_score,20);assert.equal(valid.final_result?.risk_level,'주의');
  const invalid=parseLiveEvent(JSON.stringify({type:'risk_finalized',...ended,final_result:{...result,adjusted_score:3,risk_score:3,risk_level:'정상'}}));
  assert.ok(invalid && invalid.type==='risk_finalized');
  assert.equal(invalid.final_result,null);assert.equal(invalid.messages[0].content,'씨발');
});

test('live UI: escalated threat floors are accepted and lower raw-only results never become final',()=>{
  for (const [threat, score, raw] of [[1,40,20],[2,60,30],[3,80,40]]) {
    const result={...calculateCallRisk({profanity_count:0,threat_count:threat,blame_count:0,sexual_count:0,shouting_count:0}),call_id:'call_one',customer_id:null,completed_at:'2026-10-01T02:01:00Z'};
    const ended={...call(),status:'ended',ended_at:result.completed_at,messages:[message('u1','너 찾아가서 팬다')],final_result:result};
    const valid=parseLiveEvent(JSON.stringify({type:'risk_finalized',...ended}));
    assert.ok(valid && valid.type==='risk_finalized');
    assert.equal(valid.final_result?.raw_score,raw);assert.equal(valid.final_result?.risk_score,score);assert.equal(valid.final_result?.threat_floor,score);
    const invalid=parseLiveEvent(JSON.stringify({type:'risk_finalized',...ended,final_result:{...result,adjusted_score:raw,risk_score:raw,risk_level:raw<40?'주의':'경계',threat_floor:0}}));
    assert.ok(invalid && invalid.type==='risk_finalized');assert.equal(invalid.final_result,null);assert.equal(invalid.messages[0].content,'너 찾아가서 팬다');
  }
});

test('live UI: audio SSE updates one call and malformed audio does not hide transcript',()=>{
  const audio={sequence:1,shouting_count:2,is_shouting:true,available:true,coverage_complete:true,closed:false};
  const event=parseLiveEvent(JSON.stringify({type:'audio_signal',...call(),audio_signal:audio}));
  assert.ok(event && event.type==='audio_signal');const other=call('other');
  const state=applyLiveEvent([call(),other],event);assert.equal(state[0].audio_signal?.shouting_count,2);assert.equal(state[1],other);
  const bad=parseLiveEvent(JSON.stringify({type:'audio_signal',...call(),messages:[message('x','대화 유지')],audio_signal:{...audio,shouting_count:-1}}));
  assert.ok(bad && bad.type==='audio_signal');assert.equal(bad.audio_signal,null);assert.equal(bad.messages.length,1);
});

const explicitHarmAnalysis = (marker: unknown = true) => ({ ...risk(), ruleVersion: 'local-text-rules-v6',
  analysisByTurn: { user_1: { ...risk().analysisByTurn.user_1, signals: [{ type: 'threat', matchedText: '매장 부숴버릴 거야',
    reason: '시설·매장을 대상으로 한 파괴 의사', ...(marker === undefined ? {} : { explicitHarm: marker }) }] } } });
const harmFinal = () => ({ ...calculateCallRisk({ profanity_count: 0, threat_count: 1, blame_count: 0, sexual_count: 0, shouting_count: 0 },
  { explicitHarmThreat: true }), call_id: 'call_one', customer_id: null, completed_at: '2026-10-01T02:01:00Z' });
const endedHarmCall = (analysis: unknown = explicitHarmAnalysis()) => ({ ...call(), status: 'ended', ended_at: harmFinal().completed_at,
  messages: [message('user_1', '매장 부숴버릴 거야')], risk_analysis: analysis, final_result: harmFinal() });

test('live UI: verified USER explicit harm marker accepts one-threat 60 floor without changing final contract', () => {
  const event = parseLiveEvent(JSON.stringify({ type: 'risk_finalized', ...endedHarmCall(),
    final_result: { ...harmFinal(), privateExtra: 'not-part-of-final-contract' } }));
  assert.ok(event && event.type === 'risk_finalized');
  assert.equal(event.final_result?.raw_score, 20); assert.equal(event.final_result?.threat_floor, 60);
  assert.equal(event.final_result?.risk_score, 60); assert.equal(event.final_result?.risk_level, '위험');
  assert.equal(event.risk_analysis?.analysisByTurn.user_1.signals[0].explicitHarm, true);
  assert.deepEqual(Object.keys(event.final_result!).sort(), Object.keys(harmFinal()).sort());
  assert.equal(Object.hasOwn(event.final_result!, 'explicitHarmThreat'), false);
  assert.equal(Object.hasOwn(event.final_result!.signals, 'explicitHarm'), false);
});

test('live UI: absent and false explicit harm markers retain generic one-threat 40 floor', () => {
  const generic = { ...calculateCallRisk({ profanity_count: 0, threat_count: 1, blame_count: 0, sexual_count: 0, shouting_count: 0 }),
    call_id: 'call_one', customer_id: null, completed_at: harmFinal().completed_at };
  for (const analysis of [risk(), explicitHarmAnalysis(false)]) {
    const event = parseLiveEvent(JSON.stringify({ type: 'risk_finalized', ...endedHarmCall(analysis), final_result: generic }));
    assert.ok(event && event.type === 'risk_finalized'); assert.equal(event.final_result?.risk_score, 40); assert.equal(event.final_result?.threat_floor, 40);
    const inflated = parseLiveEvent(JSON.stringify({ type: 'risk_finalized', ...endedHarmCall(analysis) }));
    assert.ok(inflated && inflated.type === 'risk_finalized'); assert.equal(inflated.final_result, null);
  }
});

test('live UI: malformed explicit harm markers do not hide transcript or justify the 60 floor', () => {
  for (const marker of ['true', 1, 0, null, {}, []]) {
    const event = parseLiveEvent(JSON.stringify({ type: 'risk_finalized', ...endedHarmCall(explicitHarmAnalysis(marker)) }));
    assert.ok(event && event.type === 'risk_finalized'); assert.equal(event.risk_analysis, null); assert.equal(event.final_result, null);
    assert.equal(event.messages[0].content, '매장 부숴버릴 거야');
  }
});

test('live UI: true harm marker on a non-threat signal is invalid while false remains compatible', () => {
  for (const marker of [true, false]) {
    const turn = { profanityCount: 1, threatCount: 0, threatDetected: false, blameCount: 0, sexualCount: 0,
      signals: [{ type: 'profanity', matchedText: '욕설', reason: '저장 분석', explicitHarm: marker }] };
    const analysis = { ruleVersion: 'local-text-rules-v6', analyzedUserTurns: 1, profanityCount: 1, threatCount: 0,
      threatDetected: false, blameCount: 0, sexualCount: 0, analysisByTurn: { user_1: turn } };
    const event = parseLiveEvent(JSON.stringify({ type: 'risk_finalized', ...endedHarmCall(analysis) }));
    assert.ok(event && event.type === 'risk_finalized'); assert.equal(event.risk_analysis === null, marker); assert.equal(event.final_result, null);
  }
});

test('live UI: Agent and unknown-turn harm markers cannot establish a customer harm floor', () => {
  const agent = parseLiveEvent(JSON.stringify({ type: 'risk_finalized', ...endedHarmCall(),
    messages: [{ ...message('user_1', '위협 표현 설명'), role: 'agent' }] }));
  assert.ok(agent && agent.type === 'risk_finalized'); assert.equal(agent.risk_analysis, null); assert.equal(agent.final_result, null);
  const unknown = parseLiveEvent(JSON.stringify({ type: 'risk_finalized', ...endedHarmCall(), messages: [message('other_user', '대화 유지')] }));
  assert.ok(unknown && unknown.type === 'risk_finalized'); assert.equal(unknown.risk_analysis, null); assert.equal(unknown.final_result, null);
});

test('live UI: invalid or missing analysis cannot justify 60 even when raw body contains a harm marker', () => {
  for (const analysis of [null, undefined, { ...explicitHarmAnalysis(), analyzedUserTurns: 2 }, { ...explicitHarmAnalysis(), threatCount: 2 },
    { ...explicitHarmAnalysis(), threatDetected: false }, { ...explicitHarmAnalysis(), analysisByTurn: {} }]) {
    const event = parseLiveEvent(JSON.stringify({ type: 'risk_finalized', ...endedHarmCall(), risk_analysis: analysis, explicitHarmThreat: true }));
    assert.ok(event && event.type === 'risk_finalized'); assert.equal(event.risk_analysis, null); assert.equal(event.final_result, null);
  }
});

test('live UI: explicit harm floor still rejects stale policy versions and tampered final fields', () => {
  const result = harmFinal();
  for (const final_result of [{ ...result, rule_version: 'call-risk-v4' }, { ...result, raw_score: 60 }, { ...result, adjusted_score: 40 },
    { ...result, threat_floor: 40 }, { ...result, risk_score: 40 }, { ...result, risk_level: '경계' }, { ...result, call_id: 'other_call' },
    { ...result, completed_at: '2026-10-01T02:02:00Z' }, { ...result, scores: { ...result.scores, threat_score: 60 } }]) {
    const event = parseLiveEvent(JSON.stringify({ type: 'risk_finalized', ...endedHarmCall(), final_result }));
    assert.ok(event && event.type === 'risk_finalized'); assert.equal(event.final_result, null); assert.ok(event.risk_analysis);
  }
});

test('live UI: corrected harm analysis replaces old metadata and finalized state across SSE snapshots', () => {
  const first = parseLiveEvent(JSON.stringify({ type: 'risk_finalized', ...endedHarmCall() }));
  assert.ok(first && first.type === 'risk_finalized'); let state = applyLiveEvent([], first);
  assert.equal(state[0].final_result?.risk_score, 60);
  const cleared = parseLiveEvent(JSON.stringify({ type: 'transcript', ...call(), messages: [message('user_1', '요금 문의입니다.')], risk_analysis: risk(false) }));
  assert.ok(cleared && cleared.type === 'transcript'); state = applyLiveEvent(state, cleared);
  assert.equal(state[0].final_result, null); assert.deepEqual(state[0].risk_analysis?.analysisByTurn.user_1.signals, []);
  assert.equal(state[0].risk_analysis?.threatCount, 0);
});
