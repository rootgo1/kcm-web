import { useEffect, useMemo, useRef, useState } from 'react';
import { formatRealDataDate, realDataApi, realDataAvailability, realDataErrorMessage, RealDataApiError,
  type RealDataAvailability, type StoredConsultation, type StoredCustomer } from '../services/realDataApi.js';
import { Icon } from './Icon';

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

export function StoredCustomers({ onAvailability }: { onAvailability?: (state: RealDataAvailability) => void }) {
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
    return items.filter(item => `${item.id} ${item.nameMasked} ${item.phoneMasked} ${item.latestPurpose}`.toLocaleLowerCase('ko-KR').includes(search));
  }, [items, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 5)); const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 5, currentPage * 5);
  const choose = (id: string) => { setSelectedId(id); setLimit(5); };

  return <section className="card real-data-section" aria-label="저장된 고객과 상담 이력">
    <div className="card-heading real-data-header"><div><h2>저장된 고객</h2><p className="real-data-notice">현재 매장의 최근 상담 고객 최대 20명을 조회합니다. 고객 정보는 마스킹해 표시합니다.</p></div>
      <button className="button button-secondary" disabled={availability === 'loading'} onClick={() => setReloadKey(key => key + 1)}><Icon name="refresh" size={14}/>새로고침</button>
    </div>
    {availability === 'loading' ? <p className="real-data-empty" role="status">저장된 고객을 불러오는 중입니다.</p>
      : availability !== 'configured' ? <div className={`real-data-${availability === 'unconfigured' ? 'notice' : 'error'}`} role="status"><p>{realDataErrorMessage(errorCode)}</p><button className="button button-secondary" onClick={() => setReloadKey(key => key + 1)}>다시 시도</button></div>
      : items.length === 0 ? <p className="real-data-empty">현재 매장에 저장된 상담 고객이 없습니다.</p>
      : <><div className="real-data-tools"><label className="search-field"><Icon name="search" size={15}/><input type="search" value={query} placeholder="고객 ID·마스킹 이름·상담 목적 검색" aria-label="저장된 고객 검색" onChange={event => { setQuery(event.target.value); setPage(1); setSelectedId(''); }}/></label><span className="count-label">{filtered.length}명</span></div>
        <div className="real-data-grid">
          <div className="real-data-list"><div className="table-scroll real-data-table-scroll" role="region" tabIndex={0} aria-label="저장된 고객 목록"><table className="appointment-table real-data-table"><thead><tr><th scope="col">고객</th><th scope="col">최근 상담</th><th scope="col">상태</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} className={selectedId === item.id ? 'selected-row' : ''}>
            <td><button className="customer-select" onClick={() => choose(item.id)} aria-pressed={selectedId === item.id}><span><strong>{item.nameMasked}</strong><small>{item.phoneMasked || '연락처 미확인'}</small></span></button><span className="real-data-id">{item.id}</span></td>
            <td><strong>{item.latestPurpose || '상담 목적 미기록'}</strong><small className="real-data-meta">{formatRealDataDate(item.latestConsultationAt)}</small></td><td><span className="status-pill">{item.latestStatus}</span></td>
          </tr>)}</tbody></table>{filtered.length === 0 && <p className="real-data-empty">검색 조건에 맞는 고객이 없습니다.</p>}</div>
          {pages > 1 && <div className="real-data-pagination" aria-label="저장된 고객 목록 페이지"><button className="button button-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button><span>{currentPage} / {pages}</span><button className="button button-secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>다음</button></div>}</div>
          <div className="real-data-detail" aria-label="선택한 고객의 저장 상담 이력">
            {!selected ? <p className="real-data-empty">고객을 선택하면 저장된 상담 이력을 확인할 수 있습니다.</p> : <>
              <div className="real-data-history-heading"><h3>{selected.nameMasked} · 저장 상담 이력</h3>{selected.privacyConsent && <button className="button button-secondary" onClick={() => setHistoryKey(key => key + 1)}>다시 조회</button>}</div><p className="real-data-id">{selected.id}</p>
              {selected.privacyConsent && <div className="briefing-facts real-data-facts" aria-label="현재 이용 상품과 요금제">
                <div><span>현재 이용 상품</span><strong>{selected.currentProduct ? `${selected.currentProduct.name} · ${selected.currentProduct.storageGb}GB · ${selected.currentProduct.color}` : '미기록'}</strong></div>
                <div><span>현재 이용 요금제</span><strong>{selected.currentPlan ? `${selected.currentPlan.name} · 월 ${selected.currentPlan.monthlyFee.toLocaleString('ko-KR')}원` : '미기록'}</strong></div>
              </div>}
              {!selected.privacyConsent ? <p className="real-data-notice">{realDataErrorMessage('CUSTOMER_PRIVACY_RESTRICTED')}</p>
                : history.customerId !== selected.id || history.limit !== limit || history.status === 'loading' ? <p className="real-data-empty" role="status">상담 이력을 불러오는 중입니다.</p>
                : history.status === 'error' ? <div className="real-data-error" role="status"><p>{realDataErrorMessage(history.code)}</p><button className="button button-secondary" onClick={() => setHistoryKey(key => key + 1)}>다시 시도</button></div>
                : <><StoredConsultationList items={history.items}/>{limit === 5 && history.items.length === 5 && <button className="button button-secondary" onClick={() => setLimit(20)}>최근 이력 최대 20건 보기</button>}<p className="real-data-notice">최근 {limit}건 범위의 저장 기록입니다. 통화별·단계별 점수는 각각 표시합니다.</p></>}
            </>}
          </div>
        </div>
      </>}
  </section>;
}
