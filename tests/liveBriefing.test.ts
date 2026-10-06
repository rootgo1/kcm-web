import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveBriefingController, fetchLiveBriefing, liveBriefingErrorCode, liveBriefingErrorMessage,
  LiveBriefingApiError, parseLiveBriefing, type LiveBriefing, type LiveBriefingState } from '../src/services/liveBriefingApi.js';
import { confirmedBriefingNarrative, isLegacyBriefingPlaceholder } from '../src/lib/briefingNarrative.js';

// Synthetic contracts and mocked GETs only; no database, external API or real customer records.
const at = '2026-10-06T09:00:00+09:00';
const fixture = (over: Record<string, unknown> = {}) => ({ source: 'supabase', readOnly: true,
  customer: { id: 'customer_001', nameMasked: '김*객' }, privacyConsent: true,
  currentProduct: { id: 'product_001', name: '저장 상품', maker: '제조사', storageGb: 256, color: '블랙' },
  currentPlan: { id: 'own_plan_001', name: '저장 요금제', monthlyFee: 45000 },
  recentConsultation: { id: 'consultation_001', purpose: '저장 목적', summary: '저장된 상담 요약', endedAt: at },
  previousRisk: { id: 'risk_001', score: 60, level: '위험', stage: 'AI', createdAt: at,
    profanityCount: 2, threatCount: 2, blameCount: 0, sexualCount: 0, shoutingCount: 1 },
  guidance: ['이전 문의 내용을 확인해 주세요.', '현재 통화 위험 신호를 확인해 주세요.'], ...over });
const safeError = (code: string) => (error: unknown) => {
  assert.ok(error instanceof LiveBriefingApiError); assert.equal(error.code, code); return true;
};
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('통화 브리핑: 저장 상품·요금제·완료 상담·이전 위험을 그대로 보존한다', () => {
  const data = parseLiveBriefing(fixture());
  assert.deepEqual(data, fixture());
  assert.equal(data.previousRisk?.score, 60); assert.equal(data.previousRisk?.threatCount, 2);
});

test('통화 브리핑: 요약과 목적 부재는 null이며 임의 상담 요약을 만들지 않는다', () => {
  const data = parseLiveBriefing(fixture({ recentConsultation: { id: 'consultation_001', purpose: null, summary: null, endedAt: at } }));
  assert.equal(data.recentConsultation?.summary, null); assert.equal(data.recentConsultation?.purpose, null);
});

test('통화 브리핑 서술: 알려진 두 저장 안내와 NFC·공백 변형만 placeholder로 판별한다', () => {
  for (const exact of ['KCM AI 상담 DB 저장 테스트', 'KCM AI 상담 연동 테스트 종료']) {
    for (const value of [exact, ` \t${exact}\n `, exact.replaceAll(' ', '  \t\n'), exact.normalize('NFD')]) {
      assert.equal(isLegacyBriefingPlaceholder(value), true);
      assert.equal(confirmedBriefingNarrative(value), null);
    }
  }
  assert.equal(confirmedBriefingNarrative(null), null);
  for (const value of [undefined, null, false, 1, {}, []]) assert.equal(isLegacyBriefingPlaceholder(value), false);
});

test('통화 브리핑 서술: 정상 요약·인용·유사 표현·일반 테스트 단어는 원문 그대로 보존한다', () => {
  for (const value of ['청구 요금 확인 후 다음 주 다시 안내하기로 했습니다.', '“KCM AI 상담 DB 저장 테스트”',
    '고객이 "KCM AI 상담 연동 테스트 종료" 문구에 관해 문의했습니다.', 'KCM AI 상담 DB 저장 테스트 결과 확인',
    'KCM AI 상담 연동 테스트 종료 요청', '요금제 테스트 이용 문의', 'kcm AI 상담 DB 저장 테스트',
    '  고객이 요청한 테스트 안내\n  후속 연락 필요  ']) {
    assert.equal(isLegacyBriefingPlaceholder(value), false);
    assert.equal(confirmedBriefingNarrative(value), value);
  }
});

