import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { EventEmitter } from 'node:events';
import { createBackend } from '../app.mjs';
import { createLiveCallStore } from '../live-calls.mjs';
import { createSupabaseReadProvider } from '../real-data.mjs';

// Local HTTP only. Configuration, DB rows and upstream failures are synthetic;
// no process environment, real DB, Retell, n8n or browser is accessed.
const customerId = 'customer_9999';
const home = 'store_005';
const callId = 'live_briefing_current';
const currentId = 'consultation_900';
const cutoff = '2026-10-06T10:00:00.000Z';
const publicOrigin = 'https://public.example.test';
const publicHeaders = { Host: 'public.example.test', Origin: publicOrigin };
const dbOrigin = 'https://briefing-http.example.test';
const route = '/api/live-briefing/' + customerId;
const currentRoute = route + '?call_id=' + callId;

function rowsFixture() {
  const past = { id: 'consultation_100', customer_id: customerId, store_id: home, status: '완료',
    call_id: 'past_call', started_at: '2026-10-03T08:00:00Z', ended_at: '2026-10-03T08:30:00Z',
    purpose: '검증고객 요금제 문의', ai_summary: '검증고객 요청 확인. 010-0000-1234, fixture@example.test',
    ai_transcription: 'RAW_TRANSCRIPT_CANARY' };
  return {
    customers: [{ id: customerId, name: ' 검증고객 ', privacy_consent: true, product_id: 'product_001', plan_id: 'own_plan_001',
      phone: 'RAW_PHONE_CANARY', birth_date: 'RAW_BIRTH_CANARY' }],
    consultations: [
      past,
      // Both exclusion IDs are tested independently of the time filter.
      { ...past, id: currentId, call_id: 'different_call', started_at: '2026-10-04T08:00:00Z',
        ended_at: '2026-10-04T08:30:00Z', ai_summary: 'RAW_CURRENT_CONSULTATION_CANARY' },
      { ...past, id: 'consultation_901', call_id: callId, started_at: '2026-10-05T08:00:00Z',
        ended_at: '2026-10-05T08:30:00Z', ai_summary: 'RAW_CURRENT_CALL_CANARY' },
      { ...past, id: 'consultation_902', started_at: '2026-10-06T09:00:00Z',
        ended_at: cutoff, ai_summary: 'RAW_EQUAL_CUTOFF_CANARY' },
      { ...past, id: 'consultation_903', started_at: '2026-10-06T10:00:00Z',
        ended_at: '2026-10-06T11:00:00Z', ai_summary: 'RAW_FUTURE_CANARY' },
      { ...past, id: 'consultation_904', status: '진행 중', ended_at: null, ai_summary: 'RAW_ONGOING_CANARY' },
      { ...past, id: 'consultation_905', store_id: 'store_001', ai_summary: 'RAW_OTHER_STORE_CANARY' },
      { ...past, id: 'consultation_906', customer_id: 'customer_0001', ai_summary: 'RAW_OTHER_CUSTOMER_CANARY' },
    ],
    risks: [
      { id: 'risk_100', customer_id: customerId, consultation_id: past.id, stage: 'AI',
        risk_score: 60, risk_level: '위험', created_at: '2026-10-03T08:31:00Z',
        profanity_count: 2, threat_violence_count: 2, verbal_abuse_count: 0, sexual_count: null, shouting_count: null },
      { id: 'risk_101', customer_id: customerId, consultation_id: past.id, stage: 'PHONE',
        risk_score: 80, risk_level: '매우 위험', created_at: '2026-10-03T08:40:00Z',
        profanity_count: 3, threat_violence_count: 3, verbal_abuse_count: 0, sexual_count: 0, shouting_count: 1 },
    ],
    products: [{ id: 'product_001', name: '등록 단말', maker: 'Samsung', storage_gb: 256, color: '검정' }],
    own_plans: [{ id: 'own_plan_001', name: '등록 요금제', monthly_fee: 55000 }],
  };
}

function localRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const call = request(url, { method: options.method ?? 'GET', headers: options.headers }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => body += chunk);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        body: JSON.parse(body) }));
      response.on('error', reject);
    });
    call.on('error', reject);
    call.setTimeout(3000, () => call.destroy(new Error('Local HTTP response timed out')));
    call.end(options.body);
  });
}

async function setup(t, options = {}) {
  let externalRequests = 0, clock = cutoff;
  t.mock.method(globalThis, 'fetch', () => {
    externalRequests++;
    throw new Error('Unexpected non-fixture network request');
  });
  const data = options.data ?? rowsFixture(), reads = [], upstream = { failure: null };
  const provider = createSupabaseReadProvider({
    supabaseUrl: options.dbUrl ?? dbOrigin,
    supabaseKey: options.dbKey ?? 'sb_publishable_http_fixture',
    fetchImpl: async (url, init) => {
      const parsed = new URL(url), table = parsed.pathname.split('/').at(-1), query = parsed.searchParams;
      assert.equal(parsed.origin, dbOrigin);
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'manual');
      assert.equal(init.body, undefined);
      const selected = query.get('select').split(',');
      assert.ok(!selected.some(field => ['*', 'phone', 'birth_date', 'ai_transcription'].includes(field)));
      reads.push({ table, selected, query: new URLSearchParams(query) });
      if (upstream.failure) return upstream.failure(table, query);
      let rows = structuredClone(data[table] ?? []);
      for (const [column, filter] of query) {
        if (['select', 'order', 'limit'].includes(column)) continue;
        if (filter.startsWith('eq.')) rows = rows.filter(row => String(row[column]) === filter.slice(3));
        else if (filter === 'not.is.null') rows = rows.filter(row => row[column] !== null);
        else if (filter.startsWith('lt.')) rows = rows.filter(row => row[column] !== null && Date.parse(row[column]) < Date.parse(filter.slice(3)));
        else assert.fail('Unexpected fixture filter');
      }
      for (const part of (query.get('order') ?? '').split(',').reverse()) {
        if (!part) continue;
        const [field, direction] = part.split('.');
        rows.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1));
      }
      rows = rows.slice(0, Number(query.get('limit')));
      return new Response(JSON.stringify(rows.map(row => ({
        ...Object.fromEntries(selected.map(field => [field, row[field] ?? null])),
        unexpected: 'RAW_UPSTREAM_PRIVATE_CANARY',
      }))));
    },
  });
  const store = createLiveCallStore(() => clock);
  const liveCalls = options.snapshotTransform
    ? { ...store, snapshot: () => options.snapshotTransform(store.snapshot()) } : store;
  const server = createBackend({
    key: '', agentId: '', monitors: { start() {}, release() {}, close() {} }, log() {},
    liveCalls, realDataProvider: provider,
    demoCustomerId: Object.hasOwn(options, 'demoCustomerId') ? options.demoCustomerId : customerId,
    demoStoreId: Object.hasOwn(options, 'demoStoreId') ? options.demoStoreId : home,
    deployment: options.local ? null : { origin: publicOrigin, staticDir: '.' },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  t.after(() => assert.equal(externalRequests, 0, 'All upstream operations must stay in the injected fixture'));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { data, reads, upstream, provider, store, base,
    setTime(value) { clock = value; },
    start(id = callId, selectedCustomer = customerId, selectedStore = home, consultationId = currentId) {
      store.connecting(id, selectedCustomer, consultationId, selectedStore);
      store.live(id);
    },
    get(path = currentRoute, headers = options.local ? undefined : publicHeaders) {
      return localRequest(base + path, { headers });
    },
    request(path, requestOptions = {}) {
      return localRequest(base + path, { headers: options.local ? undefined : publicHeaders, ...requestOptions });
    },
  };
}

function assertError(response, status, errorCode) {
  assert.equal(response.status, status);
  assert.deepEqual(response.body, { errorCode });
  assert.doesNotMatch(JSON.stringify(response.body), /CANARY|example\.test|sb_publishable_|https?:\/\//u);
}

function openSse(base, headers = publicHeaders) {
  const events = [], changed = new EventEmitter();
  return new Promise((resolve, reject) => {
    const call = request(base + '/api/live-calls/events', { headers }, response => {
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
          if (!match) continue;
          const value = JSON.parse(match[2]);
          assert.equal(value.type, match[1]);
          events.push(value); changed.emit('event');
        }
      });
      response.on('error', () => {});
      resolve({ events,
        waitFor(predicate, after = 0) {
          const found = () => events.slice(after).find(predicate);
          if (found()) return Promise.resolve(found());
          return new Promise((done, fail) => {
            const timer = setTimeout(() => {
              changed.off('event', listener); fail(new Error('Local SSE event was not received'));
            }, 3000);
            const listener = () => {
              const value = found();
              if (value) { clearTimeout(timer); changed.off('event', listener); done(value); }
            };
            changed.on('event', listener);
          });
        },
        close() { response.destroy(); call.destroy(); },
      });
    });
    call.on('error', reject); call.end();
  });
}

