import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createConsultationIdFactory } from '../call-identity.mjs';
import { createLiveCallStore } from '../live-calls.mjs';
import { createN8nDelivery, callResultPayload, n8nConfig } from '../n8n-delivery.mjs';
import { createBackend } from '../app.mjs';
import { createMonitorRegistry } from '../monitor.mjs';

// Synthetic fixtures only: never the user's production webhook/customer/credentials.
const webhookUrl = 'https://workflow.example.test/webhook/synthetic-private-path';
const customerId = 'customer_unit_fixture';
const audio = (sequence = 1, closed = true) => ({ sequence, shouting_count: 2, is_shouting: false, available: true, coverage_complete: true, closed });
const transcript = [{ id: 'u1', role: 'user', time_sec: 1, content: '씨발 씨발. 내가 너 찾아간다. 일을 왜 이렇게 못해요? 말이 안 통하네. 이것도 제대로 못해요?' }];
const tick = () => new Promise(resolve => setImmediate(resolve));
const getCall = (store, id = 'call_test') => store.snapshot().find(call => call.call_id === id);
function prepare(store, id = 'call_test', customer = customerId) {
  store.connecting(id, customer); store.live(id); store.transcript(id, transcript);
}
function finish(store, id = 'call_test') { store.audio(id, audio()); store.ended(id); }
function fixture(t, overrides = {}) {
  const store = createLiveCallStore(), requests = [], logs = [];
  const delivery = createN8nDelivery({ liveCalls: store, webhookUrl,
    fetchImpl: async (url, init) => { requests.push({ url, init }); return new Response('ok'); },
    log: line => logs.push(line), ...overrides });
  t.after(() => delivery.close());
  return { store, requests, logs, delivery };
}

test('consultation IDs are numeric, unique in the same millisecond and survive a clock rollback', () => {
  let time = 1760000000000;
  const generate = createConsultationIdFactory(() => time);
  const ids = [generate(), generate()]; time--; ids.push(generate());
  assert.deepEqual(ids, ['consultation_1760000000000', 'consultation_1760000000001', 'consultation_1760000000002']);
  ids.forEach(id => assert.match(id, /^consultation_\d+$/));
});

test('server config has no implicit demo customer or URL; configured values are trimmed', () => {
  assert.deepEqual(n8nConfig({}), { webhookUrl: '', demoCustomerId: null });
  assert.deepEqual(n8nConfig({ N8N_WEBHOOK_URL: ` ${webhookUrl} `, KCM_DEMO_CUSTOMER_ID: ` ${customerId} ` }),
    { webhookUrl, demoCustomerId: customerId });
});

test('final audio before end never posts early; finalized JSON matches the exact contract and 200 marks sent', async t => {
  const { store, requests, logs } = fixture(t);
  prepare(store);
  const consultationId = getCall(store).consultation_id;
  store.connecting('call_test', 'must-not-replace', 'consultation_999');
  store.audio('call_test', audio());
  assert.equal(requests.length, 0);
  store.ended('call_test');
  assert.equal(getCall(store).webhook_delivery.status, 'pending');
  await tick();
  assert.equal(requests.length, 1);
  const { url, init } = requests[0];
  assert.equal(url, webhookUrl); assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
  assert.equal(init.redirect, 'manual');
  const payload = JSON.parse(init.body);
  assert.deepEqual(payload, {
    call_id: 'call_test', consultation_id: consultationId, customer_id: customerId,
    signals: { profanity_count: 2, threat_count: 1, blame_count: 3, sexual_count: 0, shouting_count: 2 },
    scores: { profanity_score: 6, threat_score: 20, blame_score: 8, sexual_score: 0, shouting_score: 5 },
    risk_score: 39, risk_level: '주의',
  });
  assert.equal(Array.isArray(payload), false); assert.equal('body' in payload, false);
  assert.equal(getCall(store).consultation_id, consultationId);
  assert.equal(getCall(store).webhook_delivery.status, 'sent');
  assert.deepEqual(logs, ['[n8n] delivered call result: call_test']);
  assert.doesNotMatch(JSON.stringify(logs), /https:|synthetic-private-path|customer_unit|씨발/);
});

test('raw end waits for late final audio; repeated finalization/registration/claims cannot post twice', async t => {
  let resolve;
  const posts = [];
  const { store } = fixture(t, { fetchImpl: (url, init) => { posts.push(init); return new Promise(done => { resolve = done; }); } });
  prepare(store); store.audio('call_test', audio(1, false)); store.ended('call_test');
  assert.equal(posts.length, 0); assert.equal(getCall(store).webhook_delivery, null);
  store.audio('call_test', audio(2));
  assert.equal(posts.length, 1);
  for (let i = 0; i < 3; i++) {
    store.ended('call_test'); store.audio('call_test', audio(2)); store.audio('call_test', audio(3));
    assert.equal(store.claimWebhookDelivery('call_test'), null);
  }
  const pending = getCall(store);
  resolve(new Response(null, { status: 200 })); await tick();
  const sent = getCall(store);
  store.ended('call_test'); store.finishWebhookDelivery('call_test', 'failed', 'must-not-overwrite');
  assert.equal(store.claimWebhookDelivery('call_test'), null);
  assert.deepEqual(getCall(store), sent);
  assert.deepEqual(sent.final_result, pending.final_result);
  assert.equal(sent.webhook_delivery.attempted_at, pending.webhook_delivery.attempted_at);
  assert.equal(posts.length, 1);
});

