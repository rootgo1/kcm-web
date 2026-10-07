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

const quoteRequest = { product_id: 'product_001', plan_id: 'own_plan_001', bundle_id: 'bundle_001',
  installment_months: 24, contract_months: 24, discount_type: 'PLAN_DISCOUNT' };
const quoteProduct = { ...product, name: 'Galaxy S26', price: 1254000 };
const quotePlan = { ...plan, name: '검증 90 요금제', monthly_fee: 90000 };
const quoteBundle = { ...bundle, id: 'bundle_001', name: '따로 살아도 가족결합', type: 'FAMILY_PROGRAM', discount_method: 'PROGRAM',
  parent_id: null, max_internet_lines: 5, max_tv_lines: 5, family_relations: ['본인', '배우자'] };
const quoteRule = { ...rule, id: 'bundle_rule_001', bundle_id: quoteBundle.id, order_no: 1,
  type: 'ADDITIONAL_INTERNET', service: 'INTERNET', scope: 'SERVICE_LINE', fee_basis: 'NONE',
  min_fee: null, max_fee: null, min_line: null, max_line: null, mobile_discount: null, internet_discount: 3300, tv_discount: null };

function preparedFixture(overrides = {}, options = {}) {
  const calls = [];
  const rows = { own_plans: [quotePlan], products: [quoteProduct], bundles: [quoteBundle], bundle_rules: [quoteRule],
    consultations: [{ id: 'consultation_001', customer_id: 'customer_001', store_id: 'store_005' }],
    customers: [{ id: 'customer_001', plan_id: 'own_plan_001', privacy_consent: true }], ...overrides };
  const filtered = (table, query) => (rows[table] ?? []).filter(row => Object.entries(query.filters ?? {})
    .every(([field, condition]) => condition === 'eq.' + row[field]));
  const provider = {
    async read(table, query) {
      calls.push({ table, query });
      if (options.failure?.table === table) return { ok: false, code: options.failure.code };
      return { ok: true, data: filtered(table, query) };
    },
    async readOne(table, query) {
      calls.push({ table, query });
      if (options.failure?.table === table) return { ok: false, code: options.failure.code };
      const row = filtered(table, query)[0] ?? null;
      return { ok: true, data: options.transformOne ? options.transformOne(table, row, query) : row };
    },
  };
  return { api: createEffectivePriceApi({ provider, homeStoreId: options.homeStoreId === undefined ? 'store_005' : options.homeStoreId }), calls, rows };
}
const dataFailure = { status: 502, body: { errorCode: 'PRICE_DATA_INVALID' } };

test('v2 API는승인된6조건의원본전체견적과각금액을정확히반환한다', async () => {
  const { api } = preparedFixture();
  const response = await request(api, quoteRequest);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['policyVersion', 'quote']);
  assert.equal(response.body.policyVersion, 'n8n-quote-v2');
  const q = response.body.quote;
  assert.deepEqual(q.raw_result, { monthly_payment_during_installment: 112036, last_installment_month_payment: 112043,
    monthly_payment_after_installment: 60500, average_monthly_effective_price: 112036,
    total_effective_cost: 2688871, total_contract_discount_benefit: 798000 });
  assert.equal(q.breakdown.monthly_device_installment, 51536);
  assert.equal(q.breakdown.plan_fee_after_discount, 60500);
  assert.equal(q.breakdown.total_device_discount, 90000);
  assert.equal(q.breakdown.selection_agreement_discount, 22500);
  assert.equal(q.breakdown.bundle_mobile_discount_applied, 7000);
  assert.equal(q.breakdown.installment_interest_total, 72871);
  assert.deepEqual(q.result['금액 구성'], { '월 단말 할부금': '월 51,536원', '할인 후 월 통신요금': '월 60,500원' });
  assert.equal(q.result['고객 체감가']['약정기간 총 체감가'], '2,688,871원');
  assert.equal(q.product_name, quoteProduct.name);
  assert.equal(q.plan_name, quotePlan.name);
  assert.equal(q.excluded.customer_lookup, true);
});

