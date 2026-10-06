import type { CatalogItem, PlanTerms } from '../data/productCatalog.js';

export interface CatalogProduct { id: string; name: string; maker: string; storageGb: number; color: string; price: number }
export interface CatalogPlan {
  id: string; name: string; company: string | null; groupName: string; type: string; monthlyFee: number;
  dataUnlimited: boolean; dataGb: number | null; afterSpeedKbps: number | null;
  voiceUnlimited: boolean; voiceMinutes: number | null; textUnlimited: boolean; textCount: number | null;
}
export interface CatalogBundle {
  id: string; name: string; type: string; description: string; familyRequired: boolean; internetRequired: boolean;
  minMobileLines: number; maxMobileLines: number; discountMethod: string;
}
export interface CatalogBenefit { id: string; name: string; type: string; grade: string; description: string }
export interface ProductCatalog {
  source: 'supabase'; products: CatalogProduct[]; ownPlans: CatalogPlan[]; competitorPlans: CatalogPlan[];
  bundles: CatalogBundle[]; benefits: CatalogBenefit[];
}
export interface EffectivePriceInput {
  plan_id: string; product_id?: string; bundle_id?: string; customer_id?: string;
  family?: boolean; internet?: boolean; mobile_lines?: number;
}
export type DiscountStatus = 'not_selected' | 'not_applicable' | 'needs_confirmation' | 'applied';
export type PriceRowKey = 'plan_fee' | 'bundle_discount' | 'benefit_value' | 'contract_discount' | 'monthly_subtotal' | 'device_cash' | 'device_installment';
export interface PriceBreakdown {
  key: PriceRowKey; label: string; amount: number | null; period: 'monthly' | 'once';
  status: DiscountStatus | 'recorded' | 'calculated'; note?: string;
}
export interface PricePlan { id: string; name: string; monthlyFee: number }
export interface EffectivePriceResult {
  source: 'supabase'; policyVersion: 'db-fixed-mobile-v1'; plan: PricePlan; product: CatalogProduct | null;
  bundle: { id: string; name: string } | null; currentPlan: PricePlan | null; monthlyFeeDifference: number | null;
  bundleDiscount: { status: DiscountStatus; amount: number | null; ruleId: string | null; message: string };
  monthlySubtotal: number | null; productCashPrice: number | null; monthlyInstallment: null;
  finalMonthlyTotal: number | null; quoteScope: 'communication_only' | 'partial'; breakdown: PriceBreakdown[]; warnings: string[];
}