test('unmeasured/incomplete audio, absent final audio and Monitor error do not post', async t => {
  const { store, requests } = fixture(t);
  prepare(store, 'absent'); store.ended('absent');
  prepare(store, 'missing'); store.audio('missing', { ...audio(), available: false, coverage_complete: false }); store.ended('missing');
  prepare(store, 'gap'); store.audio('gap', { ...audio(), coverage_complete: false }); store.ended('gap');
  prepare(store, 'error'); store.audio('error', audio()); store.error('error'); store.ended('error');
  await tick(); assert.equal(requests.length, 0);
  for (const call of store.snapshot()) { assert.equal(call.final_result, null); assert.equal(call.webhook_delivery, null); }
});

for (const status of [400, 401, 429, 500, 503, 302]) {
  test(`HTTP ${status} is failed without disclosing response, destroying result or auto-retrying`, async t => {
    let count = 0;
    const { store, logs } = fixture(t, { fetchImpl: async () => { count++; return new Response('private workflow response', { status }); } });
    prepare(store); finish(store); const result = getCall(store).final_result;
    await tick();
    assert.equal(getCall(store).webhook_delivery.status, 'failed');
    assert.equal(getCall(store).webhook_delivery.error, `HTTP_${status}`);
    store.ended('call_test'); store.audio('call_test', audio(2));
    assert.equal(store.claimWebhookDelivery('call_test'), null);
    assert.deepEqual(getCall(store).final_result, result); assert.equal(count, 1);
    assert.deepEqual(logs, [`[n8n] delivery failed: call_test (HTTP_${status})`]);
  });
}

test('network rejection is sanitized; another call can still finalize and deliver', async t => {
  let count = 0;
  const { store, logs } = fixture(t, { fetchImpl: async () => {
    if (++count === 1) throw new Error(`connect failed ${webhookUrl} private-key`);
    return new Response(null, { status: 204 });
  } });
  prepare(store); finish(store); await tick();
  assert.equal(getCall(store).webhook_delivery.error, 'NETWORK_ERROR');
  const first = getCall(store);
  prepare(store, 'call_other', 'customer_other_fixture'); finish(store, 'call_other'); await tick();
  assert.equal(getCall(store, 'call_other').webhook_delivery.status, 'sent');
  assert.notEqual(getCall(store, 'call_other').consultation_id, first.consultation_id);
  assert.equal(getCall(store, 'call_other').final_result.customer_id, 'customer_other_fixture');
  assert.deepEqual(getCall(store), first);
  assert.doesNotMatch(JSON.stringify(logs), /https:|private-key|synthetic-private-path/);
});

test('timeout and server close abort pending work and preserve final results', async t => {
  const pendingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const a = fixture(t, { fetchImpl: pendingFetch, timeoutMs: 10 });
  prepare(a.store); finish(a.store);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(getCall(a.store).webhook_delivery.error, 'TIMEOUT');
  assert.equal(getCall(a.store).final_result.risk_score, 39);
  const b = fixture(t, { fetchImpl: pendingFetch });
  prepare(b.store); finish(b.store); b.delivery.close(); await tick();
  assert.equal(getCall(b.store).webhook_delivery.error, 'SERVER_STOPPED');
  assert.equal(getCall(b.store).final_result.risk_score, 39);
  prepare(b.store, 'after_close'); finish(b.store, 'after_close');
  assert.equal(getCall(b.store, 'after_close').webhook_delivery, null);
});

for (const [url, expected] of [['', 'N8N_WEBHOOK_URL_MISSING'], ['not a URL', 'N8N_WEBHOOK_URL_INVALID'],
  ['http://workflow.example.test', 'N8N_WEBHOOK_URL_INVALID'], ['https://user:pass@workflow.example.test', 'N8N_WEBHOOK_URL_INVALID']]) {
  test(`invalid/unset webhook configuration: ${expected} preserves calls without any network`, async t => {
    const { store, requests } = fixture(t, { webhookUrl: url });
    prepare(store); finish(store); await tick();
    assert.equal(requests.length, 0); assert.equal(getCall(store).webhook_delivery.error, expected);
    assert.equal(getCall(store).final_result.risk_score, 39);
  });
}

