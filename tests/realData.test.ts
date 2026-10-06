import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRealDataDate, parseRealAppointments, parseRealBriefing, parseRealDataStatus, parseStoredConsultations, parseStoredCustomers,
  realDataApi, realDataAvailability, realDataErrorCode, realDataErrorMessage, RealDataApiError, validRealDataTimestamp,
  type RealAppointment, type StoredConsultation, type StoredCustomer } from '../src/services/realDataApi.js';

// Synthetic contracts only. No service/database requests or real customer records.
const at = '2026-10-06T09:00:00+09:00';
const reservation: RealAppointment = { id: 'reservation_001', consultationId: 'consultation_001', storeId: 'store_005', customerId: 'customer_001',
  customerNameMasked: '김*객', phoneMasked: '010-****-1234', employeeId: 'employee_001', employeeName: '테스트 직원',
  source: 'AI', reservedAt: at, visitAt: at, purpose: '예약 목적', status: '예약 확정', privacyConsent: true, summaryStatus: 'available', summaryPreview: '저장된 요약' };
const consultation: StoredConsultation = { id: 'consultation_001', customerId: 'customer_001', storeId: 'store_005', callId: 'call_fixture_001',
  purpose: '상담 목적', status: '완료', startedAt: at, endedAt: at, summaryStatus: 'available', summaryPreview: '저장된 요약',
  usedAi: true, usedPhone: false, usedVisit: false, risks: [{ id: 'risk_001', stage: 'AI', score: 4, level: '주의', createdAt: at }] };
const customer: StoredCustomer = { id: 'customer_001', nameMasked: '김*객', phoneMasked: '010-****-1234', latestConsultationId: 'consultation_001',
  latestConsultationAt: at, latestPurpose: '최근 목적', latestStatus: '완료', privacyConsent: true, currentProduct: null, currentPlan: null };
const wrap = (items: unknown) => ({ source: 'supabase', readOnly: true, items });
const briefing = (over: Record<string, unknown> = {}) => ({ source: 'supabase', readOnly: true, reservation,
  summaryStatus: 'available', summary: '저장된 전체 요약', checklist: ['예약 사실 확인'], history: [consultation],
  currentProduct: null, currentPlan: null, requestNote: null, desiredProduct: null, desiredDevice: null,
  desiredProductStatus: 'not_recorded', desiredDeviceStatus: 'not_recorded', ...over });
const invalid = (error: unknown) => { assert.ok(error instanceof RealDataApiError); assert.equal(error.code, 'INVALID_RESPONSE'); return true; };

test('저장 자료: ISO 시간은 유효한 날짜·시각·시간대만 허용하고 한국 시간으로 표시한다', () => {
  for (const value of [at, '2024-02-29T00:00:00Z', '2026-10-06T00:00:00.123456+00:00']) assert.equal(validRealDataTimestamp(value), true, value);
  for (const value of ['2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-00-01T00:00:00Z', '2026-01-00T00:00:00Z',
    '2026-10-06T24:00:00Z', '2026-10-06T00:60:00Z', '2026-10-06T00:00:60Z', '2026-10-06T00:00:00+24:00',
    '2026-10-06T00:00:00+09:60', '2026-10-06', '2026-10-06T00:00:00', 'not a date', '', null, 0]) assert.equal(validRealDataTimestamp(value), false, String(value));
  assert.match(formatRealDataDate('2026-10-06T00:00:00Z'), /09:00/);
  assert.equal(formatRealDataDate(null), '미확인');
});

test('저장 예약: 취소·노쇼 등 실제 네 가지 상태를 그대로 유지한다', () => {
  for (const status of ['예약 확정', '방문 완료', '취소', '노쇼']) {
    const result = parseRealAppointments(wrap([{ ...reservation, status }]));
    assert.equal(result.items[0].status, status); assert.equal(result.source, 'supabase'); assert.equal(result.readOnly, true);
  }
  for (const status of ['reserved', 'completed', 'toString', '__proto__', 'constructor']) assert.throws(() => parseRealAppointments(wrap([{ ...reservation, status }])), invalid);
});

