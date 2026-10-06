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

for (const text of [
  '매장 뒤집어 놓을 거야', '매장 뒤집어 놓을 거예요',
  '매장 뒤집어 놓을 거니까 알아서 해', '매장 뒤집어 놓을 거니까 알아서 하세요',
  '매장 뒤집어놓을거야', '매장 뒤집어놓을거예요', '매장 뒤집어놓을거니까 알아서 하세요',
  '매장 부숴버릴 거예요', '매장 부숴 버릴 거니까', '가게 가서 난리칠 거야',
  '가게 가서 난리칠거야', '매장 가서 난리 칠 거예요', '찾아 가서 난리칠거니까',
  '너 찾아가서 팬다', '너 찾아가서 팰 거야', '너 찾아가서 패버린다',
  '직원 찾아가서 팬다', '상담사 찾아가서 팬다', '찾아가서 팬다',
  '가서 팬다', '가서 팰 거야', '가서 패버린다', '가서 때린다',
  '찾아가서 때린다', '찾아가서 패준다', '두들겨 팬다',
  '너 찾아 가서 팬다', '너 찾아가서 팰거야', '직원 찾아가서 패 버린다',
  '상담사 찾아가서 때릴 거야', '상담사 찾아가서 때릴거야', '너 가서 두들겨팬다',
  '너 팬다', '직원을 팰 거예요', '가서 패 버릴 거야', '직원도 가만 안 둘 거야',
]) {
  test('future statements and explicit assault with person/visit context: ' + text, () => {
    const result = analyzeRiskText(text);
    assert.deepEqual(totals(result), [0, 1, 0, 0]);
    assert.equal(result.signals.length, 1);
    assert.ok(text.includes(result.signals[0].matchedText));
  });
}

for (const text of [
  '“너 찾아가서 팬다”라는 말을 들었습니다.', '고객이 직원을 찾아가서 팬다고 했습니다.',
  '직원을 때리겠다는 뜻이 아닙니다.', '너 찾아가서 팬다고 신고했습니다.',
  '가서 때릴 거야라는 뜻이 아닙니다.', '“매장 뒤집어 놓을 거니까”라는 말을 들었어요.',
  '매장 부숴버릴 거예요라고 보고했습니다.', '팬다', '장작을 팬다',
  '숲에 가서 장작을 팬다', '골프장에 가서 공을 때릴 거야', '나는 이 팀의 팬이다',
]) {
  test('future/assault report, negation and unrelated usage remain nonthreatening: ' + text, () => {
    assert.deepEqual(totals(analyzeRiskText(text)), [0, 0, 0, 0]);
  });
}

test('exact video scenario records the clear USER threat once, without expanding an ambiguous first question', () => {
  const text = '아니 찾아와서 팬다?\n그래 그때까지 없으면 너 찾아가서 팬다?';
  const result = analyzeRiskText(text);
  assert.deepEqual(totals(result), [0, 1, 0, 0]);
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].matchedText, '너 찾아가서 팬다');
});

for (const [label, first, intervention, action, expected] of [
  ['A', '아 씨발 장난해요?', '욕설은 삼가 주세요.', '일 처리 진짜 개판이네.', [2, 0, 0, 0]],
  ['B', '그날도 없으면 매장', '위협적인 발언은 삼가 주세요.', '뒤집어 놓을 거니까 알아서 하세요.', [0, 1, 0, 0]],
  ['C', '내가 가서', '위협적인 말씀은 삼가 주세요.', '매장 부숴버릴 거야.', [0, 1, 0, 0]],
  ['D', '그때까지 없으면 너', '위협적인 발언은 삼가 주세요.', '찾아가서 팬다.', [0, 1, 0, 0]],
  ['E', '매장에', '확인해 드리겠습니다.', '가서 확인할게요.', [0, 0, 0, 0]],
]) {
  test('USER-only interrupted sequence ' + label + ' attributes the finding to the action turn', () => {
    const messages = [message('u1', first), message('a1', intervention, 'agent'), message('u2', action)];
    const result = analyzeTranscriptRisk(messages);
    assert.deepEqual(totals(result), expected);
    assert.deepEqual(Object.keys(result.analysisByTurn), ['u1', 'u2']);
    if (expected[1]) {
      assert.equal(result.analysisByTurn.u1.threatCount, 0);
      assert.equal(result.analysisByTurn.u2.threatCount, 1);
      assert.ok(result.analysisByTurn.u2.signals.every(signal => action.includes(signal.matchedText)));
    }
    if (label === 'B') assert.match(result.analysisByTurn.u2.signals[0].reason, /이전 USER/);
  });
}

