import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { analyzeRiskText, analyzeTranscriptRisk, TEXT_RISK_RULE_VERSION } from '../text-risk.mjs';
import { createLiveCallStore } from '../live-calls.mjs';
import { createMonitorRegistry } from '../monitor.mjs';
import { createLiveEvents } from '../live-events.mjs';

const message = (id, content, role = 'user') => ({ turn_id: id, content, role, start_sec: 1, end_sec: null });
const turn = (id, content, role = 'user') => ({ id, content, role, time_sec: 1 });
const totals = value => [value.profanityCount, value.threatCount, value.blameCount, value.sexualCount];

for (const [text, expected] of [
  ['일을 왜 이렇게 못해요?', [0, 0, 1, 0]],
  ['사람이 뭐라 하는 거야? 내가 너 찾아간다.', [0, 1, 0, 0]],
  ['내일 매장에 찾아가겠습니다.', [0, 0, 0, 0]],
  ['매장 찾아갈게요.', [0, 0, 0, 0]],
  ['상담을 이렇게밖에 못해요?', [0, 0, 1, 0]],
  ['너 어디 사냐?', [0, 0, 0, 0]],
  ['너 어디 사냐? 가만 안 둔다.', [0, 1, 0, 0]],
  ['죽여버린다.', [0, 1, 0, 0]],
  ['가만 안 둔다.', [0, 1, 0, 0]],
  ['짜증난다. 몇 번을 말해야 하냐? 왜 계속 설명해야 하냐? 말이 안 된다. 너무 불편하다.', [0, 0, 0, 0]],
  ['씨발 씨발, 말이 안 통하네. 내가 너 찾아간다.', [2, 1, 1, 0]],
  ['시발점과 시발역을 설명해 주세요. 강아지 새끼가 귀엽네요.', [0, 0, 0, 0]],
  ['안 말이 안 통하네. 답답하지 않네요. 죽여버리지 않겠어요.', [0, 0, 0, 0]],
  ['“내가 너 찾아간다”라고 들었어요. 죽여버린다고 하면 안 되죠. 가만 안 둔다는 말은 안 했어요.', [0, 0, 0, 0]],
]) {
  test(`local text rules: ${text}`, () => {
    const result = analyzeRiskText(text);
    assert.deepEqual(totals(result), expected);
    assert.equal(result.threatDetected, expected[1] > 0);
    assert.equal(result.signals.length, expected.reduce((a, b) => a + b, 0));
    assert.ok(result.signals.every(signal => signal.matchedText && signal.reason));
  });
}

test('local rules: same turn grows/changes/removes findings; repeated snapshots never increment counts', () => {
  const store = createLiveCallStore(); store.connecting('one'); store.live('one');
  for (const text of ['내가', '내가 너', '내가 너 찾아간다.', '내가 너 찾아간다.']) {
    store.transcript('one', [turn('user_2', text)]);
    const call = store.snapshot()[0];
    assert.equal(call.messages.length, 1);
    assert.equal(call.risk_analysis.threatCount, text.endsWith('찾아간다.') ? 1 : 0);
    assert.equal(call.risk_analysis.analyzedUserTurns, 1);
  }
  store.transcript('one', [turn('user_2', '내일 매장에 찾아가겠습니다.')]);
  assert.equal(store.snapshot()[0].risk_analysis.threatDetected, false);
  assert.equal(store.snapshot()[0].risk_analysis.threatCount, 0);
  store.transcript('one', [turn('user_2', '씨발 씨발')]);
  assert.equal(store.snapshot()[0].risk_analysis.profanityCount, 2);
  store.transcript('one', [turn('user_2', '씨발')]);
  assert.equal(store.snapshot()[0].risk_analysis.profanityCount, 1);
  store.transcript('one', []);
  assert.deepEqual(totals(store.snapshot()[0].risk_analysis), [0, 0, 0, 0]);
  assert.deepEqual(store.snapshot()[0].risk_analysis.analysisByTurn, {});
});

test('local rules: only USER, one result per ID, overlapping signals remain distinct categories', () => {
  const result = analyzeTranscriptRisk([
    message('agent_1', '씨발, 내가 너 찾아간다. 말이 안 통하네.', 'agent'),
    message('user_1', '오인식'), message('user_1', '씨발, 말이 안 통하네. 내가 너 찾아간다.'),
  ]);
  assert.deepEqual(totals(result), [1, 1, 1, 0]);
  assert.equal(result.analyzedUserTurns, 1);
  assert.deepEqual(Object.keys(result.analysisByTurn), ['user_1']);
  assert.equal(result.ruleVersion, TEXT_RISK_RULE_VERSION);
  assert.ok(!('risk_score' in result) && !('shoutingCount' in result));
});

