import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deploymentConfig } from '../deployment.mjs';
import { createBackend } from '../app.mjs';
import { createLiveCallStore } from '../live-calls.mjs';

const env = { NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://kcm-test.onrender.com',
  KCM_ACCESS_USER: 'kcm', KCM_ACCESS_PASSWORD: 'synthetic-test-password-only', RETELL_API_KEY: 'synthetic-api-key', RETELL_AGENT_ID: 'agent_test' };
const auth = 'Basic ' + Buffer.from(env.KCM_ACCESS_USER + ':' + env.KCM_ACCESS_PASSWORD).toString('base64');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'kcm-render-test-'));
  await mkdir(join(directory, 'assets'));
  const files = { 'index.html': '<html>KCM test build</html>', 'assets/app.js': 'window.KCM_TEST=true;',
    'favicon.svg': '<svg/>', '.env': 'SECRET=synthetic-not-public', 'private.js': 'not a build asset' };
  for (const [name, content] of Object.entries(files)) await writeFile(join(directory, name), content);
  const calls = createLiveCallStore(), upstream = [], logs = [];
  const server = createBackend({ key: env.RETELL_API_KEY, agentId: env.RETELL_AGENT_ID, liveCalls: calls,
    deployment: { ...deploymentConfig(env), staticDir: directory },
    monitors: { start: id => calls.connecting(id), release() {}, close() {} }, log: line => logs.push(line),
    fetchImpl: async (url, init) => { upstream.push({ url, init }); return Response.json({ call_id: 'call_deployed', access_token: 'synthetic-access-token' }); },
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    for (const name of Object.keys(files)) await unlink(join(directory, name));
    await rmdir(join(directory, 'assets')); await rmdir(directory);
  });
  const headers = { Host: 'kcm-test.onrender.com', Origin: env.RENDER_EXTERNAL_URL, Authorization: auth };
  const call = (path, overrides = {}, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers: { ...headers, ...overrides } }, res => {
      let data = ''; res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject); req.end(body);
  });
  return { call, port, headers, calls, upstream, logs };
}

test('deployment: local mode stays local; public mode requires HTTPS, secrets and team access', () => {
  assert.equal(deploymentConfig({}), null);
  assert.equal(deploymentConfig({ NODE_ENV: 'development', ...{ RETELL_API_KEY: 'not-read' } }), null);
  assert.equal(deploymentConfig(env).origin, env.RENDER_EXTERNAL_URL);
  assert.equal(deploymentConfig({ ...env, KCM_PUBLIC_ORIGIN: 'https://team.example.test/' }).origin, 'https://team.example.test');
  for (const patch of [{ RENDER_EXTERNAL_URL: '' }, { RENDER_EXTERNAL_URL: 'http://example.test' },
    { RENDER_EXTERNAL_URL: 'https://user:password@example.test' }, { RENDER_EXTERNAL_URL: 'https://example.test/path' },
    { KCM_ACCESS_USER: '' }, { KCM_ACCESS_PASSWORD: 'short' }, { KCM_ACCESS_PASSWORD: ' '.repeat(20) },
    { RETELL_API_KEY: '' }, { RETELL_AGENT_ID: '' }]) assert.throws(() => deploymentConfig({ ...env, ...patch }));
  assert.throws(() => deploymentConfig({ RENDER: 'true' }));
});

test('deployment: only health is anonymous; UI, configuration, SSE and call creation require credentials', async t => {
  const b = await fixture(t);
  const health = await b.call('/health', { Authorization: '', Host: 'internal-health-check' });
  assert.equal(health.status, 200); assert.deepEqual(JSON.parse(health.body), { ok: true });
  for (const path of ['/', '/retell/config', '/api/live-calls/events', '/assets/app.js']) {
    const response = await b.call(path, { Authorization: '' });
    assert.equal(response.status, 401); assert.match(response.headers['www-authenticate'], /^Basic/);
  }
  assert.equal((await b.call('/', { Authorization: 'Basic ' + Buffer.from('kcm:wrong').toString('base64') })).status, 401);
  assert.equal((await b.call('/retell/v3/create-web-call', { Authorization: '' }, 'POST')).status, 401);
  assert.equal((await b.call('/api/live-calls/call_deployed/audio-signals', { Authorization: '' }, 'POST')).status, 401);
  assert.equal(b.upstream.length, 0); assert.deepEqual(b.calls.snapshot(), []);
});

