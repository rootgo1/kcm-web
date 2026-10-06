import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEffectivePrice, effectivePriceErrorMessage, EffectivePriceApiError, formatEffectivePrice, loadProductCatalog,
  parseEffectivePrice, parseProductCatalog, toCatalogItems,
  type CatalogPlan, type CatalogProduct, type EffectivePriceResult, type ProductCatalog } from '../src/services/effectivePriceApi.js';

// Synthetic read-only contracts; never requests an external service or changes a customer record.
const device: CatalogProduct = { id: 'product_001', name: '테스트 단말', maker: 'Samsung', storageGb: 256, color: '블랙', price: 1000000 };
const plan: CatalogPlan = { id: 'own_plan_001', name: '테스트 요금제', company: null, groupName: '기본', type: 'MOBILE', monthlyFee: 59000,
  dataUnlimited: false, dataGb: 20.5, afterSpeedKbps: 1000, voiceUnlimited: false, voiceMinutes: 300, textUnlimited: true, textCount: null };
const catalog: ProductCatalog = { source: 'supabase', products: [device], ownPlans: [plan], competitorPlans: [{ ...plan, id: 'competitor_plan_001', company: 'SKT' }],
  bundles: [{ id: 'bundle_001', name: '정액 결합', type: 'FIXED', description: '등록 설명', familyRequired: true, internetRequired: false, minMobileLines: 2, maxMobileLines: 4, discountMethod: 'PER_LINE_FEE_TIER' }],
  benefits: [{ id: 'benefit_001', name: '등록 혜택', type: 'BIRTHDAY', grade: 'ALL', description: '정액으로 환산되지 않은 혜택' }] };
const rows = (fee = 59000): EffectivePriceResult['breakdown'] => [
  { key: 'plan_fee', label: '선택 요금제 월정액', amount: fee, period: 'monthly', status: 'recorded' },
  { key: 'bundle_discount', label: '결합 할인', amount: null, period: 'monthly', status: 'not_selected' },
  { key: 'benefit_value', label: '혜택 월환산', amount: null, period: 'monthly', status: 'needs_confirmation' },
  { key: 'contract_discount', label: '약정 할인', amount: null, period: 'monthly', status: 'needs_confirmation' },
  { key: 'monthly_subtotal', label: '월 통신요금 소계', amount: fee, period: 'monthly', status: 'calculated' },
  { key: 'device_cash', label: '단말 현금 가격', amount: null, period: 'once', status: 'not_selected' },
  { key: 'device_installment', label: '단말 월할부', amount: null, period: 'monthly', status: 'not_selected' },
];
const quote = (over: Partial<EffectivePriceResult> = {}): EffectivePriceResult => ({ source: 'supabase', policyVersion: 'db-fixed-mobile-v1',
  plan: { id: plan.id, name: plan.name, monthlyFee: plan.monthlyFee }, product: null, bundle: null,
  currentPlan: { id: 'own_plan_002', name: '현재 요금제', monthlyFee: 69000 }, monthlyFeeDifference: -10000,
  bundleDiscount: { status: 'not_selected', amount: null, ruleId: null, message: '결합 미선택' },
  monthlySubtotal: 59000, productCashPrice: null, monthlyInstallment: null, finalMonthlyTotal: 59000, quoteScope: 'communication_only',
  breakdown: rows(), warnings: ['선택약정·단말할부·이자는 포함하지 않았습니다.'], ...over });
const invalid = (error: unknown) => { assert.ok(error instanceof EffectivePriceApiError); assert.equal(error.code, 'INVALID_RESPONSE'); return true; };

