import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once, EventEmitter } from 'node:events';
import { createBackend } from '../app.mjs';
import { createSupabaseReadProvider } from '../real-data.mjs';
import { createMonitorRegistry } from '../monitor.mjs';
import { createLiveCallStore } from '../live-calls.mjs';
import { INVENTORY_DB_PATH } from '../inventory.mjs';

// All identities, data, URLs and keys below are synthetic. No environment values are read.
const dbOrigin = 'https://release-db.example.test';
const dbKey = 'sb_publishable_release_fixture';
const inventoryOrigin = 'https://release-inventory.example.test/webhook';
const home = 'store_005';
const allowedOrigin = 'http://127.0.0.1:5173';
const tick = () => new Promise(resolve => setImmediate(resolve));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const turn = (id, content, role = 'user', time_sec = 1) => ({ id, content, role, time_sec });
const silentFinal = { sequence: 1, shouting_count: 0, is_shouting: false, available: true, coverage_complete: true, closed: true };

function rowsFixture() {
  const basePlan = { name: '통합 요금제', group_name: '통합 그룹', type: '5G', data_unlimited: true, data_gb: null,
    after_speed_kbps: null, voice_unlimited: true, voice_minutes: null, text_unlimited: true, text_count: null };
  const consultation = { id: 'consultation_001', customer_id: 'customer_001', store_id: home,
    purpose: '통합검증고객 요금 상담', status: '완료', call_id: 'stored_call_fixture', used_ai: true, used_phone: false, used_visit: false,
    started_at: '2026-10-05T01:00:00.000Z', ended_at: '2026-10-05T01:30:00.000Z',
    ai_summary: '통합검증고객 요청 확인. 010-0000-9001로 확인.', ai_transcription: 'RAW_TRANSCRIPT_CANARY' };
  const reservation = { id: 'reservation_001', consultation_id: consultation.id, store_id: home, employee_id: 'employee_001',
    source: 'AI', reserved_at: '2026-10-05T01:35:00Z', visit_at: '2026-10-08T14:00:00+09:00',
    purpose: '통합검증고객 요금 상담', note: '통합검증고객에게 010-0000-9001로 방문 안내', status: '예약 확정' };
  return {
    customers: [
      { id: 'customer_001', name: '통합검증고객', phone: '010-0000-9001', privacy_consent: true,
        product_id: 'product_001', plan_id: 'own_plan_002', birth_date: 'BIRTH_DATE_CANARY' },
      { id: 'customer_002', name: 'PRIVATE_NAME_CANARY', phone: '010-0000-9002', privacy_consent: false,
        product_id: 'product_001', plan_id: 'own_plan_002' },
      { id: 'customer_003', name: 'OTHER_STORE_NAME_CANARY', phone: '010-0000-9003', privacy_consent: true,
        product_id: 'product_001', plan_id: 'own_plan_002' },
    ],
    consultations: [consultation,
      { ...consultation, id: 'consultation_002', customer_id: 'customer_002', purpose: 'PRIVATE_PURPOSE_CANARY', ai_summary: 'PRIVATE_SUMMARY_CANARY' },
      { ...consultation, id: 'consultation_003', customer_id: 'customer_003', store_id: 'store_001' }],
    reservations: [reservation,
      { ...reservation, id: 'reservation_002', consultation_id: 'consultation_002', source: 'PHONE',
        purpose: 'PRIVATE_PURPOSE_CANARY', note: 'PRIVATE_NOTE_CANARY', status: '노쇼' },
      { ...reservation, id: 'reservation_003', consultation_id: 'consultation_003', store_id: 'store_001' }],
    employees: [{ id: 'employee_001', store_id: home, name: '통합직원', phone: 'EMPLOYEE_PHONE_CANARY' }],
    risks: [{ id: 'risk_001', consultation_id: 'consultation_001', customer_id: 'customer_001', stage: 'AI',
      risk_score: 40, risk_level: '경계', created_at: consultation.ended_at }],
    products: [{ id: 'product_001', name: '통합 단말', maker: 'Samsung', storage_gb: 256, color: '블랙', price: 900000 }],
    own_plans: [{ ...basePlan, id: 'own_plan_001', monthly_fee: 61000 }, { ...basePlan, id: 'own_plan_002', name: '현재 요금제', monthly_fee: 55000 }],
    competitor_plans: [{ ...basePlan, id: 'competitor_plan_001', company: '합성 통신사', monthly_fee: 65000 }],
    bundles: [{ id: 'bundle_001', name: '통합 결합', type: 'FIXED', description: '검증용 고정 할인', family_required: true,
      internet_required: true, min_mobile_lines: 1, max_mobile_lines: 10, discount_method: 'PER_LINE_FEE_TIER' }],
    bundle_rules: [{ id: 'bundle_rule_001', bundle_id: 'bundle_001', order_no: 1, type: 'PER_LINE_FEE', service: 'MOBILE', scope: 'PER_LINE',
      fee_basis: 'PER_LINE', min_fee: 0, max_fee: 100000, min_line: 1, max_line: 10, min_speed: null, max_speed: null,
      customer_condition: null, mobile_discount: 5000, mobile_rate: null, extra_discount: null, description: '합성 할인 구간' }],
    benefits: [{ id: 'benefit_001', type: 'MEMBERSHIP', grade: 'VIP', name: '통합 혜택', description: '가격으로 환산하지 않는 합성 혜택' }],
  };
}

