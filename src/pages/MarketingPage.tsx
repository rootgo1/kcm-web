import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';
import { consultationTime, followUpLabels } from '../lib/consultation';
import { maskCustomerName } from '../lib/customerName';
import { aftercareBlocker, aftercareReviewed, consentLabels, recommendedAftercareMessage, type AftercareItem, type AftercareRecord, type AftercareState } from '../lib/aftercare';
import { uiText } from '../lib/uiText';
import { CALLS_PER_PAGE, paginateCalls } from '../lib/callPagination';

type Props = { items: AftercareItem[]; records: AftercareState; store: string; onReview: (id: string, message: string) => void; onSend: (id: string) => void; onSupport: () => void };
const recommendedMessage = (item: AftercareItem, store: string) => recommendedAftercareMessage({ ...item, inquiryType: uiText(item.inquiryType) }, store);
export function MarketingPage({ items, records, store, onReview, onSend, onSupport }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pagination = paginateCalls(items, page);
  useEffect(() => { setPage(pagination.page); }, [pagination.page]);
  const selected = items.find(item => item.id === selectedId);
  return <>
    <div className="page-heading"><div><span className="eyebrow">매장관리</span><h1>마케팅</h1><p>완료 상담을 바탕으로 후속 안내 내용을 확인하고 처리 기록을 관리하세요.</p></div></div>
    <section className="card appointments-card aftercare-card" aria-label="상담 후 고객 사후관리">
      <div className="card-heading"><div className="title-with-icon"><span className="small-icon red"><Icon name="megaphone" size={18}/></span><h2>완료 상담 고객</h2></div><div className="support-actions"><span className="small-badge">전체 {items.length}건</span><span className="small-badge">처리 완료 {items.filter(item => records[item.id]?.status === 'sent').length}건</span></div></div>
      <div className="table-scroll" role="region" aria-label="사후관리 목록 · 좌우 스크롤" tabIndex={0}><table className="appointment-table aftercare-table"><thead><tr><th scope="col">고객 / 상담</th><th scope="col">상담 요약</th><th scope="col">상담 결과</th><th scope="col">연락·안내 동의</th><th scope="col">후속 안내</th><th scope="col">추천 후속 메시지</th><th scope="col">처리 상태</th><th scope="col">안내 확인</th></tr></thead><tbody>
        {pagination.items.map(item => { const record = records[item.id], sent = record?.status === 'sent', blocker = aftercareBlocker(item); return <tr key={item.id}>
          <td><strong>{maskCustomerName(item.customerName)}</strong><small className="muted-text">{item.sourceId} · {item.source}</small></td>
          <td><span className="aftercare-message-preview">{item.summary || '상담 결과 기록 없음'}</span><small className="muted-text">{uiText(item.inquiryType)}</small></td><td>{item.outcome}</td>
          <td><span className={`status-pill ${item.consent === 'granted' ? 'available' : 'neutral'}`}>{consentLabels[item.consent]}</span></td><td><span className="small-badge">{followUpLabels[item.followUp]}</span></td>
          <td><span className="aftercare-message-preview">{sent ? record.message : recommendedMessage(item, store) || '—'}</span></td>
          <td><span className={`status-pill ${sent ? 'available' : 'neutral'}`}>{sent ? '처리 완료' : blocker ? '확인 필요' : '처리 대기'}</span>{!sent && aftercareReviewed(item, record) && <small className="muted-text">안내 내용 확인됨</small>}</td>
          <td><button className="text-button" aria-label={`${item.sourceId} ${sent ? '처리 기록 보기' : '후속 안내 확인'}`} onClick={() => setSelectedId(item.id)}>{sent ? '처리 기록' : '후속 안내 확인'}<Icon name="chevron" size={13}/></button>{!sent && blocker && <small className="aftercare-blocker">{blocker}</small>}</td>
        </tr>; })}
      </tbody></table></div>
      {items.length === 0 && <div className="empty-search" role="status"><strong>완료된 상담이 없습니다.</strong><p>상담지원에서 상담을 시작하고 결과 기록을 완료해 주세요.</p><button className="button button-secondary" onClick={onSupport}>상담지원 보기</button></div>}
      {pagination.totalPages > 1 && <nav className="call-pagination workflow-pagination" aria-label="사후관리 목록 페이지">
        <span className="workflow-pagination-count">{(pagination.page - 1) * CALLS_PER_PAGE + 1}–{Math.min(pagination.page * CALLS_PER_PAGE, items.length)} / {items.length}건</span>
        <button type="button" aria-label="이전 사후관리 페이지" disabled={pagination.page === 1} onClick={() => setPage(pagination.page - 1)}><Icon name="chevron" className="previous-chevron" size={16}/></button>
        <span role="status" aria-live="polite" aria-atomic="true"><span className="sr-only">현재 페이지 </span>{pagination.page} / {pagination.totalPages}</span>
        <button type="button" aria-label="다음 사후관리 페이지" disabled={pagination.page === pagination.totalPages} onClick={() => setPage(pagination.page + 1)}><Icon name="chevron" size={16}/></button>
      </nav>}
      <div className="aftercare-notice"><Icon name="help" size={17}/><p>안내 내용과 처리 상태를 기록하는 기능이며 고객에게 문자를 보내지 않습니다. 처리 기록은 새로고침하면 초기화됩니다.</p></div>
    </section>
    {selected && <AftercareMessage key={selected.id} item={selected} record={records[selected.id]} store={store} onReview={message => onReview(selected.id, message)} onSend={() => onSend(selected.id)} onClose={() => setSelectedId(null)}/>}
  </>;
}