test('AGENT attacks/warnings cannot contribute a target, action or any of the four counts', () => {
  for (const messages of [
    [message('a1', '씨발. 매장 뒤집어 놓을 거야. 일을 왜 이렇게 못해요? 너랑 섹스하자', 'agent')],
    [message('a1', '매장', 'agent'), message('u1', '뒤집어 놓을 거니까 알아서 하세요')],
    [message('u1', '너'), message('a1', '찾아가서 팬다', 'agent')],
    [message('a1', '욕설은 삼가 주세요. 위협적인 발언은 삼가 주세요.', 'agent'), message('u1', '안녕하세요')],
  ]) assert.deepEqual(totals(analyzeTranscriptRisk(messages)), [0, 0, 0, 0]);
});

test('independent threats and context-assisted threats never count the same action twice', () => {
  for (const [prefix, action, expected] of [
    ['너', '찾아가서 팬다', 1], ['매장', '가서 다 부숴버릴 거야', 1],
    ['너', '패버린다', 1], ['매장', '뒤집어 놓을 거야. 너 찾아가서 팬다', 2],
  ]) {
    const result = analyzeTranscriptRisk([message('u1', prefix), message('u2', action)]);
    assert.equal(result.threatCount, expected);
    assert.equal(result.analysisByTurn.u1.threatCount, 0);
    assert.equal(result.analysisByTurn.u2.threatCount, expected);
    assert.equal(result.analysisByTurn.u2.signals.length, expected);
  }
});

test('two unfinished USER fragments can bridge a target and visit but never use AGENT content', () => {
  const result = analyzeTranscriptRisk([
    message('u1', '그때까지 없으면 매장'), message('a1', '안내해 드리겠습니다', 'agent'),
    message('u2', '가서'), message('a2', '그런 표현은 자제해 주세요', 'agent'), message('u3', '부숴버릴 거야'),
  ]);
  assert.deepEqual(totals(result), [0, 1, 0, 0]);
  assert.equal(result.analysisByTurn.u3.threatCount, 1);
  assert.equal(result.analysisByTurn.u3.signals[0].matchedText, '부숴버릴 거야');
});

test('bounded context respects two fragments, 120 characters, 30 known seconds and 160 action-prefix characters', () => {
  const timed = (id, content, start) => ({ ...message(id, content), start_sec: start });
  for (const [messages, expected] of [
    [[timed('u1', '매장', 1), timed('u2', '뒤집어 놓을 거야', 31)], 1],
    [[timed('u1', '매장', 1), timed('u2', '뒤집어 놓을 거야', 31.01)], 0],
    [[timed('u1', '매장', 31), timed('u2', '뒤집어 놓을 거야', 1)], 0],
    [[timed('u1', '매장', null), timed('u2', '뒤집어 놓을 거야', null)], 1],
    [[message('u1', '그'.repeat(118) + '매장'), message('u2', '뒤집어 놓을 거야')], 1],
    [[message('u1', '그'.repeat(119) + '매장'), message('u2', '뒤집어 놓을 거야')], 0],
    [[message('u1', '매장'), message('u2', '내가 가서'), message('u3', '가서'), message('u4', '부숴버릴 거야')], 0],
    [[message('u1', '매장'), message('u2', ' '.repeat(160) + '뒤집어 놓을 거야')], 0],
  ]) assert.equal(analyzeTranscriptRisk(messages).threatCount, expected);
});