test('live briefing HTTP: public demo customer is the sole masked read-only exception', async t => {
  const f = await setup(t); f.start();
  const response = await f.get();
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.body.source, 'supabase'); assert.equal(response.body.readOnly, true);
  assert.deepEqual(response.body.customer, { id: customerId, nameMasked: '검**객' });
  assert.deepEqual(Object.keys(response.body).sort(),
    ['source', 'readOnly', 'privacyConsent', 'customer', 'currentProduct', 'currentPlan', 'recentConsultation', 'previousRisk', 'guidance'].sort());
  assert.equal(response.body.currentPlan.monthlyFee, 55000);
  assert.doesNotMatch(JSON.stringify(response.body), /RAW_|검증고객|010-0000-1234|fixture@example\.test|sb_publishable_/u);
});

test('live briefing HTTP: all other public customer IDs and forged proxy headers reject before provider access', async t => {
  const f = await setup(t); f.start();
  for (const headers of [publicHeaders, { Host: 'public.example.test' },
    { ...publicHeaders, 'X-Forwarded-Host': '127.0.0.1', 'X-Forwarded-For': '127.0.0.1' }]) {
    for (const id of ['customer_0001', 'customer_99990', 'customer_09999', 'invalid', 'customer_%39999']) {
      assertError(await f.get('/api/live-briefing/' + id + '?call_id=' + callId, headers), 403, 'REAL_DATA_ACCESS_RESTRICTED');
    }
  }
  assert.equal(f.reads.length, 0);
});

test('live briefing HTTP: missing or malformed server demo configuration never grants the public exception', async t => {
  for (const demoCustomerId of [null, '', '9999', 'customer_9999 ', 'customer_12', 'customer_9999/other']) {
    const f = await setup(t, { demoCustomerId }); f.start();
    assertError(await f.get(), 403, 'REAL_DATA_ACCESS_RESTRICTED');
    assert.equal(f.reads.length, 0);
  }
});

test('live briefing HTTP: existing stored customer, reservation and personalized price public guards stay 503', async t => {
  const f = await setup(t); f.start();
  for (const path of ['/api/data/customers', '/api/data/appointments', '/api/data/customers/' + customerId + '/consultations',
    '/api/briefings/reservation_001']) {
    assertError(await f.get(path), 503, 'REAL_DATA_ACCESS_RESTRICTED');
  }
  assertError(await f.request('/api/effective-price', { method: 'POST',
    headers: { ...publicHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId, plan_id: 'own_plan_001' }) }), 503, 'REAL_DATA_ACCESS_RESTRICTED');
  assert.equal(f.reads.length, 0);
  const status = await f.get('/api/data/status');
  assert.deepEqual(status.body, { source: 'supabase', readOnly: true, configured: true, scopeConfigured: true, errorCode: null });
});

