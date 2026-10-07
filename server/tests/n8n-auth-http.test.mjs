import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createBackend } from '../app.mjs';
import { createLiveCallStore } from '../live-calls.mjs';
import { n8nConfig, callResultPayload } from '../n8n-delivery.mjs';
import { INVENTORY_DB_PATH } from '../inventory.mjs';

// Synthetic settings only; no local secrets, Retell call or Production POST.
const header = 'Authorization';
const value = 'SYNTHETIC_WEBHOOK_AUTH_CANARY_123456';
const webhook = 'https://call-result.example.test/webhook/fixture';
const inventory = 'https://inventory.example.test/webhook';
const tick = () => new Promise(resolve => setImmediate(resolve));

function read(base, path) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, base), { headers: { Origin: 'http://127.0.0.1:5173' } }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
      res.on('error', reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error('Local fixture timed out')));
    req.on('error', reject);
    req.end();
  });
}

function snapshot(base) {
  return new Promise((resolve, reject) => {
    const req = request(new URL('/api/live-calls/events', base), { headers: { Origin: 'http://127.0.0.1:5173' } }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        text += chunk;
        if (!text.includes('event: snapshot\n') || !text.includes('\n\n')) return;
        resolve(text);
        res.destroy();
        req.destroy();
      });
      res.on('error', reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error('Local SSE fixture timed out')));
    req.on('error', reject);
    req.end();
  });
}

async function setup(t, { authToken = value, status = 200 } = {}) {
  const liveCalls = createLiveCallStore(), posts = [], inventoryPosts = [], logs = [];
  const server = createBackend({ key: '', agentId: '', liveCalls,
    monitors: { start() { throw new Error('No actual calls allowed'); }, release() {}, close() {} },
    ...n8nConfig({ N8N_WEBHOOK_URL: webhook, N8N_WEBHOOK_AUTH_TOKEN: authToken }),
    demoStoreId: 'store_005', inventoryBaseUrl: inventory, log: line => logs.push(line),
    fetchImpl: async () => { throw new Error('No external Retell requests allowed'); },
    webhookFetchImpl: async (url, init) => {
      if (url === webhook) { posts.push(init); return new Response(value, { status }); }
      assert.equal(url, inventory + INVENTORY_DB_PATH);
      inventoryPosts.push(init);
      return Response.json({ ok: true, data: [{ storeId: 'store_005', storeName: '합성 매장' }] });
    },
  });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const finish = () => {
    liveCalls.connecting('call_auth_fixture', 'customer_auth_fixture', 'consultation_1760000000000', 'store_005');
    liveCalls.live('call_auth_fixture');
    liveCalls.transcript('call_auth_fixture', [{ id: 'u1', role: 'user', content: '재고 문의입니다.', time_sec: 1 }]);
    liveCalls.audio('call_auth_fixture', { sequence: 1, shouting_count: 0, is_shouting: false,
      available: true, coverage_complete: true, closed: true });
    liveCalls.ended('call_auth_fixture');
  };
  return { liveCalls, posts, inventoryPosts, logs, base, finish };
}

test('server env -> backend -> final result uses Header Auth once without leaking it to APIs, SSE, JSON or inventory', async t => {
  const f = await setup(t);
  for (const path of ['/health', '/retell/config', '/api/inventory/stores']) {
    const response = await read(f.base, path);
    assert.equal(response.status, 200);
    assert.ok(!response.text.includes(value));
    assert.ok(!response.text.includes('Bearer ' + value));
  }
  assert.equal(f.inventoryPosts.length, 1);
  assert.deepEqual(f.inventoryPosts[0].headers, { 'Content-Type': 'application/json' });
  assert.equal(f.posts.length, 0);
  f.finish();
  await tick();
  const call = f.liveCalls.snapshot()[0];
  assert.equal(call.webhook_delivery.status, 'sent');
  assert.equal(f.posts.length, 1);
  assert.deepEqual(f.posts[0].headers, { 'Content-Type': 'application/json', [header]: 'Bearer ' + value });
  assert.deepEqual(JSON.parse(f.posts[0].body), callResultPayload(call));
  assert.ok(!f.posts[0].body.includes(value));
  assert.ok(!JSON.stringify(f.logs).includes(value));
  const frame = await snapshot(f.base);
  assert.ok(frame.includes('call_auth_fixture'));
  assert.ok(!frame.includes(value) && !frame.includes(header));
  f.liveCalls.ended(call.call_id);
  f.liveCalls.audio(call.call_id, { sequence: 2, shouting_count: 0, is_shouting: false,
    available: true, coverage_complete: true, closed: true });
  await tick();
  assert.equal(f.posts.length, 1);
});

test('backend Header Auth 401 preserves the finalized call and exposes only a fixed failure code', async t => {
  const f = await setup(t, { status: 401 });
  f.finish();
  await tick();
  const call = f.liveCalls.snapshot()[0];
  assert.equal(call.webhook_delivery.status, 'failed');
  assert.equal(call.webhook_delivery.error, 'HTTP_401');
  assert.ok(call.final_result && call.ended_at);
  assert.ok(!JSON.stringify([call, f.logs]).includes(value));
  const frame = await snapshot(f.base);
  assert.ok(frame.includes('HTTP_401'));
  assert.ok(!frame.includes(value));
  f.liveCalls.ended(call.call_id);
  await tick();
  assert.equal(f.posts.length, 1);
});

test('backend missing Header Auth token never sends an unauthenticated request', async t => {
  const f = await setup(t, { authToken: '' });
  f.finish();
  await tick();
  const call = f.liveCalls.snapshot()[0];
  assert.equal(f.posts.length, 0);
  assert.equal(call.webhook_delivery.status, 'failed');
  assert.equal(call.webhook_delivery.error, 'N8N_WEBHOOK_AUTH_MISSING');
  assert.ok(call.final_result);
  assert.equal((await read(f.base, '/health')).status, 200);
});