test('v2의시연결합가정과마지막달7원정산차이는원본견적에보존된다', async () => {
  const { api } = preparedFixture();
  const q = (await request(api, quoteRequest)).body.quote;
  assert.equal(q.calculation_basis.quote_is_estimate, true);
  assert.equal(q.calculation_basis.bundle_source, 'DEMO_POLICY');
  assert.equal(q.calculation_basis.bundle_eligibility_fully_verified, false);
  assert.deepEqual(q.calculation_basis.applied_bundle_rule_ids, []);
  assert.deepEqual(q.calculation_basis.bundle_demo_assumptions.family_mobile_monthly_fees, [90000, 90000]);
  assert.ok(q.result['계산 유의사항'].some(note => note.includes('실제 가입 자격')));
  assert.equal(q.raw_result.total_effective_cost,
    q.raw_result.monthly_payment_during_installment * 23 + q.raw_result.last_installment_month_payment);
  assert.notEqual(q.raw_result.total_effective_cost, q.raw_result.monthly_payment_during_installment * 24);
});

test('v2 일시불은첫달단말금과다음달통신료를나누고이자를0원으로표시한다', async () => {
  const { api } = preparedFixture();
  const response = await request(api, { ...quoteRequest, installment_months: 1 });
  assert.equal(response.status, 200);
  const q = response.body.quote;
  assert.equal(q.result['예상 납부금액'], '첫 달 1,224,500원');
  assert.equal(q.result['다음 달부터 예상 납부금액'], '월 60,500원');
  assert.equal(q.breakdown.installment_interest_total, 0);
  assert.equal(q.raw_result.total_effective_cost, 2616000);
  assert.equal(q.raw_result.average_monthly_effective_price, 109000);
});

test('v2 단말할인선택은공통·추가지원금만적용하고선택약정할인은0원으로구분한다', async () => {
  const { api } = preparedFixture();
  const response = await request(api, { ...quoteRequest, discount_type: 'DEVICE_DISCOUNT' });
  assert.equal(response.status, 200);
  const q = response.body.quote;
  assert.equal(q.breakdown.common_device_discount, 600000);
  assert.equal(q.breakdown.additional_device_discount, 90000);
  assert.equal(q.breakdown.total_device_discount, 690000);
  assert.equal(q.breakdown.selection_agreement_discount, 0);
  assert.equal(q.breakdown.plan_fee_after_discount, 83000);
});

test('v2 결합ID생략과명시null은둘다결합조회없이동일견적을반환한다', async () => {
  const noBundle = { ...quoteRequest }; delete noBundle.bundle_id;
  const omitted = preparedFixture(); const explicitNull = preparedFixture();
  const first = await request(omitted.api, noBundle);
  const second = await request(explicitNull.api, { ...noBundle, bundle_id: null });
  assert.equal(first.status, 200);
  assert.deepEqual(first, second);
  assert.equal(first.body.quote.bundle_id, null);
  assert.equal(first.body.quote.breakdown.bundle_mobile_discount_applied, 0);
  assert.equal(first.body.quote.breakdown.plan_fee_after_discount, 67500);
  assert.equal(first.body.quote.calculation_basis.eligibility_source, 'REQUEST');
  assert.equal([...omitted.calls, ...explicitNull.calls].some(call => ['bundles', 'bundle_rules'].includes(call.table)), false);
});

test('v2는미완성기간·문자숫자·지원외값·기존가족조건·임의금액을DB조회전에거절한다', async () => {
  const { api, calls } = preparedFixture();
  const invalid = [
    { ...quoteRequest, product_id: undefined }, { ...quoteRequest, product_id: null },
    { ...quoteRequest, installment_months: undefined }, { ...quoteRequest, contract_months: undefined },
    { ...quoteRequest, discount_type: undefined }, { ...quoteRequest, installment_months: '24' },
    { ...quoteRequest, installment_months: 36 }, { ...quoteRequest, installment_months: 0 },
    { ...quoteRequest, contract_months: 12 }, { ...quoteRequest, contract_months: '24' },
    { ...quoteRequest, discount_type: 'plan_discount' }, { ...quoteRequest, discount_type: '선택약정' },
    { ...quoteRequest, bundle_id: '' }, { ...quoteRequest, customer_id: null },
    ...['family', 'internet', 'mobile_lines', 'monthly_fee', 'price', 'annual_rate', 'upfront_payment', 'target_age',
      'family_mobile_monthly_fees', 'strict_bundle_validation'].map(key => ({ ...quoteRequest, [key]: 1 })),
  ];
  for (const body of invalid) assert.deepEqual(await request(api, body), { status: 400, body: { errorCode: 'INVALID_PRICE_REQUEST' } });
  assert.equal(calls.length, 0);
});