test('저장 자료: 성공 응답의 envelope·배열·중복 ID·연결 ID를 확인한다', () => {
  for (const body of [null, {}, [], { source: 'mock', readOnly: true, items: [] }, { source: 'supabase', readOnly: false, items: [] }, wrap(null), wrap([{}]), wrap([reservation, reservation])]) assert.throws(() => parseRealAppointments(body), invalid);
  for (const over of [{ id: '' }, { consultationId: 'reservation_001' }, { customerId: null }, { employeeId: 'wrong' }, { storeId: 'store_abc' }, { source: '__proto__' }, { visitAt: '2026-02-30T10:00:00Z' }]) assert.throws(() => parseRealAppointments(wrap([{ ...reservation, ...over }])), invalid);
  assert.deepEqual(parseRealAppointments(wrap([])).items, []);
});

test('저장 자료: 원문 이름·연락처·전문 등 추가 필드는 보관하지 않고 표시 문자열은 임의 변환하지 않는다', () => {
  const exact = '<img src=x> 데모점 (예시) 고객이 입력한 문자열';
  const result = parseRealAppointments(wrap([{ ...reservation, summaryPreview: exact, name: 'private_fixture_name', phone: 'private_fixture_phone', ai_transcription: 'private_fixture_transcript' }]));
  assert.equal(result.items[0].summaryPreview, exact);
  assert.equal(Object.hasOwn(result.items[0], 'name'), false); assert.equal(Object.hasOwn(result.items[0], 'phone'), false); assert.equal(Object.hasOwn(result.items[0], 'ai_transcription'), false);
  const customers = parseStoredCustomers(wrap([{ ...customer, name: 'private_fixture_name', phone: 'private_fixture_phone' }]));
  assert.deepEqual(customers.items, [customer]);
});

test('저장 고객: 최신 상담 ID·상태·날짜를 검증하고 없는 이력을 만들어 채우지 않는다', () => {
  assert.deepEqual(parseStoredCustomers(wrap([customer])).items, [customer]);
  assert.deepEqual(parseStoredCustomers(wrap([])).items, []);
  for (const over of [{ nameMasked: null }, { latestConsultationId: null }, { latestConsultationAt: 'invalid' }, { latestPurpose: {} }, { latestStatus: '__proto__' }]) assert.throws(() => parseStoredCustomers(wrap([{ ...customer, ...over }])), invalid);
});

test('저장 고객: 현재 이용 요금제·상품은 저장된 ID·숫자 계약으로 조회하고 미동의 고객에게 노출하지 않는다', () => {
  const currentPlan = { id: 'own_plan_001', name: '저장 요금제', monthlyFee: 45000 };
  const currentProduct = { id: 'product_001', name: '저장 상품', maker: 'Samsung', storageGb: 256, color: '블랙' };
  const result = parseStoredCustomers(wrap([{ ...customer, currentPlan, currentProduct }]));
  assert.deepEqual(result.items[0].currentPlan, currentPlan); assert.deepEqual(result.items[0].currentProduct, currentProduct);
  for (const monthlyFee of ['45000', -1, 1.5, Number.NaN]) assert.throws(() => parseStoredCustomers(wrap([{ ...customer, currentPlan: { ...currentPlan, monthlyFee } }])), invalid);
  assert.throws(() => parseStoredCustomers(wrap([{ ...customer, currentProduct: { ...currentProduct, storageGb: 0 } }])), invalid);
  const hidden = { ...customer, privacyConsent: false, nameMasked: '비공개 고객', phoneMasked: '연락처 비공개', latestPurpose: '개인정보 동의 확인 필요' };
  assert.throws(() => parseStoredCustomers(wrap([{ ...hidden, currentPlan }])), invalid);
  assert.throws(() => parseStoredCustomers(wrap([{ ...hidden, currentProduct }])), invalid);
});

test('저장 상담: 점수는 통화·단계별 저장 0~99 정수이며 숫자 문자열이나 비정상 수량을 거절한다', () => {
  for (const score of [0, 4, 99]) assert.equal(parseStoredConsultations(wrap([{ ...consultation, risks: [{ ...consultation.risks[0], score }] }])).items[0].risks[0].score, score);
  for (const score of [-1, 100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '4', null]) assert.throws(() => parseStoredConsultations(wrap([{ ...consultation, risks: [{ ...consultation.risks[0], score }] }])), invalid);
  for (const over of [{ stage: 'toString' }, { level: '__proto__' }, { createdAt: '2026-04-31T00:00:00Z' }, { id: '' }]) assert.throws(() => parseStoredConsultations(wrap([{ ...consultation, risks: [{ ...consultation.risks[0], ...over }] }])), invalid);
  assert.throws(() => parseStoredConsultations(wrap([{ ...consultation, risks: [...consultation.risks, ...consultation.risks] }])), invalid);
});

