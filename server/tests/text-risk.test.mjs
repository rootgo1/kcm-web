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

for (const [text, count] of [
  ['씨발', 1], ['씨팔', 1], ['시발', 1], ['씨발 씨발 씨발', 3],
  ['개판', 1], ['개판이네', 1], ['개판이야', 1], ['개판이군', 1],
  ['개같네', 1], ['개같다', 1], ['개같은', 1], ['엿같네', 1], ['엿같다', 1],
  ['좆같네', 1], ['좆같다', 1], ['좆같아서 화가 난다', 1], ['좆같이 처리했네', 1],
  ['병신', 1], ['지랄', 1], ['개새끼', 1], ['씹새끼', 1],
  ['씨발, 개판이네', 2], ['개판 이네', 1], ['개 같네', 1], ['좆 같네', 1],
  ['개 판 이네', 1], ['엿 같다', 1], ['씨 발 씨 발 씨 발', 3],
  ['개 새끼', 1], ['씹 새끼', 1], ['병 신', 1], ['지 랄', 1],
]) {
  test('expanded profanity lexical groups: ' + text, () => {
    const result = analyzeRiskText(text);
    assert.deepEqual(totals(result), [count, 0, 0, 0]);
    assert.equal(result.signals.length, count);
    assert.ok(result.signals.every(signal => signal.type === 'profanity' && text.includes(signal.matchedText)));
  });
}

for (const text of [
  '매장 뒤집어 놓는다', '매장 뒤집어놓는다', '매장 뒤집어버린다', '가게 뒤집어 놓는다',
  '매장 엎어버린다', '가게 엎어버린다', '찾아가서 난리친다', '매장 가서 난리친다',
  '다 부숴버린다', '매장 박살낸다', '매장 부숴버린다', '매장 부셔버린다',
  '가게 부숴버린다', '매장 부순다', '매장 부숴 놓겠다', '매장 부숴놓겠다',
  '매장 부숴버릴 거야', '매장 부숴버릴거야', '가서 다 부숴버린다',
  '내가 매장 가서 뒤집어 놓는다', '매장 뒤집어 버린다', '매장 부숴 버린다',
  '매장 부셔 버린다', '매장 엎어 버린다', '매장 부숴 버릴 거야',
  '매장에 가서 부수겠다', '매장에 가서 뒤집겠다', '매장에 가서 난리치겠다',
  '시설을 부수겠다', '점포를 엎어버린다', '사무실을 박살내겠다',
  '매장에 가서 난동을 부리겠다', '찾아 가서 난리 친다',
  // The existing generic violence rule overlaps this facility rule; it is still one occurrence.
  '매장 박살내버린다', '매장에 가서 다 부숴버린다',
]) {
  test('explicit facility destruction or disturbance: ' + text, () => {
    const result = analyzeRiskText(text);
    assert.deepEqual(totals(result), [0, 1, 0, 0]);
    assert.equal(result.threatDetected, true);
    assert.equal(result.signals.length, 1);
    assert.equal(result.signals[0].type, 'threat');
    assert.ok(text.includes(result.signals[0].matchedText));
  });
}

for (const text of [
  '시발점', '시발역', '개가 귀엽다', '개를 키우고 있습니다', '강아지 새끼가 귀엽네요',
  '판이 바뀌었다', '판을 다시 짜겠습니다', '시발점을 설명해 주세요', '시 발 점을 설명해 주세요',
  '내일 매장에 방문하겠습니다', '매장에 찾아가겠습니다', '매장 찾아갈게요',
  '매장에 가서 확인하겠습니다', '매장 위치를 알려주세요', '직접 매장에 가겠습니다',
  '내일 매장에 찾아가겠습니다', '매장에 방문하겠습니다',
  '“매장 부숴버린다”는 말을 들었어요.', '고객이 매장을 부숴버린다고 협박했습니다.',
  '“매장 뒤집어 놓는다”라고 말하면 안 됩니다.', '저는 매장을 부수겠다는 뜻이 아닙니다.',
  '매장을 부수겠다는 뜻이 아닙니다',
  '매장을 부수지 않겠습니다.', '매장 부숴버린다는 말을 들었어요',
  '매장을 부숴버린다고 신고했습니다.', '찾아가서 난리친다고 신고하려고요.',
  '매장 가서 난리친다는 말을 들었어요.', '매장 안 부순다.',
  '매장 부숴버린다라는 문장은 위협 표현입니다.',
  '“개판이네”라고 들었어요.', '씨발이라고 신고했습니다.',
  '씨발이라는 단어는 욕설입니다.', '씨팔이라고 말하지 않았어요.',
  '“개 같네”라고 신고했습니다.', '“엿같네”라는 표현을 들었습니다.',
  '좆같지 않아요.', '좆같다는 말을 들었어요.',
]) {
  test('expanded rules exclude normal visits, reports, quotation and negation: ' + text, () => {
    const result = analyzeRiskText(text);
    assert.deepEqual(totals(result), [0, 0, 0, 0]);
    assert.equal(result.threatDetected, false);
    assert.deepEqual(result.signals, []);
  });
}

