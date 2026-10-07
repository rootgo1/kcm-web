import { useEffect, useId, useRef, useState } from 'react';
import { calculateEffectivePrice, effectivePriceErrorMessage, effectivePriceNoteMessage, EffectivePriceApiError, formatEffectivePrice,
  type EffectivePriceInput, type EffectivePriceQuoteResult, type ProductCatalog } from '../services/effectivePriceApi';
import type { StoredCustomer } from '../services/realDataApi';

interface PriceChoices { productId: string; planId: string; bundleId: string; installmentMonths: string; contractMonths: string; discountType: string }
export interface EffectivePricePanelProps {
  catalog: ProductCatalog; customers?: readonly StoredCustomer[]; customersError?: string;
  initialPlanId?: string; initialProductId?: string;
}

/** Prices are calculated by the server. Changing any choice invalidates earlier results. */
export function EffectivePricePanel({ catalog, initialPlanId = '', initialProductId = '' }: EffectivePricePanelProps) {
  const elementId = useId();
  const [choices, setChoices] = useState<PriceChoices>(() => ({
    productId: catalog.products.some(product => product.id === initialProductId) ? initialProductId : '',
    planId: catalog.ownPlans.some(plan => plan.id === initialPlanId) ? initialPlanId : '',
    bundleId: '', installmentMonths: '24', contractMonths: '24', discountType: 'PLAN_DISCOUNT',
  }));
  const [result, setResult] = useState<EffectivePriceQuoteResult | null>(null);
  const [resultRevision, setResultRevision] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const generation = useRef(0); const activeRequest = useRef<AbortController | null>(null);
  const catalogRevision = JSON.stringify(catalog);
  const invalidate = () => {
    generation.current += 1; activeRequest.current?.abort(); activeRequest.current = null;
    setResult(null); setResultRevision(''); setError(''); setLoading(false);
  };
  useEffect(() => {
    invalidate();
    setChoices(previous => ({ ...previous,
      productId: catalog.products.some(product => product.id === previous.productId) ? previous.productId : '',
      planId: catalog.ownPlans.some(plan => plan.id === previous.planId) ? previous.planId : '',
      bundleId: catalog.bundles.some(bundle => bundle.id === previous.bundleId) ? previous.bundleId : '',
    }));
    return () => { generation.current += 1; activeRequest.current?.abort(); activeRequest.current = null; };
  }, [catalogRevision]);
  const change = (field: keyof PriceChoices, value: string) => { invalidate(); setChoices(previous => ({ ...previous, [field]: value })); };
  const selectedProduct = catalog.products.find(product => product.id === choices.productId);
  const selectedPlan = catalog.ownPlans.find(plan => plan.id === choices.planId);
  const calculate = async () => {
    invalidate();
    if (!selectedProduct) { setError('계산할 단말기를 선택해 주세요.'); return; }
    if (!selectedPlan) { setError('계산할 자사 요금제를 선택해 주세요.'); return; }
    if (choices.bundleId && !catalog.bundles.some(bundle => bundle.id === choices.bundleId)
      || !['1', '24'].includes(choices.installmentMonths) || choices.contractMonths !== '24'
      || !['DEVICE_DISCOUNT', 'PLAN_DISCOUNT'].includes(choices.discountType)) {
      setError('결합·할부·약정·할인 조건을 다시 확인해 주세요.'); return;
    }
    const input: EffectivePriceInput = { product_id: choices.productId, plan_id: choices.planId,
      ...(choices.bundleId ? { bundle_id: choices.bundleId } : {}), installment_months: Number(choices.installmentMonths) as 1 | 24,
      contract_months: 24, discount_type: choices.discountType as 'DEVICE_DISCOUNT' | 'PLAN_DISCOUNT' };
    const token = generation.current; const controller = new AbortController(); activeRequest.current = controller; setLoading(true);
    try {
      const response = await calculateEffectivePrice(input, controller.signal);
      if (response.policyVersion !== 'n8n-quote-v2') throw new EffectivePriceApiError('INVALID_RESPONSE');
      if (token === generation.current && !controller.signal.aborted) { setResult(response); setResultRevision(catalogRevision); }
    } catch (cause) {
      if (token === generation.current && !controller.signal.aborted) setError(effectivePriceErrorMessage(cause));
    } finally {
      if (token === generation.current) { setLoading(false); activeRequest.current = null; }
    }
  };
  const quote = result?.quote; const output = quote?.result;
  return <section className="card effective-price-panel" aria-labelledby={`${elementId}-title`}>
    <div className="card-heading"><div><h2 id={`${elementId}-title`}>체감가 확인</h2><p className="real-data-notice">단말기·요금제·결합과 납부 조건을 선택해 예상 납부금액과 약정기간 체감가를 확인합니다.</p></div></div>
    <div className="effective-price-content">
      <div className="effective-price-form">
        <div className="consultation-field"><label htmlFor={`${elementId}-product`}>단말기 <span>필수</span></label>
          <select id={`${elementId}-product`} value={choices.productId} onChange={event => change('productId', event.target.value)}>
            <option value="">단말기를 선택해 주세요</option>{catalog.products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.storageGb}GB · {product.color}</option>)}
          </select>
        </div>
        <div className="consultation-field"><label htmlFor={`${elementId}-plan`}>요금제 <span>필수 · 자사 요금제</span></label>
          <select id={`${elementId}-plan`} value={choices.planId} onChange={event => change('planId', event.target.value)}>
            <option value="">요금제를 선택해 주세요</option>{catalog.ownPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {formatEffectivePrice(plan.monthlyFee)} / 월</option>)}
          </select>
        </div>
        <div className="consultation-field"><label htmlFor={`${elementId}-bundle`}>결합 <span>선택</span></label>
          <select id={`${elementId}-bundle`} value={choices.bundleId} onChange={event => change('bundleId', event.target.value)}>
            <option value="">결합 선택 안함</option>{catalog.bundles.map(bundle => <option key={bundle.id} value={bundle.id}>{bundle.name}</option>)}
          </select>
        </div>
        <div className="consultation-field"><label htmlFor={`${elementId}-installment`}>할부개월</label>
          <select id={`${elementId}-installment`} value={choices.installmentMonths} onChange={event => change('installmentMonths', event.target.value)}>
            <option value="24">24개월</option><option value="1">일시불</option>
          </select>
        </div>
        <div className="consultation-field"><label htmlFor={`${elementId}-contract`}>약정개월</label>
          <select id={`${elementId}-contract`} value={choices.contractMonths} onChange={event => change('contractMonths', event.target.value)}><option value="24">24개월</option></select>
        </div>
        <div className="consultation-field"><label htmlFor={`${elementId}-discount`}>할인종류</label>
          <select id={`${elementId}-discount`} value={choices.discountType} onChange={event => change('discountType', event.target.value)}>
            <option value="PLAN_DISCOUNT">요금할인</option><option value="DEVICE_DISCOUNT">기기할인</option>
          </select>
        </div>
      </div>
      <p className="real-data-notice">등록된 단말 할인표를 적용하며, 결합 선택 시 시연용 가족·회선 조건을 가정합니다. 실제 가입 자격은 확인이 필요합니다.</p>
      <div className="effective-price-actions"><button className="button button-primary" type="button" disabled={loading || !selectedPlan || !selectedProduct} onClick={calculate}>{loading ? '계산 중…' : '체감가 계산'}</button></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {loading && <p className="real-data-notice" role="status">등록된 가격과 계산 조건을 확인하고 있습니다.</p>}
      {quote && output && resultRevision === catalogRevision && <div className="effective-price-result" aria-live="polite">
        <h3>예상 납부금액</h3><p className="effective-price-total"><strong>{output['예상 납부금액']}</strong></p>
        <p className="real-data-notice">{output['계산 설명']}</p>
        {output['다음 달부터 예상 납부금액'] && <p className="real-data-notice">다음 달부터 예상 납부금액: {output['다음 달부터 예상 납부금액']}</p>}
        <h3>금액 구성</h3>
        <dl className="product-detail-fields effective-price-breakdown">{Object.entries(output['금액 구성']).map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{amount}</dd></div>)}</dl>
        <h3>적용 할인</h3>
        <dl className="product-detail-fields effective-price-breakdown">{Object.entries(output['적용 할인']).map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{amount}</dd></div>)}</dl>
        <h3>고객 체감가</h3><p className="real-data-notice">{output['고객 체감가']['체감가 안내']}</p>
        <dl className="product-detail-fields effective-price-breakdown">{Object.entries(output['고객 체감가']).filter(([label]) => label !== '체감가 안내').map(([label, amount]) => <div key={label}><dt>{label}</dt><dd className={label === '월평균 체감가' ? 'product-monthly-price' : undefined}>{amount}</dd></div>)}</dl>
        {(quote.calculation_basis.quote_is_estimate || !quote.calculation_basis.bundle_eligibility_fully_verified) && <p className="real-data-notice">시연 가정이 포함된 예상 견적이며 실제 가입 조건과 할인 적용 여부는 별도로 확인해 주세요.</p>}
        {output['계산 유의사항'].length > 0 && <><h3>계산 유의사항</h3><ul className="effective-price-warnings">{output['계산 유의사항'].map((warning, index) => <li key={`${index}-${warning}`}>{effectivePriceNoteMessage(warning)}</li>)}</ul></>}
      </div>}
    </div>
  </section>;
}
