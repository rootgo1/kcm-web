import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEffectivePrice, effectivePriceErrorMessage, effectivePriceNoteMessage, EffectivePriceApiError, formatEffectivePrice, loadProductCatalog,
  parseEffectivePrice, parseProductCatalog, toCatalogItems,
  type CatalogPlan, type CatalogProduct, type EffectivePriceInput, type EffectivePriceQuoteResult, type EffectivePriceResult, type ProductCatalog } from '../src/services/effectivePriceApi.js';

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
const quoteInput: EffectivePriceInput = { product_id: 'product_001', plan_id: 'own_plan_001', bundle_id: 'bundle_001',
  installment_months: 24, contract_months: 24, discount_type: 'PLAN_DISCOUNT' };
const completeQuote = (): EffectivePriceQuoteResult => ({ policyVersion: 'n8n-quote-v2', quote: {
  currency: 'KRW', quote_type: 'pure_calculation', product_id: 'product_001', product_name: '테스트 단말',
  plan_id: 'own_plan_001', plan_name: '테스트 요금제', bundle_id: 'bundle_001', bundle_name: '테스트 결합',
  calculation_basis: { installment_months: 24, contract_months: 24, discount_type: 'PLAN_DISCOUNT', quote_is_estimate: true,
    bundle_eligibility_fully_verified: false, eligibility_source: 'DEMO_ASSUMPTIONS', device_discount_policy_notes: [],
    bundle_validation_notes: ['시연용 가족·회선 조건을 가정합니다.'] },
  result: { '계산 설명': '단말과 통신요금을 포함한 예상 납부금액입니다.', '계산 유의사항': ['시연용 가족·회선 조건을 가정합니다.'],
    '예상 납부금액': '월 112,036원', '금액 구성': { '월 단말 할부금': '월 51,536원', '할인 후 월 통신요금': '월 60,500원' },
    '적용 할인': { '할인 방식': '요금할인', '단말 할인 총액': '-90,000원', '선택약정 월 할인': '-22,500원', '모바일 결합 월 할인': '-7,000원' },
    '고객 체감가': { '체감가 안내': '24개월 예상 총 납부액과 월평균 체감가입니다.', '약정기간 총 할인 혜택': '798,000원',
      '단말 할부수수료 총액': '72,871원', '약정기간 총 체감가': '2,688,871원', '월평균 체감가': '월 112,036원' } },
  raw_result: { monthly_payment_during_installment: 112036, last_installment_month_payment: 112043, monthly_payment_after_installment: 60500,
    average_monthly_effective_price: 112036, total_effective_cost: 2688871, total_contract_discount_benefit: 798000 },
  breakdown: { product_price: 1254000, common_device_discount: 0, additional_device_discount: 90000, total_device_discount: 90000,
    financed_principal: 1164000, installment_interest_total: 72871, installment_repayment_total: 1236871,
    monthly_device_installment: 51536, last_month_device_installment: 51543, plan_monthly_fee: 90000,
    selection_agreement_discount: 22500, selection_agreement_discount_contract_total: 540000,
    target_mobile_bundle_discount_before_youth: 7000, premium_youth_additional_discount: 0, bundle_mobile_discount_applied: 7000,
    bundle_mobile_discount_contract_total: 168000, group_internet_discount_reference: 0, plan_fee_after_discount: 60500 },
} });

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
  if (result.policyVersion !== 'db-fixed-mobile-v1') assert.fail('기존 정책 응답이어야 합니다.');
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

test('체감가 v2: 요청한 여섯 조건과 네 결과 그룹을 보존하고 월 표시액에서 약정 총액을 역산하지 않는다', () => {
  const result = parseEffectivePrice(completeQuote(), quoteInput);
  assert.deepEqual(result, completeQuote());
  assert.equal(result.quote.raw_result.total_effective_cost, 2688871);
  assert.equal(result.quote.raw_result.average_monthly_effective_price, 112036);
  assert.notEqual(result.quote.raw_result.average_monthly_effective_price * 24, result.quote.raw_result.total_effective_cost);
  assert.deepEqual(result.quote.result['적용 할인'], { '할인 방식': '요금할인', '단말 할인 총액': '-90,000원', '선택약정 월 할인': '-22,500원', '모바일 결합 월 할인': '-7,000원' });
});

test('체감가 v2: 다른 상품·결합·할부·약정·할인 방식의 응답과 구 정책으로 대체된 결과를 거절한다', () => {
  for (const expected of [{ ...quoteInput, product_id: 'product_002' }, { ...quoteInput, plan_id: 'own_plan_002' },
    { ...quoteInput, bundle_id: 'bundle_002' }, { ...quoteInput, installment_months: 1 as const },
    { ...quoteInput, contract_months: 12 }, { ...quoteInput, discount_type: 'DEVICE_DISCOUNT' as const }, { plan_id: plan.id }]) {
    assert.throws(() => parseEffectivePrice(completeQuote(), expected as EffectivePriceInput), invalid);
  }
  assert.throws(() => parseEffectivePrice(quote(), quoteInput), invalid);
});

