import { useEffect, useId, useRef, useState } from 'react';
import { calculateEffectivePrice, effectivePriceErrorMessage, formatEffectivePrice, type EffectivePriceInput, type EffectivePriceResult, type PriceBreakdown, type ProductCatalog } from '../services/effectivePriceApi';
import type { StoredCustomer } from '../services/realDataApi';
import { storedCustomerDisplayName } from '../lib/customerName';

interface PriceChoices { planId: string; productId: string; bundleId: string; customerId: string; family: string; internet: string; mobileLines: string }
export interface EffectivePricePanelProps {
  catalog: ProductCatalog; customers?: readonly StoredCustomer[]; customersError?: string;
  initialPlanId?: string; initialProductId?: string;
}
function amountLabel(row: PriceBreakdown): string {
  if (row.amount !== null) return formatEffectivePrice(row.amount);
  if (row.status === 'not_selected') return '선택 안함';
  if (row.status === 'not_applicable') return '조건 미충족 · 미적용';
  return '확인 필요';
}
const validLines = (value: string) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));

/** Server-read prices only; editing a selection invalidates any result from earlier choices. */
export function EffectivePricePanel({ catalog, customers, customersError, initialPlanId = '', initialProductId = '' }: EffectivePricePanelProps) {
  const elementId = useId();
  const [choices, setChoices] = useState<PriceChoices>(() => ({
    planId: catalog.ownPlans.some(plan => plan.id === initialPlanId) ? initialPlanId : '',
    productId: catalog.products.some(product => product.id === initialProductId) ? initialProductId : '',
    bundleId: '', customerId: '', family: '', internet: '', mobileLines: '',
  }));
  const [result, setResult] = useState<EffectivePriceResult | null>(null);
  const [resultRevision, setResultRevision] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const generation = useRef(0); const activeRequest = useRef<AbortController | null>(null);
  const catalogRevision = JSON.stringify(catalog);
  const customerRevision = JSON.stringify(customers?.map(customer => ({ id: customer.id, privacyConsent: customer.privacyConsent, currentPlan: customer.currentPlan })) ?? []);
  const dataRevision = `${catalogRevision}|${customerRevision}`;
  const invalidate = () => {
    generation.current += 1; activeRequest.current?.abort(); activeRequest.current = null;
    setResult(null); setResultRevision(''); setError(''); setLoading(false);
  };
  useEffect(() => {
    invalidate();
    setChoices(previous => ({ ...previous,
      planId: catalog.ownPlans.some(plan => plan.id === previous.planId) ? previous.planId : '',
      productId: catalog.products.some(product => product.id === previous.productId) ? previous.productId : '',
      bundleId: catalog.bundles.some(bundle => bundle.id === previous.bundleId) ? previous.bundleId : '',
      customerId: customers?.some(customer => customer.id === previous.customerId && customer.privacyConsent) ? previous.customerId : '',
    }));
    return () => { generation.current += 1; activeRequest.current?.abort(); activeRequest.current = null; };
  }, [catalogRevision, customerRevision]);
  const change = (field: keyof PriceChoices, value: string) => {
    invalidate(); setChoices(previous => ({ ...previous, [field]: value,
      ...(field === 'bundleId' ? { family: '', internet: '', mobileLines: '' } : {}) }));
  };
  const selectedPlan = catalog.ownPlans.find(plan => plan.id === choices.planId);
  const selectedCustomer = customers?.find(customer => customer.id === choices.customerId);
  const calculate = async () => {
    invalidate();
    if (!selectedPlan) { setError('계산할 자사 요금제를 선택해 주세요.'); return; }
    if (choices.customerId && (!selectedCustomer || !selectedCustomer.privacyConsent)) { setError('현재 매장의 고객과 개인정보 동의를 다시 확인해 주세요.'); return; }
    if (choices.bundleId && choices.mobileLines !== '' && !validLines(choices.mobileLines)) { setError('휴대전화 회선 수를 1 이상의 정수로 입력해 주세요.'); return; }
    const input: EffectivePriceInput = { plan_id: choices.planId,
      ...(choices.productId ? { product_id: choices.productId } : {}), ...(choices.bundleId ? { bundle_id: choices.bundleId } : {}),
      ...(choices.customerId ? { customer_id: choices.customerId } : {}), ...(choices.bundleId ? {
        ...(choices.family === '' ? {} : { family: choices.family === 'yes' }),
        ...(choices.internet === '' ? {} : { internet: choices.internet === 'yes' }),
        ...(choices.mobileLines === '' ? {} : { mobile_lines: Number(choices.mobileLines) }),
      } : {}) };
    const token = generation.current; const controller = new AbortController(); activeRequest.current = controller; setLoading(true);
    try {
      const response = await calculateEffectivePrice(input, controller.signal);
      if (token === generation.current && !controller.signal.aborted) { setResult(response); setResultRevision(dataRevision); }
    } catch (cause) {
      if (token === generation.current && !controller.signal.aborted) setError(effectivePriceErrorMessage(cause));
    } finally {
      if (token === generation.current) { setLoading(false); activeRequest.current = null; }
    }
  };
  return <section className="card effective-price-panel" aria-labelledby={`${elementId}-title`}>
    <div className="card-heading"><div><h2 id={`${elementId}-title`}>체감가 확인</h2><p className="real-data-notice">등록된 월정액과 확인 가능한 정액 결합 할인으로 월 통신요금을 계산합니다.</p></div></div>
    <div className="effective-price-content">
      <div className="effective-price-form">
        <div className="consultation-field"><label htmlFor={`${elementId}-customer`}>고객 <span>선택</span></label>
          <select id={`${elementId}-customer`} value={choices.customerId} onChange={event => change('customerId', event.target.value)}>
            <option value="">고객 정보 없이 계산</option>{customers?.filter(customer => customer.privacyConsent).map(customer => <option key={customer.id} value={customer.id}>{storedCustomerDisplayName(customer.nameMasked, customer.id)} · {customer.phoneMasked}</option>)}
          </select><p className="real-data-notice">현재 매장의 최근 상담 고객 최대 20명 중 동의가 확인된 고객을 비교할 수 있습니다.</p>
          {customersError && <p className="real-data-notice" role="status">{customersError} 고객 정보 없이 계산할 수 있습니다.</p>}
          {choices.customerId && !selectedCustomer?.currentPlan && <p className="real-data-notice">현재 요금제 기록이 없으면 요금 차이는 확인 필요로 표시됩니다.</p>}
        </div>
        <div className="consultation-field"><label htmlFor={`${elementId}-plan`}>선택 요금제 <span>필수 · 자사 요금제</span></label>
          <select id={`${elementId}-plan`} value={choices.planId} onChange={event => change('planId', event.target.value)}>
            <option value="">요금제를 선택해 주세요</option>{catalog.ownPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {formatEffectivePrice(plan.monthlyFee)} / 월</option>)}
          </select>
        </div>
        <div className="consultation-field"><label htmlFor={`${elementId}-product`}>단말 <span>선택</span></label>
          <select id={`${elementId}-product`} value={choices.productId} onChange={event => change('productId', event.target.value)}>
            <option value="">단말 선택 안함</option>{catalog.products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.storageGb}GB · {product.color}</option>)}
          </select>
        </div>
        <div className="consultation-field"><label htmlFor={`${elementId}-bundle`}>결합 <span>선택</span></label>
          <select id={`${elementId}-bundle`} value={choices.bundleId} onChange={event => change('bundleId', event.target.value)}>
            <option value="">결합 선택 안함</option>{catalog.bundles.map(bundle => <option key={bundle.id} value={bundle.id}>{bundle.name}</option>)}
          </select>
        </div>
      </div>
      {choices.bundleId && <fieldset className="effective-price-conditions"><legend>결합 조건</legend><p className="real-data-notice">모르는 조건은 ‘확인 필요’로 두세요. 확인되지 않은 할인은 계산하지 않습니다.</p>
        <div className="effective-price-form">
          <div className="consultation-field"><label htmlFor={`${elementId}-family`}>가족관계 조건</label><select id={`${elementId}-family`} value={choices.family} onChange={event => change('family', event.target.value)}><option value="">확인 필요</option><option value="yes">충족</option><option value="no">미충족</option></select></div>
          <div className="consultation-field"><label htmlFor={`${elementId}-internet`}>인터넷 이용 조건</label><select id={`${elementId}-internet`} value={choices.internet} onChange={event => change('internet', event.target.value)}><option value="">확인 필요</option><option value="yes">충족</option><option value="no">미충족</option></select></div>
          <div className="consultation-field"><label htmlFor={`${elementId}-lines`}>휴대전화 회선 수 <span>확인된 경우 입력</span></label><input id={`${elementId}-lines`} type="text" inputMode="numeric" value={choices.mobileLines} onChange={event => change('mobileLines', event.target.value)} placeholder="확인 필요" aria-invalid={choices.mobileLines !== '' && !validLines(choices.mobileLines)}/></div>
        </div>
      </fieldset>}
      <div className="effective-price-actions"><button className="button button-primary" type="button" disabled={loading || !selectedPlan} onClick={calculate}>{loading ? '계산 중…' : '월 통신요금 계산'}</button><p className="real-data-notice">가입·결제·고객 기록 변경은 실행하지 않습니다.</p></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {loading && <p className="real-data-notice" role="status">등록된 가격과 조건을 확인하고 있습니다.</p>}
      {result && resultRevision === dataRevision && (!choices.customerId || selectedCustomer?.privacyConsent) && <div className="effective-price-result" aria-live="polite">
        <h3>계산 결과</h3><p className="real-data-notice">{result.plan.name} · {result.bundleDiscount.message}</p>
        {choices.customerId && <dl className="product-detail-fields effective-price-current-plan">
          <div><dt>현재 요금제</dt><dd>{result.currentPlan ? `${result.currentPlan.name} · ${formatEffectivePrice(result.currentPlan.monthlyFee)} / 월` : '기록 확인 필요'}</dd></div>
          <div><dt>월정액 차이 · 할인 전</dt><dd>{result.monthlyFeeDifference === null ? '확인 필요' : result.monthlyFeeDifference === 0 ? '0원 · 동일' : `${formatEffectivePrice(Math.abs(result.monthlyFeeDifference))} ${result.monthlyFeeDifference < 0 ? '감소' : '증가'}`}</dd></div>
        </dl>}
        <dl className="product-detail-fields effective-price-breakdown">{result.breakdown.map(row => <div key={row.key}>
          <dt>{row.label}{row.period === 'once' && <small> · 일시 금액</small>}{row.note && <small> · {row.note}</small>}</dt>
          <dd className={row.key === 'monthly_subtotal' ? 'product-monthly-price' : undefined}>{amountLabel(row)}</dd>
        </div>)}</dl>
        <p className="effective-price-total"><strong>{result.finalMonthlyTotal === null ? '총 부담 확인 필요' : `계산 범위 내 월 통신요금 ${formatEffectivePrice(result.finalMonthlyTotal)}`}</strong></p>
        <p className="real-data-notice">{result.quoteScope === 'communication_only' ? '단말·결합을 선택하지 않은 월정액 기준입니다. 약정 할인과 부가 비용을 제외한 범위입니다.' : '월 통신요금 소계와 단말 현금 가격을 구분해 표시합니다. 할부·혜택·추가 조건을 확인하기 전 최종 월 부담은 확정하지 않습니다.'}</p>
        <ul className="effective-price-warnings">{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      </div>}
    </div>
  </section>;
}