test('통화 브리핑: 저장 안내는 nullable 서술로만 투영하며 원본 DTO·상담·60점 위험 기록을 변경하지 않는다', () => {
  for (const [purpose, summary, expectedPurpose, expectedSummary] of [
    ['KCM AI 상담 DB 저장 테스트', 'KCM AI 상담 연동 테스트 종료', null, null],
    [' \tKCM  AI\n상담 DB 저장 테스트 ', '요금 차이를 확인한 상담입니다.', null, '요금 차이를 확인한 상담입니다.'],
    ['요금 확인', 'KCM AI 상담 연동 테스트 종료'.normalize('NFD'), '요금 확인', null],
  ]) {
    const original = fixture({ recentConsultation: { ...fixture().recentConsultation, purpose, summary } });
    const untouched = structuredClone(original);
    const data = parseLiveBriefing(original);
    assert.deepEqual(original, untouched);
    assert.deepEqual(data.recentConsultation, { ...untouched.recentConsultation, purpose: expectedPurpose, summary: expectedSummary });
    assert.deepEqual(data.previousRisk, untouched.previousRisk);
    assert.equal(data.previousRisk?.score, 60); assert.equal(data.previousRisk?.level, '위험');
    assert.deepEqual(Object.keys(data).sort(), Object.keys(untouched).sort());
    assert.deepEqual(data.customer, untouched.customer); assert.deepEqual(data.currentProduct, untouched.currentProduct);
    assert.deepEqual(data.currentPlan, untouched.currentPlan); assert.deepEqual(data.guidance, untouched.guidance);
  }
});

test('통화 브리핑: 정상 상담 서술에 포함된 저장 안내 인용과 공백을 파싱 중 변경하지 않는다', () => {
  const purpose = 'KCM AI 상담 DB 저장 테스트 관련 안내 문의';
  const summary = '  고객이 “KCM AI 상담 연동 테스트 종료” 표시를 문의했습니다.\n확인 후 재안내합니다.  ';
  const original = fixture({ recentConsultation: { ...fixture().recentConsultation, purpose, summary } });
  assert.deepEqual(parseLiveBriefing(original), original);
});

test('통화 브리핑: 이전 상담·위험·현재 이용 정보가 없는 상태를 0으로 채우지 않는다', () => {
  const data = parseLiveBriefing(fixture({ currentProduct: null, currentPlan: null, recentConsultation: null, previousRisk: null }));
  assert.equal(data.recentConsultation, null); assert.equal(data.previousRisk, null); assert.equal(data.currentProduct, null); assert.equal(data.currentPlan, null);
});

test('통화 브리핑: 이전 상담은 있어도 위험 기록이 없는 상태를 허용한다', () => {
  const data = parseLiveBriefing(fixture({ previousRisk: null }));
  assert.ok(data.recentConsultation); assert.equal(data.previousRisk, null);
});

test('통화 브리핑: 미동의는 비공개 고객과 안내 하나만 허용하며 상세 정보는 모두 null이다', () => {
  const hidden = fixture({ customer: { id: 'customer_001', nameMasked: '비공개 고객' }, privacyConsent: false,
    currentProduct: null, currentPlan: null, recentConsultation: null, previousRisk: null, guidance: ['고객 개인정보 동의 확인이 필요합니다.'] });
  assert.deepEqual(parseLiveBriefing(hidden), hidden);
  for (const key of ['currentProduct', 'currentPlan', 'recentConsultation', 'previousRisk'] as const) {
    assert.throws(() => parseLiveBriefing({ ...hidden, [key]: fixture()[key] }), safeError('INVALID_RESPONSE'));
  }
  assert.throws(() => parseLiveBriefing({ ...hidden, customer: { id: 'customer_001', nameMasked: '김*객' } }), safeError('INVALID_RESPONSE'));
});

test('통화 브리핑: 동의 필드가 없거나 잘못된 형식이면 상세 자료를 수용하지 않는다', () => {
  for (const privacyConsent of [undefined, null, 'true', 1]) assert.throws(() => parseLiveBriefing(fixture({ privacyConsent })), safeError('INVALID_RESPONSE'));
});

