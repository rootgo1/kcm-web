import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { RetellClient } from 'retell-client-js-sdk';
import { createBackend } from '../app.mjs';
import { createMonitorRegistry, createTranscriptPrinter } from '../monitor.mjs';

const origin = 'http://127.0.0.1:5173';
const key = 'unit-test-placeholder'; // synthetic, never a real credential
const agentId = 'agent_test';
const turn = (id, role, content) => ({ id, role, content, time_sec: 1 });
const tick = () => new Promise(resolve => setImmediate(resolve));

async function backend(t, overrides = {}) {
  const logs = [], started = [], released = [], requests = [];
  let closed = false;
  const monitors = { start: id => started.push(id), release: id => released.push(id), close: () => { closed = true; } };
  const server = createBackend({ key, agentId, monitors, log: line => logs.push(line),
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return Response.json({ call_id: 'call_test', access_token: 'short-lived-placeholder', transport: 'gateway', url: 'wss://media.invalid', unexpected: 'discard' });
    }, ...overrides });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); assert.equal(closed, true); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path = '/retell/v3/create-web-call', body = { agent_id: agentId }, headers = {}) => fetch(base + path,
    { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { base, post, logs, started, released, requests };
}

test('backend: missing environment returns 503 without any upstream request', async t => {
  const b = await backend(t, { key: '' });
  const config = await (await fetch(b.base + '/retell/config')).json();
  assert.equal(config.configured, false);
  const response = await b.post();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error_message, 'RETELL_API_KEY_MISSING');
  assert.equal(b.requests.length, 0);
  assert.equal(b.started.length, 0);
});

test('backend: missing Agent ID fails explicitly', async t => {
  const b = await backend(t, { agentId: '' });
  assert.equal((await (await b.post()).json()).error_message, 'RETELL_AGENT_ID_MISSING');
  assert.equal(b.requests.length, 0);
});

test('backend: v3 proxy uses server key, starts monitor and returns SDK fields without logging credentials', async t => {
  const b = await backend(t);
  const response = await b.post(undefined, undefined, { Authorization: 'browser-value-must-not-be-forwarded' });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(data.access_token, 'short-lived-placeholder');
  assert.equal(data.unexpected, undefined);
  assert.equal(b.requests[0].url, 'https://api.retellai.com/v3/create-web-call');
  assert.equal(b.requests[0].init.headers.Authorization, `Bearer ${key}`);
  assert.equal(b.requests[0].init.headers['X-Retell-Client-JS-SDK-Version'], '3.0.2');
  assert.deepEqual(JSON.parse(b.requests[0].init.body), { agent_id: agentId });
  assert.deepEqual(b.started, ['call_test']);
  assert.deepEqual(b.logs, ['call created: call_test']);
  assert.doesNotMatch(JSON.stringify(b.logs), /placeholder|access_token|Authorization/);
});

