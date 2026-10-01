import { createServer } from 'node:http';
import { createLiveCallStore } from './live-calls.mjs';
import { createLiveEvents } from './live-events.mjs';
import { serveBuild } from './deployment.mjs';

const localOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);
const api = 'https://api.retellai.com';
const createPath = '/v3/create-web-call'; // retell-client-js-sdk 3.0.2 ControlApi
const versionHeaders = ['x-retell-client-js-sdk-min-version', 'x-retell-client-js-sdk-recommended-version'];
const validId = /^[A-Za-z0-9_-]{1,128}$/;

/** @param {import('node:http').IncomingMessage} request */
async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 4096) throw new Error('BODY_TOO_LARGE');
  }
  return body ? JSON.parse(body) : {};
}

/**
 * Only the two REST operations used by WebCallSession are allowed.
 * stop-call is needed for SDK cancellation while createWebCall is in flight.
 * @param {{ key: string, agentId: string, monitors: Pick<ReturnType<import('./monitor.mjs').createMonitorRegistry>, 'start' | 'close' | 'release'>,
 * fetchImpl?: typeof fetch, log?: (line: string) => void, liveCalls?: ReturnType<typeof createLiveCallStore>,
 * deployment?: import('./deployment.mjs').Deployment | null }} options
 */
export function createBackend({ key, agentId, monitors, fetchImpl = fetch, log = console.log, liveCalls = createLiveCallStore(), deployment = null }) {
  const allowedOrigins = deployment ? new Set([deployment.origin]) : localOrigins;
  const publicHost = deployment ? new URL(deployment.origin).host : null;
  const liveEvents = createLiveEvents(liveCalls);
  // Ownership permits cancelling only calls created by this local server.
  // Expiring IDs carry no token; Monitor sessions have their own end/error cleanup.
  /** @type {Map<string, number>} */
  const owned = new Map();
  const expiry = setInterval(() => {
    for (const [id, until] of owned) if (until < Date.now()) owned.delete(id);
  }, 60_000);
  expiry.unref();

  const upstream = (/** @type {string} */ path, /** @type {unknown} */ body) => fetchImpl(api + path, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Retell-Client-JS-SDK-Version': '3.0.2' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (/** @type {number} */ status, /** @type {unknown} */ body) => {
      if (response.destroyed) return;
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    const error = (/** @type {number} */ status, /** @type {string} */ code) => send(status, { error_message: code });
    const path = (request.url ?? '').split('?')[0];
    // Render health checks are public and reveal no environment/configuration details.
    if (deployment && request.method === 'GET' && path === '/health') return send(200, { ok: true });
    // Origin checks also apply to simple requests, not just CORS preflight.
    const origin = request.headers.origin;
    const host = request.headers.host ?? '';
    if (publicHost ? host !== publicHost : !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return error(403, deployment ? 'HOST_NOT_ALLOWED' : 'LOCALHOST_ONLY');
    if (origin && !allowedOrigins.has(origin)) return error(403, 'ORIGIN_NOT_ALLOWED');
    const pageNavigation = request.method === 'GET' && request.headers['sec-fetch-mode'] === 'navigate' && request.headers['sec-fetch-dest'] === 'document';
    if (deployment && request.headers['sec-fetch-site'] === 'cross-site' && !pageNavigation) return error(403, 'CROSS_SITE_NOT_ALLOWED');
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Retell-Client-JS-SDK-Version');
      response.setHeader('Access-Control-Expose-Headers', versionHeaders.join(', '));
    }
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    if (deployment) {
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('X-Frame-Options', 'DENY');
      if (await serveBuild(request, response, deployment.staticDir)) return;
    }
    if (request.method === 'GET' && path === '/api/live-calls/events') {
      liveEvents.connect(response);
      return;
    }
    if (request.method === 'GET' && path === '/retell/config') {
      return send(200, { agent_id: agentId, configured: Boolean(key && agentId) });
    }
    if (request.method === 'GET' && path === '/health') return send(200, { ok: true, configured: Boolean(key && agentId) });
    if (request.method !== 'POST') return error(404, 'NOT_FOUND');
    if (!origin) return error(403, 'ORIGIN_REQUIRED');
    const audioMatch = /^\/api\/live-calls\/([A-Za-z0-9_-]{1,128})\/audio-signals$/.exec(path);
    if (audioMatch) {
      if (!request.headers['content-type']?.startsWith('application/json')) return error(415, 'JSON_REQUIRED');
      let value;
      try { value = await readBody(request); } catch { return error(400, 'INVALID_REQUEST_BODY'); }
      const outcome = liveCalls.audio(audioMatch[1], value);
      if (outcome === 'not_found') return error(404, 'CALL_NOT_FOUND');
      if (outcome === 'invalid') return error(400, 'INVALID_AUDIO_SIGNALS');
      if (outcome === 'closed') return error(409, 'CALL_SIGNALS_CLOSED');
      return send(200, { accepted: true });
    }
    const stopMatch = /^\/retell\/v2\/stop-call\/([A-Za-z0-9_-]{1,128})$/.exec(path);
    const isCreate = path === `/retell${createPath}`;
    if (!isCreate && !stopMatch) return error(404, 'NOT_FOUND');
    if (!key) return error(503, 'RETELL_API_KEY_MISSING');
    if (!agentId) return error(503, 'RETELL_AGENT_ID_MISSING');
    const stopId = stopMatch?.[1];
    if (stopId && (owned.get(stopId) ?? 0) < Date.now()) return error(404, 'CALL_NOT_OWNED');
    if (isCreate && !request.headers['content-type']?.startsWith('application/json')) return error(415, 'JSON_REQUIRED');
    let body;
    try { body = await readBody(request); } catch { return error(400, 'INVALID_REQUEST_BODY'); }
    if (isCreate && (typeof body !== 'object' || body === null || Array.isArray(body) || body.agent_id !== agentId || Object.keys(body).some(key => key !== 'agent_id'))) {
      return error(400, 'CONFIGURED_AGENT_ONLY');
    }
    try {
      const result = await upstream(isCreate ? createPath : `/v2/stop-call/${stopId}`, isCreate ? { agent_id: agentId } : undefined);
      // Never forward upstream error bodies, headers or error objects containing secrets.
      if (!result.ok) {
        log(`retell request failed: HTTP ${result.status}`);
        await result.body?.cancel();
        return error(result.status === 429 ? 429 : 502, result.status === 401 || result.status === 403 ? 'RETELL_AUTH_FAILED' : 'RETELL_REQUEST_FAILED');
      }
      if (stopId) {
        await result.body?.cancel();
        owned.delete(stopId);
        monitors.release(stopId);
        return send(200, {});
      }
      const data = await result.json();
      if (!data || typeof data.call_id !== 'string' || !validId.test(data.call_id) || typeof data.access_token !== 'string' || !data.access_token) {
        return error(502, 'INVALID_RETELL_RESPONSE');
      }
      owned.set(data.call_id, Date.now() + 10 * 60_000);
      log(`call created: ${data.call_id}`);
      if (response.destroyed) {
        // The browser went away before receiving its token; don't leave a registered call.
        const stopped = await upstream(`/v2/stop-call/${data.call_id}`, undefined);
        await stopped.body?.cancel();
        owned.delete(data.call_id);
        return;
      }
      monitors.start(data.call_id);
      for (const header of versionHeaders) {
        const value = result.headers.get(header);
        if (value && /^[\d.]+$/.test(value)) response.setHeader(header, value);
      }
      // Only fields required by the official SDK cross back to the browser.
      send(200, { call_id: data.call_id, access_token: data.access_token, transport: data.transport,
        url: data.url, ice_servers: data.ice_servers, expires_at: data.expires_at });
    } catch {
      log('retell request failed: 연결 또는 응답 처리 오류');
      error(502, 'RETELL_CONNECTION_FAILED');
    }
  });
  server.on('close', () => { liveEvents.close(); clearInterval(expiry); owned.clear(); monitors.close(); });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  return server;
}