test('저장 상담: 선택한 고객과 다른 고객의 응답은 거절하고 nullable 종료·통화 ID는 그대로 둔다', () => {
  const noEnd = { ...consultation, endedAt: null, callId: null, summaryStatus: 'missing', summaryPreview: null, risks: [] };
  assert.equal(parseStoredConsultations(wrap([noEnd]), 'customer_001').items[0].endedAt, null);
  assert.throws(() => parseStoredConsultations(wrap([consultation]), 'customer_002'), invalid);
  for (const over of [{ endedAt: 'invalid' }, { startedAt: null }, { usedAi: 'true' }, { risks: null }, { callId: {} }]) assert.throws(() => parseStoredConsultations(wrap([{ ...consultation, ...over }])), invalid);
});

test('저장 요약: available에는 내용이 필요하고 missing은 null이며 즉석 요약으로 대체하지 않는다', () => {
  assert.equal(parseRealBriefing(briefing({ summaryStatus: 'missing', summary: null, history: [] })).summary, null);
  for (const over of [{ summaryStatus: 'available', summary: null }, { summary: '   ' }, { summaryStatus: 'missing', summary: '만든 요약' }, { summaryStatus: 'toString' }, { checklist: [{}] }, { history: null }]) assert.throws(() => parseRealBriefing(briefing(over)), invalid);
  for (const over of [{ summaryStatus: 'missing', summaryPreview: '내용' }, { summaryStatus: 'available', summaryPreview: null }]) assert.throws(() => parseRealAppointments(wrap([{ ...reservation, ...over }])), invalid);
});

test('저장 브리핑: 요청 예약과 같은 고객의 이력만 수용하고 원문 전문은 투영하지 않는다', () => {
  const result = parseRealBriefing(briefing({ transcript: 'private_fixture_transcript' }), 'reservation_001');
  assert.equal(result.reservation.id, 'reservation_001'); assert.equal(Object.hasOwn(result, 'transcript'), false);
  assert.throws(() => parseRealBriefing(briefing(), 'reservation_002'), invalid);
  assert.throws(() => parseRealBriefing(briefing({ history: [{ ...consultation, customerId: 'customer_002' }] })), invalid);
});

test('저장 자료: 설정 없는 상태는 명시적으로 구분하고 알 수 없는 설정 오류 원문은 거절한다', () => {
  const status = { source: 'supabase', readOnly: true, configured: false, scopeConfigured: false, errorCode: 'REAL_DATA_NOT_CONFIGURED' };
  assert.equal(parseRealDataStatus(status).configured, false);
  assert.equal(parseRealDataStatus({ ...status, configured: true, scopeConfigured: true, errorCode: null }).errorCode, null);
  for (const over of [{ configured: 'false' }, { scopeConfigured: null }, { errorCode: 'https://fixture.invalid/?token=private_fixture' }, { errorCode: '__proto__' }]) assert.throws(() => parseRealDataStatus({ ...status, ...over }), invalid);
  assert.equal(realDataAvailability(new RealDataApiError('REAL_DATA_NOT_CONFIGURED')), 'unconfigured');
  for (const code of ['REAL_DATA_UNAVAILABLE', 'HOME_STORE_NOT_CONFIGURED', 'REAL_DATA_ACCESS_DENIED', 'NETWORK', 'UNKNOWN_ERROR']) assert.equal(realDataAvailability(new RealDataApiError(code)), 'error');
});

test('저장 자료: 알 수 없는 오류·URL·토큰·객체 상속 속성은 표시 오류에 남기지 않는다', () => {
  for (const raw of ['https://fixture.invalid/?token=private_fixture', 'Bearer private_fixture', '<script>private_fixture</script>', 'toString', '__proto__', 'constructor', null, {}]) {
    const error = new RealDataApiError(raw); assert.equal(error.code, 'UNKNOWN_ERROR'); assert.equal(error.message, 'UNKNOWN_ERROR');
    assert.equal(realDataErrorCode(raw), 'UNKNOWN_ERROR'); assert.doesNotMatch(realDataErrorMessage(raw), /private_fixture|https?:|Bearer|<script>|toString|__proto__|constructor/);
  }
  assert.match(realDataErrorMessage('REAL_DATA_TIMEOUT'), /지연/);
});