test('v2카탈로그와규칙조회는명시필드·정확ID·정렬·상한을유지한다', async () => {
  const { api, calls } = preparedFixture();
  assert.equal((await request(api, quoteRequest)).status, 200);
  const bundleCall = calls.find(call => call.table === 'bundles');
  assert.equal(bundleCall.query.select, 'id,name,type,description,family_required,internet_required,min_mobile_lines,max_mobile_lines,discount_method,parent_id,max_internet_lines,max_tv_lines,family_relations');
  assert.deepEqual(bundleCall.query.filters, { id: 'eq.bundle_001' });
  const rulesCall = calls.find(call => call.table === 'bundle_rules');
  assert.equal(rulesCall.query.select, 'id,bundle_id,order_no,type,service,scope,fee_basis,min_fee,max_fee,min_speed,max_speed,min_line,max_line,customer_condition,mobile_discount,mobile_rate,extra_discount,description,internet_discount,tv_discount');
  assert.deepEqual(rulesCall.query.filters, { bundle_id: 'eq.bundle_001' });
  assert.equal(rulesCall.query.order, 'order_no.asc,id.asc');
  assert.equal(rulesCall.query.limit, 1000);
  assert.equal(calls.every(call => !call.query.select.includes('*')), true);
});

test('부모결합은v2선택결합에연결된ID로만추가조회하고원본부모정책을반영한다', async () => {
  const child = { ...quoteBundle, id: 'bundle_002', name: '검증 회선별 정액 결합', type: 'FIXED', discount_method: 'PER_LINE_FEE_TIER', parent_id: quoteBundle.id };
  const mobileRule = { ...quoteRule, id: 'bundle_rule_002', bundle_id: child.id, type: 'PER_LINE_FEE', service: 'MOBILE',
    scope: 'PER_LINE', fee_basis: 'PER_LINE', min_fee: 77000, mobile_discount: 7000, internet_discount: null };
  const { api, calls } = preparedFixture({ bundles: [child, quoteBundle], bundle_rules: [mobileRule] });
  const response = await request(api, { ...quoteRequest, bundle_id: child.id });
  assert.equal(response.status, 200);
  assert.equal(response.body.quote.calculation_basis.parent_bundle_id, quoteBundle.id);
  assert.equal(response.body.quote.breakdown.bundle_mobile_discount_applied, 7000);
  const bundleCalls = calls.filter(call => call.table === 'bundles');
  assert.deepEqual(bundleCalls.map(call => call.query.filters), [{ id: 'eq.bundle_002' }, { id: 'eq.bundle_001' }]);
  assert.equal(bundleCalls[0].query.select, bundleCalls[1].query.select);
});

test('v2부모결합누락·ID불일치·자기참조·서로참조는고정데이터오류로차단한다', async () => {
  const child = { ...quoteBundle, id: 'bundle_002', parent_id: 'bundle_001' };
  for (const bundles of [[child], [{ ...child, parent_id: child.id }], [child, { ...quoteBundle, parent_id: child.id }],
    [{ ...child, parent_id: 'invalid' }]]) {
    assert.deepEqual(await request(preparedFixture({ bundles, bundle_rules: [] }).api, { ...quoteRequest, bundle_id: child.id }), dataFailure);
  }
  const mismatch = preparedFixture({ bundles: [child, quoteBundle], bundle_rules: [] }, {
    transformOne(table, row, query) { return table === 'bundles' && query.filters.id === 'eq.bundle_001' ? { ...row, id: 'bundle_999' } : row; },
  });
  assert.deepEqual(await request(mismatch.api, { ...quoteRequest, bundle_id: child.id }), dataFailure);
});

