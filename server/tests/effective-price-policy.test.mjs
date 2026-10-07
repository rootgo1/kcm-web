import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePreparedQuote } from '../effective-price-policy.mjs';

function input(overrides = {}) {
  return {
    calculation: { product_id: 'product_001', plan_id: 'own_plan_001', bundle_id: 'bundle_001',
      installment_months: 24, contract_months: 24, discount_type: 'PLAN_DISCOUNT', ...overrides },
    product: { id: 'product_001', product_name: 'Galaxy S26', maker: 'Samsung', price: 1254000 },
    plan: { id: 'own_plan_001', plan_name: '초이스 90 유튜브 프리미엄', monthly_fee: 90000 },
    bundle: { id: 'bundle_001', name: '따로 살아도 가족결합', type: 'FAMILY_PROGRAM', parent_id: null,
      discount_method: 'PROGRAM', family_required: true, internet_required: true,
      min_mobile_lines: 1, max_mobile_lines: 10, max_internet_lines: 5, max_tv_lines: 5, family_relations: ['본인', '배우자'] },
    parent_bundle: null,
    // Internet/TV-only rules must never be counted as a mobile discount.
    bundle_rules: [{ id: 'bundle_rule_001', bundle_id: 'bundle_001', type: 'ADDITIONAL_INTERNET',
      service: 'INTERNET', scope: 'SERVICE_LINE', fee_basis: 'NONE', internet_discount: 3300, mobile_discount: null }],
  };
}

test('prepared quote matches every amount from the approved six-input example', () => {
  const quote = calculatePreparedQuote(input());
  assert.deepEqual(quote.raw_result, {
    monthly_payment_during_installment: 112036, last_installment_month_payment: 112043,
    monthly_payment_after_installment: 60500, average_monthly_effective_price: 112036,
    total_effective_cost: 2688871, total_contract_discount_benefit: 798000,
  });
  assert.equal(quote.result['예상 납부금액'], '월 112,036원');
  assert.deepEqual(quote.result['금액 구성'], { '월 단말 할부금': '월 51,536원', '할인 후 월 통신요금': '월 60,500원' });
  assert.deepEqual(quote.result['적용 할인'], { '할인 방식': '요금할인', '단말 할인 총액': '-90,000원',
    '선택약정 월 할인': '-22,500원', '모바일 결합 월 할인': '-7,000원' });
  assert.equal(quote.result['고객 체감가']['단말 할부수수료 총액'], '72,871원');
  assert.equal(quote.result['고객 체감가']['약정기간 총 체감가'], '2,688,871원');
  assert.equal(quote.result['고객 체감가']['약정기간 총 할인 혜택'], '798,000원');
  assert.equal(quote.result['고객 체감가']['월평균 체감가'], '월 112,036원');
  assert.ok(quote.result['고객 체감가']['체감가 안내'].includes('72,871원'));
});

test('last installment settles the remaining seven won and totals are not rounded monthly multiples', () => {
  const q = calculatePreparedQuote(input());
  assert.equal(q.breakdown.installment_repayment_total, q.breakdown.financed_principal + q.breakdown.installment_interest_total);
  assert.equal(q.breakdown.installment_repayment_total, q.breakdown.monthly_device_installment * 23 + q.breakdown.last_month_device_installment);
  assert.equal(q.raw_result.total_effective_cost, q.raw_result.monthly_payment_during_installment * 23 + q.raw_result.last_installment_month_payment);
});

test('cash payment distinguishes first-month amount, subsequent telecom fee and zero interest', () => {
  const q = calculatePreparedQuote(input({ installment_months: 1 }));
  assert.equal(q.result['예상 납부금액'], '첫 달 1,224,500원');
  assert.equal(q.result['다음 달부터 예상 납부금액'], '월 60,500원');
  assert.equal(q.breakdown.installment_interest_total, 0);
  assert.equal(q.raw_result.total_effective_cost, 2616000);
  assert.equal(q.raw_result.average_monthly_effective_price, 109000);
});

test('device discount applies the prepared common and additional subsidy without selection discount', () => {
  const q = calculatePreparedQuote(input({ discount_type: 'DEVICE_DISCOUNT' }));
  assert.equal(q.breakdown.common_device_discount, 600000);
  assert.equal(q.breakdown.additional_device_discount, 90000);
  assert.equal(q.breakdown.total_device_discount, 690000);
  assert.equal(q.breakdown.selection_agreement_discount, 0);
  assert.equal(q.breakdown.plan_fee_after_discount, 83000);
  assert.equal(q.raw_result.total_contract_discount_benefit, 858000);
});

test('no selected bundle excludes all bundle discounts and assumptions', () => {
  const data = input(); delete data.calculation.bundle_id; data.bundle = null; data.bundle_rules = [];
  const q = calculatePreparedQuote(data);
  assert.equal(q.bundle_id, null);
  assert.equal(q.breakdown.bundle_mobile_discount_applied, 0);
  assert.equal(q.breakdown.plan_fee_after_discount, 67500);
  assert.equal(q.calculation_basis.eligibility_source, 'REQUEST');
});

test('six inputs show demo assumptions and never assert verified family eligibility', () => {
  const q = calculatePreparedQuote(input());
  assert.equal(q.calculation_basis.bundle_source, 'DEMO_POLICY');
  assert.equal(q.calculation_basis.quote_is_estimate, true);
  assert.equal(q.calculation_basis.bundle_eligibility_fully_verified, false);
  assert.deepEqual(q.calculation_basis.applied_bundle_rule_ids, []);
  assert.deepEqual(q.calculation_basis.bundle_demo_assumptions.family_mobile_monthly_fees, [90000, 90000]);
  assert.ok(q.result['계산 유의사항'].some(note => note.includes('실제 가입 자격')));
});

test('non-90000 plan retains the prepared discount table with a visible demonstration note', () => {
  const data = input(); data.plan.monthly_fee = 55000;
  const q = calculatePreparedQuote(data);
  assert.equal(q.breakdown.selection_agreement_discount, 13750);
  assert.ok(q.result['계산 유의사항'].some(note => note.includes('9만원 기준') && note.includes('시연')));
});

test('unsupported terms, missing policy and excessive subsidy fail instead of inventing a quote', () => {
  for (const overrides of [{ installment_months: 36 }, { contract_months: 12 }, { discount_type: 'OTHER' }]) {
    assert.throws(() => calculatePreparedQuote(input(overrides)));
  }
  const unknown = input(); unknown.product.product_name = 'Unregistered Phone'; unknown.product.maker = 'Other';
  assert.throws(() => calculatePreparedQuote(unknown), /등록된 단말 할인 정책/);
  const underpriced = input({ discount_type: 'DEVICE_DISCOUNT' }); underpriced.product.price = 500000;
  assert.throws(() => calculatePreparedQuote(underpriced), /단말 할인액/);
});

test('quotation policy never mutates its input catalog or calculation object', () => {
  const data = input(); const original = structuredClone(data);
  calculatePreparedQuote(data);
  assert.deepEqual(data, original);
});
