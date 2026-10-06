/** Read-only product catalog and deterministic calculation from verified DB values. */
export const EFFECTIVE_PRICE_POLICY = 'db-fixed-mobile-v1';

const ids = { product: /^product_\d{3,}$/, plan: /^own_plan_\d{3,}$/, competitor: /^competitor_plan_\d{3,}$/, bundle: /^bundle_\d{3,}$/, rule: /^bundle_rule_\d{3,}$/, benefit: /^benefit_\d{3,}$/, customer: /^customer_\d{3,}$/, store: /^store_\d{3,}$/, consultation: /^consultation_\d{3,}$/ };
const object = (/** @type {any} */ value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (/** @type {any} */ value, minimum = 0) => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const text = (/** @type {any} */ value) => typeof value === 'string' && value.trim().length > 0;
class PriceFailure extends Error { constructor(/** @type {string} */ code) { super(code); this.code = code; } }
const requireData = (/** @type {unknown} */ condition) => { if (!condition) throw new PriceFailure('PRICE_DATA_INVALID'); };
const requireInput = (/** @type {unknown} */ condition) => { if (!condition) throw new PriceFailure('INVALID_PRICE_REQUEST'); };

const productSelect = 'id,name,maker,storage_gb,color,price';
const planSelect = 'id,name,group_name,type,monthly_fee,data_unlimited,data_gb,after_speed_kbps,voice_unlimited,voice_minutes,text_unlimited,text_count';
const bundleSelect = 'id,name,type,description,family_required,internet_required,min_mobile_lines,max_mobile_lines,discount_method';
const ruleSelect = 'id,bundle_id,order_no,type,service,scope,fee_basis,min_fee,max_fee,min_speed,max_speed,min_line,max_line,customer_condition,mobile_discount,mobile_rate,extra_discount,description';

function productDto(/** @type {any} */ row) {
  requireData(object(row) && typeof row.id === 'string' && ids.product.test(row.id) && text(row.name) && integer(row.price, 1)
    && text(row.maker) && integer(row.storage_gb, 1) && text(row.color));
  return { id: row.id, name: row.name, maker: row.maker, storageGb: row.storage_gb, color: row.color, price: row.price };
}
function planPrice(/** @type {any} */ row) {
  requireData(object(row) && typeof row.id === 'string' && ids.plan.test(row.id) && text(row.name) && integer(row.monthly_fee));
  return { id: row.id, name: row.name, monthlyFee: row.monthly_fee };
}
const nullableCount = (/** @type {any} */ value) => value === null || integer(value);
function planDto(/** @type {any} */ row, competitor = false) {
  requireData(object(row) && typeof row.id === 'string' && (competitor ? ids.competitor : ids.plan).test(row.id)
    && text(row.name) && text(row.group_name) && text(row.type) && integer(row.monthly_fee)
    && [row.data_unlimited, row.voice_unlimited, row.text_unlimited].every(value => typeof value === 'boolean')
    && [row.after_speed_kbps, row.voice_minutes, row.text_count].every(nullableCount));
  // Numeric data allowances can be serialized as a number or a decimal string by Postgres.
  const allowance = row.data_gb === null ? null : typeof row.data_gb === 'number' ? row.data_gb
    : typeof row.data_gb === 'string' && /^\d+(?:\.\d+)?$/.test(row.data_gb) ? Number(row.data_gb) : NaN;
  requireData(allowance === null || Number.isFinite(allowance) && allowance >= 0);
  if (competitor) requireData(text(row.company));
  return { id: row.id, name: row.name, company: competitor ? row.company : null, groupName: row.group_name, type: row.type,
    monthlyFee: row.monthly_fee, dataUnlimited: row.data_unlimited, dataGb: allowance, afterSpeedKbps: row.after_speed_kbps,
    voiceUnlimited: row.voice_unlimited, voiceMinutes: row.voice_minutes, textUnlimited: row.text_unlimited, textCount: row.text_count };
}
function bundleDto(/** @type {any} */ row) {
  requireData(object(row) && typeof row.id === 'string' && ids.bundle.test(row.id) && text(row.name) && text(row.type)
    && typeof row.description === 'string' && typeof row.family_required === 'boolean' && typeof row.internet_required === 'boolean'
    && integer(row.min_mobile_lines, 1) && integer(row.max_mobile_lines, row.min_mobile_lines) && text(row.discount_method));
  return { id: row.id, name: row.name, type: row.type, description: row.description, familyRequired: row.family_required,
    internetRequired: row.internet_required, minMobileLines: row.min_mobile_lines, maxMobileLines: row.max_mobile_lines, discountMethod: row.discount_method };
}
function benefitDto(/** @type {any} */ row) {
  requireData(object(row) && typeof row.id === 'string' && ids.benefit.test(row.id) && text(row.name) && text(row.type)
    && text(row.grade) && typeof row.description === 'string');
  return { id: row.id, name: row.name, type: row.type, grade: row.grade, description: row.description };
}

function requestInput(/** @type {any} */ body) {
  requireInput(object(body));
  requireInput(Object.keys(body).every(key => ['plan_id', 'product_id', 'bundle_id', 'customer_id', 'family', 'internet', 'mobile_lines'].includes(key)));
  requireInput(typeof body.plan_id === 'string' && ids.plan.test(body.plan_id));
  for (const [field, pattern] of [['product_id', ids.product], ['bundle_id', ids.bundle], ['customer_id', ids.customer]]) {
    requireInput(body[/** @type {string} */ (field)] === undefined
      || typeof body[/** @type {string} */ (field)] === 'string' && /** @type {RegExp} */ (pattern).test(body[/** @type {string} */ (field)]));
  }
  requireInput(body.family === undefined || typeof body.family === 'boolean');
  requireInput(body.internet === undefined || typeof body.internet === 'boolean');
  requireInput(body.mobile_lines === undefined || integer(body.mobile_lines, 1));
  return body;
}

/**
 * No percentage, installment, subsidy, household allocation, or text eligibility is inferred.
 * The approved fixed mobile tier uses DB descriptions' inclusive min / exclusive max fee boundaries.
 * @param {{plan: any, product?: any, bundle?: any, rules?: any[], conditions?: any, currentPlan?: any, customerSelected?: boolean}} input
 */
export function calculateEffectivePrice({ plan, product = null, bundle = null, rules = [], conditions = {}, currentPlan = null, customerSelected = false }) {
  const selectedPlan = planPrice(plan);
  const selectedProduct = product === null ? null : productDto(product);
  const selectedBundle = bundle === null ? null : bundleDto(bundle);
  const current = currentPlan === null ? null : planPrice(currentPlan);
  /** @type {{status: string, amount: number | null, ruleId: string | null, message: string}} */
  let discount = { status: 'not_selected', amount: null, ruleId: null, message: '결합을 선택하지 않았습니다.' };
  /** @type {number | null} */
  let monthlySubtotal = selectedPlan.monthlyFee;
  const warnings = ['선택약정·지원금·월할부·이자는 계산에 포함하지 않았습니다.', '등록 금액의 세금 포함 여부와 추가 비용은 별도 확인이 필요합니다.'];
  if (selectedBundle) {
    discount = { status: 'needs_confirmation', amount: null, ruleId: null, message: '결합 조건과 이 회선에 적용되는 금액을 확인해야 합니다.' };
    monthlySubtotal = null;
    if (selectedBundle.familyRequired && conditions.family === false || selectedBundle.internetRequired && conditions.internet === false
      || integer(conditions.mobile_lines, 1) && (conditions.mobile_lines < selectedBundle.minMobileLines || conditions.mobile_lines > selectedBundle.maxMobileLines)) {
      discount = { ...discount, status: 'not_applicable', message: '입력한 조건이 선택한 결합의 가입 조건을 충족하지 않습니다.' };
      monthlySubtotal = selectedPlan.monthlyFee;
    } else if ((!selectedBundle.familyRequired || conditions.family === true)
      && (!selectedBundle.internetRequired || conditions.internet === true) && integer(conditions.mobile_lines, 1)
      && selectedBundle.type === 'FIXED' && selectedBundle.discountMethod === 'PER_LINE_FEE_TIER') {
      const candidates = rules.filter(row => row?.service === 'MOBILE' && row?.scope === 'PER_LINE' && row?.fee_basis === 'PER_LINE');
      for (const row of candidates) requireData(typeof row.id === 'string' && ids.rule.test(row.id) && row.bundle_id === selectedBundle.id
        && nullableCount(row.min_fee) && nullableCount(row.max_fee) && nullableCount(row.min_line) && nullableCount(row.max_line)
        && (row.min_fee === null || row.max_fee === null || row.min_fee < row.max_fee)
        && (row.min_line === null || row.max_line === null || row.min_line <= row.max_line));
      const matching = candidates.filter(row => (row.min_fee === null || selectedPlan.monthlyFee >= row.min_fee)
        && (row.max_fee === null || selectedPlan.monthlyFee < row.max_fee)
        && (row.min_line === null || conditions.mobile_lines >= row.min_line)
        && (row.max_line === null || conditions.mobile_lines <= row.max_line));
      if (matching.length > 1) throw new PriceFailure('PRICE_DATA_INVALID');
      const rule = matching[0];
      // Null does not mean a zero discount. Additional/rate/speed/text conditions stay uncalculated.
      if (rule && rule.type === 'PER_LINE_FEE' && rule.customer_condition === null && rule.min_speed === null && rule.max_speed === null
        && rule.mobile_rate === null && rule.extra_discount === null && integer(rule.mobile_discount)) {
        requireData(rule.mobile_discount <= selectedPlan.monthlyFee);
        discount = { status: 'applied', amount: rule.mobile_discount, ruleId: rule.id, message: '등록된 회선별 정액 할인 구간을 적용했습니다.' };
        monthlySubtotal = selectedPlan.monthlyFee - rule.mobile_discount;
      }
    }
    if (discount.status === 'needs_confirmation') warnings.push(discount.message);
  }
  if (customerSelected && !current) warnings.push('고객의 현재 요금제 정보가 없어 요금 차이를 계산하지 않았습니다.');
  const completeCommunicationOnly = selectedProduct === null && selectedBundle === null && (!customerSelected || current !== null);
  return { source: 'supabase', policyVersion: EFFECTIVE_PRICE_POLICY, plan: selectedPlan, product: selectedProduct,
    bundle: selectedBundle ? { id: selectedBundle.id, name: selectedBundle.name } : null, currentPlan: current,
    monthlyFeeDifference: current ? selectedPlan.monthlyFee - current.monthlyFee : null,
    bundleDiscount: discount, monthlySubtotal, productCashPrice: selectedProduct?.price ?? null,
    monthlyInstallment: null, finalMonthlyTotal: completeCommunicationOnly ? monthlySubtotal : null,
    quoteScope: completeCommunicationOnly ? 'communication_only' : 'partial',
    breakdown: [
      { key: 'plan_fee', label: '선택 요금제 월정액', amount: selectedPlan.monthlyFee, period: 'monthly', status: 'recorded' },
      { key: 'bundle_discount', label: '결합 할인', amount: discount.amount, period: 'monthly', status: discount.status },
      { key: 'benefit_value', label: '혜택 금액', amount: null, period: 'monthly', status: 'needs_confirmation', note: 'DB 월환산 금액 없음' },
      { key: 'contract_discount', label: '약정 할인', amount: null, period: 'monthly', status: 'needs_confirmation', note: '약정 할인율 확인 필요' },
      { key: 'monthly_subtotal', label: '월 통신요금 소계', amount: monthlySubtotal, period: 'monthly', status: monthlySubtotal === null ? 'needs_confirmation' : 'calculated' },
      { key: 'device_cash', label: '단말 현금 가격', amount: selectedProduct?.price ?? null, period: 'once', status: selectedProduct ? 'recorded' : 'not_selected' },
      { key: 'device_installment', label: '단말 월할부', amount: null, period: 'monthly', status: selectedProduct ? 'needs_confirmation' : 'not_selected' },
    ], warnings };
}

const errorStatus = /** @type {Record<string, number>} */ ({ INVALID_PRICE_REQUEST: 400, PLAN_NOT_FOUND: 404, PRODUCT_NOT_FOUND: 404,
  BUNDLE_NOT_FOUND: 404, CUSTOMER_NOT_FOUND: 404, STORE_NOT_ALLOWED: 403, CUSTOMER_PRIVACY_RESTRICTED: 403, HOME_STORE_NOT_CONFIGURED: 503,
  PRICE_DATA_INVALID: 502, REAL_DATA_NOT_CONFIGURED: 503, REAL_DATA_CONFIG_INVALID: 503, REAL_DATA_ACCESS_DENIED: 502,
  REAL_DATA_UNAVAILABLE: 502, REAL_DATA_TIMEOUT: 504, REAL_DATA_INVALID_RESPONSE: 502, REAL_DATA_INVALID_QUERY: 500 });
const failure = (/** @type {string} */ code) => ({ status: errorStatus[code] ?? 502, body: { errorCode: Object.hasOwn(errorStatus, code) ? code : 'REAL_DATA_UNAVAILABLE' } });

/** @param {{provider: Pick<ReturnType<import('./real-data.mjs').createSupabaseReadProvider>, 'read' | 'readOne'>, homeStoreId?: string | null}} options */
export function createEffectivePriceApi({ provider, homeStoreId = null }) {
  const read = async (/** @type {string} */ table, /** @type {import('./real-data.mjs').ReadQuery} */ query) => {
    const result = await provider.read(table, query);
    if (!result.ok) throw new PriceFailure(result.code);
    requireData(Array.isArray(result.data));
    return result.data;
  };
  const one = async (/** @type {string} */ table, /** @type {import('./real-data.mjs').ReadQuery} */ query) => {
    const result = await provider.readOne(table, query);
    if (!result.ok) throw new PriceFailure(result.code);
    return result.data;
  };
  return {
    /** @param {string} method @param {string} path @param {URLSearchParams} _query @param {any} body */
    async handle(method, path, _query, body) {
      if (path !== '/api/products/catalog' && path !== '/api/effective-price') return null;
      if (method !== (path === '/api/products/catalog' ? 'GET' : 'POST')) return { status: 405, body: { errorCode: 'METHOD_NOT_ALLOWED' } };
      try {
        if (path === '/api/products/catalog') {
          const [products, own, other, bundles, benefits] = await Promise.all([
            read('products', { select: productSelect, order: 'id.asc', limit: 1000 }),
            read('own_plans', { select: planSelect, order: 'id.asc', limit: 1000 }),
            read('competitor_plans', { select: 'company,' + planSelect, order: 'id.asc', limit: 1000 }),
            read('bundles', { select: bundleSelect, order: 'id.asc', limit: 1000 }),
            read('benefits', { select: 'id,type,grade,name,description', order: 'id.asc', limit: 1000 }),
          ]);
          const unique = (/** @type {any[]} */ rows) => { requireData(new Set(rows.map(row => row.id)).size === rows.length); return rows; };
          return { status: 200, body: { source: 'supabase', products: unique(products.map(productDto)), ownPlans: unique(own.map(row => planDto(row))),
            competitorPlans: unique(other.map(row => planDto(row, true))), bundles: unique(bundles.map(bundleDto)), benefits: unique(benefits.map(benefitDto)) } };
        }
        const input = requestInput(body);
        const plan = await one('own_plans', { select: 'id,name,monthly_fee', filters: { id: 'eq.' + input.plan_id } });
        if (!plan) throw new PriceFailure('PLAN_NOT_FOUND');
        requireData(plan.id === input.plan_id);
        const product = input.product_id ? await one('products', { select: productSelect, filters: { id: 'eq.' + input.product_id } }) : null;
        if (input.product_id && !product) throw new PriceFailure('PRODUCT_NOT_FOUND');
        if (product) requireData(product.id === input.product_id);
        const bundle = input.bundle_id ? await one('bundles', { select: bundleSelect, filters: { id: 'eq.' + input.bundle_id } }) : null;
        if (input.bundle_id && !bundle) throw new PriceFailure('BUNDLE_NOT_FOUND');
        if (bundle) requireData(bundle.id === input.bundle_id);
        const rules = bundle ? await read('bundle_rules', { select: ruleSelect, filters: { bundle_id: 'eq.' + bundle.id }, order: 'order_no.asc,id.asc', limit: 1000 }) : [];
        let currentPlan = null;
        if (input.customer_id) {
          if (typeof homeStoreId !== 'string' || !ids.store.test(homeStoreId)) throw new PriceFailure('HOME_STORE_NOT_CONFIGURED');
          const link = await one('consultations', { select: 'id,customer_id,store_id', filters: { customer_id: 'eq.' + input.customer_id, store_id: 'eq.' + homeStoreId } });
          if (!link) throw new PriceFailure('STORE_NOT_ALLOWED');
          requireData(typeof link.id === 'string' && ids.consultation.test(link.id) && link.customer_id === input.customer_id && link.store_id === homeStoreId);
          const customer = await one('customers', { select: 'id,plan_id,privacy_consent', filters: { id: 'eq.' + input.customer_id } });
          if (!customer) throw new PriceFailure('CUSTOMER_NOT_FOUND');
          requireData(customer.id === input.customer_id);
          requireData(typeof customer.privacy_consent === 'boolean');
          if (!customer.privacy_consent) throw new PriceFailure('CUSTOMER_PRIVACY_RESTRICTED');
          if (customer.plan_id !== null) {
            requireData(typeof customer.plan_id === 'string' && ids.plan.test(customer.plan_id));
            currentPlan = await one('own_plans', { select: 'id,name,monthly_fee', filters: { id: 'eq.' + customer.plan_id } });
            requireData(currentPlan && currentPlan.id === customer.plan_id);
          }
        }
        return { status: 200, body: calculateEffectivePrice({ plan, product, bundle, rules, conditions: input, currentPlan, customerSelected: Boolean(input.customer_id) }) };
      } catch (error) { return failure(error instanceof PriceFailure ? error.code : 'REAL_DATA_UNAVAILABLE'); }
    },
  };
}
