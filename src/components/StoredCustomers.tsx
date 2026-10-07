import { useEffect, useMemo, useRef, useState } from 'react';
import { formatRealDataDate, realDataApi, realDataAvailability, realDataErrorMessage, RealDataApiError,
  type RealDataAvailability, type StoredConsultation, type StoredCustomer } from '../services/realDataApi.js';
import { Icon } from './Icon';
import { StaffReadGate } from './StaffReadGate';
import { Modal } from './Modal';
import { paginateCalls } from '../lib/callPagination';
import { latestCompletedStoredConsultation } from '../lib/storedCustomerPresentation';
import { storedCustomerDisplayName } from '../lib/customerName';

const stageLabels = { AI: 'AI 응대', PHONE: '전화', VISIT: '방문' } as const;
const codeOf = (error: unknown) => error instanceof RealDataApiError ? error.code : 'UNKNOWN_ERROR';
type HistoryState = { customerId: string; limit: number; status: 'loading' | 'ready' | 'error'; items: StoredConsultation[]; code?: string };

/** Saved records only; each stage's score is displayed without recalculating or combining calls. */
export function StoredConsultationList({ items }: { items: StoredConsultation[] }) {
  if (items.length === 0) return <p className="real-data-empty">이 고객의 저장된 상담 이력이 없습니다.</p>;
  return <div className="real-data-history-list">{items.map(item => <article className="real-data-history-item" key={item.id}>
    <div className="real-data-history-heading"><strong>{item.purpose || '상담 목적 미기록'}</strong><span className="status-pill">{item.status}</span></div>
    <p className="real-data-id">{item.id}{item.callId ? ` · ${item.callId}` : ''}</p>
    <p className="real-data-meta">시작 {formatRealDataDate(item.startedAt)}{item.endedAt ? ` · 종료 ${formatRealDataDate(item.endedAt)}` : ' · 종료 시각 미기록'}</p>
    <p className="real-data-summary">{item.summaryStatus === 'available' ? item.summaryPreview : '저장된 AI 요약이 없습니다.'}</p>
    <div className="real-data-risk-list">{item.risks.length > 0 ? item.risks.map(risk => <div className="real-data-risk" key={risk.id}>
      <span>{stageLabels[risk.stage]} · {risk.level}</span><strong>{risk.score}점</strong><span className="real-data-meta">{formatRealDataDate(risk.createdAt)}</span>
    </div>) : <span className="real-data-meta">저장된 위험 기록 없음</span>}</div>
  </article>)}</div>;
}

