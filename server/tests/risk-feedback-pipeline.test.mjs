import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMonitorRegistry } from '../monitor.mjs';
import { createLiveCallStore } from '../live-calls.mjs';
import { createLiveEvents } from '../live-events.mjs';
import { callResultPayload } from '../n8n-delivery.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const turn = (id, content, role = 'user', time_sec = 1) => ({ id, content, role, time_sec });
const counts = call => {
  assert.ok(call.risk_analysis, 'Monitor transcript must have its current analysis in the same SSE event');
  const analysis = call.risk_analysis;
  return [analysis.profanityCount, analysis.threatCount, analysis.blameCount, analysis.sexualCount];
};
const audio = (sequence, closed = false) => ({
  sequence, shouting_count: 0, is_shouting: false,
  available: true, coverage_complete: true, closed,
});

/** Actual SDK + actual Monitor hooks; only the WebSocket transport is replaced. */
function sdkMonitorFactory(t) {
  const originalSocket = globalThis.WebSocket;
  const sockets = [], logs = [];
  let requests = 0, clock = 0;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    throw new Error('External requests are forbidden in this fixture');
  });
  class FakeWS {
    closed = false;
    constructor(url) {
      assert.match(url, /^wss:\/\/api\.retellai\.com\/v2\/monitor-call\/[A-Za-z0-9_-]+$/);
      this.url = url;
      sockets.push(this);
    }
    frame(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    close() { this.closed = true; }
  }
  globalThis.WebSocket = FakeWS;
  const store = createLiveCallStore(() => new Date(1_760_000_000_000 + (++clock) * 1000).toISOString());
  const registry = createMonitorRegistry({ key: 'synthetic-feedback-fixture', liveCalls: store, log: line => logs.push(line) });
  const sse = createLiveEvents(store);
  class Response extends EventEmitter {
    frames = [];
    destroyed = false;
    writeHead(status, headers) {
      assert.equal(status, 200);
      assert.match(headers['Content-Type'], /text\/event-stream/);
    }
    setTimeout() {}
    flushHeaders() {}
    write(frame) { this.frames.push(frame); return true; }
    end() { this.emit('close'); }
  }
  const response = new Response();
  sse.connect(response);
  const events = () => response.frames.flatMap(frame => {
    const match = /^event: ([^\n]+)\ndata: ([^\n]+)\n\n$/u.exec(frame);
    if (!match) return [];
    const value = JSON.parse(match[2]);
    assert.equal(value.type, match[1]);
    return [value];
  });
  assert.deepEqual(events(), [{ type: 'snapshot', calls: [] }]);
  t.after(() => {
    try { registry.close(); sse.close(); }
    finally { globalThis.WebSocket = originalSocket; }
    assert.equal(store.subscriberCount, 0);
    assert.equal(requests, 0, 'No Retell REST, classifier, DB or webhook requests');
    assert.doesNotMatch(JSON.stringify(events()), /synthetic-feedback-fixture|access_token|api_key/);
  });
  const current = id => {
    const stored = store.snapshot().find(call => call.call_id === id);
    assert.ok(stored);
    const event = events().filter(value => value.call_id === id).at(-1);
    assert.ok(event, 'Current call must also be visible through real SSE serialization');
    const { type: _type, ...serialized } = event;
    assert.deepEqual(serialized, stored);
    if (stored.risk_analysis) {
      const users = stored.messages.filter(message => message.role === 'user');
      assert.equal(stored.risk_analysis.analyzedUserTurns, users.length);
      assert.deepEqual(Object.keys(stored.risk_analysis.analysisByTurn).sort(), users.map(message => message.turn_id).sort());
      assert.equal(stored.risk_analysis.threatDetected, stored.risk_analysis.threatCount > 0);
      for (const user of users) for (const signal of stored.risk_analysis.analysisByTurn[user.turn_id].signals) {
        assert.ok(user.content.includes(signal.matchedText), 'Badge evidence belongs to the actual current USER turn');
      }
    }
    return stored;
  };
  return {
    store, registry, events, current,
    async start(id, customer = 'customer_feedback_fixture') {
      // Identity is normally allocated by the backend before Monitor starts.
      store.connecting(id, customer, `consultation_${1000 + sockets.length}`, 'store_feedback_fixture');
      registry.start(id);
      await tick();
      const socket = sockets.at(-1);
      assert.ok(socket);
      assert.equal(socket.url.endsWith('/' + id), true);
      return socket;
    },
    reconnectSnapshot() {
      const reconnected = new Response();
      sse.connect(reconnected);
      const frame = reconnected.frames.find(value => value.startsWith('event: snapshot\n'));
      const snapshot = JSON.parse(frame.split('\ndata: ')[1]);
      assert.deepEqual(snapshot, { type: 'snapshot', calls: store.snapshot() });
      reconnected.end();
      return snapshot;
    },
  };
}