test('통화 브리핑: 원문 신원·전화·생일·전문·비밀 추가 필드는 화면 상태에서 제거한다', () => {
  const original = fixture();
  const data = parseLiveBriefing({ ...original, phone: 'private-phone', birthday: 'private-birth', secret: 'private-secret',
    customer: { ...original.customer, name: 'private-name', phone: 'private-phone' },
    recentConsultation: { ...original.recentConsultation, transcript: 'private-transcript' },
    previousRisk: { ...original.previousRisk, raw_response: 'private-response' },
    currentProduct: { ...original.currentProduct, privateField: 'private-field' }, currentPlan: { ...original.currentPlan, secret: 'private-secret' } });
  assert.deepEqual(data, original); assert.doesNotMatch(JSON.stringify(data), /private-/);
});

test('통화 브리핑: 저장 자유서술은 HTML 실행이나 임의 치환 없이 실제 문자열로 보존한다', () => {
  const exact = '<img src=x> 고객이 기록한 문자열 (예시)';
  const data = parseLiveBriefing(fixture({ recentConsultation: { ...fixture().recentConsultation, summary: exact } }));
  assert.equal(data.recentConsultation?.summary, exact);
});

test('통화 브리핑: 위험 횟수 null과 실제 0은 서로 다른 값으로 유지한다', () => {
  const data = parseLiveBriefing(fixture({ previousRisk: { ...fixture().previousRisk, profanityCount: null, shoutingCount: null } }));
  assert.equal(data.previousRisk?.profanityCount, null); assert.equal(data.previousRisk?.shoutingCount, null); assert.equal(data.previousRisk?.blameCount, 0);
});

test('통화 브리핑: score·5counts는 안전한 정수 범위로 검증한다', () => {
  for (const score of [-1, 100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '60', null]) {
    assert.throws(() => parseLiveBriefing(fixture({ previousRisk: { ...fixture().previousRisk, score } })), safeError('INVALID_RESPONSE'));
  }
  for (const key of ['profanityCount', 'threatCount', 'blameCount', 'sexualCount', 'shoutingCount']) {
    for (const count of [-1, 0.5, '2', undefined, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => parseLiveBriefing(fixture({ previousRisk: { ...fixture().previousRisk, [key]: count } })), safeError('INVALID_RESPONSE'));
    }
  }
});

test('통화 브리핑: 저장 stage와 등급을 그대로 쓰며 현재 위험과 합산하지 않는다', () => {
  for (const stage of ['AI', 'PHONE', 'VISIT']) assert.equal(parseLiveBriefing(fixture({ previousRisk: { ...fixture().previousRisk, stage } })).previousRisk?.stage, stage);
  for (const level of ['정상', '주의', '경계', '위험', '매우 위험']) assert.equal(parseLiveBriefing(fixture({ previousRisk: { ...fixture().previousRisk, level } })).previousRisk?.level, level);
  for (const over of [{ stage: '__proto__' }, { level: 'constructor' }, { id: 'consultation_001' }, { createdAt: '2026-02-30T09:00:00Z' }]) {
    assert.throws(() => parseLiveBriefing(fixture({ previousRisk: { ...fixture().previousRisk, ...over } })), safeError('INVALID_RESPONSE'));
  }
  assert.throws(() => parseLiveBriefing(fixture({ recentConsultation: null })), safeError('INVALID_RESPONSE'));
});

test('통화 브리핑: 완료 종료시각·상담 ID·nullable 서술을 검증한다', () => {
  for (const over of [{ id: 'risk_001' }, { endedAt: null }, { endedAt: '2026-04-31T00:00:00Z' }, { purpose: {} }, { summary: '' }]) {
    assert.throws(() => parseLiveBriefing(fixture({ recentConsultation: { ...fixture().recentConsultation, ...over } })), safeError('INVALID_RESPONSE'));
  }
});