test('live briefing HTTP: server live-call IDs and start time exclude current, equal, later and unrelated consultations', async t => {
  const f = await setup(t); f.start();
  const before = f.store.snapshot(), response = await f.get();
  assert.equal(response.status, 200);
  assert.equal(response.body.recentConsultation.id, 'consultation_100');
  assert.equal(response.body.previousRisk.id, 'risk_100');
  assert.equal(response.body.previousRisk.stage, 'AI');
  assert.equal(response.body.previousRisk.score, 60);
  assert.equal(response.body.previousRisk.sexualCount, null);
  assert.equal(response.body.previousRisk.shoutingCount, null);
  const pastRead = f.reads.find(row => row.table === 'consultations' && row.selected.includes('ended_at'));
  assert.equal(pastRead.query.get('ended_at'), 'lt.' + cutoff);
  assert.equal(pastRead.query.get('customer_id'), 'eq.' + customerId);
  assert.equal(pastRead.query.get('store_id'), 'eq.' + home);
  assert.equal(pastRead.query.get('status'), 'eq.완료');
  assert.deepEqual(f.store.snapshot(), before, 'Briefing reads must not mutate live risk or transcript state');
});

test('live briefing HTTP: a finalized 60-point call keeps prior 20 on reload and becomes prior 60 only for the next call', async t => {
  const data = rowsFixture();
  data.consultations = [data.consultations[0]];
  data.risks = [{ ...data.risks[0], risk_score: 20, risk_level: '주의',
    profanity_count: 1, threat_violence_count: 0, sexual_count: 0, shouting_count: 0 }];
  const f = await setup(t, { data }); f.start();
  const prior = await f.get();
  assert.equal(prior.status, 200);
  assert.equal(prior.body.recentConsultation.id, 'consultation_100');
  assert.equal(prior.body.previousRisk.score, 20);

  // Finalize through the real in-memory analyzer/audio path, never an external call.
  f.store.transcript(callId, [{ id: 'u1', role: 'user', time_sec: 1,
    content: '씨발. 처리 진짜 개판이네. 매장 뒤집어 놓을 테니까 알아서 하세요.' }]);
  assert.equal(f.store.audio(callId, { sequence: 1, shouting_count: 0, is_shouting: false,
    available: true, coverage_complete: true, closed: true }), 'accepted');
  f.setTime('2026-10-06T10:05:00.000Z'); f.store.ended(callId);
  const finished = f.store.snapshot().find(call => call.call_id === callId);
  assert.equal(finished.status, 'ended');
  assert.equal(finished.final_result.risk_score, 60);
  assert.equal(finished.final_result.risk_level, '위험');
  assert.equal(finished.final_result.threat_floor, 60);
  assert.deepEqual(finished.final_result.signals, { profanity_count: 2, threat_count: 1,
    blame_count: 0, sexual_count: 0, shouting_count: 0 });

  // Stand in for completed persistence using only this test's mutable row fixture.
  data.consultations.push({ ...data.consultations[0], id: finished.consultation_id, call_id: finished.call_id,
    started_at: finished.started_at, ended_at: finished.ended_at, purpose: '기기변경 조건 문의',
    ai_summary: '기기변경 조건과 방문 가능 시간을 문의했습니다.' });
  data.risks.push({ ...data.risks[0], id: 'risk_900', consultation_id: finished.consultation_id,
    risk_score: 60, risk_level: '위험', created_at: '2026-10-06T10:05:01.000Z',
    profanity_count: 2, threat_violence_count: 1 });
  const savedRows = structuredClone(data);
  for (const path of [currentRoute, route]) {
    const reloaded = await f.get(path);
    assert.equal(reloaded.status, 200);
    assert.deepEqual(reloaded.body.recentConsultation, prior.body.recentConsultation);
    assert.deepEqual(reloaded.body.previousRisk, prior.body.previousRisk);
  }
  assert.deepEqual(f.store.snapshot().find(call => call.call_id === callId), finished);

  f.setTime('2026-10-06T10:06:00.000Z');
  f.start('live_briefing_next', customerId, home, 'consultation_910');
  const beforeReads = f.store.snapshot();
  for (const path of [route + '?call_id=live_briefing_next', route]) {
    const next = await f.get(path);
    assert.equal(next.status, 200);
    assert.equal(next.body.recentConsultation.id, finished.consultation_id);
    assert.equal(next.body.recentConsultation.endedAt, finished.ended_at);
    assert.equal(next.body.previousRisk.id, 'risk_900');
    assert.equal(next.body.previousRisk.stage, 'AI');
    assert.equal(next.body.previousRisk.score, 60);
    assert.equal(next.body.previousRisk.level, '위험');
    assert.equal(next.body.previousRisk.profanityCount, 2);
    assert.equal(next.body.previousRisk.threatCount, 1);
    assert.equal(next.body.previousRisk.shoutingCount, 0);
  }
  // Opening the old call still uses that call's original cutoff after a new call exists.
  assert.equal((await f.get(currentRoute)).body.previousRisk.score, 20);
  assert.deepEqual(f.store.snapshot(), beforeReads);
  assert.deepEqual(f.store.snapshot().find(call => call.call_id === callId).final_result, finished.final_result);
  assert.equal(f.store.snapshot().find(call => call.call_id === 'live_briefing_next').final_result, null);
  assert.deepEqual(data, savedRows, 'All briefing GETs must preserve stored row fixtures');
});

