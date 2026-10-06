import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseReadProvider, projectStoredNarrative } from '../real-data.mjs';
import { buildLiveBriefingGuidance, createLiveBriefingApi, selectPreviousConsultation, selectPreviousRisk } from '../live-briefing.mjs';

// Synthetic rows and fetch only: no environment, production data, WebSocket or external requests.
const home = 'store_005';
const path = '/api/live-briefing/customer_001';
const context = { currentCallId: 'live_current', currentConsultationId: 'consultation_002',
  currentStartedAt: '2026-10-06T10:00:00Z', customerId: 'customer_001', storeId: home };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const baseConsultation = { id: 'consultation_001', customer_id: 'customer_001', store_id: home, status: '완료',
  call_id: 'call_previous', started_at: '2026-10-05T08:00:00Z', ended_at: '2026-10-05T08:30:00Z',
  purpose: '검증고객 요금제 문의', ai_summary: '검증고객 요청 확인. 010-0000-1234 및 example@example.test로 안내.',
  ai_transcription: 'RAW_TRANSCRIPT_CANARY' };
const baseRisk = { id: 'risk_001', customer_id: 'customer_001', consultation_id: 'consultation_001', stage: 'AI',
  risk_score: 60, risk_level: '위험', created_at: '2026-10-05T08:31:00Z',
  profanity_count: 2, threat_violence_count: 2, verbal_abuse_count: 0, sexual_count: null, shouting_count: null };

function fixtures() {
  return {
    customers: [{ id: 'customer_001', name: '검증고객', privacy_consent: true, product_id: 'product_001', plan_id: 'own_plan_001',
      phone: 'CUSTOMER_PHONE_CANARY', birth_date: 'BIRTH_CANARY' }],
    consultations: [baseConsultation,
      { ...baseConsultation, id: 'consultation_002', call_id: 'live_current', started_at: '2026-10-06T10:00:00Z', ended_at: '2026-10-06T10:01:00Z', ai_summary: 'CURRENT_CANARY' },
      { ...baseConsultation, id: 'consultation_003', status: '진행 중', ended_at: null, ai_summary: 'ONGOING_CANARY' },
      { ...baseConsultation, id: 'consultation_004', store_id: 'store_001', ai_summary: 'OTHER_STORE_CANARY' }],
    risks: [baseRisk,
      { ...baseRisk, id: 'risk_002', stage: 'PHONE', risk_score: 80, risk_level: '매우 위험', created_at: '2026-10-05T08:35:00Z' },
      { ...baseRisk, id: 'risk_003', stage: 'VISIT', risk_score: 40, risk_level: '경계', created_at: '2026-10-05T08:40:00Z' }],
    products: [{ id: 'product_001', name: '등록 단말', maker: 'Samsung', storage_gb: 256, color: '검정', price: 100000, secret: 'PRODUCT_CANARY' }],
    own_plans: [{ id: 'own_plan_001', name: '등록 요금제', monthly_fee: 55000, secret: 'PLAN_CANARY' }],
  };
}

function setup({ data = fixtures(), override, configured = true, homeStoreId = home } = {}) {
  const reads = [];
  const provider = createSupabaseReadProvider({ supabaseUrl: configured ? 'https://live-briefing.example.test' : '',
    supabaseKey: configured ? 'sb_publishable_live_briefing_fixture' : '', fetchImpl: async (url, init) => {
      const parsed = new URL(url), table = parsed.pathname.split('/').at(-1), query = parsed.searchParams;
      assert.equal(parsed.origin, 'https://live-briefing.example.test');
      assert.equal(init.method, 'GET'); assert.equal(init.body, undefined); assert.equal(init.redirect, 'manual');
      const selected = query.get('select').split(',');
      assert.ok(!selected.some(field => ['*', 'phone', 'birth_date', 'ai_transcription'].includes(field)));
      reads.push({ table, selected, query: new URLSearchParams(query) });
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
      if (override) {
        const changed = override(table, rows, query);
        if (changed instanceof Response) return changed;
        rows = changed;
      }
      return json(rows.map(row => ({ ...Object.fromEntries(selected.map(field => [field, row[field] ?? null])),
        unexpected: 'UPSTREAM_PRIVATE_CANARY' })));
    } });
  return { api: createLiveBriefingApi({ provider, homeStoreId }), provider, data, reads };
}
const noPrivate = body => assert.doesNotMatch(JSON.stringify(body), /CANARY|검증고객|010-0000-1234|example@example\.test|sb_publishable_/u);