test('체감가 v2: 손상·음수·소수 숫자와 숫자에 맞지 않는 금액 문자열을 거절한다', () => {
  for (const amount of [undefined, null, -1, 51536.5, '51536', Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    const body = completeQuote(); body.quote.breakdown.monthly_device_installment = amount as number;
    assert.throws(() => parseEffectivePrice(body), invalid);
  }
  const missing = completeQuote(); delete (missing.quote.raw_result as Partial<EffectivePriceQuoteResult['quote']['raw_result']>).total_effective_cost;
  assert.throws(() => parseEffectivePrice(missing), invalid);
  const inconsistent = completeQuote(); inconsistent.quote.result['고객 체감가']['약정기간 총 체감가'] = '2,688,864원';
  assert.throws(() => parseEffectivePrice(inconsistent), invalid);
  const wrongType = completeQuote(); wrongType.quote.result['적용 할인']['할인 방식'] = '단말할인';
  assert.throws(() => parseEffectivePrice(wrongType), invalid);
});

test('체감가 v2: 일시불 첫 달과 다음 달 금액을 구분하고 결합 생략·null 요청을 같은 미선택으로 검증한다', () => {
  const cash = completeQuote(); cash.quote.bundle_id = null; cash.quote.bundle_name = null;
  cash.quote.calculation_basis.installment_months = 1;
  cash.quote.result['예상 납부금액'] = '첫 달 1,224,500원';
  cash.quote.result['금액 구성'] = { '일시불 단말금': '1,164,000원', '할인 후 월 통신요금': '월 60,500원' };
  cash.quote.result['다음 달부터 예상 납부금액'] = '월 60,500원';
  cash.quote.raw_result.monthly_payment_during_installment = 1224500;
  cash.quote.breakdown.monthly_device_installment = 1164000;
  const expected = { ...quoteInput, bundle_id: undefined, installment_months: 1 as const };
  assert.equal(parseEffectivePrice(cash, expected).quote.result['예상 납부금액'], '첫 달 1,224,500원');
  assert.equal(parseEffectivePrice(cash, { ...expected, bundle_id: null }).quote.result['다음 달부터 예상 납부금액'], '월 60,500원');
  delete cash.quote.result['다음 달부터 예상 납부금액']; assert.throws(() => parseEffectivePrice(cash), invalid);
});

test('체감가 v2: 시연 가정·가입 자격·원본 정책 유의사항을 유지하고 누락된 유의사항을 거절한다', () => {
  const result = parseEffectivePrice(completeQuote());
  assert.equal(result.quote.calculation_basis.eligibility_source, 'DEMO_ASSUMPTIONS');
  assert.equal(result.quote.calculation_basis.bundle_eligibility_fully_verified, false);
  assert.deepEqual(result.quote.result['계산 유의사항'], ['시연용 가족·회선 조건을 가정합니다.']);
  const removed = completeQuote(); removed.quote.result['계산 유의사항'] = []; assert.throws(() => parseEffectivePrice(removed), invalid);
  const invalidBasis = completeQuote(); invalidBasis.quote.calculation_basis.quote_is_estimate = 'true' as unknown as boolean;
  assert.throws(() => parseEffectivePrice(invalidBasis), invalid);
});

test('체감가 v2: 응답의 추가 고객 정보·토큰·가정 원문을 DTO에 남기지 않는다', () => {
  const original = completeQuote();
  const body = { ...original, token: 'private_fixture_token', quote: { ...original.quote, phone: 'private_fixture_phone',
    calculation_basis: { ...original.quote.calculation_basis, bundle_demo_assumptions: { customerName: 'private_fixture_name' } },
    result: { ...original.quote.result, transcript: 'private_fixture_transcript', '금액 구성': { ...original.quote.result['금액 구성'], secret: 'private_fixture_secret' } },
    breakdown: { ...original.quote.breakdown, apiKey: 'private_fixture_key' }, raw_result: { ...original.quote.raw_result, token: 'private_fixture_token' } } };
  assert.deepEqual(parseEffectivePrice(body, quoteInput), original);
  assert.doesNotMatch(JSON.stringify(parseEffectivePrice(body, quoteInput)), /private_fixture/);
});

test('가격 조회 API v2: 여섯 조건을 그대로 전송하고 조건 누락·비허용 기간·임의 할인 금액은 요청 전 거절한다', async () => {
  const original = globalThis.fetch; const requests: RequestInit[] = [];
  try {
    globalThis.fetch = async (path, init) => { assert.equal(path, '/api/effective-price'); requests.push(init ?? {}); return new Response(JSON.stringify(completeQuote()), { status: 200 }); };
    await calculateEffectivePrice(quoteInput);
    assert.deepEqual(JSON.parse(String(requests[0].body)), quoteInput);
    for (const input of [{ ...quoteInput, product_id: undefined }, { ...quoteInput, installment_months: undefined },
      { ...quoteInput, contract_months: undefined }, { ...quoteInput, discount_type: undefined }, { ...quoteInput, installment_months: 36 },
      { ...quoteInput, contract_months: 12 }, { ...quoteInput, discount_type: 'INVALID' }, { ...quoteInput, device_discount: 90000 },
      { ...quoteInput, family: true }, { ...quoteInput, internet: true }, { ...quoteInput, mobile_lines: 2 }]) {
      await assert.rejects(calculateEffectivePrice(input as EffectivePriceInput), error => error instanceof EffectivePriceApiError && error.code === 'INVALID_PRICE_REQUEST');
    }
    assert.equal(requests.length, 1);
  } finally { globalThis.fetch = original; }
});

test('가격 조회 API v2: 시연 할인표 미등록 오류를 별도 안내하고 서버 원문을 표시하지 않는다', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ errorCode: 'PRICE_POLICY_UNAVAILABLE', details: 'private_fixture_secret' }), { status: 422 });
    await assert.rejects(calculateEffectivePrice(quoteInput), error => {
      assert.ok(error instanceof EffectivePriceApiError); assert.equal(error.code, 'PRICE_POLICY_UNAVAILABLE');
      assert.match(error.message, /시연 할인표/); assert.doesNotMatch(error.message, /private_fixture/); return true;
    });
  } finally { globalThis.fetch = original; }
});

