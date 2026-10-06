import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateEffectivePrice, createEffectivePriceApi } from '../effective-price.mjs';

// Isolated fixtures only. Runtime prices and discounts are always read from the DB.
const plan = { id: 'own_plan_001', name: '검증 요금제', monthly_fee: 61000 };
const product = { id: 'product_001', name: '검증 단말', maker: 'Samsung', storage_gb: 256, color: '블랙', price: 900000 };
const bundle = { id: 'bundle_003', name: '검증 정액 결합', type: 'FIXED', description: '회선별 구간', family_required: true,
  internet_required: true, min_mobile_lines: 1, max_mobile_lines: 10, discount_method: 'PER_LINE_FEE_TIER' };
const conditions = { family: true, internet: true, mobile_lines: 1 };
const rule = { id: 'bundle_rule_014', bundle_id: bundle.id, order_no: 4, type: 'PER_LINE_FEE', service: 'MOBILE', scope: 'PER_LINE',
  fee_basis: 'PER_LINE', min_fee: 61000, max_fee: 77000, min_line: 1, max_line: 10, min_speed: null, max_speed: null,
  customer_condition: null, mobile_discount: 5000, mobile_rate: null, extra_discount: null, description: '검증 구간' };

test('무결합·단말미선택은 할인값null과 선택없음을 유지하고 통신만의 확정범위를 표시한다', () => {
  const result = calculateEffectivePrice({ plan });
  assert.equal(result.bundleDiscount.status, 'not_selected');
  assert.equal(result.bundleDiscount.amount, null);
  assert.equal(result.monthlySubtotal, 61000);
  assert.equal(result.finalMonthlyTotal, 61000);
  assert.equal(result.quoteScope, 'communication_only');
  assert.equal(result.monthlyInstallment, null);
  assert.equal(result.productCashPrice, null);
  for (const key of ['benefit_value', 'contract_discount']) {
    assert.equal(result.breakdown.find(row => row.key === key).amount, null);
    assert.equal(result.breakdown.find(row => row.key === key).status, 'needs_confirmation');
  }
});
test('실제0원월정액과 실제0원할인은 누락과 구분된다', () => {
  const zeroPlan = { ...plan, monthly_fee: 0 };
  const noDiscount = { ...rule, min_fee: 0, max_fee: 37000, mobile_discount: 0 };
  assert.equal(calculateEffectivePrice({ plan: zeroPlan }).finalMonthlyTotal, 0);
  const result = calculateEffectivePrice({ plan: zeroPlan, bundle, rules: [noDiscount], conditions });
  assert.equal(result.bundleDiscount.status, 'applied');
  assert.equal(result.bundleDiscount.amount, 0);
  assert.equal(result.monthlySubtotal, 0);
});
test('고정액DB구간의 최소포함·최대제외와 회선수조건을 적용한다', () => {
  const calculate = monthly_fee => calculateEffectivePrice({ plan: { ...plan, monthly_fee }, bundle, rules: [rule], conditions });
  assert.equal(calculate(61000).monthlySubtotal, 56000);
  assert.equal(calculate(76999).monthlySubtotal, 71999);
  assert.equal(calculate(77000).bundleDiscount.amount, null);
  assert.equal(calculate(60999).monthlySubtotal, null);
  const outside = calculateEffectivePrice({ plan, bundle, rules: [rule], conditions: { ...conditions, mobile_lines: 11 } });
  assert.equal(outside.bundleDiscount.status, 'not_applicable');
  assert.equal(outside.monthlySubtotal, 61000);
});
test('선택결합 조건누락은 월소계null이며 명시false는 미적용으로 구분한다', () => {
  for (const missing of [{}, { family: true }, { family: true, internet: true }]) {
    const result = calculateEffectivePrice({ plan, bundle, rules: [rule], conditions: missing });
    assert.equal(result.monthlySubtotal, null);
    assert.equal(result.bundleDiscount.status, 'needs_confirmation');
    assert.equal(result.finalMonthlyTotal, null);
  }
  assert.equal(calculateEffectivePrice({ plan, bundle, rules: [rule], conditions: { ...conditions, family: false } }).bundleDiscount.status, 'not_applicable');
});
test('문자조건·가구배분·비율·추가할인·속도조건을 임의계산하지 않는다', () => {
  for (const changed of [{ customer_condition: '청소년' }, { mobile_rate: '25.00' }, { extra_discount: 0 }, { mobile_discount: null }, { min_speed: 500 }]) {
    const result = calculateEffectivePrice({ plan, bundle, rules: [{ ...rule, ...changed }], conditions });
    assert.equal(result.bundleDiscount.amount, null);
    assert.equal(result.monthlySubtotal, null);
  }
  for (const discount_method of ['TOTAL_FEE_TIER', 'SINGLE_LINE_RATE', 'PER_LINE_RATE', 'PROGRAM']) {
    assert.equal(calculateEffectivePrice({ plan, bundle: { ...bundle, discount_method }, rules: [rule], conditions }).monthlySubtotal, null);
  }
});
test('중복구간·월정액보다큰할인·잘못된금액을 clamp나0으로보충하지않는다', () => {
  const calculate = input => calculateEffectivePrice({ plan, bundle, rules: [rule], conditions, ...input });
  for (const monthly_fee of [null, undefined, '61000', -1, 1.5, NaN, Infinity]) assert.throws(() => calculate({ plan: { ...plan, monthly_fee } }), /PRICE_DATA_INVALID/);
  assert.throws(() => calculate({ rules: [rule, { ...rule, id: 'bundle_rule_099' }] }), /PRICE_DATA_INVALID/);
  assert.throws(() => calculate({ rules: [{ ...rule, mobile_discount: 70000 }] }), /PRICE_DATA_INVALID/);
  for (const price of [null, undefined, 0, -1, '900000', 1.2]) assert.throws(() => calculate({ product: { ...product, price } }), /PRICE_DATA_INVALID/);
});
test('단말 현금가격은 별도항목이고 월환산·최종월합계는 생성하지 않는다', () => {
  const result = calculateEffectivePrice({ plan, product, bundle, rules: [rule], conditions });
  assert.equal(result.productCashPrice, 900000);
  assert.equal(result.monthlySubtotal, 56000);
  assert.equal(result.monthlyInstallment, null);
  assert.equal(result.finalMonthlyTotal, null);
  assert.equal(result.quoteScope, 'partial');
  assert.equal(result.breakdown.find(row => row.key === 'device_cash').period, 'once');
});
test('현재요금제0원도 비교하고 현재요금누락은 차액null로 보존한다', () => {
  const result = calculateEffectivePrice({ plan, currentPlan: { ...plan, id: 'own_plan_002', monthly_fee: 0 }, customerSelected: true });
  assert.equal(result.monthlyFeeDifference, 61000);
  const missing = calculateEffectivePrice({ plan, customerSelected: true });
  assert.equal(missing.monthlyFeeDifference, null);
  assert.equal(missing.finalMonthlyTotal, null);
});
test('동일입력은동일결과이며DB입력원본을변경하지않는다', () => {
  const input = { plan, product, bundle, rules: [rule], conditions };
  const before = structuredClone(input);
  assert.deepEqual(calculateEffectivePrice(input), calculateEffectivePrice(input));
  assert.deepEqual(input, before);
});