test('deployment: serves built entry/assets and favicon; never exposes source, dotfiles or traversal', async t => {
  const b = await fixture(t);
  assert.match((await b.call('/')).body, /KCM test build/);
  assert.match((await b.call('/assets/app.js')).headers['content-type'], /javascript/);
  assert.equal((await b.call('/favicon.svg')).status, 200);
  const head = await b.call('/index.html', {}, 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body, '');
  for (const path of ['/.env', '/server/index.mjs', '/src/lib/riskPolicy.js', '/private.js', '/assets/../private.js',
    '/assets/%2e%2e/private.js', '/assets/%2e%2e%5cprivate.js', '/assets/missing.js', '/%zz', '/api/unknown']) {
    const response = await b.call(path); assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.body, /synthetic-not-public|not a build asset/);
  }
});

test('deployment: exact public host/origin checks reject spoofed proxy headers and cross-site requests', async t => {
  const b = await fixture(t);
  for (const headers of [{ Host: 'evil.test' }, { Origin: 'https://evil.test' }, { Origin: 'http://127.0.0.1:5173' },
    { Host: 'evil.test', 'X-Forwarded-Host': 'kcm-test.onrender.com' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await b.call('/retell/config', headers)).status, 403);
  }
  assert.equal((await b.call('/retell/config', { Origin: '' })).status, 200);
  // A team member may open a shared link from another website; authentication still applies.
  const navigation = { Origin: '', 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
  assert.equal((await b.call('/', navigation)).status, 200);
  assert.equal((await b.call('/', { ...navigation, Authorization: '' })).status, 401);
  assert.equal((await b.call('/retell/v3/create-web-call', { Origin: '' }, 'POST')).status, 403);
});

test('deployment: authenticated create uses server API key only and retains audio/SSE flow', async t => {
  const b = await fixture(t);
  const response = await b.call('/retell/v3/create-web-call', { 'Content-Type': 'application/json' }, 'POST', JSON.stringify({ agent_id: env.RETELL_AGENT_ID }));
  assert.equal(response.status, 200); assert.equal(JSON.parse(response.body).call_id, 'call_deployed');
  assert.equal(b.upstream[0].init.headers.Authorization, 'Bearer ' + env.RETELL_API_KEY);
  assert.doesNotMatch(JSON.stringify(b.logs), /synthetic|Basic|Bearer|password/);
  const audio = await b.call('/api/live-calls/call_deployed/audio-signals', { 'Content-Type': 'application/json' }, 'POST',
    JSON.stringify({ sequence: 1, shouting_count: 2, is_shouting: false, available: true, coverage_complete: true, closed: true }));
  assert.equal(audio.status, 200);
  b.calls.ended('call_deployed'); assert.equal(b.calls.snapshot()[0].final_result.risk_score, 5);
  const snapshot = await new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: b.port, path: '/api/live-calls/events', headers: b.headers }, res => {
      assert.equal(res.statusCode, 200); assert.match(res.headers['content-type'], /text\/event-stream/);
      let data = ''; res.setEncoding('utf8'); res.on('data', chunk => {
        data += chunk;
        if (data.includes('"calls"')) { resolve(data); res.destroy(); req.destroy(); }
      });
    }); req.on('error', reject); req.end();
  });
  assert.match(snapshot, /"risk_score":5/);
  assert.doesNotMatch(snapshot, /synthetic|access_token|password/);
});