test('v2결합의필수projection필드·숫자·가족관계가불량하면시연기본값으로보충하지않는다', async () => {
  const missing = { ...quoteBundle }; delete missing.max_internet_lines;
  for (const changed of [missing, { ...quoteBundle, max_internet_lines: '5' }, { ...quoteBundle, max_tv_lines: -1 },
    { ...quoteBundle, min_mobile_lines: 11 }, { ...quoteBundle, family_relations: '본인' },
    { ...quoteBundle, family_relations: ['본인', ''] }, { ...quoteBundle, family_required: null }]) {
    assert.deepEqual(await request(preparedFixture({ bundles: [changed] }).api, quoteRequest), dataFailure);
  }
});

test('v2규칙중복·타결합·누락금액·문자금액·음수·역전구간은0원이나부분견적으로대체하지않는다', async () => {
  const missing = { ...quoteRule }; delete missing.tv_discount;
  const cases = [[quoteRule, quoteRule], [missing], [{ ...quoteRule, internet_discount: '3300' }],
    [{ ...quoteRule, mobile_discount: -1 }], [{ ...quoteRule, min_fee: 10, max_fee: 9 }],
    [{ ...quoteRule, mobile_rate: 'NaN' }], [{ ...quoteRule, order_no: 1.5 }]];
  for (const bundle_rules of cases) assert.deepEqual(await request(preparedFixture({ bundle_rules }).api, quoteRequest), dataFailure);
  // A compromised provider must not bypass the exact bundle_id check by returning an unfiltered rule.
  const api = createEffectivePriceApi({ provider: {
    async read(table) { return { ok: true, data: table === 'bundle_rules' ? [{ ...quoteRule, bundle_id: 'bundle_999' }] : [] }; },
    async readOne(table) { return { ok: true, data: table === 'products' ? quoteProduct : table === 'bundles' ? quoteBundle : quotePlan }; },
  } });
  assert.deepEqual(await request(api, quoteRequest), dataFailure);
});