function noSensitive(body) {
  assert.doesNotMatch(JSON.stringify(body), /sb_publishable_release_fixture|release-db\.example|RAW_TRANSCRIPT_CANARY|BIRTH_DATE_CANARY|EMPLOYEE_PHONE_CANARY|PRIVATE_[A-Z_]+_CANARY|OTHER_STORE_NAME_CANARY|통합검증고객|010-0000-900[123]/u);
}

/** HTTP is permitted only to this fixture's loopback server, never to a business service. */
function localJson(base, path, { method = 'GET', body, headers = {} } = {}) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  return new Promise((resolve, reject) => {
    const call = request(new URL(path, base), { method, headers: { Origin: allowedOrigin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers } }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => text += chunk);
      response.on('end', () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    call.setTimeout(5000, () => call.destroy(new Error('Local fixture response timed out')));
    call.on('error', reject);
    call.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

function openSse(base) {
  const events = [], changed = new EventEmitter();
  return new Promise((resolve, reject) => {
    const call = request(base + '/api/live-calls/events', { headers: { Origin: allowedOrigin } }, response => {
      assert.equal(response.statusCode, 200);
      assert.match(response.headers['content-type'], /text\/event-stream/);
      let buffer = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        buffer += chunk;
        for (;;) {
          const boundary = buffer.indexOf('\n\n');
          if (boundary < 0) break;
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const match = /^event: ([^\n]+)\ndata: ([^\n]+)$/u.exec(frame);
          if (!match) continue; // retry and heartbeat frames are not call events
          const value = JSON.parse(match[2]);
          assert.equal(value.type, match[1]);
          events.push(value);
          changed.emit('event');
        }
      });
      response.on('error', () => {}); // local cleanup deliberately destroys the reader
      resolve({ events,
        waitFor(predicate, after = 0) {
          const found = () => events.slice(after).find(predicate);
          if (found()) return Promise.resolve(found());
          return new Promise((done, fail) => {
            const timeout = setTimeout(() => { changed.off('event', listener); fail(new Error('Expected local SSE event was not received')); }, 5000);
            const listener = () => {
              const value = found();
              if (value) { clearTimeout(timeout); changed.off('event', listener); done(value); }
            };
            changed.on('event', listener);
          });
        },
        close() { response.destroy(); call.destroy(); },
      });
    });
    call.on('error', reject);
    call.end();
  });
}

async function setup(t, { configured = true } = {}) {
  const originalSocket = globalThis.WebSocket, sockets = [], streams = [], logs = [];
  const data = rowsFixture(), reads = [], inventoryReads = [];
  const failedTables = new Set();
  let failInventory = false, externalRequests = 0, clock = 0;
  t.mock.method(globalThis, 'fetch', () => { externalRequests++; throw new Error('Unexpected external request'); });
  class FakeWS {
    closed = false;
    constructor(url) { this.url = url; sockets.push(this); }
    frame(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    close() { this.closed = true; }
  }
  globalThis.WebSocket = FakeWS;
  const provider = createSupabaseReadProvider({ supabaseUrl: configured ? dbOrigin : '', supabaseKey: configured ? dbKey : '',
    fetchImpl: async (url, init) => {
      const parsed = new URL(url), table = parsed.pathname.split('/').at(-1);
      assert.equal(parsed.origin, dbOrigin);
      assert.equal(init.method, 'GET');
      assert.equal(init.body, undefined);
      assert.equal(init.redirect, 'manual');
      assert.equal(init.headers.apikey, dbKey);
      assert.equal(init.headers.Authorization, undefined);
      const selected = parsed.searchParams.get('select').split(',');
      assert.ok(!selected.includes('*') && !selected.includes('ai_transcription') && !selected.includes('birth_date'));
      if (table === 'employees') assert.ok(!selected.includes('phone'));
      reads.push({ table, selected, query: new URLSearchParams(parsed.search) });
      if (failedTables.has(table)) return new Response('PRIVATE_UPSTREAM_BODY_CANARY', { status: 503 });
      let rows = structuredClone(data[table] ?? []);
      for (const [column, filter] of parsed.searchParams) {
        if (['select', 'order', 'limit'].includes(column)) continue;
        if (filter.startsWith('eq.')) rows = rows.filter(row => String(row[column]) === filter.slice(3));
        else if (filter.startsWith('in.(')) rows = rows.filter(row => filter.slice(4, -1).split(',').includes(row[column]));
        else assert.fail('Unexpected synthetic query filter');
      }
      for (const part of (parsed.searchParams.get('order') ?? '').split(',').reverse()) {
        if (!part) continue;
        const [field, direction] = part.split('.');
        rows.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1));
      }
      rows = rows.slice(0, Number(parsed.searchParams.get('limit')));
      // Keep the REST select contract, and add a canary to check provider projection.
      return json(rows.map(row => ({ ...Object.fromEntries(selected.map(field => [field, row[field] ?? null])),
        unexpected_private_field: 'RAW_TRANSCRIPT_CANARY' })));
    } });
  const store = createLiveCallStore(() => new Date(1_760_000_000_000 + (++clock) * 1000).toISOString());
  const monitors = createMonitorRegistry({ key: 'synthetic_release_monitor', liveCalls: store, log: line => logs.push(line) });
  const server = createBackend({ key: '', agentId: '', liveCalls: store, monitors, realDataProvider: provider, demoStoreId: home,
    webhookUrl: '', inventoryBaseUrl: inventoryOrigin, log: line => logs.push(line),
    fetchImpl: async () => { externalRequests++; throw new Error('Retell REST must not be called'); },
    webhookFetchImpl: async (url, init) => {
      assert.equal(url, inventoryOrigin + INVENTORY_DB_PATH, 'No notifications or live-result webhook is invoked');
      assert.equal(init.method, 'POST');
      const input = JSON.parse(init.body);
      assert.ok(['GET_STORES', 'GET_INVENTORY', 'GET_RENTALS'].includes(input.action), 'Inventory actions are read-only');
      inventoryReads.push(input);
      if (failInventory) return json({ ok: false, code: 'DB_UNAVAILABLE' });
      if (input.action === 'GET_STORES') return json({ ok: true, data: [{ storeId: home, storeName: '통합 합성 매장' }] });
      if (input.action === 'GET_INVENTORY') return json({ ok: true, data: [{ storeId: home, storeName: '통합 합성 매장', productId: 'product_001',
        productName: '통합 단말', storageGb: 256, color: '블랙', stockQty: 5, reservedQty: 1, transferQty: 1, available: 3 }] });
      return json({ ok: true, data: [{ rentalId: 'stock_001', productId: 'product_001', productName: '통합 단말', quantity: 1,
        requestStoreId: home, provideStoreId: null, deliveryStatus: '요청 중', returnStatus: null, role: 'SENT',
        requester: { name: '합성 요청자', phone: 'EMPLOYEE_PHONE_CANARY' } }] });
    } });
  t.after(async () => {
    for (const stream of streams) stream.close();
    try { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
    finally { globalThis.WebSocket = originalSocket; }
    assert.equal(externalRequests, 0);
    assert.doesNotMatch(logs.join('\n'), /sb_publishable_release_fixture|PRIVATE_UPSTREAM_BODY_CANARY|RAW_TRANSCRIPT_CANARY/);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  return { store, monitors, reads, inventoryReads, data, failedTables,
    set failInventory(value) { failInventory = value; },
    get(path, options) { return localJson(base, path, options); },
    post(path, body) { return localJson(base, path, { method: 'POST', body }); },
    async stream() { const stream = await openSse(base); streams.push(stream); return stream; },
    async start(id) {
      store.connecting(id, 'customer_001', 'consultation_' + (900 + sockets.length), home);
      monitors.start(id);
      await tick();
      const socket = sockets.at(-1);
      assert.equal(socket.url, 'wss://api.retellai.com/v2/monitor-call/' + id);
      return socket;
    },
  };
}

async function finalThroughHttp(f, stream, socket, id, after = 0) {
  socket.frame({ type: 'call_ended', disconnection_reason: 'user_hangup' });
  const ended = await stream.waitFor(event => event.type === 'call_ended' && event.call_id === id, after);
  assert.equal(ended.final_result, null, 'No final risk before the final microphone snapshot');
  const accepted = await f.post('/api/live-calls/' + id + '/audio-signals', silentFinal);
  assert.deepEqual(accepted, { status: 200, body: { accepted: true } });
  const final = await stream.waitFor(event => event.type === 'risk_finalized' && event.call_id === id, after);
  assert.equal(final.final_result.rule_version, 'call-risk-v4');
  assert.equal(final.final_result.signals.shouting_count, 0);
  assert.equal(final.risk_analysis.ruleVersion, 'local-text-rules-v4');
  return final;
}

test('final release: stored appointments/customers/history/briefing, catalog/price and inventory reads coexist on one Backend', async t => {
  const f = await setup(t);
  const status = await f.get('/api/data/status');
  assert.deepEqual(status, { status: 200, body: { source: 'supabase', readOnly: true, configured: true, scopeConfigured: true, errorCode: null } });
  for (const path of ['/api/data/appointments', '/api/data/customers', '/api/data/customers/customer_001/consultations']) {
    const result = await f.get(path);
    assert.equal(result.status, 200, path);
    assert.equal(result.body.source, 'supabase');
    assert.equal(result.body.readOnly, true);
    assert.ok(result.body.items.length > 0);
    noSensitive(result.body);
    assert.ok(result.body.items.every(row => row.storeId === undefined || row.storeId === home));
  }
  const briefing = await f.get('/api/briefings/reservation_001');
  assert.equal(briefing.status, 200);
  assert.equal(briefing.body.reservation.id, 'reservation_001');
  assert.equal(briefing.body.currentProduct.id, 'product_001');
  assert.equal(briefing.body.currentPlan.monthlyFee, 55000);
  assert.equal(briefing.body.desiredProductStatus, 'not_recorded');
  assert.equal(briefing.body.history[0].risks[0].score, 40);
  noSensitive(briefing.body);
  const catalog = await f.get('/api/products/catalog');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.source, 'supabase');
  assert.deepEqual(['products', 'ownPlans', 'competitorPlans', 'bundles', 'benefits'].map(key => catalog.body[key].length), [1, 2, 1, 1, 1]);
  const price = await f.post('/api/effective-price', { plan_id: 'own_plan_001', product_id: 'product_001', bundle_id: 'bundle_001',
    customer_id: 'customer_001', family: true, internet: true, mobile_lines: 1 });
  assert.equal(price.status, 200);
  assert.equal(price.body.monthlySubtotal, 56000);
  assert.equal(price.body.currentPlan.monthlyFee, 55000);
  assert.equal(price.body.productCashPrice, 900000);
  assert.equal(price.body.finalMonthlyTotal, null);
  noSensitive(price.body);
  const stores = await f.get('/api/inventory/stores');
  const stock = await f.get('/api/inventory/stock?store_id=' + home);
  const rentals = await f.get('/api/inventory/rentals');
  assert.equal(stores.status, 200); assert.equal(stores.body[0].is_home, true);
  assert.equal(stock.status, 200); assert.equal(stock.body[0].quantity, 3);
  assert.equal(rentals.status, 200); assert.equal(rentals.body[0].status, 'requested');
  noSensitive(rentals.body);
  assert.deepEqual(f.inventoryReads.map(row => row.action), ['GET_STORES', 'GET_INVENTORY', 'GET_RENTALS']);
  assert.deepEqual((await f.get('/retell/config')).body, { agent_id: '', configured: false });
  assert.equal((await f.get('/health')).status, 200);
  assert.deepEqual(f.store.snapshot(), [], 'Business reads do not manufacture live calls');
});

test('final release: concurrent stored-data/inventory reads leave Monitor-to-SSE context and reconnect snapshot intact', async t => {
  const f = await setup(t), stream = await f.stream();
  assert.deepEqual(await stream.waitFor(event => event.type === 'snapshot'), { type: 'snapshot', calls: [] });
  const socket = await f.start('coexist_context');
  socket.frame({ type: 'transcript_snapshot', transcripts: [turn('u1', '그날도 없으면 매장'), turn('a1', '위협적인 발언은 삼가 주세요.', 'agent', 2)] });
  socket.frame({ type: 'transcript_updated', transcripts: [turn('u2', '뒤집어 놓을 거니까 알아서 하세요.', 'user', 3)] });
  const first = await stream.waitFor(event => event.type === 'transcript' && event.risk_analysis?.threatCount === 1);
  const [appointments, catalog, stock] = await Promise.all([f.get('/api/data/appointments'), f.get('/api/products/catalog'), f.get('/api/inventory/stock')]);
  assert.deepEqual([appointments.status, catalog.status, stock.status], [200, 200, 200]);
  assert.deepEqual(f.store.snapshot()[0].risk_analysis, first.risk_analysis);
  assert.equal(first.risk_analysis.analysisByTurn.u2.threatCount, 1);
  assert.equal(Object.hasOwn(first.risk_analysis.analysisByTurn, 'a1'), false);
  const reconnected = await f.stream();
  const restored = await reconnected.waitFor(event => event.type === 'snapshot');
  assert.deepEqual(restored.calls, f.store.snapshot());
  const after = stream.events.length;
  socket.frame({ type: 'transcript_updated', transcripts: [turn('u1', '다시 문의하겠습니다.')] });
  const corrected = await stream.waitFor(event => event.type === 'transcript' && event.risk_analysis?.threatCount === 0, after);
  assert.equal(corrected.messages.length, 3);
  assert.equal(corrected.risk_analysis.analysisByTurn.u2.threatCount, 0);
});

for (const [id, text, profanity, threat, score, level] of [
  ['release_basic', '아 씨발, 장난해요?\n폰도 없이 장사를 해요?\n일 처리 진짜 개판이네.\n토요일 2시요.\n그날도 없으면 매장 뒤집어 놓을 거니까 알아서 하세요.', 2, 1, 40, '경계'],
  ['release_strong', '아 씨발, 장난해요?\n폰도 없이 장사를 해요?\n일 처리 진짜 개판이네.\n토요일 2시요.\n그날도 없으면 매장 뒤집어 놓을 거예요.\n가서 다 부숴버릴 거니까 알아서 하세요.', 2, 2, 60, '위험'],
  ['release_person', '아니 찾아와서 팬다?\n그래 그때까지 없으면 너 찾아가서 팬다?', 0, 1, 40, '경계'],
  ['release_visit', '매장에 방문하겠습니다.', 0, 0, 0, '정상'],
]) {
  test(`final release scenario ${id}: merged business APIs coexist with actual SDK/Monitor/SSE and final risk ${score}/${level}`, async t => {
    const f = await setup(t), stream = await f.stream(), socket = await f.start(id);
    socket.frame({ type: 'transcript_snapshot', transcripts: [turn('u1', text)] });
    const transcript = await stream.waitFor(event => event.type === 'transcript' && event.call_id === id);
    assert.equal(transcript.risk_analysis.profanityCount, profanity);
    assert.equal(transcript.risk_analysis.threatCount, threat);
    const after = stream.events.length;
    socket.frame({ type: 'transcript_updated', transcripts: [turn('a1', '씨발. 너 찾아가서 팬다. 욕설과 위협은 삼가 주세요. 소리를 낮춰 주세요.', 'agent', 2)] });
    const updated = await stream.waitFor(event => event.type === 'transcript' && event.messages.length === 2, after);
    assert.equal(updated.risk_analysis.profanityCount, profanity);
    assert.equal(updated.risk_analysis.threatCount, threat);
    assert.equal(updated.risk_analysis.analyzedUserTurns, 1);
    assert.equal(updated.audio_signal, null);
    assert.deepEqual((await f.get('/api/data/customers/customer_001/consultations')).body.items.map(row => row.id), ['consultation_001']);
    assert.equal((await f.get('/api/inventory/stock')).body[0].quantity, 3);
    const final = await finalThroughHttp(f, stream, socket, id);
    assert.equal(final.final_result.signals.profanity_count, profanity);
    assert.equal(final.final_result.signals.threat_count, threat);
    assert.equal(final.final_result.risk_score, score);
    assert.equal(final.final_result.risk_level, level);
    assert.equal(final.messages[0].content, text);
    assert.equal(final.final_result.customer_id, 'customer_001');
    assert.equal(f.monitors.has(id), false);
    assert.equal(socket.closed, true);
    assert.equal((await f.get('/api/briefings/reservation_001')).status, 200);
    assert.equal((await f.post('/api/live-calls/' + id + '/audio-signals', { ...silentFinal, sequence: 2 })).status, 409);
  });
}

test('final release: failed stored-data reads stay explicit and cannot break pricing, inventory or an active Monitor/SSE call', async t => {
  const f = await setup(t), stream = await f.stream(), socket = await f.start('data_failure');
  socket.frame({ type: 'transcript_snapshot', transcripts: [turn('u1', '너 찾아가서 팬다.')] });
  const live = await stream.waitFor(event => event.type === 'transcript' && event.call_id === 'data_failure');
  f.failedTables.add('reservations');
  for (const path of ['/api/data/appointments', '/api/briefings/reservation_001']) {
    const failed = await f.get(path);
    assert.deepEqual(failed, { status: 502, body: { errorCode: 'REAL_DATA_UNAVAILABLE' } });
    noSensitive(failed.body);
    assert.equal(Object.hasOwn(failed.body, 'items'), false, 'No silent mock/empty success fallback');
  }
  assert.equal((await f.get('/api/products/catalog')).status, 200);
  assert.equal((await f.post('/api/effective-price', { plan_id: 'own_plan_001' })).status, 200);
  assert.equal((await f.get('/api/inventory/stock')).status, 200);
  assert.deepEqual(f.store.snapshot()[0].risk_analysis, live.risk_analysis);
  assert.equal((await finalThroughHttp(f, stream, socket, 'data_failure')).final_result.risk_score, 40);
  f.failedTables.clear();
  assert.equal((await f.get('/api/data/appointments')).status, 200, 'A later explicit retry uses the recovered provider');
});

test('final release: failed inventory reads do not corrupt stored business data or independent live final risk', async t => {
  const f = await setup(t), stream = await f.stream(), socket = await f.start('inventory_failure');
  socket.frame({ type: 'transcript_snapshot', transcripts: [turn('u1', '매장에 방문하겠습니다.')] });
  await stream.waitFor(event => event.type === 'transcript' && event.call_id === 'inventory_failure');
  f.failInventory = true;
  for (const path of ['/api/inventory/stores', '/api/inventory/stock', '/api/inventory/rentals']) {
    assert.deepEqual(await f.get(path), { status: 502, body: { error_message: 'DB_UNAVAILABLE' } });
  }
  assert.equal((await f.get('/api/data/appointments')).status, 200);
  assert.equal((await f.get('/api/briefings/reservation_001')).status, 200);
  assert.equal((await f.get('/api/products/catalog')).status, 200);
  assert.equal((await finalThroughHttp(f, stream, socket, 'inventory_failure')).final_result.risk_score, 0);
  f.failInventory = false;
  assert.equal((await f.get('/api/inventory/stock')).body[0].quantity, 3);
});

test('final release: consent and home-store restrictions survive integration without denying nonpersonal catalog/inventory/live paths', async t => {
  const f = await setup(t);
  const customers = await f.get('/api/data/customers?store_id=store_001');
  assert.deepEqual(new Set(customers.body.items.map(row => row.id)), new Set(['customer_001', 'customer_002']));
  const restricted = customers.body.items.find(row => row.id === 'customer_002');
  assert.equal(restricted.nameMasked, '비공개 고객');
  assert.equal(restricted.currentPlan, null);
  assert.equal(restricted.currentProduct, null);
  noSensitive(customers.body);
  assert.deepEqual(await f.get('/api/data/customers/customer_002/consultations'), { status: 403, body: { errorCode: 'CUSTOMER_PRIVACY_RESTRICTED' } });
  assert.deepEqual(await f.get('/api/data/customers/customer_003/consultations'), { status: 404, body: { errorCode: 'CUSTOMER_NOT_FOUND' } });
  const before = f.reads.length, briefing = await f.get('/api/briefings/reservation_002');
  assert.equal(briefing.status, 200);
  assert.equal(briefing.body.summaryStatus, 'restricted');
  assert.equal(briefing.body.summary, null); assert.equal(briefing.body.requestNote, null);
  assert.deepEqual(briefing.body.history, []);
  assert.ok(f.reads.slice(before).every(row => !row.selected.includes('note') && !row.selected.includes('ai_summary')));
  noSensitive(briefing.body);
  assert.deepEqual(await f.post('/api/effective-price', { plan_id: 'own_plan_001', customer_id: 'customer_002' }),
    { status: 403, body: { errorCode: 'CUSTOMER_PRIVACY_RESTRICTED' } });
  assert.equal((await f.get('/api/products/catalog')).status, 200);
  assert.equal((await f.get('/api/inventory/stores')).status, 200);
  const stream = await f.stream();
  assert.deepEqual(await stream.waitFor(event => event.type === 'snapshot'), { type: 'snapshot', calls: [] });
});

test('final release: read-only method/origin/input guards do not query providers or intercept existing routes', async t => {
  const f = await setup(t);
  assert.equal((await f.get('/api/data/appointments', { method: 'POST' })).status, 405);
  assert.equal((await f.get('/api/briefings/reservation_001', { method: 'DELETE' })).status, 405);
  assert.equal((await f.post('/api/products/catalog', {})).status, 405);
  assert.equal((await f.get('/api/effective-price')).status, 405);
  assert.equal((await f.post('/api/effective-price', { plan_id: 'own_plan_001', monthly_fee: 1 })).status, 400);
  assert.equal((await f.get('/api/data/appointments', { headers: { Origin: 'https://untrusted.example.test' } })).status, 403);
  assert.equal((await f.get('/api/inventory/stores', { headers: { Origin: 'https://untrusted.example.test' } })).status, 403);
  assert.deepEqual(f.reads, []); assert.deepEqual(f.inventoryReads, []);
  assert.equal((await f.get('/api/unknown-release-route')).status, 404);
  assert.equal((await f.get('/health')).status, 200);
  assert.equal((await f.get('/retell/config')).status, 200);
  assert.deepEqual(f.store.snapshot(), []);
});

test('final release: absent stored-data configuration remains explicit while inventory and Monitor/SSE can still finish a quiet call', async t => {
  const f = await setup(t, { configured: false });
  assert.deepEqual((await f.get('/api/data/status')).body,
    { source: 'supabase', readOnly: true, configured: false, scopeConfigured: true, errorCode: 'REAL_DATA_NOT_CONFIGURED' });
  for (const path of ['/api/data/appointments', '/api/data/customers', '/api/briefings/reservation_001', '/api/products/catalog']) {
    assert.deepEqual(await f.get(path), { status: 503, body: { errorCode: 'REAL_DATA_NOT_CONFIGURED' } });
  }
  assert.deepEqual(await f.post('/api/effective-price', { plan_id: 'own_plan_001' }), { status: 503, body: { errorCode: 'REAL_DATA_NOT_CONFIGURED' } });
  assert.deepEqual(f.reads, []);
  assert.equal((await f.get('/api/inventory/stock')).status, 200);
  const stream = await f.stream(), socket = await f.start('unconfigured_quiet');
  socket.frame({ type: 'transcript_snapshot', transcripts: [turn('u1', '안녕하세요.')] });
  assert.equal((await finalThroughHttp(f, stream, socket, 'unconfigured_quiet')).final_result.risk_score, 0);
});