test('통화 브리핑: 상품·요금제 ID와 금액·용량을 검증하고 실제 무료 요금제는 허용한다', () => {
  assert.equal(parseLiveBriefing(fixture({ currentPlan: { ...fixture().currentPlan, monthlyFee: 0 } })).currentPlan?.monthlyFee, 0);
  for (const over of [{ storageGb: 0 }, { storageGb: 0.5 }, { id: 'customer_001' }]) assert.throws(() => parseLiveBriefing(fixture({ currentProduct: { ...fixture().currentProduct, ...over } })), safeError('INVALID_RESPONSE'));
  for (const monthlyFee of [-1, '45000', 0.5]) assert.throws(() => parseLiveBriefing(fixture({ currentPlan: { ...fixture().currentPlan, monthlyFee } })), safeError('INVALID_RESPONSE'));
});

test('통화 브리핑: 성공 envelope와 짧은 안내 2~4개를 검증한다', () => {
  for (const body of [null, [], {}, fixture({ source: 'mock' }), fixture({ readOnly: false }), fixture({ guidance: [] }), fixture({ guidance: ['하나'] }),
    fixture({ guidance: ['1', '2', '3', '4', '5'] }), fixture({ guidance: ['1', ''] })]) assert.throws(() => parseLiveBriefing(body), safeError('INVALID_RESPONSE'));
});

test('통화 브리핑 GET: 고객·통화 경로와 GET만 사용하며 추가 인증·개인정보를 전달하지 않는다', async t => {
  const requests: { path: string; init: RequestInit | undefined }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => { requests.push({ path, init }); return Response.json(fixture()); });
  assert.deepEqual(await fetchLiveBriefing('customer_001', 'call_fixture-001'), fixture());
  assert.equal(requests.length, 1); assert.equal(requests[0].path, '/api/live-briefing/customer_001?call_id=call_fixture-001');
  assert.equal(requests[0].init?.method, 'GET'); assert.equal(requests[0].init?.body, undefined); assert.deepEqual(requests[0].init?.headers, { Accept: 'application/json' });
});

test('통화 브리핑 GET: 잘못된 고객·통화 ID는 fetch 전에 거절한다', async t => {
  let count = 0; t.mock.method(globalThis, 'fetch', async () => { ++count; return Response.json(fixture()); });
  await assert.rejects(fetchLiveBriefing('invalid', 'call_fixture'), safeError('INVALID_CUSTOMER_ID'));
  for (const callId of ['', '../call', 'call with space', 'x'.repeat(129)]) await assert.rejects(fetchLiveBriefing('customer_001', callId), safeError('INVALID_CALL_ID'));
  assert.equal(count, 0);
});

test('통화 브리핑 GET: 다른 고객 응답은 표시하지 않는다', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(fixture({ customer: { id: 'customer_002', nameMasked: '이*객' } })));
  await assert.rejects(fetchLiveBriefing('customer_001', 'call_fixture'), safeError('INVALID_RESPONSE'));
});

test('통화 브리핑 GET: API 500은 고정 오류 코드만 남기며 원문 오류를 버린다', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ errorCode: 'REAL_DATA_UNAVAILABLE', message: 'private-upstream-url-and-secret' }, { status: 500 }));
  await assert.rejects(fetchLiveBriefing('customer_001', 'call_fixture'), error => {
    assert.ok(safeError('REAL_DATA_UNAVAILABLE')(error)); assert.doesNotMatch(String(error), /private-/); return true;
  });
});

test('통화 브리핑 GET: 공개 접근 거절은 서버 고정 코드를 표시하고 브라우저 allowlist를 만들지 않는다', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ errorCode: 'REAL_DATA_ACCESS_RESTRICTED' }, { status: 403 }));
  await assert.rejects(fetchLiveBriefing('customer_002', 'call_fixture'), safeError('REAL_DATA_ACCESS_RESTRICTED'));
});