test('feedback pipeline: Agent warnings and explicit attacks never count, infer shouting or leak prior-session USER text', async t => {
  const f = sdkMonitorFactory(t), socket = await f.start('agent_only');
  socket.frame({ type: 'transcript_snapshot', transcripts: [turn('a1', '욕설은 삼가 주세요.', 'agent')],
    pre_session_transcripts: [turn('old_user', '씨발. 매장 부숴버린다. 너랑 섹스하자. 일을 왜 이렇게 못해요?')] });
  for (const [id, text] of [
    ['a2', '위협적인 발언은 삼가 주세요.'], ['a3', '그런 표현은 자제해 주세요. 소리를 낮춰 주세요.'],
    ['a4', '씨발, 개판이네. 매장 부숴버린다. 너 찾아가서 팬다. 일을 왜 이렇게 못해요? 너랑 섹스하자.'],
  ]) socket.frame({ type: 'transcript_updated', transcripts: [turn(id, text, 'agent')] });
  const call = f.current('agent_only');
  assert.deepEqual(counts(call), [0, 0, 0, 0]);
  assert.equal(call.risk_analysis.analyzedUserTurns, 0);
  assert.equal(call.audio_signal, null);
  assert.equal(call.messages.length, 4);
  assert.ok(call.messages.every(message => message.role === 'agent'));
  assert.equal(call.final_result, null);
  f.store.audio('agent_only', audio(1, true));
  socket.frame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
  assert.equal(f.current('agent_only').final_result.risk_score, 0);
  assert.equal(f.current('agent_only').final_result.signals.shouting_count, 0);
});

test('feedback pipeline CASE A: two USER profanities survive AI intervention and ten duplicate snapshots/updates without inflation', async t => {
  const f = sdkMonitorFactory(t), socket = await f.start('case_a');
  const transcript = [turn('u1', '아 씨발 장난해요?'), turn('a1', '욕설은 삼가 주세요.', 'agent', 2),
    turn('u2', '일 처리 진짜 개판이네.', 'user', 3)];
  socket.frame({ type: 'transcript_snapshot', transcripts: [transcript[0]] });
  assert.deepEqual(counts(f.current('case_a')), [1, 0, 0, 0]);
  socket.frame({ type: 'transcript_updated', transcripts: [transcript[1]] });
  assert.deepEqual(counts(f.current('case_a')), [1, 0, 0, 0]);
  socket.frame({ type: 'transcript_updated', transcripts: [transcript[2]] });
  const before = f.current('case_a'), eventCount = f.events().length;
  assert.deepEqual(counts(before), [2, 0, 0, 0]);
  for (let n = 0; n < 10; n++) {
    socket.frame({ type: 'transcript_snapshot', transcripts: transcript });
    socket.frame({ type: 'transcript_updated', transcripts: [transcript[2]] });
  }
  assert.deepEqual(f.current('case_a'), before);
  assert.equal(f.events().length, eventCount);
  socket.frame({ type: 'transcript_updated', transcripts: [turn('u1', '안녕하세요?')] });
  assert.deepEqual(counts(f.current('case_a')), [1, 0, 0, 0]);
  socket.frame({ type: 'transcript_updated', transcripts: [turn('u2', '다시 설명해 주세요.', 'user', 3)] });
  assert.deepEqual(counts(f.current('case_a')), [0, 0, 0, 0]);
});