test('v2제품가격·요금은기존엄격숫자검증을유지하고정수범위초과결과도거절한다', async () => {
  for (const price of [null, undefined, '1254000', 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(await request(preparedFixture({ products: [{ ...quoteProduct, price }] }).api, quoteRequest), dataFailure);
  }
  for (const monthly_fee of [null, undefined, '90000', -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(await request(preparedFixture({ own_plans: [{ ...quotePlan, monthly_fee }] }).api, quoteRequest), dataFailure);
  }
  // The original policy rejects a subsidy larger than the device price; the API does not expose its free-form error.
  assert.deepEqual(await request(preparedFixture({ products: [{ ...quoteProduct, price: 500000 }] }).api,
    { ...quoteRequest, discount_type: 'DEVICE_DISCOUNT' }), dataFailure);
});

test('v2정책미등록기종은422고정코드이며제품값이나오류원문을응답에노출하지않는다', async () => {
  for (const name of ['iPhone 18', 'iPhone 18 Plus', 'SYNTHETIC_PRIVATE_CATALOG_DETAIL']) {
    const { api } = preparedFixture({ products: [{ ...quoteProduct, name, maker: 'Other' }] });
    assert.deepEqual(await request(api, quoteRequest), { status: 422, body: { errorCode: 'PRICE_POLICY_UNAVAILABLE' } });
  }
});

test('v2조회실패도타임아웃·미설정고정코드만유지하고정책실행을진행하지않는다', async () => {
  for (const [code, status] of [['REAL_DATA_TIMEOUT', 504], ['REAL_DATA_NOT_CONFIGURED', 503], ['SECRET_PROVIDER_ERROR', 502]]) {
    const { api } = preparedFixture({}, { failure: { table: 'products', code } });
    assert.deepEqual(await request(api, quoteRequest), { status, body: { errorCode: code === 'SECRET_PROVIDER_ERROR' ? 'REAL_DATA_UNAVAILABLE' : code } });
  }
});

test('v2고객선택도기존매장·동의검증을통과해야하며견적에고객값을전달하지않는다', async () => {
  const selected = { ...quoteRequest, customer_id: 'customer_001' };
  const denied = preparedFixture({ consultations: [] });
  assert.deepEqual(await request(denied.api, selected), { status: 403, body: { errorCode: 'STORE_NOT_ALLOWED' } });
  assert.equal(denied.calls.some(call => call.table === 'customers'), false);
  const privacy = preparedFixture({ customers: [{ id: 'customer_001', plan_id: plan.id, privacy_consent: false }] });
  assert.deepEqual(await request(privacy.api, selected), { status: 403, body: { errorCode: 'CUSTOMER_PRIVACY_RESTRICTED' } });
  assert.equal(privacy.calls.filter(call => call.table === 'own_plans').length, 1);
  const noHome = preparedFixture({}, { homeStoreId: null });
  assert.deepEqual(await request(noHome.api, selected), { status: 503, body: { errorCode: 'HOME_STORE_NOT_CONFIGURED' } });
  const allowed = preparedFixture();
  const withCustomer = await request(allowed.api, selected);
  assert.deepEqual(withCustomer, await request(preparedFixture().api, quoteRequest));
  assert.equal(JSON.stringify(withCustomer.body).includes('customer_001'), false);
  assert.equal(JSON.stringify(withCustomer.body).includes('privacy_consent'), false);
  assert.deepEqual(allowed.calls.find(call => call.table === 'consultations').query.filters,
    { customer_id: 'eq.customer_001', store_id: 'eq.store_005' });
});

test('v2고객현재요금제의불량금액도기존v1과같이거절한다', async () => {
  const f = preparedFixture({ own_plans: [quotePlan, { ...quotePlan, id: 'own_plan_002', monthly_fee: null }],
    customers: [{ id: 'customer_001', plan_id: 'own_plan_002', privacy_consent: true }] });
  assert.deepEqual(await request(f.api, { ...quoteRequest, customer_id: 'customer_001' }), dataFailure);
  const missing = preparedFixture({ customers: [{ id: 'customer_001', plan_id: null, privacy_consent: true }] });
  assert.equal((await request(missing.api, { ...quoteRequest, customer_id: 'customer_001' })).status, 200);
});

test('v2명시projection은DB의추가개인필드를제외하며입력과DB원본을변경하지않는다', async () => {
  const privateMarker = 'SYNTHETIC_DO_NOT_EXPOSE';
  const f = preparedFixture({ products: [{ ...quoteProduct, private_note: privateMarker }],
    own_plans: [{ ...quotePlan, private_note: privateMarker }],
    bundles: [{ ...quoteBundle, private_note: privateMarker }], bundle_rules: [{ ...quoteRule, private_note: privateMarker }] });
  const original = structuredClone(f.rows); const input = structuredClone(quoteRequest);
  const first = await request(f.api, input);
  assert.equal(first.status, 200);
  assert.deepEqual(first, await request(f.api, input));
  assert.equal(JSON.stringify(first.body).includes(privateMarker), false);
  assert.deepEqual(f.rows, original);
  assert.deepEqual(input, quoteRequest);
});

test('v1기존입력과catalog는v2추가필드·부모결합조회의영향을받지않는다', async () => {
  const f = apiFixture();
  const response = await request(f.api, { plan_id: plan.id, product_id: product.id, bundle_id: bundle.id, ...conditions });
  assert.equal(response.status, 200);
  assert.equal(response.body.policyVersion, 'db-fixed-mobile-v1');
  assert.equal(response.body.monthlySubtotal, 56000);
  assert.equal(response.body.monthlyInstallment, null);
  assert.equal(f.calls.filter(call => call.table === 'bundles').length, 1);
  assert.equal(f.calls.some(call => call.query.select.includes('parent_id') || call.query.select.includes('internet_discount')), false);
  const catalogPlan = { ...plan, group_name: '그룹', type: '모바일', data_unlimited: false, data_gb: null,
    after_speed_kbps: null, voice_unlimited: false, voice_minutes: 0, text_unlimited: false, text_count: 0 };
  const catalog = apiFixture({ own_plans: [catalogPlan], competitor_plans: [], benefits: [] });
  assert.equal((await catalog.api.handle('GET', '/api/products/catalog', new URLSearchParams(), {})).status, 200);
  assert.equal(catalog.calls.some(call => call.query.select.includes('parent_id') || call.query.select.includes('internet_discount')), false);
});