test('live briefing returns a minimal masked past consultation, current service and stored AI risk without recalculation', async () => {
  const { api, reads } = setup();
  const result = await api.handle('GET', path, context);
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ['source', 'readOnly', 'privacyConsent', 'customer', 'currentProduct', 'currentPlan', 'recentConsultation', 'previousRisk', 'guidance'].sort());
  assert.equal(result.body.source, 'supabase'); assert.equal(result.body.readOnly, true); assert.equal(result.body.privacyConsent, true);
  assert.deepEqual(result.body.customer, { id: 'customer_001', nameMasked: '검**객' });
  assert.deepEqual(result.body.currentProduct, { id: 'product_001', name: '등록 단말', maker: 'Samsung', storageGb: 256, color: '검정' });
  assert.deepEqual(result.body.currentPlan, { id: 'own_plan_001', name: '등록 요금제', monthlyFee: 55000 });
  assert.equal(result.body.recentConsultation.id, 'consultation_001');
  assert.equal(result.body.recentConsultation.endedAt, baseConsultation.ended_at);
  assert.match(result.body.recentConsultation.summary, /검\*\*객 요청 확인/);
  assert.deepEqual(result.body.previousRisk, { id: 'risk_001', score: 60, level: '위험', stage: 'AI', createdAt: baseRisk.created_at,
    profanityCount: 2, threatCount: 2, blameCount: 0, sexualCount: null, shoutingCount: null });
  assert.equal(result.body.guidance.length, 4); noPrivate(result.body);
  assert.ok(reads.find(row => row.table === 'consultations' && row.selected.includes('ended_at')).query.get('ended_at').startsWith('lt.'));
  assert.ok(reads.every(row => Number(row.query.get('limit')) <= 1000));
});

test('privacy false stops detail/product/plan/summary/risk reads and returns a restricted envelope', async () => {
  const data = fixtures(); data.customers[0].privacy_consent = false;
  const { api, reads } = setup({ data });
  const result = await api.handle('GET', path, context);
  assert.deepEqual(result, { status: 200, body: { source: 'supabase', readOnly: true, privacyConsent: false,
    customer: { id: 'customer_001', nameMasked: '비공개 고객' }, currentProduct: null, currentPlan: null, recentConsultation: null,
    previousRisk: null, guidance: ['고객 개인정보 동의 확인이 필요합니다.'] } });
  assert.deepEqual(reads.map(row => [row.table, row.selected]), [['customers', ['id', 'name', 'privacy_consent']]]);
  noPrivate(result.body);
});

test('trusted live-call scope permits a known customer with no stored consultation and preserves empty history', async () => {
  const data = fixtures(); data.consultations = []; data.risks = [];
  const { api, reads } = setup({ data });
  const result = await api.handle('GET', path, context);
  assert.equal(result.status, 200); assert.equal(result.body.recentConsultation, null); assert.equal(result.body.previousRisk, null);
  assert.equal(result.body.currentPlan.monthlyFee, 55000); assert.equal(result.body.guidance.length, 2);
  assert.equal(reads.some(row => row.selected.includes('ai_summary') || row.table === 'risks'), false);
});

test('without context, a home-store link is required before customer lookup; a valid link permits empty completed history', async () => {
  const data = fixtures(); data.consultations = [data.consultations[2]];
  const linked = setup({ data });
  const result = await linked.api.handle('GET', path);
  assert.equal(result.status, 200); assert.equal(result.body.recentConsultation, null);
  assert.deepEqual(linked.reads[0].selected, ['id', 'customer_id', 'store_id']);
  data.consultations[0].store_id = 'store_001';
  const foreign = setup({ data });
  assert.deepEqual(await foreign.api.handle('GET', path), { status: 404, body: { errorCode: 'CUSTOMER_NOT_FOUND' } });
  assert.deepEqual(foreign.reads.map(row => row.table), ['consultations']);
});

test('no risk and no summary remain null; purpose is not fabricated into an AI summary', async () => {
  const data = fixtures(); data.risks = []; data.consultations[0].ai_summary = null;
  const { api } = setup({ data });
  const result = await api.handle('GET', path, context);
  assert.equal(result.status, 200); assert.equal(result.body.previousRisk, null); assert.equal(result.body.recentConsultation.summary, null);
  assert.equal(result.body.recentConsultation.purpose, '검**객 요금제 문의');
  assert.match(result.body.guidance[0], /저장된 상담 요약이 없으므로/);
});