test('feedback pipeline CASE B: USER facility context crosses Agent warning, invalidates on parent/action correction and never duplicates', async t => {
  const f = sdkMonitorFactory(t), socket = await f.start('case_b');
  const parent = turn('u1', '그날도 없으면 매장');
  const warning = turn('a1', '위협적인 발언은 삼가 주세요.', 'agent', 2);
  const action = turn('u2', '뒤집어 놓을 거니까 알아서 하세요.', 'user', 3);
  socket.frame({ type: 'transcript_snapshot', transcripts: [parent, warning] });
  assert.deepEqual(counts(f.current('case_b')), [0, 0, 0, 0]);
  socket.frame({ type: 'transcript_updated', transcripts: [action] });
  assert.deepEqual(counts(f.current('case_b')), [0, 1, 0, 0]);
  for (let n = 0; n < 10; n++) socket.frame({ type: 'transcript_snapshot', transcripts: [parent, warning, action] });
  assert.deepEqual(counts(f.current('case_b')), [0, 1, 0, 0]);
  socket.frame({ type: 'transcript_updated', transcripts: [turn('u1', '그날도 없으면 다시 문의할게요.')] });
  assert.deepEqual(counts(f.current('case_b')), [0, 0, 0, 0]);
  socket.frame({ type: 'transcript_updated', transcripts: [parent] });
  assert.deepEqual(counts(f.current('case_b')), [0, 1, 0, 0]);
  socket.frame({ type: 'transcript_updated', transcripts: [turn('u2', '방문해서 확인할게요.', 'user', 3)] });
  assert.deepEqual(counts(f.current('case_b')), [0, 0, 0, 0]);
  socket.frame({ type: 'transcript_updated', transcripts: [action] });
  socket.frame({ type: 'transcript_updated', transcripts: [{ ...parent, role: 'agent' }] });
  assert.deepEqual(counts(f.current('case_b')), [0, 0, 0, 0]);
});

test('feedback pipeline CASE D: split person/assault survives AI intervention and same-ID assault correction clears the finding', async t => {
  const f = sdkMonitorFactory(t), socket = await f.start('case_d');
  const transcript = [turn('u1', '그때까지 없으면 너'), turn('a1', '위협적인 발언은 삼가 주세요.', 'agent', 2),
    turn('u2', '찾아가서 팬다.', 'user', 3)];
  socket.frame({ type: 'transcript_snapshot', transcripts: transcript.slice(0, 2) });
  assert.deepEqual(counts(f.current('case_d')), [0, 0, 0, 0]);
  socket.frame({ type: 'transcript_updated', transcripts: [transcript[2]] });
  assert.deepEqual(counts(f.current('case_d')), [0, 1, 0, 0]);
  for (let n = 0; n < 10; n++) socket.frame({ type: 'transcript_snapshot', transcripts: transcript });
  assert.deepEqual(counts(f.current('case_d')), [0, 1, 0, 0]);
  socket.frame({ type: 'transcript_updated', transcripts: [turn('u2', '찾아가서 상담한다.', 'user', 3)] });
  assert.deepEqual(counts(f.current('case_d')), [0, 0, 0, 0]);
});

test('feedback pipeline CASE C: independently explicit USER action counts once despite an earlier context turn', async t => {
  const f = sdkMonitorFactory(t), socket = await f.start('case_c');
  socket.frame({ type: 'transcript_snapshot', transcripts: [turn('u1', '내가 가서'),
    turn('a1', '위협적인 말씀은 삼가 주세요.', 'agent', 2)] });
  socket.frame({ type: 'transcript_updated', transcripts: [turn('u2', '매장 부숴버릴 거야.', 'user', 3)] });
  assert.deepEqual(counts(f.current('case_c')), [0, 1, 0, 0]);
  assert.equal(f.current('case_c').risk_analysis.analysisByTurn.u2.threatCount, 1);
});

test('feedback pipeline CASE E: normal split visit and Agent-only attack target cannot create USER threat context', async t => {
  const f = sdkMonitorFactory(t), normal = await f.start('case_e');
  normal.frame({ type: 'transcript_snapshot', transcripts: [turn('u1', '매장에'), turn('a1', '확인해 드리겠습니다.', 'agent', 2)] });
  normal.frame({ type: 'transcript_updated', transcripts: [turn('u2', '가서 확인할게요.', 'user', 3)] });
  assert.deepEqual(counts(f.current('case_e')), [0, 0, 0, 0]);
  const agentTarget = await f.start('agent_context');
  agentTarget.frame({ type: 'transcript_snapshot', transcripts: [turn('a1', '그날도 없으면 매장', 'agent')] });
  agentTarget.frame({ type: 'transcript_updated', transcripts: [turn('u1', '뒤집어 놓을 거니까 알아서 하세요.', 'user', 2)] });
  assert.deepEqual(counts(f.current('agent_context')), [0, 0, 0, 0]);
  assert.equal(f.current('agent_context').risk_analysis.analyzedUserTurns, 1);
});