test('completed or reported/quoted fragments cannot seed a later unrelated threat', () => {
  for (const [prefix, action] of [
    ['너.', '팬다'], ['너와 상담했습니다', '팬다'], ['매장에 방문하겠습니다', '뒤집어 놓을 거야'],
    ['“매장', '뒤집어 놓을 거야'], ['고객이 매장', '뒤집어 놓을 거야'],
    ['신고 내용은 매장', '뒤집어 놓을 거야'], ['매장이라고 들었어요', '뒤집어 놓을 거야'],
    ['“너', '찾아가서 팬다”라는 말을 들었습니다.'],
    ['매장', '부수지 않겠습니다'], ['매장', '뒤집어 놓을 거야라는 뜻이 아닙니다'],
  ]) assert.deepEqual(totals(analyzeTranscriptRisk([message('u1', prefix), message('u2', action)])), [0, 0, 0, 0]);
  assert.equal(analyzeTranscriptRisk([message('u1', '매장'), message('u2', '확인 부탁드립니다'), message('u3', '뒤집어 놓을 거야')]).threatCount, 0);
});

test('full current report suffix protects a bounded-prefix context candidate even when the report is beyond 160 characters', () => {
  const action = '뒤집어 놓을 거야' + ' '.repeat(170) + '라고 말했습니다';
  assert.equal(analyzeTranscriptRisk([message('u1', '매장'), message('u2', action)]).threatCount, 0);
});

test('context-dependent cache follows parent corrections/removal/role changes and recalculates only adjacent USER turns', () => {
  const analyzed = [];
  const analyze = text => { analyzed.push(text); return analyzeRiskText(text); };
  const history = Array.from({ length: 200 }, (_, n) => message('earlier_' + n, '안녕하세요'));
  let previousMessages = [...history, message('u1', '매장'), message('u2', '가서'), message('u3', '부숴버릴 거야'), message('u4', '감사합니다')];
  let result = analyzeTranscriptRisk(previousMessages, [], undefined, analyze);
  assert.equal(result.threatCount, 1);
  const firstCount = analyzed.length;
  for (let n = 0; n < 10; n++) result = analyzeTranscriptRisk(previousMessages, previousMessages, result, analyze);
  assert.equal(analyzed.length, firstCount);
  let current = [...history, message('u1', '공원'), ...previousMessages.slice(-3)];
  result = analyzeTranscriptRisk(current, previousMessages, result, analyze);
  assert.equal(result.threatCount, 0);
  assert.equal(analyzed.length - firstCount, 3);
  previousMessages = current;
  current = [...history, message('u1', '매장'), ...previousMessages.slice(-3)];
  result = analyzeTranscriptRisk(current, previousMessages, result, analyze);
  assert.equal(result.threatCount, 1);
  previousMessages = current;
  current = [...history, ...previousMessages.slice(-3)];
  result = analyzeTranscriptRisk(current, previousMessages, result, analyze);
  assert.equal(result.threatCount, 0);
  previousMessages = current;
  current = [...history, message('u1', '매장', 'agent'), ...previousMessages.slice(-3)];
  result = analyzeTranscriptRisk(current, previousMessages, result, analyze);
  assert.equal(result.threatCount, 0);
  assert.equal(Object.hasOwn(result.analysisByTurn, 'u1'), false);
});