test('live briefing HTTP: a newly stored consultation waits for its own delayed risk instead of falling back to older risk', async t => {
  const data = rowsFixture();
  data.consultations = [data.consultations[0]];
  data.risks = [{ ...data.risks[0], risk_score: 20, risk_level: '주의',
    profanity_count: 1, threat_violence_count: 0, sexual_count: 0, shouting_count: 0 }];
  const f = await setup(t, { data }); f.start();
  assert.equal((await f.get()).body.previousRisk.score, 20);
  const beforeReads = f.store.snapshot();

  data.consultations.push({ ...data.consultations[0], id: 'consultation_800', call_id: 'previous_delayed_call',
    started_at: '2026-10-06T09:00:00.000Z', ended_at: '2026-10-06T09:30:00.000Z',
    purpose: '데이터 이용 조건 문의', ai_summary: '데이터 이용 조건을 확인했습니다.' });
  const waiting = await f.get();
  assert.equal(waiting.status, 200);
  assert.equal(waiting.body.recentConsultation.id, 'consultation_800');
  assert.equal(waiting.body.previousRisk, null, 'The older consultation risk must not fill the new consultation gap');
  const riskRead = f.reads.filter(read => read.table === 'risks').at(-1);
  assert.equal(riskRead.query.get('consultation_id'), 'eq.consultation_800');
  assert.equal(riskRead.query.get('customer_id'), 'eq.' + customerId);

  data.risks.push({ ...data.risks[0], id: 'risk_800', consultation_id: 'consultation_800',
    risk_score: 60, risk_level: '위험', created_at: '2026-10-06T09:31:00.000Z',
    profanity_count: 2, threat_violence_count: 1 });
  const savedRows = structuredClone(data), reloaded = await f.get();
  assert.equal(reloaded.status, 200);
  assert.deepEqual(reloaded.body.recentConsultation, waiting.body.recentConsultation);
  assert.equal(reloaded.body.previousRisk.id, 'risk_800');
  assert.equal(reloaded.body.previousRisk.stage, 'AI');
  assert.equal(reloaded.body.previousRisk.score, 60);
  assert.equal(reloaded.body.previousRisk.threatCount, 1);
  assert.deepEqual(f.store.snapshot(), beforeReads);
  assert.deepEqual(data, savedRows);
});

