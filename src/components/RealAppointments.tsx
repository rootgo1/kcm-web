import { useEffect, useMemo, useRef, useState } from 'react';
import { formatRealDataDate, realDataApi, realDataAvailability, realDataErrorMessage, RealDataApiError,
  type RealAppointment, type RealBriefing, type RealDataAvailability, type ReservationStatus } from '../services/realDataApi.js';
import { Icon } from './Icon';
import { StoredConsultationList } from './StoredCustomers';
import { storedCustomerDisplayName } from '../lib/customerName';

const statuses: ReservationStatus[] = ['예약 확정', '방문 완료', '취소', '노쇼'];
const codeOf = (error: unknown) => error instanceof RealDataApiError ? error.code : 'UNKNOWN_ERROR';
type BriefingState = { reservationId: string; status: 'loading' | 'ready' | 'error'; data?: RealBriefing; code?: string };

export function RealBriefingPanel({ appointment }: { appointment?: RealAppointment }) {
  const [state, setState] = useState<BriefingState>({ reservationId: '', status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const reservationId = appointment?.id ?? ''; const customerId = appointment?.customerId ?? ''; const consultationId = appointment?.consultationId ?? '';
  useEffect(() => {
    let active = true; const controller = new AbortController();
    setState({ reservationId, status: 'loading' });
    if (reservationId) void realDataApi.briefing(reservationId, controller.signal).then(body => {
      if (!active) return;
      if (body.reservation.customerId !== customerId || body.reservation.consultationId !== consultationId) throw new RealDataApiError('INVALID_RESPONSE');
      setState({ reservationId, status: 'ready', data: body });
    }).catch(error => { if (active) setState({ reservationId, status: 'error', code: codeOf(error) }); });
    return () => { active = false; controller.abort(); };
  }, [reservationId, customerId, consultationId, reloadKey]);

  const data = state.reservationId === reservationId ? state.data : undefined;
  return <section className="card real-data-detail real-data-briefing" aria-label="선택한 예약의 저장 사전 브리핑">
    <div className="card-heading real-data-header"><div><h2>사전 브리핑</h2><p className="real-data-notice">저장된 AI 요약과 예약 정보를 확인합니다.</p></div>{appointment && <button className="button button-secondary" onClick={() => setReloadKey(key => key + 1)}>다시 조회</button>}</div>
    {!appointment ? <p className="real-data-empty">예약을 선택하면 저장된 브리핑을 확인할 수 있습니다.</p> : <>
      <div className="real-data-history-heading"><strong>{storedCustomerDisplayName(appointment.customerNameMasked, appointment.customerId)}</strong><span className="status-pill">{appointment.status}</span></div><p className="real-data-meta">{appointment.phoneMasked || '연락처 미확인'} · 방문 {formatRealDataDate(appointment.visitAt)}</p><p className="real-data-id">{appointment.id}</p>
      {state.reservationId !== reservationId || state.status === 'loading' ? <p className="real-data-empty" role="status">저장된 브리핑을 불러오는 중입니다.</p>
        : state.status === 'error' ? <div className="real-data-error" role="status"><p>{realDataErrorMessage(state.code)}</p><button className="button button-secondary" onClick={() => setReloadKey(key => key + 1)}>다시 시도</button></div>
        : data && <>
          <div className="briefing-facts real-data-facts"><div><span>상담 목적</span><strong>{data.reservation.purpose || '미기록'}</strong></div><div><span>담당 직원</span><strong>{data.reservation.employeeName || '미확인'}</strong></div><div><span>예약 경로</span><strong>{data.reservation.source === 'AI' ? 'AI 응대' : '전화'}</strong></div></div>
          {data.reservation.privacyConsent && <>
            <div className="briefing-facts real-data-facts"><div><span>현재 이용 상품</span><strong>{data.currentProduct ? `${data.currentProduct.name} · ${data.currentProduct.storageGb}GB · ${data.currentProduct.color}` : '별도 기록 없음'}</strong></div><div><span>현재 이용 요금제</span><strong>{data.currentPlan ? `${data.currentPlan.name} · 월 ${data.currentPlan.monthlyFee.toLocaleString('ko-KR')}원` : '별도 기록 없음'}</strong></div></div>
            <div className="briefing-facts real-data-facts"><div><span>희망 상품</span><strong>별도 기록 없음</strong></div><div><span>희망 단말</span><strong>별도 기록 없음</strong></div></div>
            <div className="real-data-request-note"><h3>저장된 요청사항</h3><p className="real-data-summary">{data.requestNote ?? '별도 기록 없음'}</p></div>
          </>}
          <div className="briefing-summary"><span className="eyebrow"><Icon name="file" size={14}/>저장된 AI 요약</span><p className="real-data-summary">{data.summaryStatus === 'available' ? data.summary : data.summaryStatus === 'restricted' ? '개인정보 동의를 확인하기 전에는 저장된 요약과 상담 이력을 조회할 수 없습니다.' : '저장된 AI 요약이 없습니다. 예약 정보와 고객 요청을 직접 확인해 주세요.'}</p></div>
          {data.checklist.length > 0 && <div className="briefing-checklist"><h3>상담 전 확인 사항</h3>{data.checklist.map((item, index) => <div key={index}><span className="check-circle"><Icon name="check" size={11}/></span><span>{item}</span></div>)}</div>}
          {data.summaryStatus !== 'restricted' && <div className="real-data-briefing-history"><h3>같은 고객의 최근 저장 상담</h3><StoredConsultationList items={data.history}/></div>}
          <p className="real-data-notice">조회 전용입니다. 요약 생성·예약 변경·상담 저장은 실행하지 않습니다.</p>
        </>}
    </>}
  </section>;
}

export function RealAppointments({ compact = false, onAvailability, onAll }: {
  compact?: boolean; onAvailability?: (state: RealDataAvailability) => void; onAll?: () => void;
}) {
  const [items, setItems] = useState<RealAppointment[]>([]);
  const [availability, setAvailability] = useState<RealDataAvailability>('loading');
  const [errorCode, setErrorCode] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<'all' | ReservationStatus>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const availabilityCallback = useRef(onAvailability); availabilityCallback.current = onAvailability;
  useEffect(() => {
    let active = true; const controller = new AbortController();
    setItems([]); setSelectedId(''); setErrorCode(''); setAvailability('loading'); availabilityCallback.current?.('loading');
    if (document.documentElement.dataset.kcmStandalone === 'true') {
      setAvailability('unconfigured'); setErrorCode('REAL_DATA_NOT_CONFIGURED'); availabilityCallback.current?.('unconfigured');
      return () => { active = false; controller.abort(); };
    }
    void realDataApi.appointments(controller.signal).then(body => {
      if (!active) return;
      setItems(body.items); setSelectedId(body.items[0]?.id ?? ''); setPage(1);
      setAvailability('configured'); availabilityCallback.current?.('configured');
    }).catch(error => {
      if (!active) return;
      const next = realDataAvailability(error); setAvailability(next); setErrorCode(codeOf(error)); availabilityCallback.current?.(next);
    });
    return () => { active = false; controller.abort(); };
  }, [reloadKey]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('ko-KR');
    return items.filter(item => (filter === 'all' || item.status === filter)
      && `${item.id} ${item.customerNameMasked} ${storedCustomerDisplayName(item.customerNameMasked, item.customerId)} ${item.purpose} ${item.employeeName}`.toLocaleLowerCase('ko-KR').includes(search));
  }, [items, filter, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 5)); const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 5, currentPage * 5);
  const selected = items.find(item => item.id === selectedId);

  return <section className={`real-data-section ${compact ? 'real-data-compact' : ''}`} aria-label="저장된 예약과 사전 브리핑">
    <div className="real-data-grid">
      <section className="card real-data-list">
        <div className="card-heading real-data-header"><div><h2>저장된 예약</h2><p className="real-data-notice">현재 매장의 예약을 저장 상태 그대로 조회합니다.</p></div><div className="real-data-header-actions">{compact && onAll && <button className="text-button" onClick={onAll}>전체 보기<Icon name="chevron" size={14}/></button>}<button className="button button-secondary" disabled={availability === 'loading'} onClick={() => setReloadKey(key => key + 1)}><Icon name="refresh" size={14}/>새로고침</button></div></div>
        {availability === 'loading' ? <p className="real-data-empty" role="status">저장된 예약을 불러오는 중입니다.</p>
          : availability !== 'configured' ? <div className={`real-data-${availability === 'unconfigured' ? 'notice' : 'error'}`} role="status"><p>{realDataErrorMessage(errorCode)}</p><button className="button button-secondary" onClick={() => setReloadKey(key => key + 1)}>다시 시도</button></div>
          : items.length === 0 ? <p className="real-data-empty">현재 매장에 저장된 예약이 없습니다.</p>
          : <><div className="real-data-tools"><label>예약 상태<select value={filter} onChange={event => { setFilter(event.target.value as 'all' | ReservationStatus); setPage(1); setSelectedId(''); }} aria-label="저장 예약 상태 필터"><option value="all">전체</option>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select></label><label className="search-field"><Icon name="search" size={15}/><input type="search" value={query} placeholder="고객·목적·직원 검색" aria-label="저장된 예약 검색" onChange={event => { setQuery(event.target.value); setPage(1); setSelectedId(''); }}/></label></div>
            <div className="table-scroll real-data-table-scroll" role="region" tabIndex={0} aria-label="저장된 예약 목록"><table className="appointment-table real-data-table"><thead><tr><th scope="col">방문 예정</th><th scope="col">고객 / 상담 목적</th><th scope="col">담당 / 상태</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} className={selectedId === item.id ? 'selected-row' : ''}>
              <td className="real-data-meta">{formatRealDataDate(item.visitAt)}</td><td><button className="customer-select" onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id} aria-label={`${storedCustomerDisplayName(item.customerNameMasked, item.customerId)} 예약 선택`}><span><strong>{storedCustomerDisplayName(item.customerNameMasked, item.customerId)}</strong><small>{item.purpose || '상담 목적 미기록'}</small></span></button><span className="real-data-id">{item.id}</span></td>
              <td><span className="employee-name">{item.employeeName || '담당 미확인'}</span><span className="status-pill">{item.status}</span><small className="real-data-meta">{item.summaryStatus === 'available' ? '저장 요약 있음' : item.summaryStatus === 'restricted' ? '개인정보 동의 확인 필요' : '저장 요약 없음'}</small></td>
            </tr>)}</tbody></table>{filtered.length === 0 && <p className="real-data-empty">검색 조건에 맞는 예약이 없습니다.</p>}</div>
            {pages > 1 && <div className="real-data-pagination" aria-label="저장된 예약 목록 페이지"><button className="button button-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button><span>{currentPage} / {pages}</span><button className="button button-secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>다음</button></div>}
            <p className="real-data-notice">조회한 {items.length}건 중 {filtered.length}건 · 방문일과 저장된 상태를 확인해 주세요.</p>
          </>}
      </section>
      {availability === 'configured' && <RealBriefingPanel appointment={selected}/>}
    </div>
  </section>;
}
