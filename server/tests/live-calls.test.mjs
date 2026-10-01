import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { createLiveCallStore, normalizeTranscript } from '../live-calls.mjs';
import { createLiveEvents } from '../live-events.mjs';
import { createMonitorRegistry } from '../monitor.mjs';
import { createBackend } from '../app.mjs';

const turn = (id, role, content, time_sec = 1) => ({ id, role, content, time_sec });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('snapshot store: full transcript replaces, shorter correction updates same turn, new turns alone add messages', () => {
  const store = createLiveCallStore();
  store.connecting('one'); store.live('one');
  for (const text of ['요금', '요금제를 변경하고 싶어요.', '청구 문의입니다.']) {
    store.transcript('one', [turn('u1', 'user', text)]);
    assert.equal(store.snapshot()[0].messages.length, 1);
    assert.equal(store.snapshot()[0].messages[0].content, text);
  }
  store.transcript('one', [turn('u1', 'user', '청구 문의입니다.'), turn('a1', 'agent', '도와')]);
  store.transcript('one', [turn('u1', 'user', '청구 문의입니다.'), turn('a1', 'agent', '도와드리겠습니다.')]);
  assert.equal(store.snapshot()[0].messages.length, 2);
  store.transcript('one', [turn('a1', 'agent', '정정된 전체 목록')]);
  assert.equal(store.snapshot()[0].messages.length, 1); // not merged with stale messages
});

test('snapshot store: duplicate snapshots/end events do not emit or overwrite original timestamps', () => {
  let clock = 0;
  const store = createLiveCallStore(() => `t${++clock}`);
  const events = [];
  store.subscribe(event => events.push(event));
  store.connecting('one'); store.connecting('one'); store.live('one'); store.live('one');
  store.transcript('one', [turn('u1', 'user', '대화')]);
  store.transcript('one', [turn('u1', 'user', '대화')]);
  store.ended('one');
  const before = store.snapshot();
  store.ended('one'); store.error('one'); store.live('one'); store.transcript('one', []);
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(events.map(event => event.type), ['call_status', 'call_started', 'transcript', 'call_ended']);
  assert.equal(before[0].messages[0].content, '대화');
  assert.equal(before[0].started_at, 't2');
  assert.equal(before[0].ended_at, 't4');
});

test('snapshot store: call isolation, snapshot copy isolation, no key/token/raw metadata, and server restart reset', () => {
  const store = createLiveCallStore();
  store.connecting('one'); store.connecting('two');
  store.transcript('one', [{ ...turn('u1', 'user', '첫 통화'), access_token: 'private', api_key: 'private' }]);
  store.transcript('two', [turn('u1', 'user', '다른 통화')]);
  store.ended('one');
  const snapshot = store.snapshot();
  assert.equal(snapshot[1].messages[0].content, '다른 통화');
  assert.equal(snapshot[1].status, 'connecting');
  assert.doesNotMatch(JSON.stringify(snapshot), /private|access_token|api_key/);
  snapshot[0].messages.length = 0;
  assert.equal(store.snapshot()[0].messages.length, 1);
  assert.deepEqual(createLiveCallStore().snapshot(), []);
});

test('normalization: stable IDs, fallback role/position, duplicate ID replacement, role filtering and absent end time', () => {
  const raw = [turn('a1', 'agent', '안녕', 0), turn('tool', 'tool_call_result', 'hidden'), turn(undefined, 'user', '문의'), turn('a1', 'agent', '안녕하세요', 0), turn('node', 'node_transition', ''), turn('dtmf', 'dtmf', '1')];
  const first = normalizeTranscript(raw);
  assert.equal(first.length, 2);
  assert.equal(first[0].content, '안녕하세요');
  assert.equal(first[0].start_sec, 0);
  assert.equal(first[0].end_sec, null);
  assert.equal(first[1].turn_id, 'fallback:user:2');
  raw[2].content = '문의 정정';
  assert.equal(normalizeTranscript(raw)[1].turn_id, first[1].turn_id);
  assert.equal(normalizeTranscript([turn('x', 'user', '<script>text</script>', NaN)])[0].start_sec, null);
});

test('store: subscriber exceptions do not affect the call or other subscribers; unsubscribe is idempotent', () => {
  const store = createLiveCallStore();
  store.subscribe(() => { throw new Error('closed browser'); });
  let count = 0;
  const off = store.subscribe(() => count++);
  store.connecting('one'); store.live('one');
  assert.equal(count, 2);
  assert.equal(store.subscriberCount, 1);
  off(); off(); assert.equal(store.subscriberCount, 0);
});