function AftercareMessage({ item, record, store, onReview, onSend, onClose }: { item: AftercareItem; record?: AftercareRecord; store: string; onReview: (message: string) => void; onSend: () => void; onClose: () => void }) {
  const [message, setMessage] = useState(() => record?.message ?? recommendedMessage(item, store));
  const sent = record?.status === 'sent';
  const blocker = aftercareBlocker(item);
  const messageError = !message.trim() ? '안내 메시지를 입력해 주세요.' : message.length > 1000 ? '안내 메시지는 1,000자 이내로 입력해 주세요.' : '';
  const reviewed = aftercareReviewed(item, record) && record?.message === message.trim();
  return <Modal title={sent ? '후속 안내 처리 기록' : '후속 안내 확인'} onClose={onClose}>
    <div className="aftercare-modal">
    <div className="detail-meta"><span>{item.sourceId}</span><span>{maskCustomerName(item.customerName)}</span><span>{item.outcome}</span></div>
    <dl className="consultation-result"><div><dt>상담 요약</dt><dd>{item.summary || '결과 기록 없음'}</dd></div><div><dt>후속 조치</dt><dd>{item.followUpMemo || followUpLabels[item.followUp]}</dd></div><div><dt>연락·안내 동의</dt><dd>{consentLabels[item.consent]}</dd></div></dl>
    {sent ? <><h3 className="section-label">처리한 안내 내용</h3><p className="call-opening aftercare-sent-message">{record.message}</p><p className="aftercare-success" role="status"><Icon name="check" size={18}/>후속 안내 처리가 완료되었습니다.</p><p className="muted-text">안내 확인: {consultationTime(record.reviewedAt)} · {uiText(record.reviewedBy)}<br/>안내 처리: {consultationTime(record.sentAt)} · {uiText(record.sentBy ?? '')}</p></> : <>
      <div className="consultation-field"><label htmlFor="aftercare-message">추천 후속 메시지</label><textarea id="aftercare-message" value={message} maxLength={1000} rows={5} disabled={Boolean(blocker)} onChange={event => setMessage(event.target.value)} aria-describedby="aftercare-message-help"/></div>
      <p id="aftercare-message-help" className="microcopy">{message.length} / 1,000자 · 안내할 내용을 확인하거나 수정해 주세요.</p>
      {blocker ? <p className="notice-inline" role="status">{blocker}</p> : messageError ? <p className="field-error">{messageError}</p> : <p className="microcopy" role="status">{reviewed ? '안내 내용 확인 완료 · 처리 기록을 남길 수 있습니다.' : '안내 처리 전에 내용을 확인해 주세요.'}</p>}
      <div className="modal-actions"><button className="button button-secondary" onClick={() => onReview(message)} disabled={Boolean(blocker || messageError) || reviewed}><Icon name="check" size={16}/>안내 내용 확인 완료</button><button className="button button-primary" disabled={!reviewed} onClick={onSend}>안내 처리<Icon name="arrow" size={16}/></button></div>
    </>}
    <p className="microcopy aftercare-modal-note">이 화면에서는 처리 기록만 남기며 고객에게 문자를 보내지 않습니다.</p>
    </div>
  </Modal>;
}