test('missing current product/plan IDs stay null, and an explicitly recorded zero monthly fee stays zero', async () => {
  const data = fixtures(); data.customers[0].product_id = null; data.customers[0].plan_id = null;
  const absent = setup({ data });
  const missing = await absent.api.handle('GET', path, context);
  assert.equal(missing.status, 200); assert.equal(missing.body.currentProduct, null); assert.equal(missing.body.currentPlan, null);
  assert.equal(absent.reads.some(row => ['products', 'own_plans'].includes(row.table)), false);
  const zeroData = fixtures(); zeroData.own_plans[0].monthly_fee = 0;
  assert.equal((await setup({ data: zeroData }).api.handle('GET', path, context)).body.currentPlan.monthlyFee, 0);
});

test('completed selection excludes current consultation/call, equal/future ends and missing ended_at', () => {
  const rows = [baseConsultation,
    { ...baseConsultation, id: 'consultation_002', ended_at: '2026-10-06T09:50:00Z' },
    { ...baseConsultation, id: 'consultation_010', call_id: context.currentCallId, ended_at: '2026-10-06T09:55:00Z' },
    { ...baseConsultation, id: 'consultation_011', ended_at: context.currentStartedAt },
    { ...baseConsultation, id: 'consultation_012', ended_at: '2026-10-06T10:00:01Z' },
    { ...baseConsultation, id: 'consultation_013', ended_at: null },
    { ...baseConsultation, id: 'consultation_014', ended_at: '2026-10-06T09:40:00Z' }];
  assert.equal(selectPreviousConsultation(rows, context).id, 'consultation_014');
  assert.equal(selectPreviousConsultation(rows.slice(1, 6), context), null);
});

test('historical started_at null permits a completed past ended_at while present starts and current cutoff stay strict', async () => {
  const data = fixtures(); data.consultations[0] = { ...data.consultations[0], started_at: null };
  const { api } = setup({ data });
  const result = await api.handle('GET', path, context);
  assert.equal(result.status, 200);
  assert.equal(result.body.recentConsultation.id, 'consultation_001');
  assert.equal(result.body.recentConsultation.endedAt, baseConsultation.ended_at);
  assert.equal(selectPreviousConsultation([{ ...baseConsultation, started_at: null, ended_at: null }], context), null);
  assert.equal(selectPreviousConsultation([{ ...baseConsultation, started_at: null, ended_at: context.currentStartedAt }], context), null);
  for (const started_at of ['2026-02-30T08:00:00Z', '2026-10-05T08:30:01Z']) {
    assert.throws(() => selectPreviousConsultation([{ ...baseConsultation, started_at }], context), /REAL_DATA_INVALID_RESPONSE/);
  }
  assert.deepEqual(await api.handle('GET', path, { ...context, currentStartedAt: null }),
    { status: 400, body: { errorCode: 'INVALID_LIVE_BRIEFING_CONTEXT' } });
});

test('timestamp ordering respects offsets, microsecond boundaries and deterministic ID ties', () => {
  const rows = [
    { ...baseConsultation, id: 'consultation_010', ended_at: '2026-10-06T18:59:59.999999+09:00' },
    { ...baseConsultation, id: 'consultation_011', ended_at: '2026-10-06T09:59:59.999999Z' },
    { ...baseConsultation, id: 'consultation_012', ended_at: '2026-10-06T10:00:00.000001Z' },
    { ...baseConsultation, id: 'consultation_013', ended_at: '2026-10-06T10:00:00.000002Z' }];
  const cutoff = { ...context, currentStartedAt: '2026-10-06T10:00:00.000002Z' };
  assert.equal(selectPreviousConsultation(rows, cutoff).id, 'consultation_012');
  assert.equal(selectPreviousConsultation(rows.slice(0, 2), context).id, 'consultation_011');
});

test('AI priority uses its newest timestamp/ID; without AI a newer VISIT beats older PHONE without sums', () => {
  const rows = fixtures().risks;
  rows.push({ ...baseRisk, id: 'risk_010', risk_score: 17, risk_level: '주의', created_at: '2026-10-05T08:32:00Z' });
  rows.push({ ...baseRisk, id: 'risk_011', risk_score: 18, risk_level: '주의', created_at: '2026-10-05T17:32:00+09:00' });
  const ai = selectPreviousRisk(rows);
  assert.equal(ai.id, 'risk_011'); assert.equal(ai.score, 18); assert.equal(ai.threatCount, 2);
  const fallback = selectPreviousRisk(rows.filter(row => row.stage !== 'AI'));
  assert.equal(fallback.id, 'risk_003'); assert.equal(fallback.stage, 'VISIT'); assert.equal(fallback.score, 40);
});

