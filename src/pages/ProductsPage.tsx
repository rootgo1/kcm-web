import { useEffect, useId, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { Tabs } from '../components/Tabs';
import { Modal } from '../components/Modal';
import { createProductCatalog, formatProductPrice, productReferenceNote, type CatalogItem, type ProductCarrier } from '../data/productCatalog';
import { productTabs, type ProductTabId } from '../lib/navigation';
import { filterProducts, maxComparedPlans, paginateProducts, productPageSize, selectedProduct, toggleComparedPlan } from '../lib/productLookup';
import type { DashboardData } from '../types';
import { loadProductCatalog, toCatalogItems, type ProductCatalog } from '../services/effectivePriceApi';
import { realDataApi, realDataErrorMessage, RealDataApiError, type StoredCustomer } from '../services/realDataApi';
import { EffectivePricePanel } from '../components/EffectivePricePanel';

const descriptions: Record<ProductTabId, string> = {
  plans: '이용 조건을 확인하고 최대 3개 요금제를 함께 비교하세요.',
  bundles: '회선 구성에 맞는 결합 조건과 확인사항을 살펴보세요.',
  benefits: '고객에게 안내할 혜택의 대상과 적용 조건을 확인하세요.',
  devices: '제품별 용량과 색상을 확인하세요. 재고 수량은 스마트 재고에서 조회합니다.',
};
const icons: Record<ProductTabId, IconName> = { plans: 'phone', bundles: 'users', benefits: 'sparkles', devices: 'box' };

function ProductDetail({ item, compared, full, onCompare }: { item: CatalogItem; compared: boolean; full: boolean; onCompare: (id: string) => void }) {
  return <section className="card product-detail" aria-label="선택한 상품 상세" aria-live="polite">
    <div className="product-detail-heading"><div><span className="small-badge">{item.tag}</span><h2>{item.name}</h2><p>{item.summary}</p></div>
      {item.plan && <button type="button" className={`button ${compared ? 'button-secondary' : 'button-primary'}`} disabled={!compared && full} onClick={() => onCompare(item.id)}>
        <Icon name={compared ? 'check' : 'file'} size={15}/>{compared ? '비교에서 제외' : full ? '비교 목록이 가득 찼습니다' : '비교에 추가'}
      </button>}
    </div>
    <div className="product-detail-sections">{item.sections.map(section => <section key={section.title}><h3>{section.title}</h3>
      <dl className="product-detail-fields">{section.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd className={field.label === '월정액' ? 'product-monthly-price' : undefined}>{field.value}</dd></div>)}</dl>
    </section>)}</div>
  </section>;
}

function PlanComparison({ items, onRemove, onClear }: { items: CatalogItem[]; onRemove: (id: string) => void; onClear: () => void }) {
  const rows: { label: string; value: (item: CatalogItem) => string }[] = [
    { label: '구분', value: item => item.tag },
    { label: '월정액', value: item => formatProductPrice(item.plan!.monthlyFee) },
    { label: '데이터', value: item => item.plan!.data },
    { label: '음성', value: item => item.plan!.voice },
    { label: '문자', value: item => item.plan!.messages },
    { label: '가입 조건', value: item => item.plan!.condition },
    { label: '혜택 확인', value: item => item.plan!.benefit },
  ];
  return <section className="card product-comparison" aria-label="요금제 비교">
    <div className="card-heading"><div><h2>요금제 비교 <span className="muted-count">{items.length}/{maxComparedPlans}</span></h2><p className="product-comparison-note" aria-live="polite">{items.length < 2 ? '자사·타사에서 요금제를 추가하면 조건을 나란히 비교할 수 있습니다.' : '약정·결합 할인 전 월정액 기준입니다.'}</p></div>
      {items.length > 0 && <button type="button" className="text-button" onClick={onClear}>전체 제외</button>}
    </div>
    {items.length > 0 ? <div className="table-scroll product-comparison-scroll" tabIndex={0} aria-label="선택한 요금제 비교표">
      <table className="product-comparison-table"><caption className="sr-only">선택한 요금제의 월정액, 제공량, 가입 조건과 혜택</caption>
        <thead><tr><th scope="col">비교 항목</th>{items.map(item => <th key={item.id} scope="col"><strong>{item.name}</strong><button className="text-button" type="button" onClick={() => onRemove(item.id)} aria-label={`${item.name} 비교에서 제외`}><Icon name="close" size={14}/></button></th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.label} className={row.label === '월정액' ? 'product-price-row' : undefined}><th scope="row">{row.label}</th>{items.map(item => <td key={item.id}>{row.value(item)}</td>)}</tr>)}</tbody>
      </table>
    </div> : <div className="product-comparison-empty"><Icon name="file" size={20}/><span>상품 상세에서 ‘비교에 추가’를 선택하세요.</span></div>}
  </section>;
}