test('저장 상품: 실제 catalog DTO만 기존 네 탭에 투영하고 원문 문자열·소수 데이터 제공량을 보존한다', () => {
  const parsed = parseProductCatalog(catalog); assert.deepEqual(parsed, catalog);
  const projected = toCatalogItems(parsed);
  assert.deepEqual(new Set(projected.map(item => item.tab)), new Set(['plans', 'bundles', 'benefits', 'devices']));
  assert.equal(projected.find(item => item.id === plan.id)?.plan?.monthlyFee, 59000);
  assert.equal(projected.find(item => item.id === plan.id)?.plan?.data, '20.5GB');
  assert.match(projected.find(item => item.id === device.id)?.sections[1].fields[0].value ?? '', /1,000,000원/);
  assert.equal(projected.find(item => item.id === 'benefit_001')?.sections[0].fields.find(field => field.label === '월환산 금액')?.value, '등록된 월환산 금액 없음');
  const exact = '상품 표시 (예시) 데모점 <img src=x>';
  assert.equal(toCatalogItems(parseProductCatalog({ ...catalog, products: [{ ...device, name: exact }] })).find(item => item.id === device.id)?.name, exact);
});

test('저장 상품: 잘못된 source·배열·중복 ID·누락 및 비정상 가격은 운영 상품으로 수용하지 않는다', () => {
  for (const body of [null, {}, { ...catalog, source: 'mock' }, { ...catalog, products: null }, { ...catalog, ownPlans: [{}] }, { ...catalog, products: [device, device] }]) assert.throws(() => parseProductCatalog(body), invalid);
  for (const price of [undefined, null, 0, -1, 1.5, '1000000', Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => parseProductCatalog({ ...catalog, products: [{ ...device, price }] }), invalid);
  for (const monthlyFee of [undefined, null, -1, 0.5, '59000', Number.NaN]) assert.throws(() => parseProductCatalog({ ...catalog, ownPlans: [{ ...plan, monthlyFee }] }), invalid);
  assert.equal(parseProductCatalog({ ...catalog, ownPlans: [{ ...plan, monthlyFee: 0 }] }).ownPlans[0].monthlyFee, 0);
});

test('체감가: 현재 요금제 대비 음수 차이와 월정액 0원을 정상 유지하고 미계산 금액 null을 0으로 바꾸지 않는다', () => {
  const result = parseEffectivePrice(quote(), { plan_id: 'own_plan_001', customer_id: 'customer_001' });
  assert.equal(result.monthlyFeeDifference, -10000); assert.equal(result.monthlyInstallment, null);
  assert.equal(result.bundleDiscount.amount, null); assert.equal(result.productCashPrice, null);
  // The frontend preserves the server's signed result; it does not own the difference formula.
  assert.equal(parseEffectivePrice(quote({ monthlyFeeDifference: -12000 })).monthlyFeeDifference, -12000);
  const free = quote({ plan: { id: plan.id, name: '0원 요금제', monthlyFee: 0 }, currentPlan: null, monthlyFeeDifference: null,
    monthlySubtotal: 0, finalMonthlyTotal: 0, breakdown: rows(0) });
  assert.equal(parseEffectivePrice(free, { plan_id: plan.id }).finalMonthlyTotal, 0); assert.equal(formatEffectivePrice(0), '0원');
});

test('체감가: 단말 또는 불확실한 결합이 포함되면 partial·확인 필요를 유지하고 최종 월요금을 만들어 채우지 않는다', () => {
  const withDevice = quote({ product: device, productCashPrice: device.price, quoteScope: 'partial', finalMonthlyTotal: null,
    breakdown: rows().map(row => row.key === 'device_cash' ? { ...row, amount: device.price, status: 'recorded' } : row.key === 'device_installment' ? { ...row, status: 'needs_confirmation' } : row) });
  assert.equal(parseEffectivePrice(withDevice, { plan_id: plan.id, product_id: device.id, customer_id: 'customer_001' }).finalMonthlyTotal, null);
  assert.throws(() => parseEffectivePrice({ ...withDevice, finalMonthlyTotal: 59000 }), invalid);
  const uncertain = quote({ bundle: { id: 'bundle_001', name: '조건 확인 결합' }, bundleDiscount: { status: 'needs_confirmation', amount: null, ruleId: null, message: '회선 조건 확인 필요' },
    monthlySubtotal: null, finalMonthlyTotal: null, quoteScope: 'partial', breakdown: rows().map(row => row.key === 'bundle_discount' || row.key === 'monthly_subtotal' ? { ...row, amount: null, status: 'needs_confirmation' } : row) });
  const result = parseEffectivePrice(uncertain, { plan_id: plan.id, bundle_id: 'bundle_001', customer_id: 'customer_001' });
  assert.equal(result.monthlySubtotal, null); assert.equal(result.bundleDiscount.amount, null);
  assert.throws(() => parseEffectivePrice({ ...uncertain, monthlySubtotal: 0 }), invalid);
});

test('체감가: 요청과 다른 상품·정책·현재 고객 조건, 잘못된 금액 타입과 빠진 근거 행은 거절한다', () => {
  assert.throws(() => parseEffectivePrice(quote(), { plan_id: 'own_plan_003', customer_id: 'customer_001' }), invalid);
  assert.throws(() => parseEffectivePrice(quote(), { plan_id: plan.id }), invalid);
  for (const over of [{ source: 'mock' }, { policyVersion: 'unknown' }, { monthlyFeeDifference: '-10000' }, { monthlyFeeDifference: Number.NaN },
    { monthlyFeeDifference: Number.MAX_SAFE_INTEGER + 1 }, { monthlySubtotal: '59000' }, { monthlyInstallment: 0 }, { productCashPrice: 0 }, { finalMonthlyTotal: null },
    { breakdown: rows().slice(0, 6) }, { breakdown: [rows()[0], ...rows().slice(0, 6)] }, { warnings: [{}] },
    { breakdown: rows().map(row => row.key === 'contract_discount' ? { ...row, amount: 14750 } : row) }]) assert.throws(() => parseEffectivePrice({ ...quote(), ...over }), invalid);
  assert.throws(() => parseEffectivePrice({ ...quote(), bundleDiscount: { status: '__proto__', amount: null, ruleId: null, message: 'unknown' } }), invalid);
});

test('가격 조회: 민감한 추가 키는 catalog·quote DTO에 남기지 않고 실패 원문·상속 속성을 안전하게 표시한다', () => {
  const parsed = parseProductCatalog({ ...catalog, apiKey: 'private_fixture_key', products: [{ ...device, token: 'private_fixture_token' }],
    ownPlans: [{ ...plan, customerName: 'private_fixture_name' }] });
  assert.equal(Object.hasOwn(parsed, 'apiKey'), false); assert.equal(Object.hasOwn(parsed.products[0], 'token'), false); assert.equal(Object.hasOwn(parsed.ownPlans[0], 'customerName'), false);
  const result = parseEffectivePrice({ ...quote(), phone: 'private_fixture_phone', customerName: 'private_fixture_name', transcript: 'private_fixture_transcript',
    plan: { ...quote().plan, rawResponse: 'private_fixture_secret' } });
  for (const key of ['phone', 'customerName', 'transcript']) assert.equal(Object.hasOwn(result, key), false);
  assert.equal(Object.hasOwn(result.plan, 'rawResponse'), false);
  for (const raw of ['https://fixture.invalid/?token=private_fixture', 'toString', '__proto__', 'constructor', null, {}]) {
    const error = new EffectivePriceApiError(raw); assert.equal(error.code, 'REAL_DATA_UNAVAILABLE'); assert.doesNotMatch(effectivePriceErrorMessage(error), /private_fixture|https?:|toString|__proto__|constructor/);
  }
  assert.doesNotMatch(effectivePriceErrorMessage(new Error('private_fixture_secret')), /private_fixture/);
});

test('가격 조회 API: 상대 경로의 catalog GET·계산 POST만 요청하고 고객 이름·연락처를 보내지 않는다', async () => {
  const original = globalThis.fetch; const requests: { path: string; init?: RequestInit }[] = []; const controller = new AbortController();
  try {
    globalThis.fetch = async (input, init) => { requests.push({ path: String(input), init }); return new Response(JSON.stringify(String(input) === '/api/products/catalog' ? catalog : quote()), { status: 200 }); };
    await loadProductCatalog(controller.signal); await calculateEffectivePrice({ plan_id: plan.id, customer_id: 'customer_001' }, controller.signal);
    assert.deepEqual(requests.map(row => [row.path, row.init?.method]), [['/api/products/catalog', 'GET'], ['/api/effective-price', 'POST']]);
    assert.ok(requests.every(row => row.init?.signal === controller.signal));
    assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { plan_id: plan.id, customer_id: 'customer_001' });
    assert.equal(requests[0].init?.body, undefined);
  } finally { globalThis.fetch = original; }
});