const errorMessages = {
  NETWORK: '상품 정보를 조회하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.',
  INVALID_RESPONSE: '상품 조회 결과를 확인할 수 없습니다. 다시 조회해 주세요.',
  INVALID_PRICE_REQUEST: '요금제와 계산 조건을 확인해 주세요.',
  PLAN_NOT_FOUND: '선택한 요금제가 조회되지 않았습니다. 상품 목록을 다시 조회해 주세요.',
  PRODUCT_NOT_FOUND: '선택한 단말이 조회되지 않았습니다. 상품 목록을 다시 조회해 주세요.',
  BUNDLE_NOT_FOUND: '선택한 결합이 조회되지 않았습니다. 상품 목록을 다시 조회해 주세요.',
  CUSTOMER_NOT_FOUND: '선택한 고객을 조회하지 못했습니다.',
  STORE_NOT_ALLOWED: '현재 매장에서 조회할 수 없는 고객입니다.',
  CUSTOMER_PRIVACY_RESTRICTED: '개인정보 동의를 확인하기 전에는 고객의 현재 요금제를 비교할 수 없습니다.',
  HOME_STORE_NOT_CONFIGURED: '현재 매장 설정을 확인한 뒤 고객 요금제를 비교해 주세요.',
  PRICE_DATA_INVALID: '등록된 가격 또는 조건을 확인할 수 없어 계산하지 않았습니다.',
  REAL_DATA_NOT_CONFIGURED: '저장된 상품 조회가 아직 준비되지 않았습니다.',
  REAL_DATA_CONFIG_INVALID: '저장된 상품 조회 설정을 확인해야 합니다.',
  REAL_DATA_ACCESS_DENIED: '저장된 상품 조회 권한을 확인해야 합니다.',
  REAL_DATA_ACCESS_RESTRICTED: '공개 환경의 직원 조회 접근 설정이 준비되지 않았습니다. 관리자에게 문의해 주세요.',
  REAL_DATA_UNAVAILABLE: '저장된 상품을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  REAL_DATA_TIMEOUT: '상품 조회 시간이 초과되었습니다. 다시 시도해 주세요.',
  REAL_DATA_INVALID_RESPONSE: '저장된 상품 조회 결과를 확인할 수 없습니다.',
  REAL_DATA_INVALID_QUERY: '상품 조회 조건을 확인해야 합니다.',
} as const;
export type EffectivePriceErrorCode = keyof typeof errorMessages;
export class EffectivePriceApiError extends Error {
  readonly code: EffectivePriceErrorCode;
  constructor(code: unknown) {
    const safeCode = typeof code === 'string' && Object.hasOwn(errorMessages, code) ? code as EffectivePriceErrorCode : 'REAL_DATA_UNAVAILABLE';
    super(errorMessages[safeCode]); this.name = 'EffectivePriceApiError'; this.code = safeCode;
  }
}
export function effectivePriceErrorMessage(error: unknown): string {
  return error instanceof EffectivePriceApiError ? error.message : errorMessages.REAL_DATA_UNAVAILABLE;
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => text(value) && value.trim().length > 0;
const money = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const count = (value: unknown): value is number | null => value === null || money(value);
const nullableMoney = count;
const ids = { product: /^product_\d{3,}$/, plan: /^own_plan_\d{3,}$/, competitor: /^competitor_plan_\d{3,}$/, bundle: /^bundle_\d{3,}$/, rule: /^bundle_rule_\d{3,}$/, benefit: /^benefit_\d{3,}$/, customer: /^customer_\d{3,}$/ };
const id = (kind: keyof typeof ids, value: unknown): value is string => text(value) && ids[kind].test(value);
function invalid(): never { throw new EffectivePriceApiError('INVALID_RESPONSE'); }
function unique<T extends { id: string }>(value: unknown, parse: (row: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > 1000) return invalid();
  const rows = value.map(parse); if (new Set(rows.map(row => row.id)).size !== rows.length) return invalid(); return rows;
}
function product(value: unknown): CatalogProduct {
  if (!record(value) || !id('product', value.id) || !nonempty(value.name) || !nonempty(value.maker)
    || !money(value.storageGb) || value.storageGb < 1 || !nonempty(value.color) || !money(value.price) || value.price < 1) return invalid();
  return { id: value.id, name: value.name, maker: value.maker, storageGb: value.storageGb, color: value.color, price: value.price };
}
function pricePlan(value: unknown): PricePlan {
  if (!record(value) || !id('plan', value.id) || !nonempty(value.name) || !money(value.monthlyFee)) return invalid();
  return { id: value.id, name: value.name, monthlyFee: value.monthlyFee };
}
function plan(value: unknown, competitor = false): CatalogPlan {
  if (!record(value) || !id(competitor ? 'competitor' : 'plan', value.id) || !nonempty(value.name)
    || !(competitor ? nonempty(value.company) : value.company === null) || !nonempty(value.groupName) || !nonempty(value.type) || !money(value.monthlyFee)
    || typeof value.dataUnlimited !== 'boolean' || !(value.dataGb === null || typeof value.dataGb === 'number' && Number.isFinite(value.dataGb) && value.dataGb >= 0)
    || !count(value.afterSpeedKbps) || typeof value.voiceUnlimited !== 'boolean' || !count(value.voiceMinutes)
    || typeof value.textUnlimited !== 'boolean' || !count(value.textCount)) return invalid();
  return { id: value.id, name: value.name, company: value.company as string | null, groupName: value.groupName, type: value.type,
    monthlyFee: value.monthlyFee, dataUnlimited: value.dataUnlimited, dataGb: value.dataGb as number | null,
    afterSpeedKbps: value.afterSpeedKbps, voiceUnlimited: value.voiceUnlimited, voiceMinutes: value.voiceMinutes,
    textUnlimited: value.textUnlimited, textCount: value.textCount };
}
function bundle(value: unknown): CatalogBundle {
  if (!record(value) || !id('bundle', value.id) || !nonempty(value.name) || !nonempty(value.type) || !text(value.description)
    || typeof value.familyRequired !== 'boolean' || typeof value.internetRequired !== 'boolean'
    || !money(value.minMobileLines) || value.minMobileLines < 1 || !money(value.maxMobileLines) || value.maxMobileLines < value.minMobileLines
    || !nonempty(value.discountMethod)) return invalid();
  return { id: value.id, name: value.name, type: value.type, description: value.description, familyRequired: value.familyRequired,
    internetRequired: value.internetRequired, minMobileLines: value.minMobileLines, maxMobileLines: value.maxMobileLines, discountMethod: value.discountMethod };
}
function benefit(value: unknown): CatalogBenefit {
  if (!record(value) || !id('benefit', value.id) || !nonempty(value.name) || !nonempty(value.type) || !nonempty(value.grade) || !text(value.description)) return invalid();
  return { id: value.id, name: value.name, type: value.type, grade: value.grade, description: value.description };
}
export function parseProductCatalog(value: unknown): ProductCatalog {
  if (!record(value) || value.source !== 'supabase') return invalid();
  return { source: 'supabase', products: unique(value.products, product), ownPlans: unique(value.ownPlans, row => plan(row)),
    competitorPlans: unique(value.competitorPlans, row => plan(row, true)), bundles: unique(value.bundles, bundle), benefits: unique(value.benefits, benefit) };
}
const rowKeys: readonly PriceRowKey[] = ['plan_fee', 'bundle_discount', 'benefit_value', 'contract_discount', 'monthly_subtotal', 'device_cash', 'device_installment'];
const rowStatuses: readonly string[] = ['not_selected', 'not_applicable', 'needs_confirmation', 'applied', 'recorded', 'calculated'];
const discountStatuses: readonly DiscountStatus[] = ['not_selected', 'not_applicable', 'needs_confirmation', 'applied'];
export function parseEffectivePrice(value: unknown, expected?: EffectivePriceInput): EffectivePriceResult {
  if (!record(value) || value.source !== 'supabase' || value.policyVersion !== 'db-fixed-mobile-v1') return invalid();
  const selectedPlan = pricePlan(value.plan); const selectedProduct = value.product === null ? null : product(value.product);
  const currentPlan = value.currentPlan === null ? null : pricePlan(value.currentPlan);
  if (!(value.bundle === null || record(value.bundle) && id('bundle', value.bundle.id) && nonempty(value.bundle.name))) return invalid();
  const selectedBundle = value.bundle === null ? null : { id: value.bundle.id as string, name: value.bundle.name as string };
  if (!record(value.bundleDiscount) || !discountStatuses.includes(value.bundleDiscount.status as DiscountStatus) || !nonempty(value.bundleDiscount.message)
    || !nullableMoney(value.bundleDiscount.amount) || !(value.bundleDiscount.ruleId === null || id('rule', value.bundleDiscount.ruleId))) return invalid();
  const discount = { status: value.bundleDiscount.status as DiscountStatus, amount: value.bundleDiscount.amount,
    ruleId: value.bundleDiscount.ruleId as string | null, message: value.bundleDiscount.message };
  if (discount.status === 'applied' ? !selectedBundle || discount.amount === null || discount.amount > selectedPlan.monthlyFee || discount.ruleId === null
    : discount.amount !== null || discount.ruleId !== null) return invalid();
  if ((selectedBundle === null) !== (discount.status === 'not_selected')) return invalid();
  if (!nullableMoney(value.monthlySubtotal) || (discount.status === 'needs_confirmation') !== (value.monthlySubtotal === null)
    || value.monthlySubtotal !== null && value.monthlySubtotal > selectedPlan.monthlyFee
    || !(value.monthlyFeeDifference === null || typeof value.monthlyFeeDifference === 'number' && Number.isSafeInteger(value.monthlyFeeDifference))
    || (currentPlan === null) !== (value.monthlyFeeDifference === null) || value.productCashPrice !== (selectedProduct?.price ?? null)
    || value.monthlyInstallment !== null || !['communication_only', 'partial'].includes(value.quoteScope as string)
    || !nullableMoney(value.finalMonthlyTotal) || (value.quoteScope === 'communication_only'
      ? selectedProduct !== null || selectedBundle !== null || value.finalMonthlyTotal !== value.monthlySubtotal
      : value.finalMonthlyTotal !== null)) return invalid();
  // Monetary calculation is owned by the server. The browser checks types and projects returned amounts.
  const subtotal = value.monthlySubtotal; const difference = value.monthlyFeeDifference;
  if (expected && (selectedPlan.id !== expected.plan_id || (selectedProduct?.id ?? undefined) !== expected.product_id
    || (selectedBundle?.id ?? undefined) !== expected.bundle_id || !expected.customer_id && currentPlan !== null
    || expected.customer_id && currentPlan === null && value.quoteScope !== 'partial')) return invalid();
  if (!Array.isArray(value.breakdown) || value.breakdown.length !== rowKeys.length) return invalid();
  const rows = value.breakdown.map((row): PriceBreakdown => {
    if (!record(row) || !rowKeys.includes(row.key as PriceRowKey) || !nonempty(row.label) || !nullableMoney(row.amount)
      || !['monthly', 'once'].includes(row.period as string) || !rowStatuses.includes(row.status as string) || !(row.note === undefined || nonempty(row.note))) return invalid();
    return { key: row.key as PriceRowKey, label: row.label, amount: row.amount, period: row.period as 'monthly' | 'once',
      status: row.status as PriceBreakdown['status'], ...(row.note === undefined ? {} : { note: row.note }) };
  });
  if (new Set(rows.map(row => row.key)).size !== rowKeys.length) return invalid();
  const matches = (key: PriceRowKey, amount: number | null, status: string, period = 'monthly') => rows.some(row => row.key === key && row.amount === amount && row.status === status && row.period === period);
  if (!matches('plan_fee', selectedPlan.monthlyFee, 'recorded') || !matches('bundle_discount', discount.amount, discount.status)
    || !matches('benefit_value', null, 'needs_confirmation') || !matches('contract_discount', null, 'needs_confirmation')
    || !matches('monthly_subtotal', subtotal, subtotal === null ? 'needs_confirmation' : 'calculated')
    || !matches('device_cash', selectedProduct?.price ?? null, selectedProduct ? 'recorded' : 'not_selected', 'once')
    || !matches('device_installment', null, selectedProduct ? 'needs_confirmation' : 'not_selected')
    || !Array.isArray(value.warnings) || !value.warnings.every(nonempty)) return invalid();
  return { source: 'supabase', policyVersion: 'db-fixed-mobile-v1', plan: selectedPlan, product: selectedProduct, bundle: selectedBundle,
    currentPlan, monthlyFeeDifference: difference, bundleDiscount: discount, monthlySubtotal: subtotal, productCashPrice: selectedProduct?.price ?? null,
    monthlyInstallment: null, finalMonthlyTotal: value.finalMonthlyTotal, quoteScope: value.quoteScope as EffectivePriceResult['quoteScope'],
    breakdown: rows, warnings: [...value.warnings] };
}
function validInput(value: EffectivePriceInput): boolean {
  return record(value) && Object.keys(value).every(key => ['plan_id', 'product_id', 'bundle_id', 'customer_id', 'family', 'internet', 'mobile_lines'].includes(key))
    && id('plan', value.plan_id) && (value.product_id === undefined || id('product', value.product_id))
    && (value.bundle_id === undefined || id('bundle', value.bundle_id)) && (value.customer_id === undefined || id('customer', value.customer_id))
    && (value.family === undefined || typeof value.family === 'boolean') && (value.internet === undefined || typeof value.internet === 'boolean')
    && (value.mobile_lines === undefined || money(value.mobile_lines) && value.mobile_lines >= 1);
}
async function request<T>(path: string, parse: (value: unknown) => T, signal?: AbortSignal, input?: EffectivePriceInput): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method: input ? 'POST' : 'GET', signal,
    headers: input ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
    ...(input ? { body: JSON.stringify(input) } : {}) }); }
  catch { throw new EffectivePriceApiError('NETWORK'); }
  let body: unknown;
  try { body = await response.json(); } catch { throw new EffectivePriceApiError(response.ok ? 'INVALID_RESPONSE' : 'REAL_DATA_UNAVAILABLE'); }
  if (!response.ok) throw new EffectivePriceApiError(record(body) ? body.errorCode : undefined);
  return parse(body);
}
export const loadProductCatalog = (signal?: AbortSignal): Promise<ProductCatalog> => request('/api/products/catalog', parseProductCatalog, signal);
export function calculateEffectivePrice(input: EffectivePriceInput, signal?: AbortSignal): Promise<EffectivePriceResult> {
  if (!validInput(input)) return Promise.reject(new EffectivePriceApiError('INVALID_PRICE_REQUEST'));
  return request('/api/effective-price', value => parseEffectivePrice(value, input), signal, input);
}