test('통화 브리핑 GET: timeout은 fetch를 abort하고 늦은 응답을 수용하지 않는다', async t => {
  let signal: AbortSignal | undefined;
  const response = deferred<Response>();
  t.mock.method(globalThis, 'fetch', (_path: string, init?: RequestInit) => { signal = init?.signal as AbortSignal; return response.promise; });
  await assert.rejects(fetchLiveBriefing('customer_001', 'call_fixture', undefined, 5), safeError('REAL_DATA_TIMEOUT'));
  assert.equal(signal?.aborted, true); response.resolve(Response.json(fixture())); await tick();
});

test('통화 브리핑 GET: 네트워크·비JSON·알 수 없는 오류는 원문 없는 안전한 오류다', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('private-host-credential'); });
  await assert.rejects(fetchLiveBriefing('customer_001', 'call_fixture'), safeError('NETWORK'));
  mock.mock.mockImplementation(async () => new Response('private-html', { status: 502 }));
  await assert.rejects(fetchLiveBriefing('customer_001', 'call_fixture'), safeError('INVALID_RESPONSE'));
  mock.mock.mockImplementation(async () => Response.json({ errorCode: 'private-secret' }, { status: 500 }));
  await assert.rejects(fetchLiveBriefing('customer_001', 'call_fixture'), safeError('UNKNOWN_ERROR'));
  for (const code of ['private-secret', '__proto__', 'constructor', null]) {
    assert.equal(liveBriefingErrorCode(code), 'UNKNOWN_ERROR'); assert.doesNotMatch(liveBriefingErrorMessage(code), /private-|constructor|__proto__/);
  }
});

test('통화 브리핑 controller: null 고객은 조회하지 않고 고객 확인 이후 한 번 조회한다', async () => {
  let count = 0; const states: LiveBriefingState[] = [];
  const controller = createLiveBriefingController(state => states.push(state), async () => { ++count; return parseLiveBriefing(fixture()); });
  controller.select('call_001', null); await tick(); assert.equal(count, 0); assert.equal(states.at(-1)?.status, 'missing-customer');
  controller.select('call_001', 'customer_001'); await tick(); assert.equal(count, 1); assert.equal(states.at(-1)?.status, 'ready'); controller.dispose();
});

test('통화 브리핑 controller: 동일 통화 transcript 10회 변경은 재조회하지 않으며 수동 조회만 추가한다', async () => {
  let count = 0; const states: LiveBriefingState[] = [];
  const controller = createLiveBriefingController(state => states.push(state), async () => { ++count; return parseLiveBriefing(fixture()); });
  controller.select('call_001', 'customer_001'); await tick();
  for (let index = 0; index < 10; index++) controller.select('call_001', 'customer_001');
  await tick(); assert.equal(count, 1); controller.reload(); await tick(); assert.equal(count, 2); assert.equal(states.at(-1)?.status, 'ready'); controller.dispose();
});

test('통화 브리핑 controller: 20점 조회 이후 저장된 60점은 수동 재조회와 같은 고객의 새 통화에서만 최신 기록으로 표시한다', async () => {
  const earlier = parseLiveBriefing(fixture({ previousRisk: { ...fixture().previousRisk, score: 20, level: '주의', threatCount: 0 } }));
  const laterAt = '2026-10-06T09:02:00+09:00';
  const later = parseLiveBriefing(fixture({ recentConsultation: { ...fixture().recentConsultation, id: 'consultation_002', endedAt: laterAt },
    previousRisk: { ...fixture().previousRisk, id: 'risk_002', createdAt: laterAt } }));
  let stored = earlier;
  const requests: { customerId: string; callId: string }[] = [], states: LiveBriefingState[] = [];
  const controller = createLiveBriefingController(state => states.push(state), async (customerId, callId) => {
    requests.push({ customerId, callId }); return stored;
  });
  const ready = () => {
    const state = states.at(-1);
    assert.ok(state?.status === 'ready'); return state;
  };
  try {
    controller.select('call_before-save', 'customer_001'); await tick();
    assert.equal(ready().data.previousRisk?.score, 20);
    stored = later;
    for (let index = 0; index < 10; index++) controller.select('call_before-save', 'customer_001');
    await tick(); assert.equal(requests.length, 1); assert.strictEqual(ready().data, earlier);

    controller.reload(); assert.equal(states.at(-1)?.status, 'loading'); await tick();
    assert.equal(ready().callId, 'call_before-save'); assert.equal(ready().customerId, 'customer_001');
    assert.equal(ready().data.previousRisk?.score, 60); assert.equal(ready().data.previousRisk?.id, 'risk_002');
    assert.equal(ready().data.recentConsultation?.id, 'consultation_002');
    assert.equal(ready().data.recentConsultation?.endedAt, laterAt); assert.equal(ready().data.previousRisk?.createdAt, laterAt);

    controller.select('call_after-save', 'customer_001'); await tick();
    assert.equal(ready().callId, 'call_after-save'); assert.equal(ready().customerId, 'customer_001');
    assert.strictEqual(ready().data, later);
    assert.deepEqual(requests, [
      { customerId: 'customer_001', callId: 'call_before-save' },
      { customerId: 'customer_001', callId: 'call_before-save' },
      { customerId: 'customer_001', callId: 'call_after-save' },
    ]);
    assert.equal(earlier.previousRisk?.score, 20); assert.equal(earlier.previousRisk?.id, 'risk_001');
    assert.equal(earlier.recentConsultation?.id, 'consultation_001'); assert.equal(earlier.previousRisk?.createdAt, at);
    assert.ok(Date.parse(laterAt) > Date.parse(at));
  } finally { controller.dispose(); }
});