test('저장 자료: 동의 없는 고객은 비공개 투영과 restricted·빈 이력만 허용한다', () => {
  const restricted = { ...reservation, privacyConsent: false, customerNameMasked: '비공개 고객', phoneMasked: '연락처 비공개', purpose: '개인정보 동의 확인 필요', summaryStatus: 'restricted', summaryPreview: null };
  const restrictedCustomer = { ...customer, privacyConsent: false, nameMasked: '비공개 고객', phoneMasked: '연락처 비공개', latestPurpose: '개인정보 동의 확인 필요' };
  assert.equal(parseRealAppointments(wrap([restricted])).items[0].summaryStatus, 'restricted');
  assert.equal(parseStoredCustomers(wrap([restrictedCustomer])).items[0].privacyConsent, false);
  const body = briefing({ reservation: restricted, summaryStatus: 'restricted', summary: null, history: [] });
  assert.deepEqual(parseRealBriefing(body).history, []);
  for (const over of [{ customerNameMasked: '김*객' }, { phoneMasked: '010-****-1234' }, { purpose: 'private_fixture_purpose' }, { summaryStatus: 'missing' }, { summaryPreview: 'private_fixture_summary' }]) assert.throws(() => parseRealAppointments(wrap([{ ...restricted, ...over }])), invalid);
  assert.throws(() => parseStoredCustomers(wrap([{ ...restrictedCustomer, latestPurpose: 'private_fixture_purpose' }])), invalid);
  assert.throws(() => parseRealBriefing({ ...body, history: [consultation] }), invalid);
  assert.throws(() => parseRealBriefing({ ...body, summary: 'private_fixture_summary' }), invalid);
  assert.throws(() => parseRealBriefing({ ...body, requestNote: 'private_fixture_note' }), invalid);
  assert.match(realDataErrorMessage('CUSTOMER_PRIVACY_RESTRICTED'), /개인정보 동의/);
});

test('저장 브리핑: 현재 상품·요금제의 실제 숫자와 요청 원문 표시값만 수용하고 희망 상품을 추정하지 않는다', () => {
  const currentProduct = { id: 'product_001', name: '테스트 상품', maker: 'Samsung', storageGb: 256, color: '블랙' };
  const currentPlan = { id: 'own_plan_001', name: '테스트 요금제', monthlyFee: 0 };
  const requestNote = '고객 표시 문자열 (예시) 데모점 <img src=x>';
  const result = parseRealBriefing(briefing({ currentProduct, currentPlan, requestNote }));
  assert.deepEqual(result.currentProduct, currentProduct); assert.deepEqual(result.currentPlan, currentPlan); assert.equal(result.requestNote, requestNote);
  assert.equal(result.desiredProduct, null); assert.equal(result.desiredDevice, null); assert.equal(result.desiredDeviceStatus, 'not_recorded');
  for (const storageGb of [0, -1, 1.5, '256', Number.NaN]) assert.throws(() => parseRealBriefing(briefing({ currentProduct: { ...currentProduct, storageGb } })), invalid);
  for (const monthlyFee of [-1, 0.5, '0', Number.POSITIVE_INFINITY]) assert.throws(() => parseRealBriefing(briefing({ currentPlan: { ...currentPlan, monthlyFee } })), invalid);
  for (const over of [{ currentProduct: {} }, { currentPlan: {} }, { requestNote: {} }, { desiredProduct: currentProduct }, { desiredDeviceStatus: 'inferred' }]) assert.throws(() => parseRealBriefing(briefing(over)), invalid);
});

test('저장 자료 API: 모든 조회는 서버 상대 GET이고 signal·요청 고객 범위를 유지한다', async () => {
  const original = globalThis.fetch; const requests: { path: string; init?: RequestInit }[] = []; const controller = new AbortController();
  try {
    globalThis.fetch = async (input, init) => {
      const path = String(input); requests.push({ path, init });
      const body = path === '/api/data/status' ? { source: 'supabase', readOnly: true, configured: true, scopeConfigured: true, errorCode: null }
        : path === '/api/data/appointments' ? wrap([reservation]) : path === '/api/data/customers' ? wrap([customer])
        : path.startsWith('/api/briefings/') ? briefing() : wrap([consultation]);
      return new Response(JSON.stringify(body), { status: 200 });
    };
    await realDataApi.status(controller.signal); await realDataApi.appointments(controller.signal); await realDataApi.customers(controller.signal);
    await realDataApi.customerConsultations('customer_001', 5, controller.signal); await realDataApi.briefing('reservation_001', controller.signal);
    assert.deepEqual(requests.map(row => row.path), ['/api/data/status', '/api/data/appointments', '/api/data/customers', '/api/data/customers/customer_001/consultations?limit=5', '/api/briefings/reservation_001']);
    assert.ok(requests.every(row => row.init?.method === 'GET' && row.init.signal === controller.signal && row.init.body === undefined));
  } finally { globalThis.fetch = original; }
});