export function ProductsPage({ data }: { data: Pick<DashboardData, 'inventory'> }) {
  const [active, setActive] = useState<ProductTabId>('plans');
  const [carrier, setCarrier] = useState<ProductCarrier>('own');
  const [queries, setQueries] = useState<Record<ProductTabId, string>>({ plans: '', bundles: '', benefits: '', devices: '' });
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});
  const [comparedIds, setComparedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [openTool, setOpenTool] = useState<'comparison' | 'price' | null>(null);
  const [catalogMode, setCatalogMode] = useState<'loading' | 'db' | 'error' | 'reference'>('loading');
  const [storedCatalog, setStoredCatalog] = useState<ProductCatalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [customers, setCustomers] = useState<StoredCustomer[]>([]);
  const [customersError, setCustomersError] = useState('');
  useEffect(() => {
    let active = true; const controller = new AbortController();
    setCatalogMode('loading'); setStoredCatalog(null); setCatalogError(''); setCustomers([]); setCustomersError('');
    setSelectedIds({}); setComparedIds([]); setPage(1); setOpenTool(null);
    if (document.documentElement.dataset.kcmStandalone === 'true') {
      setCatalogMode('error'); setCatalogError('저장 상품 조회는 서버 연결이 필요합니다. 참고 자료를 별도로 확인할 수 있습니다.');
      return () => { active = false; controller.abort(); };
    }
    void loadProductCatalog(controller.signal).then(body => {
      if (!active) return;
      setStoredCatalog(body); setCatalogMode('db');
    }).catch(() => { if (active) { setCatalogMode('error'); setCatalogError('저장 상품을 불러오지 못했습니다. 설정과 조회 권한을 확인한 뒤 다시 시도해 주세요.'); } });
    void realDataApi.customers(controller.signal).then(body => {
      if (active) setCustomers(body.items.filter(customer => customer.privacyConsent));
    }).catch(error => {
      if (active) setCustomersError(realDataErrorMessage(error instanceof RealDataApiError ? error.code : 'NETWORK'));
    });
    return () => { active = false; controller.abort(); };
  }, [reloadKey]);
  const catalog = useMemo(() => catalogMode === 'db' && storedCatalog ? toCatalogItems(storedCatalog)
    : catalogMode === 'reference' ? createProductCatalog(data.inventory) : [], [catalogMode, storedCatalog, data.inventory]);
  const visibleItems = filterProducts(catalog, active, queries[active], carrier);
  const pagination = paginateProducts(visibleItems, page);
  const selectionKey = active === 'plans' ? `${active}-${carrier}` : active;
  const selected = selectedProduct(pagination.items, selectedIds[selectionKey]);
  const compared = catalog.filter(item => comparedIds.includes(item.id) && item.plan).sort((a, b) => comparedIds.indexOf(a.id) - comparedIds.indexOf(b.id));
  const onCompare = (id: string) => setComparedIds(previous => toggleComparedPlan(catalog, previous, id));
  const changeTab = (tab: ProductTabId) => { setActive(tab); setPage(1); };
  const changeCarrier = (next: ProductCarrier) => { setCarrier(next); setPage(1); };
  const changeQuery = (query: string) => { setQueries(previous => ({ ...previous, [active]: query })); setPage(1); };
  return <div className="products-page">
    <div className="page-heading"><div><span className="eyebrow">상담업무</span><h1>상품관리</h1><p>요금제부터 제품까지, 상담에 필요한 정보를 한곳에서 확인하세요.</p></div></div>
    <Tabs id="products" label="상품관리 탭" tabs={productTabs} active={active} onChange={changeTab}/>
    <div className="product-source-bar">
      <p className="real-data-notice" role="status">{catalogMode === 'loading' ? '저장 상품을 불러오는 중입니다.' : catalogMode === 'db' ? '저장된 상품 자료 · 가입 조건과 현재 판매 가격은 별도 확인하세요.' : catalogMode === 'reference' ? '별도 참고 자료입니다. 운영 상품이나 DB 조회 결과가 아닙니다.' : catalogError}</p>
      <div className="real-data-header-actions">
        {catalogMode === 'db' && storedCatalog && <button type="button" className="button button-secondary" onClick={() => setOpenTool('price')}><Icon name="file" size={15}/>체감가 계산</button>}
        <button className="button button-secondary" disabled={catalogMode === 'loading'} onClick={() => setReloadKey(key => key + 1)}>저장 자료 다시 조회</button>
        {catalogMode !== 'reference' && catalogMode !== 'loading' && <button className="text-button" onClick={() => { setCatalogMode('reference'); setSelectedIds({}); setComparedIds([]); setPage(1); setOpenTool(null); }}>참고 자료 보기</button>}</div>
    </div>
    {(catalogMode === 'db' || catalogMode === 'reference') && productTabs.map(tab => <section key={tab.id} role="tabpanel" hidden={active !== tab.id} id={`products-panel-${tab.id}`} aria-labelledby={`products-tab-${tab.id}`} tabIndex={0}>
      {active === tab.id && <>
        <div className="section-intro"><div><h2>{active === 'plans' ? `${carrier === 'own' ? '자사' : '타사'} 요금제` : tab.label}</h2><p>{descriptions[active]}</p></div>
          {active === 'plans' && <div className="product-view-actions"><div className="carrier-toggle" role="group" aria-label="요금제 구분"><button type="button" aria-pressed={carrier === 'own'} onClick={() => changeCarrier('own')}>자사</button><button type="button" aria-pressed={carrier === 'other'} onClick={() => changeCarrier('other')}>타사</button></div>
            <button type="button" className="button button-secondary" onClick={() => setOpenTool('comparison')}><Icon name="file" size={15}/>요금제 비교 <span className="muted-count" aria-live="polite">{compared.length}/{maxComparedPlans}</span></button>
          </div>}
        </div>
        <div className="directory-grid product-catalog-grid">
          <section className="card directory-list product-catalog-list"><div className="card-heading"><h2>{active === 'plans' ? '요금제 목록' : '상품 목록'}</h2><span className="muted-count" aria-live="polite">{visibleItems.length}개</span></div>
            <div className="product-search-row"><label className="search-field"><Icon name="search" size={16}/><input value={queries[active]} onChange={event => changeQuery(event.target.value)} aria-label={`${tab.label} 검색`} placeholder="상품명·조건 검색"/></label>
              {queries[active] && <button type="button" className="text-button" aria-label="상품 검색 초기화" onClick={() => changeQuery('')}><Icon name="close" size={15}/></button>}
            </div>
            <div className="directory-options" id={`product-options-${tab.id}`} role="group" aria-label={`${tab.label} 선택`}>{pagination.items.map(item => <button type="button" key={item.id} aria-pressed={selected?.id === item.id} className={`directory-option ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedIds(previous => ({ ...previous, [selectionKey]: item.id }))}>
              <span className={`small-icon ${selected?.id === item.id ? 'red' : 'gray'}`}><Icon name={icons[active]} size={18}/></span><span className="directory-option-text"><strong title={item.name}>{item.name}</strong><small title={item.plan ? `${formatProductPrice(item.plan.monthlyFee)} / 월 · ${item.plan.data}` : item.summary}>{item.plan ? <span><span className="product-monthly-price">{formatProductPrice(item.plan.monthlyFee)}</span> / 월 · {item.plan.data}</span> : item.summary}{comparedIds.includes(item.id) && <span className="home-store-badge">비교 중</span>}</small></span><Icon name="chevron" size={14}/>
            </button>)}</div>
            {pagination.totalPages > 1 && <nav className="product-pagination" aria-label={`${tab.label} 페이지 이동`}>
              <span className="product-page-range">{(pagination.page - 1) * productPageSize + 1}–{Math.min(pagination.page * productPageSize, pagination.totalItems)} / {pagination.totalItems}개</span>
              <button type="button" className="icon-button" aria-label="이전 상품 페이지" aria-controls={`product-options-${tab.id}`} disabled={pagination.page === 1} onClick={() => setPage(pagination.page - 1)}><span className="product-page-previous"><Icon name="chevron" size={16}/></span></button>
              <span className="product-page-number" aria-live="polite" aria-atomic="true">{pagination.page} / {pagination.totalPages}</span>
              <button type="button" className="icon-button" aria-label="다음 상품 페이지" aria-controls={`product-options-${tab.id}`} disabled={pagination.page === pagination.totalPages} onClick={() => setPage(pagination.page + 1)}><Icon name="chevron" size={16}/></button>
            </nav>}
            {visibleItems.length === 0 && <div className="product-search-empty"><strong>검색 결과가 없습니다.</strong><p>상품명이나 조건을 바꿔 검색하세요.</p></div>}
          </section>
          {selected ? <ProductDetail item={selected} compared={comparedIds.includes(selected.id)} full={compared.length >= maxComparedPlans} onCompare={onCompare}/> : <section className="card product-detail product-search-empty"><Icon name="search" size={24}/><h2>조회할 상품을 선택하세요.</h2><p>검색어를 지우면 상품 목록을 다시 확인할 수 있습니다.</p></section>}
        </div>
        <p className="product-reference-note">{catalogMode === 'reference' ? productReferenceNote : '저장된 조회 자료입니다. 가입·구매 전 적용 조건·세금·추가 비용을 확인하세요.'}</p>
      </>}
    </section>)}
    {openTool === 'comparison' && <Modal title="요금제 비교" wide onClose={() => setOpenTool(null)} className="product-tool-modal">
      <PlanComparison items={compared} onRemove={onCompare} onClear={() => setComparedIds([])}/>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setOpenTool(null)}>상품 목록으로</button></div>
    </Modal>}
    {catalogMode === 'db' && storedCatalog && <ModalPriceTool open={openTool === 'price'} onClose={() => setOpenTool(null)} catalog={storedCatalog} customers={customers} customersError={customersError}/>}
  </div>;
}

/** Keep the existing calculator mounted so closing its dialog preserves choices/results. */
function ModalPriceTool({ open, onClose, ...props }: ComponentProps<typeof EffectivePricePanel> & { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  return <dialog ref={ref} className="modal modal-wide product-tool-modal" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-content">
      <header className="modal-header"><div><span className="eyebrow">KCM</span><h2 id={titleId}>체감가 계산</h2></div><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><Icon name="close"/></button></header>
      <EffectivePricePanel {...props}/>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>상품 목록으로</button></div>
    </div>
  </dialog>;
}