export const storedProductNote = '저장된 상품 정보입니다. 가입·구매 전 최신 요금·조건·사양을 별도로 확인하세요.';
export const formatEffectivePrice = (value: number): string => `${value.toLocaleString('ko-KR')}원`;
const allowance = (unlimited: boolean, value: number | null, unit: string) => unlimited ? '무제한' : value === null ? '제공량 확인 필요' : `${value.toLocaleString('ko-KR')}${unit}`;
/** Keeps the existing four tabs and comparison contract without adding reference prices. */
export function toCatalogItems(catalog: ProductCatalog): CatalogItem[] {
  const plans = (rows: CatalogPlan[], carrier: 'own' | 'other'): CatalogItem[] => rows.map(row => {
    const terms: PlanTerms = { carrier, monthlyFee: row.monthlyFee, data: allowance(row.dataUnlimited, row.dataGb, 'GB'),
      voice: allowance(row.voiceUnlimited, row.voiceMinutes, '분'), messages: allowance(row.textUnlimited, row.textCount, '건'),
      condition: '가입 자격 별도 확인', benefit: '혜택 상세·월환산 금액 확인 필요' };
    return { id: row.id, tab: 'plans', name: row.name, tag: carrier === 'own' ? '자사' : row.company ?? '타사',
      summary: `${row.groupName} · ${terms.data}`, plan: terms, sections: [
        { title: '요금제 기본 정보', fields: [{ label: '월정액', value: formatEffectivePrice(row.monthlyFee) }, { label: '상품 그룹', value: row.groupName }, { label: '상품 유형', value: row.type }] },
        { title: '이용 조건', fields: [{ label: '데이터 제공량', value: terms.data }, { label: '음성', value: terms.voice }, { label: '문자', value: terms.messages },
          { label: '소진 후 속도', value: row.afterSpeedKbps === null ? '확인 필요' : `${row.afterSpeedKbps.toLocaleString('ko-KR')}kbps` }, { label: '가입 조건', value: terms.condition }] },
        { title: '할인·혜택', fields: [{ label: '안내 기준', value: '약정·결합 할인 전 월정액' }, { label: '혜택 확인', value: terms.benefit }] },
      ] };
  });
  return [...plans(catalog.ownPlans, 'own'), ...plans(catalog.competitorPlans, 'other'),
    ...catalog.bundles.map((row): CatalogItem => ({ id: row.id, tab: 'bundles', name: row.name, summary: row.description, tag: '결합', sections: [
      { title: '결합 조건', fields: [{ label: '등록 설명', value: row.description || '확인 필요' }, { label: '가족관계', value: row.familyRequired ? '필수' : '필수 조건 아님' },
        { label: '인터넷', value: row.internetRequired ? '필수' : '필수 조건 아님' }, { label: '휴대전화 회선', value: `${row.minMobileLines}~${row.maxMobileLines}회선` }] },
      { title: '할인 확인', fields: [{ label: '계산 안내', value: '확인된 회선별 정액 구간만 계산하며, 나머지 조건은 별도 확인' }] },
    ] })),
    ...catalog.benefits.map((row): CatalogItem => ({ id: row.id, tab: 'benefits', name: row.name, summary: row.description, tag: '혜택', sections: [
      { title: '혜택 정보', fields: [{ label: '혜택 내용', value: row.description || '확인 필요' }, { label: '대상 등급', value: row.grade },
        { label: '월환산 금액', value: '등록된 월환산 금액 없음' }, { label: '적용 조건', value: '사용 조건 및 제공 기간 별도 확인' }] },
    ] })),
    ...catalog.products.map((row): CatalogItem => ({ id: row.id, tab: 'devices', name: row.name, summary: `${row.storageGb}GB · ${row.color}`, tag: row.maker, sections: [
      { title: '제품 정보', fields: [{ label: '제조사', value: row.maker }, { label: '용량·색상', value: `${row.storageGb}GB · ${row.color}` }] },
      { title: '판매 정보', fields: [{ label: '등록 가격', value: formatEffectivePrice(row.price) }, { label: '월할부', value: '할부 조건 확인 필요' },
        { label: '재고 확인', value: '스마트 재고에서 조회' }, { label: '가격 확인', value: '등록 가격의 적용 기준과 세금 포함 여부 별도 확인' }] },
    ] }))];
}