test('live briefing HTTP: exact legacy test narratives are hidden without changing rows or suppressing normal summaries', async t => {
  for (const { purpose, summary, expectedPurpose, expectedSummary } of [
    { purpose: 'KCM AI 상담 연동 테스트 종료', summary: 'KCM AI 상담 DB 저장 테스트',
      expectedPurpose: null, expectedSummary: null },
    { purpose: '  KCM AI 상담 연동 테스트 종료\n', summary: '\n KCM AI 상담 DB 저장 테스트  ',
      expectedPurpose: null, expectedSummary: null },
    { purpose: '통신요금 비교 문의', summary: '고객이 데이터 사용량과 월 요금 차이를 문의했습니다.',
      expectedPurpose: '통신요금 비교 문의', expectedSummary: '고객이 데이터 사용량과 월 요금 차이를 문의했습니다.' },
    { purpose: 'KCM AI 상담 연동 테스트 종료 여부 문의',
      summary: '고객이 "KCM AI 상담 DB 저장 테스트"라는 안내 문구의 뜻을 문의했습니다.',
      expectedPurpose: 'KCM AI 상담 연동 테스트 종료 여부 문의',
      expectedSummary: '고객이 "KCM AI 상담 DB 저장 테스트"라는 안내 문구의 뜻을 문의했습니다.' },
  ]) {
    const data = rowsFixture();
    data.consultations[0] = { ...data.consultations[0], purpose, ai_summary: summary };
    const originalRows = structuredClone(data), f = await setup(t, { data }); f.start();
    const response = await f.get();
    assert.equal(response.status, 200);
    assert.equal(response.body.recentConsultation.purpose, expectedPurpose);
    assert.equal(response.body.recentConsultation.summary, expectedSummary);
    assert.equal(response.body.recentConsultation.id, 'consultation_100');
    assert.equal(response.body.recentConsultation.endedAt, data.consultations[0].ended_at);
    assert.equal(response.body.previousRisk.score, 60);
    assert.equal(response.body.previousRisk.threatCount, 2);
    assert.deepEqual(data, originalRows, 'Narrative projection must not rewrite stored rows');
    if (expectedSummary === null) assert.doesNotMatch(response.body.guidance.join(' '), /중복 질문/);
  }
});

test('live briefing HTTP: browser-supplied context, duplicate parameters and unsupported query fields are rejected before reads', async t => {
  const f = await setup(t); f.start();
  for (const query of [
    'call_id=' + callId + '&call_id=' + callId,
    'call_id=' + callId + '&call%5Fid=other_call',
    'call_id=' + callId + '&customer_id=customer_0001',
    'call_id=' + callId + '&store_id=store_001',
    'call_id=' + callId + '&currentConsultationId=consultation_100',
    'call_id=' + callId + '&currentStartedAt=2027-01-01T00:00:00Z',
    'call_id=' + callId + '&ended_at=not.is.null',
    'call_id=' + callId + '&unused',
  ]) assertError(await f.get(route + '?' + query), 400, 'INVALID_LIVE_BRIEFING_CONTEXT');
  for (const id of ['', 'has+space', '%2Fother', 'x'.repeat(129)]) {
    assertError(await f.get(route + '?call_id=' + id), 400, 'INVALID_CALL_ID');
  }
  assert.equal(f.reads.length, 0);
});

test('live briefing HTTP: missing call is 404 and customer/store/null-identity mismatches are 403 before reads', async t => {
  const f = await setup(t); f.start();
  assertError(await f.get(route + '?call_id=unknown_call'), 404, 'CALL_NOT_FOUND');
  f.start('wrong_customer', 'customer_0001');
  f.start('wrong_store', customerId, 'store_001');
  f.start('missing_customer', null);
  f.start('missing_store', customerId, null);
  for (const id of ['wrong_customer', 'wrong_store', 'missing_customer', 'missing_store']) {
    assertError(await f.get(route + '?call_id=' + id), 403, 'STORE_NOT_ALLOWED');
  }
  assert.equal(f.reads.length, 0);
});

test('live briefing HTTP: connecting uses the existing registration timestamp and ignores later completed records', async t => {
  const f = await setup(t), registeredAt = '2026-10-06T08:00:00Z';
  f.setTime(registeredAt); f.store.connecting(callId, customerId, currentId, home);
  f.data.consultations.push({ ...f.data.consultations[0], id: 'consultation_800',
    started_at: '2026-10-06T08:30:00Z', ended_at: '2026-10-06T09:00:00Z', ai_summary: 'RAW_AFTER_REGISTRATION_CANARY' });
  f.setTime('2026-10-06T12:00:00Z');
  const before = f.store.snapshot(), response = await f.get();
  assert.equal(response.status, 200); assert.equal(response.body.recentConsultation.id, 'consultation_100');
  assert.equal(before[0].started_at, null);
  assert.equal(f.reads.find(row => row.selected.includes('ended_at')).query.get('ended_at'), 'lt.' + registeredAt);
  assert.deepEqual(f.store.snapshot(), before, 'Reading must not invent a start time or refresh the registration cutoff');
});