test('가격 조회 API: 잘못된 ID·소수 회선·허용하지 않은 입력은 요청 전에 실패한다', async () => {
  const original = globalThis.fetch; let requests = 0;
  try {
    globalThis.fetch = async () => { requests++; return new Response('{}'); };
    for (const input of [{ plan_id: 'competitor_plan_001' }, { plan_id: plan.id, customer_id: '../customer_001' }, { plan_id: plan.id, mobile_lines: 1.5 },
      { plan_id: plan.id, mobile_lines: 0 }, { plan_id: plan.id, family: 'true' }, { plan_id: plan.id, phone: 'private_fixture_phone' }]) {
      await assert.rejects(calculateEffectivePrice(input as Parameters<typeof calculateEffectivePrice>[0]), error => error instanceof EffectivePriceApiError && error.code === 'INVALID_PRICE_REQUEST');
    }
    assert.equal(requests, 0);
  } finally { globalThis.fetch = original; }
});

test('가격 조회 API: HTML·잘못된 성공 응답·늦게 도착한 다른 요금제 응답과 수신 오류 원문을 거절한다', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<html>private_fixture</html>', { status: 200 });
    await assert.rejects(loadProductCatalog(), invalid);
    globalThis.fetch = async () => new Response(JSON.stringify(quote()), { status: 200 });
    await assert.rejects(calculateEffectivePrice({ plan_id: 'own_plan_003', customer_id: 'customer_001' }), invalid);
    for (const errorCode of ['CUSTOMER_PRIVACY_RESTRICTED', 'PRICE_DATA_INVALID', 'https://fixture.invalid/?token=private_fixture', '__proto__']) {
      globalThis.fetch = async () => new Response(JSON.stringify({ errorCode, details: 'private_fixture_secret' }), { status: 403 });
      await assert.rejects(calculateEffectivePrice({ plan_id: plan.id }), error => {
        assert.ok(error instanceof EffectivePriceApiError); assert.equal(error.code, ['CUSTOMER_PRIVACY_RESTRICTED', 'PRICE_DATA_INVALID'].includes(errorCode) ? errorCode : 'REAL_DATA_UNAVAILABLE');
        assert.doesNotMatch(error.message, /private_fixture|https?:|__proto__/); return true;
      });
    }
    globalThis.fetch = async () => { throw new Error('private_fixture_secret'); };
    await assert.rejects(loadProductCatalog(), error => error instanceof EffectivePriceApiError && error.code === 'NETWORK' && !error.message.includes('private_fixture'));
  } finally { globalThis.fetch = original; }
});

test('가격 조회 API: 공개 직원 조회 제한은 준비 필요 안내로 표시하고 오류 원문을 노출하지 않는다', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ errorCode: 'REAL_DATA_ACCESS_RESTRICTED', details: 'Bearer private_fixture' }), { status: 503 });
    await assert.rejects(loadProductCatalog(), error => {
      assert.ok(error instanceof EffectivePriceApiError); assert.equal(error.code, 'REAL_DATA_ACCESS_RESTRICTED');
      assert.match(effectivePriceErrorMessage(error), /직원 조회 접근 설정/); assert.doesNotMatch(error.message, /private_fixture|Bearer/); return true;
    });
  } finally { globalThis.fetch = original; }
});