/** Compact list for customer management; reservation briefings keep their existing list. */
function StoredCustomerHistory({ items, customerId }: { items: StoredConsultation[]; customerId: string }) {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pagination = paginateCalls(items, page);
  const selected = items.find(item => item.id === selectedId);
  const latest = latestCompletedStoredConsultation(items, customerId);
  useEffect(() => { setPage(pagination.page); }, [pagination.page]);
  if (items.length === 0) return <p className="real-data-empty">이 고객의 저장된 상담 이력이 없습니다.</p>;
  return <>
    <div className="stored-customer-latest"><span>조회 이력 중 최근 완료 위험도</span>
      {!latest ? <strong>조회 범위 내 완료 상담 없음</strong> : latest.risks.length === 0 ? <strong>저장된 위험 기록 없음</strong>
        : latest.risks.map(risk => <strong key={risk.id}>{stageLabels[risk.stage]} · {risk.score}점 / {risk.level}</strong>)}
      {latest && <small>{formatRealDataDate(latest.endedAt ?? latest.startedAt)}</small>}
    </div>
    <div className="table-scroll" role="region" aria-label="선택 고객의 저장 상담 목록 · 좁은 화면에서 좌우 스크롤" tabIndex={0}>
      <table className="appointment-table stored-customer-history-table"><caption className="sr-only">저장된 통화별 상담과 위험도</caption>
        <thead><tr><th scope="col">상담 정보</th><th scope="col">상태</th><th scope="col">위험도</th><th scope="col">상세</th></tr></thead>
        <tbody>{pagination.items.map(item => <tr key={item.id}>
          <td><strong className="stored-customer-purpose" title={item.purpose || '상담 목적 미기록'}>{item.purpose || '상담 목적 미기록'}</strong>
            <time className="real-data-meta" dateTime={item.endedAt ?? item.startedAt}>{formatRealDataDate(item.endedAt ?? item.startedAt)}</time></td>
          <td><span className="status-pill">{item.status}</span></td>
          <td>{item.risks.length === 0 ? <span className="real-data-meta">기록 없음</span> : item.risks.map(risk => <span className="stored-customer-risk" key={risk.id}>{stageLabels[risk.stage]} · {risk.score}점 / {risk.level}</span>)}</td>
          <td><button type="button" className="text-button" aria-label={`${item.id} 저장 상담 상세 보기`} onClick={() => setSelectedId(item.id)}>상세 보기<Icon name="chevron" size={13}/></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    {pagination.totalPages > 1 && <nav className="call-pagination" aria-label="저장 상담 이력 페이지">
      <button type="button" aria-label="이전 저장 상담 페이지" disabled={pagination.page === 1} onClick={() => setPage(pagination.page - 1)}><Icon name="chevron" className="previous-chevron" size={16}/></button>
      <span role="status" aria-live="polite">{pagination.page} / {pagination.totalPages}</span>
      <button type="button" aria-label="다음 저장 상담 페이지" disabled={pagination.page === pagination.totalPages} onClick={() => setPage(pagination.page + 1)}><Icon name="chevron" size={16}/></button>
    </nav>}
    {selected && <Modal title="저장 상담 기록" eyebrow="KCM · 고객 이력" className="stored-customer-modal" onClose={() => setSelectedId(null)}>
      <p className="real-data-id">고객 {customerId} · 매장 {selected.storeId}</p>
      <StoredConsultationList items={[selected]}/>
      <p className="real-data-notice">DB에 저장된 상담·단계별 위험 기록입니다. 현재 수신한 통화와 합산하지 않습니다.</p>
      <div className="modal-actions"><button className="button button-secondary" onClick={() => setSelectedId(null)}>상담 기록 닫기</button></div>
    </Modal>}
  </>;
}

export function StoredCustomers({ onAvailability }: { onAvailability?: (state: RealDataAvailability) => void }) {
  return <StaffReadGate><StoredCustomersBody onAvailability={onAvailability}/></StaffReadGate>;
}

function StoredCustomersBody({ onAvailability }: { onAvailability?: (state: RealDataAvailability) => void }) {
  const [items, setItems] = useState<StoredCustomer[]>([]);
  const [availability, setAvailability] = useState<RealDataAvailability>('loading');
  const [errorCode, setErrorCode] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [historyKey, setHistoryKey] = useState(0);
  const [history, setHistory] = useState<HistoryState>({ customerId: '', limit: 5, status: 'loading', items: [] });
  const availabilityCallback = useRef(onAvailability); availabilityCallback.current = onAvailability;
  const selected = items.find(item => item.id === selectedId);

  useEffect(() => {
    let active = true; const controller = new AbortController();
    setItems([]); setSelectedId(''); setErrorCode(''); setAvailability('loading');
    availabilityCallback.current?.('loading');
    if (document.documentElement.dataset.kcmStandalone === 'true') {
      setAvailability('unconfigured'); setErrorCode('REAL_DATA_NOT_CONFIGURED'); availabilityCallback.current?.('unconfigured');
      return () => { active = false; controller.abort(); };
    }
    void realDataApi.customers(controller.signal).then(body => {
      if (!active) return;
      setItems(body.items); setSelectedId(body.items[0]?.id ?? ''); setLimit(5); setPage(1);
      setAvailability('configured'); availabilityCallback.current?.('configured');
    }).catch(error => {
      if (!active) return;
      const next = realDataAvailability(error); setAvailability(next); setErrorCode(codeOf(error)); availabilityCallback.current?.(next);
    });
    return () => { active = false; controller.abort(); };
  }, [reloadKey]);

  useEffect(() => {
    let active = true; const controller = new AbortController();
    setHistory({ customerId: selectedId, limit, status: 'loading', items: [] });
    if (selectedId && selected?.privacyConsent) void realDataApi.customerConsultations(selectedId, limit, controller.signal).then(body => {
      if (active) setHistory({ customerId: selectedId, limit, status: 'ready', items: body.items });
    }).catch(error => {
      if (active) setHistory({ customerId: selectedId, limit, status: 'error', items: [], code: codeOf(error) });
    });
    return () => { active = false; controller.abort(); };
  }, [selectedId, selected?.privacyConsent, limit, historyKey]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('ko-KR');
    return items.filter(item => `${item.id} ${item.nameMasked} ${storedCustomerDisplayName(item.nameMasked, item.id)} ${item.phoneMasked} ${item.latestPurpose}`.toLocaleLowerCase('ko-KR').includes(search));
  }, [items, query]);
  const pagination = paginateCalls(filtered, page);
  useEffect(() => { setPage(pagination.page); }, [pagination.page]);
  const { totalPages: pages, page: currentPage, items: visible } = pagination;
  const choose = (id: string) => { setSelectedId(id); setLimit(5); };

  return <section className="card real-data-section stored-customers" aria-label="저장된 고객과 상담 이력">
    <div className="card-heading real-data-header"><h2>저장된 고객</h2>
      {availability === 'configured' && items.length > 0 && <div className="real-data-tools"><label className="search-field"><Icon name="search" size={15}/><input type="search" value={query} placeholder="고객 ID·이름·상담 목적 검색" aria-label="저장된 고객 검색" onChange={event => { setQuery(event.target.value); setPage(1); setSelectedId(''); }}/></label><span className="count-label">{filtered.length}명</span></div>}
      {errorCode !== 'REAL_DATA_ACCESS_RESTRICTED' && <button className="button button-secondary" disabled={availability === 'loading'} onClick={() => setReloadKey(key => key + 1)}><Icon name="refresh" size={14}/>새로고침</button>}
    </div>
    {availability === 'loading' ? <p className="real-data-empty" role="status">저장된 고객을 불러오는 중입니다.</p>
      : availability !== 'configured' ? <div className={`real-data-${availability === 'unconfigured' ? 'notice' : 'error'}`} role="status"><p>{realDataErrorMessage(errorCode)}</p>
        {errorCode !== 'REAL_DATA_ACCESS_RESTRICTED' && <button className="button button-secondary" onClick={() => setReloadKey(key => key + 1)}>다시 시도</button>}</div>
      : items.length === 0 ? <p className="real-data-empty">현재 매장에 저장된 상담 고객이 없습니다.</p>
      : <>
        <div className="real-data-grid">
          <div className="real-data-list"><div className="table-scroll real-data-table-scroll" role="region" tabIndex={0} aria-label="저장된 고객 목록"><table className="appointment-table real-data-table"><thead><tr><th scope="col">고객</th><th scope="col">최근 상담</th><th scope="col">상태</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} className={selectedId === item.id ? 'selected-row' : ''}>
            <td><button className="customer-select" onClick={() => choose(item.id)} aria-pressed={selectedId === item.id}><strong>{storedCustomerDisplayName(item.nameMasked, item.id)}</strong><span className="sr-only">{item.phoneMasked || '연락처 미확인'}</span></button><span className="real-data-id">{item.id}</span></td>
            <td><strong title={item.latestPurpose || '상담 목적 미기록'}>{item.latestPurpose || '상담 목적 미기록'}</strong><small className="real-data-meta">{formatRealDataDate(item.latestConsultationAt)}</small></td><td><span className="status-pill">{item.latestStatus}</span></td>
          </tr>)}</tbody></table>{filtered.length === 0 && <p className="real-data-empty">검색 조건에 맞는 고객이 없습니다.</p>}</div>
          {pages > 1 && <nav className="call-pagination" aria-label="저장된 고객 목록 페이지"><button type="button" aria-label="이전 저장 고객 페이지" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><Icon name="chevron" className="previous-chevron" size={16}/></button><span role="status" aria-live="polite">{currentPage} / {pages}</span><button type="button" aria-label="다음 저장 고객 페이지" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><Icon name="chevron" size={16}/></button></nav>}</div>
          <div className="real-data-detail" aria-label="선택한 고객의 저장 상담 이력">
            {!selected ? <p className="real-data-empty">고객을 선택하면 저장된 상담 이력을 확인할 수 있습니다.</p> : <>
              <div className="real-data-history-heading"><div><h3>{storedCustomerDisplayName(selected.nameMasked, selected.id)} · 저장 상담 이력</h3><p className="real-data-id">{selected.id} · {selected.phoneMasked || '연락처 미확인'}</p></div>{selected.privacyConsent && <button className="button button-secondary" onClick={() => setHistoryKey(key => key + 1)}>다시 조회</button>}</div>
              {selected.privacyConsent && <details className="stored-customer-product"><summary>이용 상품·요금제</summary><div className="briefing-facts real-data-facts" aria-label="현재 이용 상품과 요금제">
                <div><span>현재 이용 상품</span><strong>{selected.currentProduct ? `${selected.currentProduct.name} · ${selected.currentProduct.storageGb}GB · ${selected.currentProduct.color}` : '미기록'}</strong></div>
                <div><span>현재 이용 요금제</span><strong>{selected.currentPlan ? `${selected.currentPlan.name} · 월 ${selected.currentPlan.monthlyFee.toLocaleString('ko-KR')}원` : '미기록'}</strong></div>
              </div></details>}
              {!selected.privacyConsent ? <p className="real-data-notice">{realDataErrorMessage('CUSTOMER_PRIVACY_RESTRICTED')}</p>
                : history.customerId !== selected.id || history.limit !== limit || history.status === 'loading' ? <p className="real-data-empty" role="status">상담 이력을 불러오는 중입니다.</p>
                : history.status === 'error' ? <div className="real-data-error" role="status"><p>{realDataErrorMessage(history.code)}</p><button className="button button-secondary" onClick={() => setHistoryKey(key => key + 1)}>다시 시도</button></div>
                : <><StoredCustomerHistory key={selected.id} items={history.items} customerId={selected.id}/>{limit === 5 && history.items.length === 5 && <button className="button button-secondary stored-history-more" onClick={() => setLimit(20)}>최근 이력 최대 20건 보기</button>}<p className="sr-only">최근 {limit}건 · 통화별·단계별 독립 기록</p></>}
            </>}
          </div>
        </div>
      </>}
    <details className="stored-customer-scope"><summary>조회 범위</summary><p className="real-data-notice">현재 매장의 최근 상담 고객 최대 20명을 조회합니다. 선택한 고객의 최근 상담 {limit}건을 조회하며, 위험도는 통화별·단계별 독립 기록입니다. 이름과 연락처는 마스킹해 표시하며 DB에 저장된 기록만 조회합니다.</p></details>
  </section>;
}