test('live briefing HTTP: live/ended calls cannot fall back to updated_at when start time is absent or invalid', async t => {
  for (const [status, startedAt, updatedAt] of [
    ['live', null, cutoff], ['ended', null, cutoff], ['live', 'invalid', cutoff],
    ['ended', '2026-02-30T10:00:00Z', cutoff], ['connecting', null, 'invalid'],
  ]) {
    const f = await setup(t, { snapshotTransform: rows => rows.map(row => ({
      ...row, status, started_at: startedAt, updated_at: updatedAt,
    })) }); f.start();
    assertError(await f.get(), 400, 'INVALID_LIVE_BRIEFING_CONTEXT');
    assert.equal(f.reads.length, 0);
  }
});

test('live briefing HTTP: missing home-store and missing/invalid DB configuration return safe explicit errors', async t => {
  for (const demoStoreId of [null, '', 'store_12', 'store_005 ']) {
    const f = await setup(t, { demoStoreId }); f.start();
    assertError(await f.get(), 503, 'HOME_STORE_NOT_CONFIGURED'); assert.equal(f.reads.length, 0);
  }
  for (const [config, code] of [
    [{ dbUrl: '' }, 'REAL_DATA_NOT_CONFIGURED'], [{ dbKey: '' }, 'REAL_DATA_NOT_CONFIGURED'],
    [{ dbUrl: 'http://invalid.example.test' }, 'REAL_DATA_CONFIG_INVALID'],
  ]) {
    const f = await setup(t, config); f.start();
    assertError(await f.get(), 503, code); assert.equal(f.reads.length, 0);
  }
});

test('live briefing HTTP: privacy refusal stops detail reads and reveals only the restricted customer envelope', async t => {
  const data = rowsFixture(); data.customers[0].privacy_consent = false;
  const f = await setup(t, { data }); f.start();
  const response = await f.get();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { source: 'supabase', readOnly: true, privacyConsent: false,
    customer: { id: customerId, nameMasked: '비공개 고객' }, currentProduct: null, currentPlan: null,
    recentConsultation: null, previousRisk: null, guidance: ['고객 개인정보 동의 확인이 필요합니다.'] });
  assert.deepEqual(f.reads.map(row => [row.table, row.selected]), [['customers', ['id', 'name', 'privacy_consent']]]);
});

test('live briefing HTTP: caller-only lookup uses a matching server call and requires a home-store DB link without one', async t => {
  const f = await setup(t); f.start();
  assert.equal((await f.get(route)).body.recentConsultation.id, 'consultation_100');
  assert.equal(f.reads.find(row => row.selected.includes('ended_at')).query.get('ended_at'), 'lt.' + cutoff);
  const unlinked = await setup(t, { data: { ...rowsFixture(), consultations: [] } });
  assertError(await unlinked.get(route), 404, 'CUSTOMER_NOT_FOUND');
  assert.deepEqual(unlinked.reads.map(row => row.table), ['consultations']);
  const linked = await setup(t);
  const response = await linked.get(route);
  assert.equal(response.status, 200);
  assert.equal(linked.reads[0].table, 'consultations');
  assert.equal(linked.reads[0].query.get('customer_id'), 'eq.' + customerId);
  assert.equal(linked.reads[0].query.get('store_id'), 'eq.' + home);
});

test('live briefing HTTP: upstream 500, timeout, thrown raw error and malformed success never expose response details', async t => {
  const f = await setup(t); f.start();
  for (const [failure, status, code] of [
    [() => new Response('RAW_500_CANARY https://private.example.test?token=secret', { status: 500 }), 502, 'REAL_DATA_UNAVAILABLE'],
    [() => { const error = new Error('RAW_TIMEOUT_CANARY'); error.name = 'TimeoutError'; throw error; }, 504, 'REAL_DATA_TIMEOUT'],
    [() => { throw new Error('RAW_THROW_CANARY sb_publishable_private'); }, 502, 'REAL_DATA_UNAVAILABLE'],
    [() => new Response(JSON.stringify({ access_token: 'RAW_INVALID_CANARY' })), 502, 'REAL_DATA_INVALID_RESPONSE'],
  ]) {
    f.upstream.failure = failure;
    assertError(await f.get(), status, code);
  }
  f.upstream.failure = null;
  assert.equal((await f.get()).status, 200);
});