test('local rules: different user turns count separately; corrected role removes previous USER findings', () => {
  const store = createLiveCallStore(); store.connecting('one');
  store.transcript('one', [turn('u1', '일을 왜 이렇게 못해요?'), turn('u2', '일을 왜 이렇게 못해요?')]);
  assert.equal(store.snapshot()[0].risk_analysis.blameCount, 2);
  store.transcript('one', [turn('u1', '일을 왜 이렇게 못해요?', 'agent'), turn('u2', '안녕하세요.')]);
  assert.deepEqual(totals(store.snapshot()[0].risk_analysis), [0, 0, 0, 0]);
  assert.deepEqual(Object.keys(store.snapshot()[0].risk_analysis.analysisByTurn), ['u2']);
});

test('local rules: call isolation, end/error retention, restart reset and unusual ID safety', () => {
  const store = createLiveCallStore(); store.connecting('A'); store.connecting('B');
  store.transcript('A', [turn('__proto__', '내가 너 찾아간다.'), turn('constructor', '일을 왜 이렇게 못해요?')]);
  store.transcript('B', [turn('__proto__', '안녕하세요.')]);
  const before = store.snapshot();
  assert.deepEqual(totals(before[0].risk_analysis), [0, 1, 1, 0]);
  assert.deepEqual(totals(before[1].risk_analysis), [0, 0, 0, 0]);
  assert.equal(Object.hasOwn(before[0].risk_analysis.analysisByTurn, '__proto__'), true);
  store.ended('A'); store.ended('A'); store.transcript('A', []); store.error('A');
  assert.deepEqual(store.snapshot()[0].risk_analysis, before[0].risk_analysis);
  assert.deepEqual(store.snapshot()[0].messages, before[0].messages);
  store.error('B'); assert.deepEqual(store.snapshot()[1].risk_analysis, before[1].risk_analysis);
  assert.deepEqual(createLiveCallStore().snapshot(), []);
});

test('local rules: unchanged USER turns are cached across AI updates; no network requests', t => {
  let analyzed = 0, network = 0;
  t.mock.method(globalThis, 'fetch', () => { network++; throw new Error('No external classifier allowed'); });
  const analyze = text => { analyzed++; return analyzeRiskText(text); };
  const first = [message('u1', '일을 왜 이렇게 못해요?')];
  let previous = first, result = analyzeTranscriptRisk(first, [], undefined, analyze);
  const started = performance.now();
  for (let n = 0; n < 500; n++) {
    const current = [...first, message('a1', `AI 발화 이어짐 ${n}`, 'agent')];
    result = analyzeTranscriptRisk(current, previous, result, analyze); previous = current;
  }
  assert.equal(analyzed, 1); assert.equal(network, 0);
  assert.deepEqual(totals(result), [0, 0, 1, 0]);
  t.diagnostic(`500 agent transcript updates: ${(performance.now() - started).toFixed(1)}ms; USER analyzed once`);
  const corrected = [message('u1', '내가 너 찾아간다.')];
  result = analyzeTranscriptRisk(corrected, previous, result, analyze);
  assert.equal(analyzed, 2); assert.deepEqual(totals(result), [0, 1, 0, 0]);
});