test('체감가 유의사항: 가족·회선·추가 가입 조건의 의미를 유지하면서 개발 필드명은 화면에 표시하지 않는다', () => {
  const notes = [
    'family_relation이 없어 가족관계 허용값을 확인할 수 없습니다. 허용값: 본인, 배우자 견적 계산에서는 이 검증을 생략했습니다.',
    '상위상품 직접 선택: 모바일 DB 규칙이 없어 코드의 정액 할인표로 시연했습니다. 하위상품 규칙을 조회하거나 적용한 결과가 아닙니다.',
    'internet_line_count가 없어 인터넷 회선 최대 5회선 조건을 확인할 수 없습니다. 견적 계산에서는 이 검증을 생략했습니다.',
    'household_group_tv_line_count가 없어 TV 회선 최대 3회선 조건을 확인할 수 없습니다. 견적 계산에서는 이 검증을 생략했습니다.',
    '프리미엄 싱글 규칙 bundle_rule_001의 customer_condition은 자유문장이어서 자동 검증하지 않았습니다. 견적 모드에서는 구조화된 단일 회선·요금제·인터넷 조건으로 계산했습니다.',
    '프리미엄 가족 추가회선 규칙 bundle_rule_002의 customer_condition은 자유문장이어서 자동 검증하지 않았습니다. 견적 모드에서는 구조화된 요금·회선·베이스 회선 조건으로 계산했습니다.',
    '프리미엄 가족결합의 인터넷 할인 규칙이 없습니다. 동일 bundle_id에 베이스 방식(FIXED/TOTAL)의 internet_discount 규칙을 추가하세요. 견적 모드에서는 인터넷 할인분을 0원으로 두고 계산했습니다.',
  ];
  const displayed = notes.map(effectivePriceNoteMessage);
  assert.equal(displayed.length, notes.length);
  assert.equal(displayed[0], '실제 가족관계를 확인해야 결합 가입 자격을 확정할 수 있습니다.');
  assert.equal(displayed[1], '선택한 가족결합의 모바일 할인은 준비된 시연 기준으로 계산했습니다.');
  assert.match(displayed[2], /인터넷.*5회선.*추가 확인/); assert.match(displayed[3], /TV.*3회선.*추가 확인/);
  assert.match(displayed[4], /싱글결합.*추가 가입 조건.*확인하지 않았습니다/);
  assert.match(displayed[5], /가족결합.*추가 회선 가입 조건.*확인하지 않았습니다/);
  assert.match(displayed[6], /참고용 인터넷 할인은 0원/);
  assert.doesNotMatch(displayed.join(' '), /family_relation|bundle_id|bundle_rule|customer_condition|_line_count|DB|SQL|코드/);
  const estimate = '기존 9만원 기준 기종별 단말 할인표를 선택 요금제에도 그대로 적용한 시연 계산입니다.';
  assert.equal(effectivePriceNoteMessage(estimate), estimate);
  const quote = completeQuote(); quote.quote.result['계산 유의사항'] = notes;
  quote.quote.calculation_basis.bundle_validation_notes = notes;
  const parsed = parseEffectivePrice(quote); parsed.quote.result['계산 유의사항'].map(effectivePriceNoteMessage);
  assert.deepEqual(parsed.quote.result['계산 유의사항'], notes);
});