test('null and missing signal counts remain unknown, while recorded zero counts remain zero', () => {
  const row = { ...baseRisk, profanity_count: null, threat_violence_count: 0, verbal_abuse_count: 0, sexual_count: null };
  delete row.shouting_count;
  assert.deepEqual(selectPreviousRisk([row]), { id: 'risk_001', score: 60, level: '위험', stage: 'AI', createdAt: baseRisk.created_at,
    profanityCount: null, threatCount: 0, blameCount: 0, sexualCount: null, shoutingCount: null });
  assert.equal(selectPreviousRisk([]), null);
});

for (const value of [-1, 0.5, NaN, Infinity, '2']) {
  test(`invalid stored count ${String(value)} is rejected rather than converted to zero`, () => {
    assert.throws(() => selectPreviousRisk([{ ...baseRisk, threat_violence_count: value }]), /REAL_DATA_INVALID_RESPONSE/);
  });
}

test('guidance uses stored threat/profanity/high-level/summary facts, remains short and separates current risk', () => {
  const previousRisk = selectPreviousRisk([baseRisk]);
  const guidance = buildLiveBriefingGuidance({ privacyConsent: true, previousRisk, recentConsultation: { summary: '저장 요약' } });
  assert.equal(guidance.length, 4); assert.match(guidance[0], /이전 상담.*위협/); assert.match(guidance[1], /이전 욕설/);
  assert.match(guidance[2], /관리자 지원/); assert.match(guidance[3], /중복 질문/);
  const unknown = buildLiveBriefingGuidance({ privacyConsent: true, previousRisk: { ...previousRisk, level: '정상', profanityCount: null, threatCount: null }, recentConsultation: null });
  assert.equal(unknown.length, 2); assert.doesNotMatch(unknown.join(' '), /욕설|위협 표현|관리자/);
});

test('shared text projection masks names and contacts safely when a phone was not selected', () => {
  const text = '검증고객의 010-0000-1234, +82 10 0000 1234, example@example.test 문의';
  const masked = projectStoredNarrative(text, { name: '검증고객' }, 80);
  assert.doesNotMatch(masked, /검증고객|010-0000-1234|0000 1234|example@example\.test/);
  assert.equal(projectStoredNarrative('검증고객', { name: '검증고객', phone: '' }), '검**객');
  assert.equal(projectStoredNarrative('   ', { name: '검증고객' }), null);
  assert.ok(projectStoredNarrative('가'.repeat(2000), { name: '검증고객' }, 1200).length === 1200);
});

test('padded stored customer names are masked in purpose/summary with both padded and plain spellings', async () => {
  const data = fixtures();
  data.customers[0].name = '  검증고객  ';
  data.consultations[0] = { ...data.consultations[0],
    purpose: '검증고객 요금 문의와   검증고객   방문 문의',
    ai_summary: '  검증고객  의 이전 요청입니다. 검증고객에게 방문 일정을 확인합니다.' };
  const { api } = setup({ data });
  const result = await api.handle('GET', path, context);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.customer, { id: 'customer_001', nameMasked: '검**객' });
  assert.equal(result.body.recentConsultation.purpose, '검**객 요금 문의와   검**객   방문 문의');
  assert.equal(result.body.recentConsultation.summary, '  검**객  의 이전 요청입니다. 검**객에게 방문 일정을 확인합니다.');
  noPrivate(result.body);
  assert.equal(data.customers[0].name, '  검증고객  ', 'Projection must not mutate stored source rows');
});

test('invalid IDs, methods, scope and timestamps fail without querying business details', async () => {
  const { api, reads } = setup();
  assert.equal(await api.handle('GET', '/api/other'), null);
  assert.equal((await api.handle('GET', '/api/live-briefing/customer_bad')).status, 400);
  assert.equal((await api.handle('DELETE', path, context)).status, 405);
  assert.equal((await api.handle('GET', path, { ...context, customerId: 'customer_002' })).status, 403);
  assert.equal((await api.handle('GET', path, { ...context, storeId: 'store_001' })).status, 403);
  assert.equal((await api.handle('GET', path, { ...context, currentConsultationId: 'consultation_bad' })).status, 400);
  assert.equal((await api.handle('GET', path, { ...context, currentStartedAt: '2026-02-30T10:00:00Z' })).status, 400);
  assert.deepEqual(reads, []);
});