test('backend: only localhost developer origins, configured Agent and exact REST routes are allowed', async t => {
  const b = await backend(t);
  assert.equal((await b.post(undefined, undefined, { Origin: 'https://untrusted.invalid' })).status, 403);
  // Node fetch replaces Host; use a raw HTTP client to actually send this test header.
  const hostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(b.base + '/retell/v3/create-web-call', { method: 'POST', headers: { Host: 'untrusted.invalid', Origin: origin } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal((await fetch(b.base + '/retell/v3/create-web-call', { method: 'POST' })).status, 403);
  assert.equal((await b.post(undefined, { agent_id: 'another_agent' })).status, 400);
  assert.equal((await b.post(undefined, { agent_id: agentId, agent_override: {} })).status, 400);
  assert.equal((await b.post('/retell/v2/take-over-live-call/call_test')).status, 404);
  assert.equal((await b.post('/retell/v2/listen-live-call/call_test')).status, 404);
  assert.equal((await b.post(undefined, undefined, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal(b.requests.length, 0);
  const preflight = await fetch(b.base + '/retell/v3/create-web-call', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('backend: malformed/oversized bodies and missing call_id/token never start Monitor', async t => {
  const b = await backend(t, { fetchImpl: async () => Response.json({ access_token: 'secret-must-not-log' }) });
  assert.equal((await b.post()).status, 502);
  const malformed = await fetch(b.base + '/retell/v3/create-web-call', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await b.post(undefined, { agent_id: 'x'.repeat(5000) })).status, 400);
  assert.equal(b.started.length, 0);
  assert.equal(b.logs.length, 0);
});

test('backend: upstream error bodies and exceptions are sanitized', async t => {
  const b = await backend(t, { fetchImpl: async () => new Response('private upstream body', { status: 401 }) });
  const response = await b.post();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error_message, 'RETELL_AUTH_FAILED');
  assert.deepEqual(b.logs, ['retell request failed: HTTP 401']);
});

test('backend: cancelling creation can stop only calls owned by this backend', async t => {
  const b = await backend(t);
  assert.equal((await b.post('/retell/v2/stop-call/call_other')).status, 404);
  await b.post();
  assert.equal((await b.post('/retell/v2/stop-call/call_test')).status, 200);
  assert.equal(b.requests[1].url, 'https://api.retellai.com/v2/stop-call/call_test');
  assert.deepEqual(b.released, ['call_test']);
  assert.equal((await b.post('/retell/v2/stop-call/call_test')).status, 404);
});

test('transcript: snapshots, growing utterances, revisions and repeated phrases use IDs, not blind append', () => {
  const lines = [], print = createTranscriptPrinter(line => lines.push(line));
  print([turn('u1', 'user', '요금제'), turn('a1', 'agent', '도와드리겠습니다.')]);
  print([turn('u1', 'user', '요금제'), turn('a1', 'agent', '도와드리겠습니다.')]);
  assert.equal(lines.length, 2);
  print([turn('u1', 'user', '요금제 변경을 원해요.')]);
  assert.equal(lines[2], '[USER] (이어짐 u1) 변경을 원해요.');
  print([turn('u1', 'user', '요금제')]); // stale snapshot
  assert.equal(lines.length, 3);
  print([turn('u1', 'user', '청구 요금 문의입니다.')]);
  assert.match(lines[3], /정정 u1/);
  print([turn('u2', 'user', '청구 요금 문의입니다.')]);
  assert.equal(lines.length, 5); // same text, different actual utterance
  print([turn('tool1', 'tool_call_result', 'not speech'), turn('n1', 'node_transition', 'not speech')]);
  assert.equal(lines.length, 5);
});

test('Monitor: actual SDK uses authenticated v2 socket, merges snapshots and cleans up without stopping call', async t => {
  const original = globalThis.WebSocket;
  const sockets = [], lines = [];
  class FakeSocket {
    constructor(url, protocols) { this.url = url; this.protocols = protocols; this.closed = false; sockets.push(this); }
    sendFrame(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    close() { this.closed = true; }
  }
  globalThis.WebSocket = FakeSocket;
  const registry = createMonitorRegistry({ key, log: line => lines.push(line) });
  t.after(() => { registry.close(); globalThis.WebSocket = original; });
  registry.start('call_one'); registry.start('call_one'); await tick();
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'wss://api.retellai.com/v2/monitor-call/call_one');
  assert.deepEqual(sockets[0].protocols, ['bearer', key]);
  sockets[0].sendFrame({ type: 'transcript_snapshot', transcripts: [turn('a1', 'agent', '안녕하세요.')], pre_session_transcripts: [turn('old', 'user', 'previous call')] });
  sockets[0].sendFrame({ type: 'transcript_updated', transcripts: [turn('u1', 'user', '요금 문의입니다.')] });
  sockets[0].sendFrame({ type: 'transcript_snapshot', transcripts: [turn('a1', 'agent', '안녕하세요.'), turn('u1', 'user', '요금 문의입니다.')] });
  assert.equal(lines.filter(line => line.includes('[AGENT]')).length, 1);
  assert.equal(lines.filter(line => line.includes('[USER]')).length, 1);
  assert.ok(lines.includes('monitor connected: call_one'));
  assert.doesNotMatch(lines.join('\n'), /previous call|unit-test-placeholder/);
  sockets[0].sendFrame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
  assert.equal(registry.size, 0);
  assert.equal(sockets[0].closed, true);
  registry.start('call_two'); await tick();
  assert.equal(sockets.length, 2);
  sockets[1].onclose({ code: 4001, reason: 'private error details' });
  assert.equal(registry.size, 0);
  assert.match(lines.join('\n'), /monitor error: call_two/);
  assert.doesNotMatch(lines.join('\n'), /private error details/);
});

test('Monitor: SDK retries not-yet-live and network interruption; shutdown cancels pending retry', async t => {
  const original = globalThis.WebSocket;
  const sockets = [];
  class FakeSocket { constructor() { sockets.push(this); } close() {} }
  globalThis.WebSocket = FakeSocket;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const registry = createMonitorRegistry({ key, log: () => {} });
  t.after(() => { registry.close(); globalThis.WebSocket = original; t.mock.timers.reset(); });
  registry.start('call_waiting'); await tick();
  sockets[0].onclose({ code: 4004, reason: 'not live' });
  t.mock.timers.tick(2000); await tick();
  assert.equal(sockets.length, 2);
  sockets[1].onclose({ code: 1011, reason: 'temporary' });
  t.mock.timers.tick(4000); await tick();
  assert.equal(sockets.length, 3);
  sockets[2].onclose({ code: 1011, reason: 'temporary' });
  registry.close(); t.mock.timers.tick(60_000); await tick();
  assert.equal(sockets.length, 3);
  assert.equal(registry.size, 0);
});

test('official SDK: cancelled in-flight createWebCall uses v3 create and v2 stop without media connection', async () => {
  const requests = [];
  let resolveCreate;
  const response = new Promise(resolve => { resolveCreate = resolve; });
  const client = new RetellClient({ key: 'placeholder', fetch: async (url, init) => {
    requests.push({ url, init });
    return requests.length === 1 ? response : Response.json({});
  } });
  const session = client.createWebCall({ agent_id: agentId });
  await tick(); await session.end();
  resolveCreate(Response.json({ call_id: 'call_cancelled', access_token: 'temporary' }));
  await tick();
  assert.equal(requests[0].url, 'https://api.retellai.com/v3/create-web-call');
  assert.equal(requests[1].url, 'https://api.retellai.com/v2/stop-call/call_cancelled');
  assert.equal(session.status, 'ended');
});