test('Monitor to store: real SDK snapshots/revisions/end; errors and local disconnect never masquerade as remote end', async t => {
  const original = globalThis.WebSocket;
  const sockets = [];
  class FakeSocket {
    constructor() { sockets.push(this); }
    frame(frame) { this.onmessage?.({ data: JSON.stringify(frame) }); }
    close() {}
  }
  globalThis.WebSocket = FakeSocket;
  const store = createLiveCallStore();
  const registry = createMonitorRegistry({ key: 'isolated-test', liveCalls: store, log: () => {} });
  t.after(() => { registry.close(); globalThis.WebSocket = original; });
  registry.start('one'); await tick();
  sockets[0].frame({ type: 'transcript_snapshot', transcripts: [turn('a1', 'agent', '안녕')] });
  assert.equal(store.snapshot()[0].status, 'live');
  sockets[0].frame({ type: 'transcript_updated', transcripts: [turn('a1', 'agent', '안녕하세요.')] });
  assert.equal(store.snapshot()[0].messages.length, 1);
  assert.equal(store.snapshot()[0].messages[0].content, '안녕하세요.');
  sockets[0].frame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
  assert.equal(store.snapshot()[0].status, 'ended');
  assert.equal(registry.size, 0);
  registry.start('two'); await tick();
  sockets[1].onclose({ code: 4001, reason: 'private error' });
  assert.equal(store.snapshot()[1].status, 'error');
  assert.equal(store.snapshot()[1].ended_at, null);
  assert.doesNotMatch(JSON.stringify(store.snapshot()), /private error/);
  registry.start('three'); await tick(); registry.release('three');
  assert.equal(store.snapshot()[2].status, 'error');
});

async function readEvent(reader) {
  // Tests read one server operation at a time; initial retry and snapshot may share a chunk.
  let text = '';
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error('SSE closed before event');
    text += decoder.decode(value, { stream: true });
    const match = /event: ([^\n]+)\ndata: ([^\n]+)\n\n/.exec(text);
    if (match) return { type: match[1], data: JSON.parse(match[2]), text };
  }
}

test('SSE HTTP: immediate snapshot, subsequent full updates/end, reconnect restoration, CORS and disconnect cleanup', { timeout: 10_000 }, async t => {
  const store = createLiveCallStore();
  store.connecting('one'); store.live('one'); store.transcript('one', [turn('u1', 'user', '가'.repeat(100_000))]);
  const server = createBackend({ key: '', agentId: '', liveCalls: store, monitors: { start() {}, close() {}, release() {} } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/api/live-calls/events`;
  assert.equal((await fetch(url, { headers: { Origin: 'https://not-allowed.invalid' } })).status, 403);
  for (let n = 0; n < 3; n++) {
    const abort = new AbortController();
    const response = await fetch(url, { headers: { Origin: 'http://127.0.0.1:5173' }, signal: abort.signal });
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    const reader = response.body.getReader();
    const first = await readEvent(reader);
    assert.equal(first.type, 'snapshot');
    assert.equal(first.data.calls.length, 1);
    assert.equal(first.data.calls[0].messages.length, 1);
    assert.equal(store.subscriberCount, 1);
    if (n === 0) {
      assert.equal(first.data.calls[0].messages[0].content.length, 100_000); // larger than socket high-water mark
      store.transcript('one', [turn('u1', 'user', '정정된 대화')]);
      const next = await readEvent(reader);
      assert.equal(next.type, 'transcript');
      assert.equal(next.data.messages.length, 1);
      assert.equal(next.data.messages[0].content, '정정된 대화');
      store.ended('one');
      const ended = await readEvent(reader);
      assert.equal(ended.data.status, 'ended');
      assert.equal(ended.data.messages[0].content, '정정된 대화');
    } else assert.equal(first.data.calls[0].status, 'ended');
    abort.abort(); await reader.cancel().catch(() => {});
    for (let retry = 0; retry < 30 && store.subscriberCount; retry++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(store.subscriberCount, 0);
  }
});

test('SSE lifecycle: heartbeat, close/error cleanup, slow subscribers do not accumulate buffers/listeners', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const store = createLiveCallStore();
  const sse = createLiveEvents(store, 100);
  class Response extends EventEmitter {
    frames = []; blocked = false; destroyed = false;
    writeHead() {} setTimeout() {} flushHeaders() {}
    write(text) { this.frames.push(text); return !this.blocked; }
    end() { this.emit('close'); } destroy() { this.destroyed = true; this.emit('close'); }
  }
  t.after(() => { sse.close(); t.mock.timers.reset(); });
  const res = new Response(); sse.connect(res);
  t.mock.timers.tick(100);
  assert.ok(res.frames.some(frame => frame.includes('keep-alive')));
  res.emit('close'); assert.equal(store.subscriberCount, 0);
  const count = res.frames.length; t.mock.timers.tick(500); assert.equal(res.frames.length, count);
  const slow = new Response(); slow.blocked = true; sse.connect(slow);
  assert.equal(slow.destroyed, false); // allow even a large initial snapshot to drain
  store.connecting('one'); store.live('one');
  assert.equal(slow.frames.length, 1); // pending events are coalesced, never queued
  slow.blocked = false; slow.emit('drain');
  assert.match(slow.frames[1], /event: snapshot/);
  assert.match(slow.frames[1], /"status":"live"/);
  slow.blocked = true; store.transcript('one', [turn('u1', 'user', '새 대화')]);
  t.mock.timers.tick(30_000);
  assert.equal(slow.destroyed, true); assert.equal(store.subscriberCount, 0);
  const other = new Response(); sse.connect(other); other.emit('error', new Error('browser gone'));
  assert.equal(store.subscriberCount, 0);
});