test('unknown customers and missing settings use explicit safe errors', async () => {
  const data = fixtures(); data.customers = [];
  assert.deepEqual(await setup({ data }).api.handle('GET', path, context), { status: 404, body: { errorCode: 'CUSTOMER_NOT_FOUND' } });
  const missing = setup({ configured: false });
  assert.deepEqual(await missing.api.handle('GET', path, context), { status: 503, body: { errorCode: 'REAL_DATA_NOT_CONFIGURED' } });
  assert.deepEqual(missing.reads, []);
  const unscoped = setup({ homeStoreId: null });
  assert.deepEqual(await unscoped.api.handle('GET', path, context), { status: 503, body: { errorCode: 'HOME_STORE_NOT_CONFIGURED' } });
  assert.deepEqual(unscoped.reads, []);
});

for (const [table, change] of [
  ['customers', rows => rows.map(row => ({ ...row, id: 'customer_002' }))],
  ['consultations', rows => rows.map(row => ({ ...row, store_id: 'store_001' }))],
  ['consultations', rows => rows.map(row => ({ ...row, ended_at: '2026-02-30T08:30:00Z' }))],
  ['products', rows => rows.map(row => ({ ...row, storage_gb: -1 }))],
  ['own_plans', rows => rows.map(row => ({ ...row, monthly_fee: null }))],
  ['risks', rows => rows.map(row => ({ ...row, consultation_id: 'consultation_999' }))],
  ['risks', rows => rows.map(row => ({ ...row, customer_id: 'customer_002' }))],
  ['risks', rows => rows.map(row => ({ ...row, risk_score: 100 }))],
  ['risks', rows => rows.map(row => ({ ...row, stage: 'UNKNOWN' }))],
  ['risks', rows => rows.map(row => ({ ...row, profanity_count: -1 }))],
]) {
  test(`malformed ${table} identity/date/value is safely rejected`, async () => {
    const { api } = setup({ override: (name, rows, query) => name === table && (name !== 'consultations' || query.get('select').includes('ended_at')) ? change(rows) : rows });
    assert.deepEqual(await api.handle('GET', path, context), { status: 502, body: { errorCode: 'REAL_DATA_INVALID_RESPONSE' } });
  });
}

test('upstream failure/timeout/throw stay safe and later explicit reads can recover', async () => {
  let fail = true;
  const f = setup({ override: (_table, rows) => fail ? new Response('UPSTREAM_PRIVATE_CANARY', { status: 503 }) : rows });
  assert.deepEqual(await f.api.handle('GET', path, context), { status: 502, body: { errorCode: 'REAL_DATA_UNAVAILABLE' } });
  fail = false; assert.equal((await f.api.handle('GET', path, context)).status, 200);
  for (const [code, status] of [['REAL_DATA_TIMEOUT', 504], ['REAL_DATA_UNAVAILABLE', 502], ['INTERNAL_URL_OR_TOKEN_CANARY', 502]]) {
    const provider = { configured: true, configError: null, read: async () => ({ ok: false, code }) };
    const result = await createLiveBriefingApi({ provider, homeStoreId: home }).handle('GET', path, context);
    assert.deepEqual(result, { status, body: { errorCode: code === 'INTERNAL_URL_OR_TOKEN_CANARY' ? 'REAL_DATA_UNAVAILABLE' : code } });
  }
  const provider = { configured: true, configError: null, read: async () => { throw new Error('UPSTREAM_PRIVATE_CANARY'); } };
  assert.deepEqual(await createLiveBriefingApi({ provider, homeStoreId: home }).handle('GET', path, context),
    { status: 502, body: { errorCode: 'REAL_DATA_UNAVAILABLE' } });
});

test('unknown and inherited error-code names always produce numeric 502 with a fixed safe code', async () => {
  for (const code of ['UNKNOWN_PRIVATE_CANARY', 'toString', '__proto__', 'constructor', 'hasOwnProperty']) {
    const provider = { configured: true, configError: null, read: async () => ({ ok: false, code }) };
    const result = await createLiveBriefingApi({ provider, homeStoreId: home }).handle('GET', path, context);
    assert.deepEqual(result, { status: 502, body: { errorCode: 'REAL_DATA_UNAVAILABLE' } });
    assert.equal(typeof result.status, 'number');
  }
});
