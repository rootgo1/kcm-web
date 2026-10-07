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
const webhookAuthToken = 'synthetic_n8n_auth_token_for_isolated_tests_only_1234567890';
const customerId = 'customer_unit_fixture';
const storeId = 'store_unit_fixture';
const audio = (sequence = 1, closed = true) => ({ sequence, shouting_count: 2, is_shouting: false, available: true, coverage_complete: true, closed });
const transcript = [{ id: 'u1', role: 'user', time_sec: 1, content: '씨발 씨발. 내가 너 찾아간다. 일을 왜 이렇게 못해요? 말이 안 통하네. 이것도 제대로 못해요?' }];
const tick = () => new Promise(resolve => setImmediate(resolve));
const getCall = (store, id = 'call_test') => store.snapshot().find(call => call.call_id === id);
function prepare(store, id = 'call_test', customer = customerId, demoStore = storeId) {
  store.connecting(id, customer, undefined, demoStore); store.live(id); store.transcript(id, transcript);
}
function finish(store, id = 'call_test') { store.audio(id, audio()); store.ended(id); }
function fixture(t, overrides = {}) {
  const store = createLiveCallStore(), requests = [], logs = [];
  const delivery = createN8nDelivery({ liveCalls: store, webhookUrl, webhookAuthToken,
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

test('server config has no implicit demo customer/store or URL; configured values are trimmed', () => {
  assert.deepEqual(n8nConfig({}), { webhookUrl: '', webhookAuthToken: '', demoCustomerId: null, demoStoreId: null });
  assert.deepEqual(n8nConfig({ N8N_WEBHOOK_URL: ` ${webhookUrl} `, KCM_DEMO_CUSTOMER_ID: ` ${customerId} `, KCM_DEMO_STORE_ID: ` ${storeId} ` }),
    { webhookUrl, webhookAuthToken: '', demoCustomerId: customerId, demoStoreId: storeId });
  assert.equal(n8nConfig({ KCM_DEMO_STORE_ID: '  ' }).demoStoreId, null);
});

test('final audio before end never posts early; finalized JSON matches the exact contract and 200 marks sent', async t => {
  const { store, requests, logs } = fixture(t);
  prepare(store);
  const consultationId = getCall(store).consultation_id;
  store.connecting('call_test', 'must-not-replace', 'consultation_999', 'must-not-replace-store');
  store.audio('call_test', audio());
  assert.equal(requests.length, 0);
  store.ended('call_test');
  assert.equal(getCall(store).webhook_delivery.status, 'pending');
  await tick();
  assert.equal(requests.length, 1);
  const { url, init } = requests[0];
  assert.equal(url, webhookUrl); assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer ' + webhookAuthToken });
  assert.equal(init.redirect, 'manual');
  const payload = JSON.parse(init.body);
  assert.deepEqual(payload, {
    call_id: 'call_test', consultation_id: consultationId, customer_id: customerId,
    signals: { profanity_count: 2, threat_count: 1, blame_count: 3, sexual_count: 0, shouting_count: 2 },
    scores: { profanity_score: 6, threat_score: 20, blame_score: 8, sexual_score: 0, shouting_score: 5 },
    risk_score: 40, risk_level: '경계',
    consultation: {
      store_id: storeId, status: '완료', used_ai: true,
      started_at: getCall(store).started_at, ended_at: getCall(store).ended_at,
      transcript: [{ turn_id: 'u1', role: 'user', content: transcript[0].content, start_sec: 1 }],
    },
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
  prepare(store, 'call_other', 'customer_other_fixture', 'store_other_fixture'); finish(store, 'call_other'); await tick();
  assert.equal(getCall(store, 'call_other').webhook_delivery.status, 'sent');
  assert.notEqual(getCall(store, 'call_other').consultation_id, first.consultation_id);
  assert.equal(getCall(store, 'call_other').final_result.customer_id, 'customer_other_fixture');
  assert.equal(callResultPayload(getCall(store, 'call_other')).consultation.store_id, 'store_other_fixture');
  assert.equal(first.store_id, storeId);
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
  assert.equal(getCall(a.store).final_result.risk_score, 40);
  const b = fixture(t, { fetchImpl: pendingFetch });
  prepare(b.store); finish(b.store); b.delivery.close(); await tick();
  assert.equal(getCall(b.store).webhook_delivery.error, 'SERVER_STOPPED');
  assert.equal(getCall(b.store).final_result.risk_score, 40);
  prepare(b.store, 'after_close'); finish(b.store, 'after_close');
  assert.equal(getCall(b.store, 'after_close').webhook_delivery, null);
});

for (const [url, expected] of [['', 'N8N_WEBHOOK_URL_MISSING'], ['not a URL', 'N8N_WEBHOOK_URL_INVALID'],
  ['http://workflow.example.test', 'N8N_WEBHOOK_URL_INVALID'], ['https://user:pass@workflow.example.test', 'N8N_WEBHOOK_URL_INVALID']]) {
  test(`invalid/unset webhook configuration: ${expected} preserves calls without any network`, async t => {
    const { store, requests } = fixture(t, { webhookUrl: url });
    prepare(store); finish(store); await tick();
    assert.equal(requests.length, 0); assert.equal(getCall(store).webhook_delivery.error, expected);
    assert.equal(getCall(store).final_result.risk_score, 40);
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

test('consultation sends the final corrected snapshot in source order, with exact text, both roles and null timing', async t => {
  const { store, requests } = fixture(t);
  prepare(store);
  store.transcript('call_test', [
    { id: 'u2', role: 'user', content: 'discarded partial', time_sec: 4 },
    { id: 'removed', role: 'agent', content: 'removed by snapshot', time_sec: 5 },
  ]);
  store.transcript('call_test', [
    { id: 'u2', role: 'user', content: '  정정된 고객 발화\n그대로 보존 <script>text</script>  ', time_sec: 4.75 },
    { id: 'a1', role: 'agent', content: 'AI 응답 · 줄바꿈\n유지', time_sec: null },
    { id: 'u3', role: 'user', content: '마지막 발화', time_sec: 1 }, // do not reorder by timestamp
  ]);
  const messages = getCall(store).messages, start = getCall(store).started_at;
  store.ended('call_test'); const end = getCall(store).ended_at;
  assert.equal(requests.length, 0);
  store.audio('call_test', audio()); await tick();
  const sent = JSON.parse(requests[0].init.body);
  assert.deepEqual(sent.consultation.transcript, messages.map(({ turn_id, role, content, start_sec }) => ({ turn_id, role, content, start_sec })));
  assert.deepEqual(sent.consultation.transcript.map(turn => turn.role), ['user', 'agent', 'user']);
  assert.equal(sent.consultation.transcript[1].start_sec, null);
  assert.equal(sent.consultation.started_at, start); assert.equal(sent.consultation.ended_at, end);
  assert.deepEqual(getCall(store).messages, messages);
  store.transcript('call_test', []); store.ended('call_test'); store.audio('call_test', audio(2));
  assert.equal(requests.length, 1); assert.deepEqual(getCall(store).messages, messages);
});

test('payload projection excludes sensitive/internal fields and summaries, never mutates the source', () => {
  const store = createLiveCallStore(); prepare(store); finish(store);
  const call = getCall(store);
  Object.assign(call, { access_token: 'private-token-fixture', api_key: 'private-key-fixture', purpose: 'not-generated', ai_summary: 'not-generated' });
  call.messages[0].access_token = 'private-token-fixture';
  call.messages[0].api_key = 'private-key-fixture';
  call.messages[0].analysis = { badge: 'do-not-forward' };
  const before = structuredClone(call), payload = callResultPayload(call);
  assert.deepEqual(call, before);
  assert.deepEqual(Object.keys(payload), ['call_id', 'consultation_id', 'customer_id', 'signals', 'scores', 'risk_score', 'risk_level', 'consultation']);
  assert.deepEqual(Object.keys(payload.consultation), ['store_id', 'status', 'used_ai', 'started_at', 'ended_at', 'transcript']);
  assert.deepEqual(Object.keys(payload.consultation.transcript[0]), ['turn_id', 'role', 'content', 'start_sec']);
  assert.doesNotMatch(JSON.stringify(payload), /private-token|private-key|access_token|api_key|analysis|badge|end_sec|purpose|ai_summary|not-generated|rule_version/);
  payload.consultation.transcript[0].content = 'changed copy';
  assert.deepEqual(call, before);
});

test('empty final transcript stays empty without fabricating content, purpose or summary', async t => {
  const { store, requests } = fixture(t);
  prepare(store); store.transcript('call_test', []); finish(store); await tick();
  const payload = JSON.parse(requests[0].init.body);
  assert.deepEqual(payload.consultation.transcript, []);
  assert.equal(payload.risk_score, 5); // unchanged shouting 2 score, no text score
});

for (const missing of [null, undefined, '', '  ']) {
  test(`missing store ID (${String(missing)}) fails without POST, fallback identity or loss of call results`, async t => {
    const { store, requests, logs } = fixture(t);
    store.connecting('call_test', customerId, undefined, missing); store.live('call_test'); store.transcript('call_test', transcript);
    finish(store); const result = getCall(store).final_result; await tick();
    assert.equal(requests.length, 0);
    assert.equal(getCall(store).webhook_delivery.status, 'failed');
    assert.equal(getCall(store).webhook_delivery.error, 'STORE_ID_MISSING');
    assert.throws(() => callResultPayload(getCall(store)), /STORE_ID_MISSING/);
    store.ended('call_test'); store.audio('call_test', audio(2));
    assert.deepEqual(getCall(store).final_result, result); assert.equal(requests.length, 0);
    assert.deepEqual(logs, ['[n8n] delivery failed: call_test (STORE_ID_MISSING)']);
  });
}

for (const [field, value] of [['started_at', null], ['ended_at', null], ['started_at', undefined],
  ['ended_at', ''], ['started_at', 'invalid'], ['ended_at', '2026-02-30T01:00:00.000Z'],
  ['started_at', '2026-10-02T00:00:02.000Z']]) {
  test(`invalid/missing/reversed call time ${field}=${String(value)} is rejected without inventing a timestamp`, () => {
    const store = createLiveCallStore(() => '2026-10-02T00:00:01.000Z');
    prepare(store); finish(store);
    const call = { ...getCall(store), [field]: value }, before = structuredClone(call);
    assert.throws(() => callResultPayload(call), /CONSULTATION_TIMES_INVALID/);
    assert.deepEqual(call, before);
  });
}

test('finalized risk with no Monitor start time becomes failed, preserving the original result and null time', async t => {
  const { store, requests, logs } = fixture(t);
  store.connecting('call_test', customerId, undefined, storeId);
  finish(store); await tick();
  assert.equal(getCall(store).started_at, null); assert.equal(getCall(store).final_result.risk_score, 5);
  assert.equal(getCall(store).webhook_delivery.status, 'failed');
  assert.equal(getCall(store).webhook_delivery.error, 'CONSULTATION_TIMES_INVALID');
  assert.equal(requests.length, 0);
  assert.deepEqual(logs, ['[n8n] delivery failed: call_test (CONSULTATION_TIMES_INVALID)']);
});

test('two delivery subscribers still share the same atomic per-call claim', async t => {
  const a = fixture(t), otherPosts = [];
  const second = createN8nDelivery({ liveCalls: a.store, webhookUrl, webhookAuthToken, fetchImpl: async () => { otherPosts.push(1); return new Response(); }, log() {} });
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
    assert.equal(req.headers.authorization, 'Bearer ' + webhookAuthToken);
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
    monitors, ...n8nConfig({ N8N_WEBHOOK_URL: webhookUrl, N8N_WEBHOOK_AUTH_TOKEN: webhookAuthToken,
      KCM_DEMO_CUSTOMER_ID: customerId, KCM_DEMO_STORE_ID: storeId }), log: line => logs.push(line),
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer synthetic-retell-key');
      assert.deepEqual(JSON.parse(init.body), { agent_id: 'agent_fixture' });
      return Response.json({ call_id: `call_http_${++createIndex}`, access_token: 'synthetic-access-token' });
    },
    webhookFetchImpl: (url, init) => {
      assert.equal(url, webhookUrl); assert.equal(init.headers.Authorization, 'Bearer ' + webhookAuthToken);
      return fetch(`http://127.0.0.1:${receiver.address().port}/receive`, init);
    },
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/retell/v3/create-web-call', { agent_id: 'agent_fixture', store_id: 'browser-override' })).status, 400);
  assert.equal(createIndex, 0);
  for (let i = 0; i < 2; i++) {
    const response = await post('/retell/v3/create-web-call', { agent_id: 'agent_fixture' });
    const data = await response.json(); await tick();
    assert.equal(response.status, 200);
    assert.doesNotMatch(JSON.stringify(data), /webhook|customer|consultation|store_id|synthetic-retell-key/);
    assert.equal(JSON.stringify(data).includes(webhookAuthToken), false);
    const before = getCall(store, data.call_id);
    identities.push(before.consultation_id);
    assert.match(before.consultation_id, /^consultation_\d+$/); assert.equal(before.customer_id, customerId);
    assert.equal(before.store_id, storeId);
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
  assert.equal((snapshot + JSON.stringify(logs)).includes(webhookAuthToken), false);
});

test('auth configuration preserves the exact bare token and never falls back to other keys', () => {
  const raw = ' ' + webhookAuthToken + '\n';
  assert.equal(n8nConfig({ N8N_WEBHOOK_AUTH_TOKEN: raw }).webhookAuthToken, raw);
  assert.equal(n8nConfig({ RETELL_API_KEY: webhookAuthToken, SUPABASE_READ_KEY: webhookAuthToken }).webhookAuthToken, '');
});

test('missing auth token fails without HTTP, preserves final result and cannot retry after finalization', async t => {
  const { store, requests, logs } = fixture(t, { webhookAuthToken: '' });
  prepare(store); finish(store);
  const result = getCall(store).final_result;
  await tick();
  assert.equal(requests.length, 0);
  assert.equal(getCall(store).webhook_delivery.status, 'failed');
  assert.equal(getCall(store).webhook_delivery.error, 'N8N_WEBHOOK_AUTH_MISSING');
  store.ended('call_test'); store.audio('call_test', audio(2));
  assert.equal(store.claimWebhookDelivery('call_test'), null);
  assert.deepEqual(getCall(store).final_result, result);
  assert.deepEqual(logs, ['[n8n] delivery failed: call_test (N8N_WEBHOOK_AUTH_MISSING)']);
});

test('malformed auth tokens are rejected without normalization, network or secret disclosure', async t => {
  for (const token of ['short', 'a'.repeat(31), 'a'.repeat(257), ' ' + webhookAuthToken, webhookAuthToken + ' ',
    webhookAuthToken + '\n', webhookAuthToken + '\r\n', webhookAuthToken + '\r', 'Bearer ' + webhookAuthToken,
    webhookAuthToken + '\t', webhookAuthToken + '\0', webhookAuthToken + '한', webhookAuthToken + '/']) {
    const { store, requests, logs } = fixture(t, { webhookAuthToken: token });
    prepare(store); finish(store); await tick();
    assert.equal(requests.length, 0);
    assert.equal(getCall(store).webhook_delivery.error, 'N8N_WEBHOOK_AUTH_INVALID');
    assert.equal(getCall(store).final_result.risk_score, 40);
    assert.equal((JSON.stringify(store.snapshot()) + JSON.stringify(logs)).includes(token), false);
  }
});

test('valid token bounds and allowed characters are transmitted only in the Authorization header', async t => {
  for (const token of ['A'.repeat(32), 'z'.repeat(256), 'Synthetic_Bare-Token_12345678901234567890']) {
    const { store, requests, logs } = fixture(t, { webhookAuthToken: token });
    prepare(store); finish(store); await tick();
    assert.equal(getCall(store).webhook_delivery.status, 'sent');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].init.headers.Authorization, 'Bearer ' + token);
    assert.equal(requests[0].url.includes(token), false);
    assert.equal(requests[0].init.body.includes(token), false);
    assert.equal((JSON.stringify(store.snapshot()) + JSON.stringify(logs)).includes(token), false);
  }
});

test('receiver auth rejection or redirect never retries, follows Location or discloses echoed credentials', async t => {
  for (const status of [401, 403, 302, 307, 308]) {
    let count = 0;
    const { store, logs } = fixture(t, { fetchImpl: async (_url, init) => {
      count++;
      assert.equal(init.redirect, 'manual');
      assert.equal(init.headers.Authorization, 'Bearer ' + webhookAuthToken);
      return new Response('echoed auth ' + webhookAuthToken, { status, headers: { Location: 'https://other.example.test/' + webhookAuthToken } });
    } });
    prepare(store); finish(store); const result = getCall(store).final_result; await tick();
    assert.equal(getCall(store).webhook_delivery.error, 'HTTP_' + status);
    store.ended('call_test'); store.audio('call_test', audio(2)); await tick();
    assert.equal(count, 1);
    assert.deepEqual(getCall(store).final_result, result);
    assert.equal((JSON.stringify(store.snapshot()) + JSON.stringify(logs)).includes(webhookAuthToken), false);
  }
});

test('network exceptions containing auth token never reach SSE state or logs', async t => {
  const { store, logs } = fixture(t, { fetchImpl: async () => { throw new Error('Authorization: Bearer ' + webhookAuthToken); } });
  prepare(store); finish(store); await tick();
  assert.equal(getCall(store).webhook_delivery.error, 'NETWORK_ERROR');
  assert.equal((JSON.stringify(store.snapshot()) + JSON.stringify(logs)).includes(webhookAuthToken), false);
});