test('feedback pipeline: full-list removal clears dependent context at the store boundary; SDK omission is only a merge', async t => {
  const f = sdkMonitorFactory(t), socket = await f.start('removed_context');
  const parent = turn('u1', '그날도 없으면 매장'), action = turn('u2', '뒤집어 놓을 거니까 알아서 하세요.', 'user', 3);
  const warning = turn('a1', '위협적인 발언은 삼가 주세요.', 'agent', 2);
  socket.frame({ type: 'transcript_snapshot', transcripts: [parent, warning, action] });
  assert.deepEqual(counts(f.current('removed_context')), [0, 1, 0, 0]);
  // SDK 3.0.2 merges both frame types by ID: omission is not a deletion command.
  socket.frame({ type: 'transcript_snapshot', transcripts: [warning, action] });
  assert.equal(f.current('removed_context').messages.length, 3);
  assert.deepEqual(counts(f.current('removed_context')), [0, 1, 0, 0]);
  // A genuinely shorter FULL list is consumed at this existing production boundary.
  f.store.transcript('removed_context', [warning, action]);
  const removed = f.current('removed_context');
  assert.deepEqual(counts(removed), [0, 0, 0, 0]);
  assert.equal(Object.hasOwn(removed.risk_analysis.analysisByTurn, 'u1'), false);
  f.store.transcript('removed_context', [parent, warning, action]);
  assert.deepEqual(counts(f.current('removed_context')), [0, 1, 0, 0]);
  f.store.transcript('removed_context', [parent, warning]);
  assert.deepEqual(counts(f.current('removed_context')), [0, 0, 0, 0]);
  f.store.transcript('removed_context', []);
  assert.equal(f.current('removed_context').risk_analysis.analyzedUserTurns, 0);
  assert.deepEqual(counts(f.current('removed_context')), [0, 0, 0, 0]);
});

const threats = ['매장 뒤집어 놓을 거야.', '가서 다 부숴버릴 거야.', '직원도 가만 안 둘 거야.', '너 찾아가서 팬다.'];
for (const [count, floor, level, raw] of [[1, 40, '경계', 20], [2, 60, '위험', 30], [3, 80, '매우 위험', 40]]) {
  test(`feedback pipeline: ${count} USER threats finalize at ${floor} after final audio, unchanged n8n projection and one immutable result`, async t => {
    const f = sdkMonitorFactory(t), id = 'floor_' + count, socket = await f.start(id);
    const transcript = threats.slice(0, count).flatMap((text, index) => [turn('u' + index, text, 'user', index * 2),
      turn('a' + index, '위협적인 발언은 삼가 주세요. 소리를 낮춰 주세요.', 'agent', index * 2 + 1)]);
    socket.frame({ type: 'transcript_snapshot', transcripts: transcript.slice(0, 2) });
    if (count > 1) socket.frame({ type: 'transcript_updated', transcripts: transcript.slice(2) });
    assert.deepEqual(counts(f.current(id)), [0, count, 0, 0]);
    assert.equal(f.current(id).final_result, null);
    assert.equal(f.store.audio(id, audio(1)), 'accepted');
    let finalized = 0;
    const unsubscribe = f.store.subscribeFinalized(() => finalized++);
    t.after(unsubscribe);
    socket.frame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
    assert.equal(f.current(id).status, 'ended');
    assert.equal(f.current(id).final_result, null);
    assert.equal(finalized, 0);
    assert.equal(f.store.audio(id, audio(2, true)), 'accepted');
    const finished = f.current(id), result = finished.final_result;
    assert.ok(result);
    assert.equal(result.rule_version, 'call-risk-v4');
    assert.equal(result.signals.threat_count, count);
    assert.equal(result.signals.shouting_count, 0);
    assert.equal(result.scores.threat_score, raw);
    assert.equal(result.raw_score, raw);
    assert.equal(result.threat_floor, floor);
    assert.equal(result.adjusted_score, floor);
    assert.equal(result.risk_score, floor);
    assert.equal(result.risk_level, level);
    assert.equal(finalized, 1);
    const payload = callResultPayload(finished);
    assert.deepEqual(Object.keys(payload).sort(), ['call_id', 'consultation_id', 'customer_id', 'signals', 'scores', 'risk_score', 'risk_level', 'consultation'].sort());
    assert.equal(payload.risk_score, floor);
    assert.equal(payload.risk_level, level);
    assert.equal(payload.scores.threat_score, raw);
    for (let n = 0; n < 10; n++) {
      f.store.ended(id);
      f.store.transcript(id, [turn('u0', '안녕하세요.')]);
      assert.equal(f.store.audio(id, audio(3 + n, true)), 'closed');
    }
    assert.deepEqual(f.current(id), finished);
    assert.equal(finalized, 1);
    assert.equal(f.events().filter(event => event.type === 'risk_finalized' && event.call_id === id).length, 1);
    assert.equal(f.registry.has(id), false);
    assert.equal(socket.closed, true);
    assert.equal(f.reconnectSnapshot().calls.find(call => call.call_id === id).final_result.risk_score, floor);
  });
}