test('통화 브리핑 controller: 같은 고객의 다음 통화 컨트롤러는 이전 화면 상태와 독립적으로 최신 60점을 조회한다', async () => {
  const earlier = parseLiveBriefing(fixture({ previousRisk: { ...fixture().previousRisk, score: 20, level: '주의' } }));
  const later = parseLiveBriefing(fixture({ recentConsultation: { ...fixture().recentConsultation, id: 'consultation_002' },
    previousRisk: { ...fixture().previousRisk, id: 'risk_002' } }));
  const firstStates: LiveBriefingState[] = [], secondStates: LiveBriefingState[] = [];
  const requests: string[] = [];
  let stored = earlier;
  const load = async (customerId: string, callId: string) => { requests.push(`${customerId}/${callId}`); return stored; };
  const first = createLiveBriefingController(state => firstStates.push(state), load);
  const second = createLiveBriefingController(state => secondStates.push(state), load);
  try {
    first.select('call_previous', 'customer_001'); await tick();
    stored = later;
    second.select('call_next', 'customer_001'); await tick();
    const previous = firstStates.at(-1), next = secondStates.at(-1);
    assert.ok(previous?.status === 'ready'); assert.ok(next?.status === 'ready');
    assert.equal(previous.callId, 'call_previous'); assert.equal(previous.data.previousRisk?.score, 20);
    assert.equal(next.callId, 'call_next'); assert.equal(next.customerId, 'customer_001');
    assert.equal(next.data.previousRisk?.score, 60); assert.equal(next.data.previousRisk?.id, 'risk_002');
    assert.equal(next.data.recentConsultation?.id, 'consultation_002');
    assert.deepEqual(requests, ['customer_001/call_previous', 'customer_001/call_next']);
  } finally { first.dispose(); second.dispose(); }
});

test('통화 브리핑 controller: 새 통화·고객 변경은 각각 조회한다', async () => {
  const requests: string[] = [];
  const controller = createLiveBriefingController(() => {}, async (customerId, callId) => { requests.push(customerId + '/' + callId); return parseLiveBriefing(fixture()); });
  controller.select('call_001', 'customer_001'); await tick(); controller.select('call_002', 'customer_001'); await tick();
  controller.select('call_002', 'customer_002'); await tick(); assert.deepEqual(requests, ['customer_001/call_001', 'customer_001/call_002', 'customer_002/call_002']); controller.dispose();
});