test('AGENT changes preserve USER cache; action correction/deletion replaces dependent findings without stale totals', () => {
  let analyzed = 0;
  const analyze = text => { analyzed++; return analyzeRiskText(text); };
  let previousMessages = [message('u1', '매장'), message('a1', '위협적인 발언은 삼가 주세요', 'agent'), message('u2', '뒤집어 놓을 거니까')];
  let result = analyzeTranscriptRisk(previousMessages, [], undefined, analyze);
  assert.equal(result.threatCount, 1);
  const firstCount = analyzed;
  let current = previousMessages.map(item => item.role === 'agent' ? { ...item, content: '너 찾아가서 팬다. 씨발' } : item);
  result = analyzeTranscriptRisk(current, previousMessages, result, analyze);
  assert.equal(analyzed, firstCount); assert.equal(result.threatCount, 1);
  previousMessages = current;
  current = current.map(item => item.turn_id === 'u2' ? { ...item, content: '매장에 방문하겠습니다' } : item);
  result = analyzeTranscriptRisk(current, previousMessages, result, analyze);
  assert.equal(result.threatCount, 0);
  previousMessages = current;
  current = current.filter(item => item.turn_id !== 'u2');
  result = analyzeTranscriptRisk(current, previousMessages, result, analyze);
  assert.deepEqual(totals(result), [0, 0, 0, 0]);
  assert.equal(Object.hasOwn(result.analysisByTurn, 'u2'), false);
});

test('actual independent threats in u1 through u4 count 1/2/3/4 despite AI interjections and ten duplicate snapshots', () => {
  const store = createLiveCallStore(); store.connecting('repeat'); store.connecting('other');
  const statements = ['매장 뒤집어 놓을 거야.', '가서 다 부숴버릴 거야.', '직원도 가만 안 둘 거야.', '너 찾아가서 팬다.'];
  const turns = [];
  statements.forEach((text, index) => {
    turns.push(turn('u' + (index + 1), text), turn('a' + (index + 1), '위협적인 발언은 삼가 주세요.', 'agent'));
    for (let n = 0; n < 10; n++) store.transcript('repeat', turns);
    assert.equal(store.snapshot()[0].risk_analysis.threatCount, index + 1);
    assert.equal(store.snapshot()[0].risk_analysis.analyzedUserTurns, index + 1);
  });
  store.transcript('other', [turn('u1', '안녕하세요')]);
  assert.equal(store.snapshot()[1].risk_analysis.threatCount, 0);
  store.transcript('repeat', [turn('u1', '매장에 방문하겠습니다')]);
  assert.equal(store.snapshot()[0].risk_analysis.threatCount, 0);
});

for (const text of [
  '직원을 찾아가서 팬다는 건 아닙니다.',
  '너 찾아가서 팬다는 게 아니라 상담하러 간다는 말입니다.',
  '고객이 너 찾아가서 팬다는 얘기를 했어요.',
  '고객이 너 찾아가서 팬다는 이야기를 했어요.',
  '너 찾아가서 팬다는 것은 아닙니다.',
  '매장 뒤집어 놓을 거야라는 건 아니에요.',
  '좆같다는 건 아닙니다.',
]) {
  test('explicit colloquial negation/report suffix remains a nonassertion: ' + text, () => {
    assert.deepEqual(totals(analyzeRiskText(text)), [0, 0, 0, 0]);
  });
}

test('colloquial negative/report action fragments stay nonthreatening across USER turns', () => {
  for (const action of ['팬다는 건 아닙니다.', '팬다는 게 아니라 상담하러 간다는 말입니다.', '팬다는 얘기를 했어요.']) {
    const result = analyzeTranscriptRisk([
      message('u1', '직원을 찾아가서'), message('a1', '위협적인 발언은 삼가 주세요.', 'agent'), message('u2', action),
    ]);
    assert.deepEqual(totals(result), [0, 0, 0, 0]);
    assert.equal(result.analysisByTurn.u2.threatCount, 0);
  }
});

test('a colloquial assertion without explicit negation is still a threat', () => {
  assert.equal(analyzeRiskText('너 찾아가서 팬다는 건 결정됐어.').threatCount, 1);
  assert.equal(analyzeTranscriptRisk([message('u1', '직원을 찾아가서'), message('u2', '팬다는 건 결정됐어.')]).threatCount, 1);
});