test('feedback pipeline RISK lifecycle: four distinct USER threats count once each and a later quiet call of the same customer remains zero', async t => {
  const f = sdkMonitorFactory(t), socket = await f.start('risk_lifecycle');
  const transcript = [];
  for (const [index, text] of threats.entries()) {
    transcript.push(turn('u' + index, text, 'user', index * 2));
    socket.frame({ type: index === 0 ? 'transcript_snapshot' : 'transcript_updated', transcripts: [transcript.at(-1)] });
    assert.deepEqual(counts(f.current('risk_lifecycle')), [0, index + 1, 0, 0]);
    transcript.push(turn('a' + index, '씨발. 너 찾아가서 팬다. 위협적인 말씀은 삼가 주세요.', 'agent', index * 2 + 1));
    socket.frame({ type: 'transcript_updated', transcripts: [transcript.at(-1)] });
    assert.deepEqual(counts(f.current('risk_lifecycle')), [0, index + 1, 0, 0]);
  }
  for (let n = 0; n < 10; n++) socket.frame({ type: 'transcript_snapshot', transcripts: transcript });
  assert.deepEqual(counts(f.current('risk_lifecycle')), [0, 4, 0, 0]);
  f.store.audio('risk_lifecycle', audio(1, true));
  socket.frame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
  assert.equal(f.current('risk_lifecycle').final_result.risk_score, 80);
  const quiet = await f.start('risk_quiet');
  quiet.frame({ type: 'transcript_snapshot', transcripts: [turn('u0', '매장에 방문하겠습니다.')] });
  f.store.audio('risk_quiet', audio(1, true));
  quiet.frame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
  assert.equal(f.current('risk_quiet').final_result.risk_score, 0);
  assert.deepEqual(f.store.historyForCustomer('customer_feedback_fixture').map(result => result.risk_score), [0, 80]);
  assert.notEqual(f.current('risk_lifecycle').consultation_id, f.current('risk_quiet').consultation_id);
});

for (const [id, text, profanity, threat, score, level] of [
  ['video_basic', '아 씨발, 장난해요?\n폰도 없이 장사를 해요?\n일 처리 진짜 개판이네.\n토요일 2시요.\n그날도 없으면 매장 뒤집어 놓을 거니까 알아서 하세요.', 2, 1, 40, '경계'],
  ['video_strong', '아 씨발, 장난해요?\n폰도 없이 장사를 해요?\n일 처리 진짜 개판이네.\n토요일 2시요.\n그날도 없으면 매장 뒤집어 놓을 거예요.\n가서 다 부숴버릴 거니까 알아서 하세요.', 2, 2, 60, '위험'],
  ['video_assault', '아니 찾아와서 팬다?\n그래 그때까지 없으면 너 찾아가서 팬다?', 0, 1, 40, '경계'],
]) {
  test(`feedback pipeline exact scenario ${id}: USER-only counts and final floor survive intervening Agent attacks`, async t => {
    const f = sdkMonitorFactory(t), socket = await f.start(id);
    socket.frame({ type: 'transcript_snapshot', transcripts: [turn('u1', text)] });
    socket.frame({ type: 'transcript_updated', transcripts: [turn('a1', '씨발, 매장 부숴버린다. 너 찾아가서 팬다. 소리를 낮춰 주세요.', 'agent', 2)] });
    const call = f.current(id);
    assert.deepEqual(counts(call), [profanity, threat, 0, 0]);
    assert.equal(call.risk_analysis.analysisByTurn.u1.threatCount, threat);
    assert.equal(call.audio_signal, null);
    f.store.audio(id, audio(1, true));
    socket.frame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
    assert.equal(f.current(id).final_result.risk_score, score);
    assert.equal(f.current(id).final_result.risk_level, level);
    assert.equal(f.current(id).final_result.signals.shouting_count, 0);
  });
}