test('통화 브리핑 controller: 이전 요청 abort와 generation으로 역순 도착 응답을 차단한다', async () => {
  const first = deferred<LiveBriefing>(), second = deferred<LiveBriefing>(); const states: LiveBriefingState[] = [], signals: AbortSignal[] = [];
  const controller = createLiveBriefingController(state => states.push(state), (_customer, callId, signal) => { signals.push(signal); return callId === 'call_001' ? first.promise : second.promise; });
  controller.select('call_001', 'customer_001'); await tick(); controller.select('call_002', 'customer_002'); await tick();
  assert.equal(signals[0].aborted, true);
  second.resolve(parseLiveBriefing(fixture({ customer: { id: 'customer_002', nameMasked: '이*객' } }))); await tick();
  first.resolve(parseLiveBriefing(fixture())); await tick();
  const ready = states.filter(state => state.status === 'ready'); assert.equal(ready.length, 1); assert.equal(ready[0].callId, 'call_002'); controller.dispose();
});

test('통화 브리핑 controller: 이전 오류가 뒤늦게 와도 새 선택을 오류로 덮지 않는다', async () => {
  const first = deferred<LiveBriefing>(); const states: LiveBriefingState[] = [];
  const controller = createLiveBriefingController(state => states.push(state), (_customer, callId) => callId === 'call_001' ? first.promise : Promise.resolve(parseLiveBriefing(fixture())));
  controller.select('call_001', 'customer_001'); await tick(); controller.select('call_002', 'customer_001'); await tick();
  first.reject(new LiveBriefingApiError('REAL_DATA_TIMEOUT')); await tick(); assert.equal(states.at(-1)?.status, 'ready'); controller.dispose();
});

test('통화 브리핑 controller: 고객 미식별로 변경하면 진행 요청을 취소하고 이전 자료를 지운다', async () => {
  const pending = deferred<LiveBriefing>(); const states: LiveBriefingState[] = []; let signal: AbortSignal | undefined;
  const controller = createLiveBriefingController(state => states.push(state), (_customer, _call, receivedSignal) => { signal = receivedSignal; return pending.promise; });
  controller.select('call_001', 'customer_001'); await tick(); controller.select('call_001', null);
  assert.equal(signal?.aborted, true); pending.resolve(parseLiveBriefing(fixture())); await tick(); assert.equal(states.at(-1)?.status, 'missing-customer'); controller.dispose();
});

test('통화 브리핑 controller: 닫힌 모달은 늦은 응답으로 상태를 갱신하지 않는다', async () => {
  const pending = deferred<LiveBriefing>(); const states: LiveBriefingState[] = []; let signal: AbortSignal | undefined;
  const controller = createLiveBriefingController(state => states.push(state), (_customer, _call, receivedSignal) => { signal = receivedSignal; return pending.promise; });
  controller.select('call_001', 'customer_001'); await tick(); controller.dispose(); const count = states.length;
  assert.equal(signal?.aborted, true); pending.resolve(parseLiveBriefing(fixture())); await tick(); controller.reload(); controller.select('call_002', 'customer_001');
  assert.equal(states.length, count);
});

test('통화 브리핑 controller: StrictMode 즉시 cleanup 재설정은 실제 조회를 중복 시작하지 않는다', async () => {
  let count = 0; const load = async () => { ++count; return parseLiveBriefing(fixture()); };
  const first = createLiveBriefingController(() => {}, load); first.select('call_001', 'customer_001'); first.dispose();
  const second = createLiveBriefingController(() => {}, load); second.select('call_001', 'customer_001'); await tick(); assert.equal(count, 1); second.dispose();
});

test('통화 브리핑 controller: 실패 상태는 안전한 코드만 저장하며 수동 다시 조회가 가능하다', async () => {
  let count = 0; const states: LiveBriefingState[] = [];
  const controller = createLiveBriefingController(state => states.push(state), async () => {
    if (++count === 1) throw new Error('private-response'); return parseLiveBriefing(fixture());
  });
  controller.select('call_001', 'customer_001'); await tick(); assert.deepEqual(states.at(-1), { callId: 'call_001', customerId: 'customer_001', status: 'error', errorCode: 'UNKNOWN_ERROR' });
  controller.reload(); await tick(); assert.equal(states.at(-1)?.status, 'ready'); assert.equal(count, 2); controller.dispose();
});