test('missing customer is never substituted; malformed IDs/unfinalized results cannot form a payload', async t => {
  const { store, requests } = fixture(t);
  prepare(store, 'call_test', null);
  assert.throws(() => callResultPayload(getCall(store)), /RESULT_NOT_FINAL/);
  finish(store); await tick();
  const call = getCall(store);
  assert.equal(call.final_result.customer_id, null); assert.equal(requests.length, 0);
  assert.equal(call.webhook_delivery.error, 'CUSTOMER_ID_MISSING');
  assert.throws(() => callResultPayload({ ...call, consultation_id: 'consultation_uuid-hyphen' }), /CONSULTATION_ID_INVALID/);
});

test('two delivery subscribers still share the same atomic per-call claim', async t => {
  const a = fixture(t), otherPosts = [];
  const second = createN8nDelivery({ liveCalls: a.store, webhookUrl, fetchImpl: async () => { otherPosts.push(1); return new Response(); }, log() {} });
  t.after(() => second.close());
  prepare(a.store); finish(a.store); await tick();
  assert.equal(a.requests.length + otherPosts.length, 1);
});

test('HTTP create + actual Monitor SDK frames + final audio automatically POST to isolated receiver; IDs and SSE remain isolated', { timeout: 10_000 }, async t => {
  // Only Retell transport and outbound HTTPS destination are substituted; actual Node HTTP/fetch and SDK are used.
  const original = globalThis.WebSocket, sockets = [], received = [], logs = [];
  class FakeSocket { constructor() { sockets.push(this); } frame(data) { this.onmessage?.({ data: JSON.stringify(data) }); } close() {} }
  globalThis.WebSocket = FakeSocket;
  t.after(() => { globalThis.WebSocket = original; });
  const receiver = createServer(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    received.push({ method: req.method, type: req.headers['content-type'], body: JSON.parse(text) });
    res.writeHead(200); res.end('received');
  });
  receiver.listen(0, '127.0.0.1'); await once(receiver, 'listening');
  t.after(() => { receiver.closeAllConnections(); receiver.close(); });
  const store = createLiveCallStore();
  const monitors = createMonitorRegistry({ key: 'synthetic-retell-key', liveCalls: store, log: line => logs.push(line) });
  let createIndex = 0;
  const identities = [];
  const server = createBackend({ key: 'synthetic-retell-key', agentId: 'agent_fixture', liveCalls: store,
    monitors, ...n8nConfig({ N8N_WEBHOOK_URL: webhookUrl, KCM_DEMO_CUSTOMER_ID: customerId }), log: line => logs.push(line),
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer synthetic-retell-key');
      assert.deepEqual(JSON.parse(init.body), { agent_id: 'agent_fixture' });
      return Response.json({ call_id: `call_http_${++createIndex}`, access_token: 'synthetic-access-token' });
    },
    webhookFetchImpl: (url, init) => {
      assert.equal(url, webhookUrl); assert.equal(init.headers.Authorization, undefined);
      return fetch(`http://127.0.0.1:${receiver.address().port}/receive`, init);
    },
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  for (let i = 0; i < 2; i++) {
    const response = await post('/retell/v3/create-web-call', { agent_id: 'agent_fixture' });
    const data = await response.json(); await tick();
    assert.equal(response.status, 200);
    assert.doesNotMatch(JSON.stringify(data), /webhook|customer|consultation|synthetic-retell-key/);
    const before = getCall(store, data.call_id);
    identities.push(before.consultation_id);
    assert.match(before.consultation_id, /^consultation_\d+$/); assert.equal(before.customer_id, customerId);
    sockets[i].frame({ type: 'transcript_snapshot', transcripts: transcript });
    sockets[i].frame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
    assert.equal(received.length, i); // raw end never posts
    assert.equal((await post(`/api/live-calls/${data.call_id}/audio-signals`, audio())).status, 200);
    for (let n = 0; n < 100 && getCall(store, data.call_id).webhook_delivery?.status !== 'sent'; n++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(getCall(store, data.call_id).webhook_delivery.status, 'sent');
    assert.equal(getCall(store, data.call_id).consultation_id, before.consultation_id);
    sockets[i].frame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
    await post(`/api/live-calls/${data.call_id}/audio-signals`, audio()); await tick();
    assert.equal(received.length, i + 1);
    assert.deepEqual(received[i], { method: 'POST', type: 'application/json', body: callResultPayload(getCall(store, data.call_id)) });
  }
  assert.notEqual(identities[0], identities[1]); assert.equal(monitors.size, 0);
  assert.deepEqual(await (await fetch(base + '/retell/config')).json(), { agent_id: 'agent_fixture', configured: true });
  const sse = await fetch(base + '/api/live-calls/events');
  const reader = sse.body.getReader(); let snapshot = '';
  while (!snapshot.includes('event: snapshot')) snapshot += new TextDecoder().decode((await reader.read()).value);
  await reader.cancel();
  assert.match(snapshot, /call_http_1/); assert.match(snapshot, /call_http_2/); assert.match(snapshot, /"status":"sent"/);
  assert.doesNotMatch(snapshot + JSON.stringify(logs), /https:|synthetic-private-path|synthetic-retell-key|synthetic-access-token/);
});