test('저장 자료 API: 잘못된 고객·예약 ID나 숫자 범위는 요청 전에 실패한다', async () => {
  const original = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response('{}'); };
    for (const id of ['', '../customer_001', 'customer_001?token=private_fixture', '__proto__']) await assert.rejects(realDataApi.customerConsultations(id), error => error instanceof RealDataApiError && error.code === 'INVALID_CUSTOMER_ID');
    for (const id of ['', '../reservation_001', 'toString']) await assert.rejects(realDataApi.briefing(id), error => error instanceof RealDataApiError && error.code === 'INVALID_RESERVATION_ID');
    for (const limit of [0, -1, 21, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) await assert.rejects(realDataApi.customerConsultations('customer_001', limit), error => error instanceof RealDataApiError && error.code === 'INVALID_LIMIT');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('저장 자료 API: 잘못된 성공 JSON·HTML·타 고객 응답은 안전한 실패로 처리한다', async () => {
  const original = globalThis.fetch;
  try {
    for (const body of [null, {}, [], wrap([{}])]) {
      globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
      await assert.rejects(realDataApi.appointments(), invalid); await assert.rejects(realDataApi.customers(), invalid);
    }
    globalThis.fetch = async () => new Response('<html>private_fixture</html>', { status: 200 });
    await assert.rejects(realDataApi.appointments(), invalid);
    globalThis.fetch = async () => new Response(JSON.stringify(wrap([{ ...consultation, customerId: 'customer_002' }])), { status: 200 });
    await assert.rejects(realDataApi.customerConsultations('customer_001'), invalid);
  } finally { globalThis.fetch = original; }
});

test('저장 자료 API: 실패 원문은 노출하지 않고 서비스 장애를 설정 없음으로 오인하지 않는다', async () => {
  const original = globalThis.fetch;
  try {
    for (const code of ['REAL_DATA_NOT_CONFIGURED', 'REAL_DATA_UNAVAILABLE', 'REAL_DATA_ACCESS_DENIED', 'private_fixture_token', '__proto__']) {
      globalThis.fetch = async () => new Response(JSON.stringify({ errorCode: code, details: 'private_fixture_secret' }), { status: 503 });
      await assert.rejects(realDataApi.appointments(), error => {
        assert.ok(error instanceof RealDataApiError); const expected = realDataErrorCode(code); assert.equal(error.code, expected); assert.equal(error.message, expected);
        assert.equal(realDataAvailability(error), code === 'REAL_DATA_NOT_CONFIGURED' ? 'unconfigured' : 'error'); return true;
      });
    }
    globalThis.fetch = async () => { throw new Error('private_fixture_secret'); };
    await assert.rejects(realDataApi.appointments(), error => error instanceof RealDataApiError && error.code === 'NETWORK' && error.message === 'NETWORK');
  } finally { globalThis.fetch = original; }
});

test('저장 자료 API: 공개 직원 조회 제한은 명시적으로 안내하고 비밀 응답·참고 자료로 대체하지 않는다', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ errorCode: 'REAL_DATA_ACCESS_RESTRICTED', details: 'https://fixture.invalid/?token=private_fixture' }), { status: 503 });
    await assert.rejects(realDataApi.customers(), error => {
      assert.ok(error instanceof RealDataApiError); assert.equal(error.code, 'REAL_DATA_ACCESS_RESTRICTED'); assert.equal(realDataAvailability(error), 'error');
      const notice = realDataErrorMessage(error.code); assert.match(notice, /직원 조회 접근 설정/); assert.match(notice, /관리자/); assert.doesNotMatch(notice, /private_fixture|https?:|token=/); return true;
    });
  } finally { globalThis.fetch = original; }
});