test('Monitor → analysis → SSE: official SDK mock frames atomically carry corrected findings and retain them on end', async t => {
  const original = globalThis.WebSocket, sockets = [];
  class FakeSocket { constructor() { sockets.push(this); } close() {} frame(data) { this.onmessage?.({ data: JSON.stringify(data) }); } }
  globalThis.WebSocket = FakeSocket;
  const store = createLiveCallStore(), sse = createLiveEvents(store);
  const registry = createMonitorRegistry({ key: 'isolated-test', liveCalls: store, log: () => {} });
  class Response extends EventEmitter {
    frames = []; destroyed = false;
    writeHead() {} setTimeout() {} flushHeaders() {}
    write(frame) { this.frames.push(frame); return true; }
    end() { this.emit('close'); }
  }
  const response = new Response(); sse.connect(response);
  t.after(() => { registry.close(); sse.close(); globalThis.WebSocket = original; });
  const last = () => JSON.parse(response.frames.at(-1).split('\ndata: ')[1]);
  registry.start('one'); await new Promise(resolve => setImmediate(resolve));
  sockets[0].frame({ type: 'transcript_snapshot', transcripts: [turn('u1', '일을 왜 이렇게 못해요?'), turn('u2', '내가')] });
  assert.deepEqual(totals(last().risk_analysis), [0, 0, 1, 0]);
  sockets[0].frame({ type: 'transcript_updated', transcripts: [turn('u2', '사람이 뭐라 하는 거야? 내가 너 찾아간다.')] });
  const threat = last();
  assert.equal(threat.messages.length, 2);
  assert.deepEqual(totals(threat.risk_analysis), [0, 1, 1, 0]);
  assert.equal(threat.risk_analysis.threatDetected, true);
  sockets[0].frame({ type: 'transcript_updated', transcripts: [turn('u2', '내일 매장에 찾아가겠습니다.')] });
  assert.equal(last().risk_analysis.threatDetected, false);
  sockets[0].frame({ type: 'transcript_updated', transcripts: [turn('u2', '내가 너 찾아간다.')] });
  sockets[0].frame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
  assert.equal(last().status, 'ended'); assert.deepEqual(totals(last().risk_analysis), [0, 1, 1, 0]);
  assert.equal(registry.size, 0);
  assert.doesNotMatch(JSON.stringify(last()), /access_token|api_key|risk_score|shoutingCount/);
});
for (const text of ['일을 왜 이렇게 못해요?','말이 안 통하네.','처리를 왜 이렇게 합니까?','이것도 제대로 못해요?','상담을 이렇게밖에 못해요?','뭐 하는 사람이에요?']) {
  test('conservative blame: '+text,()=>assert.deepEqual(totals(analyzeRiskText(text)),[0,0,1,0]));
}
for (const text of ['요금이 생각보다 많이 나왔네요.','다시 설명해 주세요.','조금 불편했어요.','왜 이런 요금이 나온 건가요?','아 답답하네요.','성교육 자료를 찾습니다.','성희롱 피해를 신고하려고요.','성관계에 관한 상담이 가능한가요?','“너랑 섹스하자”라고 들었어요.']) {
  test('normal/report not an attack: '+text,()=>assert.deepEqual(totals(analyzeRiskText(text)),[0,0,0,0]));
}
for (const text of ['너랑 섹스하자.','상담사님 가슴 만지고 싶어요.','너 옷 벗어봐.','야동 틀어줘.']) {
  test('explicit sexual harassment: '+text,()=>assert.deepEqual(totals(analyzeRiskText(text)),[0,0,0,1]));
}
test('sexual/blame corrections replace and remove the same turn',()=>{
  const store=createLiveCallStore();store.connecting('signals');
  store.transcript('signals',[turn('u','너랑 섹스하자. 일을 왜 이렇게 못해요?')]);
  assert.deepEqual(totals(store.snapshot()[0].risk_analysis),[0,0,1,1]);
  store.transcript('signals',[turn('u','너랑 섹스하자. 일을 왜 이렇게 못해요?')]);
  assert.deepEqual(totals(store.snapshot()[0].risk_analysis),[0,0,1,1]);
  store.transcript('signals',[turn('u','다시 설명해 주세요.')]);
  assert.deepEqual(totals(store.snapshot()[0].risk_analysis),[0,0,0,0]);
});
test('Retell STT spaced blame remains one finding and corrections replace it', () => {
  for (const text of ['일을 왜 이렇게 못 해요? ', '이것도 제대로 못 해요?', '상담을 이렇게밖에 못 해요?']) {
    assert.equal(analyzeRiskText(text).blameCount, 1);
  }
  const store = createLiveCallStore(); store.connecting('spacing');
  for (const text of ['일을 왜 이렇게 못해요?', '일을 왜 이렇게 못 해요? ', '일을 왜 이렇게 못 해요? ']) {
    store.transcript('spacing', [turn('u1', text)]);
    assert.equal(store.snapshot()[0].risk_analysis.blameCount, 1);
  }
  store.transcript('spacing', [turn('u1', '다시 설명해 주세요.')]);
  assert.equal(store.snapshot()[0].risk_analysis.blameCount, 0);
});