function apiFixture(overrides = {}) {
  const calls = [];
  const rows = { own_plans: [plan], products: [product], bundles: [bundle], bundle_rules: [rule],
    consultations: [{ id: 'consultation_001', customer_id: 'customer_001', store_id: 'store_005' }],
    customers: [{ id: 'customer_001', plan_id: 'own_plan_001', privacy_consent: true }], ...overrides };
  const provider = {
    async read(table, query) { calls.push({ table, query }); return { ok: true, data: rows[table] ?? [] }; },
    async readOne(table, query) { calls.push({ table, query }); return { ok: true, data: rows[table]?.[0] ?? null }; },
  };
  return { api: createEffectivePriceApi({ provider, homeStoreId: 'store_005' }), calls };
}
const request = (api, body) => api.handle('POST', '/api/effective-price', new URLSearchParams(), body);
test('API는선택ID만받고 클라이언트금액·이율·불량조건을거절한다', async () => {
  const { api, calls } = apiFixture();
  for (const body of [null, [], {}, { plan_id: 'competitor_plan_001' }, { plan_id: plan.id, monthly_fee: 1 },
    { plan_id: plan.id, family: 'true' }, { plan_id: plan.id, mobile_lines: 1.5 }, { plan_id: plan.id, product_id: null }]) {
    assert.equal((await request(api, body)).status, 400);
  }
  assert.equal(calls.length, 0);
  assert.equal((await request(api, { plan_id: plan.id })).body.monthlySubtotal, 61000);
});
test('API고객비교는서버home연결과동의를확인하고비PII금액만반환한다', async () => {
  const { api, calls } = apiFixture();
  const result = await request(api, { plan_id: plan.id, customer_id: 'customer_001' });
  assert.equal(result.status, 200);
  assert.equal(result.body.monthlyFeeDifference, 0);
  assert.deepEqual(calls.find(call => call.table === 'consultations').query.filters, { customer_id: 'eq.customer_001', store_id: 'eq.store_005' });
  assert.equal(JSON.stringify(result.body).includes('customer_001'), false);
  assert.equal(JSON.stringify(result.body).includes('privacy_consent'), false);
});
test('타매장·동의없는고객은현재요금제조회·비교를차단한다', async () => {
  const denied = apiFixture({ consultations: [] });
  assert.equal((await request(denied.api, { plan_id: plan.id, customer_id: 'customer_001' })).body.errorCode, 'STORE_NOT_ALLOWED');
  assert.equal(denied.calls.some(call => call.table === 'customers'), false);
  const privacy = apiFixture({ customers: [{ id: 'customer_001', plan_id: plan.id, privacy_consent: false }] });
  const result = await request(privacy.api, { plan_id: plan.id, customer_id: 'customer_001' });
  assert.equal(result.status, 403);
  assert.equal(result.body.errorCode, 'CUSTOMER_PRIVACY_RESTRICTED');
  assert.equal(privacy.calls.filter(call => call.table === 'own_plans').length, 1);
  assert.equal((await request(privacy.api, { plan_id: plan.id })).status, 200);
});
test('고객현재요금제null은확인필요이며서버home누락은고객비교만차단한다', async () => {
  const missing = apiFixture({ customers: [{ id: 'customer_001', plan_id: null, privacy_consent: true }] });
  const result = await request(missing.api, { plan_id: plan.id, customer_id: 'customer_001' });
  assert.equal(result.status, 200);
  assert.equal(result.body.currentPlan, null);
  assert.equal(result.body.monthlyFeeDifference, null);
  assert.equal(result.body.finalMonthlyTotal, null);
  assert.equal(result.body.quoteScope, 'partial');
  assert.equal(missing.calls.filter(call => call.table === 'own_plans').length, 1);
  const noHome = createEffectivePriceApi({ provider: { async read() { return { ok: true, data: [] }; }, async readOne() { return { ok: true, data: plan }; } } });
  assert.deepEqual(await request(noHome, { plan_id: plan.id, customer_id: 'customer_001' }), { status: 503, body: { errorCode: 'HOME_STORE_NOT_CONFIGURED' } });
  assert.equal((await request(noHome, { plan_id: plan.id })).status, 200);
});
test('상품catalog과계산API는계약된method외요청을거절하며다른경로를가로채지않는다', async () => {
  const { api, calls } = apiFixture();
  assert.equal((await api.handle('POST', '/api/products/catalog', new URLSearchParams(), {})).status, 405);
  assert.equal((await api.handle('GET', '/api/effective-price', new URLSearchParams(), {})).status, 405);
  assert.equal(await api.handle('POST', '/api/inventory', new URLSearchParams(), {}), null);
  assert.equal(calls.length, 0);
});
test('DBID불일치·조회오류는502안전코드이며잘못된성공금액을반환하지않는다', async () => {
  const mismatch = apiFixture({ own_plans: [{ ...plan, id: 'own_plan_999' }] });
  assert.equal((await request(mismatch.api, { plan_id: plan.id })).body.errorCode, 'PRICE_DATA_INVALID');
  const malformedLink = apiFixture({ consultations: [{ id: 'invalid', customer_id: 'customer_001', store_id: 'store_005' }] });
  assert.equal((await request(malformedLink.api, { plan_id: plan.id, customer_id: 'customer_001' })).body.errorCode, 'PRICE_DATA_INVALID');
  assert.equal(malformedLink.calls.some(call => call.table === 'customers'), false);
  const provider = { async read() { return { ok: false, code: 'SECRET_UPSTREAM_DETAIL' }; }, async readOne() { return { ok: false, code: 'SECRET_UPSTREAM_DETAIL' }; } };
  const api = createEffectivePriceApi({ provider });
  assert.deepEqual(await request(api, { plan_id: plan.id }), { status: 502, body: { errorCode: 'REAL_DATA_UNAVAILABLE' } });
});
test('catalog은확인된가격과0원월정액을반환하고불량가격을거절한다', async () => {
  const catalogPlan = { ...plan, group_name: '그룹', type: '모바일', monthly_fee: 0, data_unlimited: false, data_gb: '0.00',
    after_speed_kbps: null, voice_unlimited: false, voice_minutes: 0, text_unlimited: false, text_count: 0 };
  const { api } = apiFixture({ own_plans: [catalogPlan], competitor_plans: [], benefits: [] });
  const result = await api.handle('GET', '/api/products/catalog', new URLSearchParams(), {});
  assert.equal(result.status, 200);
  assert.equal(result.body.ownPlans[0].monthlyFee, 0);
  assert.equal(result.body.products[0].price, 900000);
  const bad = apiFixture({ products: [{ ...product, price: null }] });
  assert.equal((await bad.api.handle('GET', '/api/products/catalog', new URLSearchParams(), {})).status, 502);
});