test('live briefing HTTP: a safe internal 500 code is returned without exposing thrown values or unknown provider codes', async t => {
  const f = await setup(t); f.start();
  for (const [code, status, expected] of [
    ['REAL_DATA_INVALID_QUERY', 500, 'REAL_DATA_INVALID_QUERY'],
    ['https://private.example.test?token=RAW_ERROR_CANARY', 502, 'REAL_DATA_UNAVAILABLE'],
    ['toString', 502, 'REAL_DATA_UNAVAILABLE'], ['__proto__', 502, 'REAL_DATA_UNAVAILABLE'],
    ['constructor', 502, 'REAL_DATA_UNAVAILABLE'], ['hasOwnProperty', 502, 'REAL_DATA_UNAVAILABLE'],
  ]) {
    // This is a provider-result fixture; no browser field supplies an internal error code.
    f.provider.read = async () => ({ ok: false, code });
    assertError(await f.get(), status, expected);
  }
  assert.equal(f.reads.length, 0);
});

test('live briefing HTTP: non-GET, malformed path, Origin and Host protections remain independent of the demo exception', async t => {
  const f = await setup(t); f.start();
  for (const method of ['POST', 'DELETE', 'PATCH']) {
    assertError(await f.request(currentRoute, { method }), 405, 'METHOD_NOT_ALLOWED');
  }
  assertError(await f.get(route + '/extra'), 404, 'NOT_FOUND');
  for (const [headers, code] of [
    [{ ...publicHeaders, Origin: 'https://untrusted.example.test' }, 'ORIGIN_NOT_ALLOWED'],
    [{ ...publicHeaders, Host: '127.0.0.1' }, 'HOST_NOT_ALLOWED'],
    [{ ...publicHeaders, 'Sec-Fetch-Site': 'cross-site' }, 'CROSS_SITE_NOT_ALLOWED'],
  ]) {
    const response = await f.get(currentRoute, headers);
    assert.equal(response.status, 403); assert.deepEqual(response.body, { error_message: code });
  }
  assert.equal(f.reads.length, 0);
  const local = await setup(t, { local: true });
  assertError(await local.get('/api/live-briefing/invalid'), 400, 'INVALID_CUSTOMER_ID');
  assert.equal(local.reads.length, 0);
});

test('live briefing HTTP: blocked, successful and failed briefing reads cannot interrupt live risk/SSE updates', { timeout: 10_000 }, async t => {
  const f = await setup(t); f.start();
  const stream = await openSse(f.base); t.after(() => stream.close());
  const initial = await stream.waitFor(event => event.type === 'snapshot');
  assert.deepEqual(initial.calls, f.store.snapshot());
  assertError(await f.get('/api/live-briefing/customer_0001?call_id=' + callId), 403, 'REAL_DATA_ACCESS_RESTRICTED');
  assert.equal(f.reads.length, 0);
  assert.equal((await f.get()).status, 200);
  f.upstream.failure = () => new Response('RAW_500_CANARY', { status: 500 });
  assertError(await f.get(), 502, 'REAL_DATA_UNAVAILABLE');
  const after = stream.events.length;
  f.store.transcript(callId, [
    { id: 'a1', role: 'agent', content: '위협적인 발언은 삼가 주세요.', time_sec: 1 },
    { id: 'u1', role: 'user', content: '너 찾아가서 팬다.', time_sec: 2 },
  ]);
  const transcript = await stream.waitFor(event => event.type === 'transcript' && event.call_id === callId, after);
  assert.equal(transcript.messages.length, 2);
  assert.equal(transcript.risk_analysis.threatCount, 1);
  assert.deepEqual(transcript.risk_analysis, f.store.snapshot()[0].risk_analysis);
  const reconnected = await openSse(f.base); t.after(() => reconnected.close());
  assert.deepEqual((await reconnected.waitFor(event => event.type === 'snapshot')).calls, f.store.snapshot());
});