test('expanded profanity/threat corrections replace one turn and identical snapshots never accumulate', () => {
  const store = createLiveCallStore(); store.connecting('feedback');
  for (const [text, expected] of [
    ['씨발', [1, 0, 0, 0]], ['씨발', [1, 0, 0, 0]], ['안녕하세요', [0, 0, 0, 0]],
    ['매장 부숴버린다', [0, 1, 0, 0]], ['매장 부숴버린다', [0, 1, 0, 0]],
    ['매장 부숴 버린다', [0, 1, 0, 0]], ['매장에 방문하겠습니다', [0, 0, 0, 0]],
    ['개판이네. 매장 뒤집어 놓는다', [1, 1, 0, 0]],
    ['개판이네. 매장 뒤집어 놓는다', [1, 1, 0, 0]], ['다시 설명해 주세요', [0, 0, 0, 0]],
  ]) {
    store.transcript('feedback', [turn('u1', text)]);
    const result = store.snapshot()[0].risk_analysis;
    assert.deepEqual(totals(result), expected);
    assert.equal(result.analyzedUserTurns, 1);
  }
});

test('expanded findings remain independent across turns/calls and ignore AGENT speech', () => {
  const store = createLiveCallStore(); store.connecting('A'); store.connecting('B');
  const userTurns = [turn('u1', '개판이네. 매장 부숴버린다'), turn('u2', '개판이네. 매장 부숴버린다')];
  store.transcript('A', [...userTurns, turn('a1', '씨발. 매장 부숴버린다', 'agent')]);
  store.transcript('A', [...userTurns, turn('a1', '씨발. 매장 부숴버린다', 'agent')]);
  store.transcript('B', [turn('u1', '매장에 방문하겠습니다')]);
  assert.deepEqual(totals(store.snapshot()[0].risk_analysis), [2, 2, 0, 0]);
  assert.deepEqual(totals(store.snapshot()[1].risk_analysis), [0, 0, 0, 0]);
  store.transcript('A', [turn('u1', '개판이네. 매장 부숴버린다', 'agent'), turn('u2', '안녕하세요')]);
  assert.deepEqual(totals(store.snapshot()[0].risk_analysis), [0, 0, 0, 0]);
});

test('overlapping facility alternatives count once per occurrence while consecutive real occurrences stay separate', () => {
  for (const [text, expected] of [
    ['개판이네', [1, 0, 0, 0]],
    ['개판이네 개판 이네', [2, 0, 0, 0]],
    // Generic violence, facility destruction and '다' destruction all overlap the same occurrence.
    ['매장에 가서 다 박살내버린다', [0, 1, 0, 0]],
    ['매장에 가서 다 박살내버린다. 매장에 가서 다 박살내버린다', [0, 2, 0, 0]],
    ['씨발, 개판이네. 매장 박살내버린다. 매장에 가서 다 부숴버린다', [2, 2, 0, 0]],
  ]) {
    const result = analyzeRiskText(text);
    assert.deepEqual(totals(result), expected);
    assert.equal(result.signals.length, expected.reduce((sum, count) => sum + count, 0));
  }
});

test('new rule version reanalyzes unchanged turns instead of reusing pre-expansion findings', () => {
  const messages = [message('u1', '개판이네. 매장 부숴버린다')];
  const previous = analyzeTranscriptRisk([message('u1', '안녕하세요')]);
  previous.ruleVersion = 'local-text-rules-v2';
  const result = analyzeTranscriptRisk(messages, messages, previous);
  assert.equal(result.ruleVersion, TEXT_RISK_RULE_VERSION);
  assert.notEqual(result.ruleVersion, previous.ruleVersion);
  assert.deepEqual(totals(result), [1, 1, 0, 0]);
});
