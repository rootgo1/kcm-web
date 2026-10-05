import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import {
  availableOf, counterpartName, formatRequestedAt, inventoryErrorMessage, rentalRole, rentalRoleLabels, rentalRoles, rentalStatusLabels,
  lockedOf, stockLevel, stockLevelLabels, stockLevelPill, stockQtyOf, validateStockInput,
  type InventoryStore, type RentalRole, type RentalRow, type StockRow,
} from '../lib/inventory';
import { InventoryApiError, inventoryApi } from '../services/inventoryApi';

const codeOf = (error: unknown) => error instanceof InventoryApiError ? error.code : 'NETWORK';

const smallButton: CSSProperties = { minHeight: 26, padding: '4px 10px', fontSize: 10 };
const stepButton: CSSProperties = { width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb', color: '#5f6671', fontSize: 14, lineHeight: 1 };

/** One stock count: plain number + 수정 button, or (for the row being edited) a stepper with 저장/취소. */
function StockCell({ row, editing, draft, saving, error, onEdit, onDraft, onSave, onCancel }: {
  row: StockRow; editing: boolean; draft: string; saving: boolean; error?: string;
  onEdit: () => void; onDraft: (value: string) => void; onSave: () => void; onCancel: () => void;
}) {
  const current = stockQtyOf(row);
  if (!editing) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
    <span style={{ minWidth: 40 }}><strong>{current}</strong> 대</span>
    <button className="button button-secondary" style={smallButton} onClick={onEdit} aria-label={`${row.model_name} 재고 수정`}>수정</button>
  </span>;
  const locked = lockedOf(row);
  const value = /^\d{1,4}$/.test(draft.trim()) ? Number(draft.trim()) : null;
  const delta = value === null ? 0 : value - current;
  const step = (by: number) => onDraft(String(Math.min(9999, Math.max(locked, (value ?? current) + by))));
  return <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span role="group" aria-label={`${row.model_name} 재고 수량`} style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #e0e4e9', borderRadius: 7, overflow: 'hidden', background: 'white' }}>
        <button type="button" style={stepButton} aria-label="1대 줄이기" disabled={saving || (value ?? current) <= locked} onClick={() => step(-1)}>−</button>
        <input type="text" inputMode="numeric" autoFocus aria-label={`${row.model_name} 새 재고 수량`} value={draft} disabled={saving}
          onChange={event => onDraft(event.target.value.replace(/[^\d]/g, '').slice(0, 4))}
          onKeyDown={event => { if (event.key === 'Enter') onSave(); if (event.key === 'Escape') onCancel(); }}
          style={{ width: 46, height: 28, border: 0, borderInline: '1px solid #eef0f3', textAlign: 'center', font: 'inherit', fontWeight: 700, color: '#24272d', outline: 'none' }}/>
        <button type="button" style={stepButton} aria-label="1대 늘리기" disabled={saving || (value ?? current) >= 9999} onClick={() => step(1)}>+</button>
      </span>
      <span style={{ minWidth: 22, fontSize: 10, fontWeight: 700, color: delta > 0 ? '#2f8f5b' : delta < 0 ? 'var(--red)' : 'transparent' }} aria-live="polite">{delta > 0 ? `+${delta}` : delta < 0 ? delta : '0'}</span>
      <button className="button button-primary" style={smallButton} onClick={onSave} disabled={saving || delta === 0}>{saving ? '저장 중…' : '저장'}</button>
      <button className="text-button" style={{ fontSize: 10 }} onClick={onCancel} disabled={saving}>취소</button>
    </span>
    {error ? <small role="alert" style={{ color: 'var(--red)', whiteSpace: 'normal' }}>{error}</small>
      : locked > 0 && <small style={{ color: '#949aa4' }}>최소 {locked}대 (예약 {row.reserved_qty ?? 0} · 이동 중 {row.transfer_qty ?? 0})</small>}
  </span>;
}

/**
 * Smart inventory: stock per store (home store editable) and rentals of the home store.
 * Data comes from the backend (/api/inventory → n8n → DB). `fallback` is shown when the backend can't be reached
 * (e.g. the standalone preview without a server).
 */
export function SmartInventoryPage({ fallback }: { fallback?: ReactNode }) {
  const [stores, setStores] = useState<InventoryStore[]>([]);
  const [storeId, setStoreId] = useState('');
  const [stock, setStock] = useState<StockRow[]>([]);
  const [rentals, setRentals] = useState<RentalRow[]>([]);
  const [role, setRole] = useState<RentalRole>('incoming');
  const [loadError, setLoadError] = useState('');
  const [stockError, setStockError] = useState('');
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const home = stores.find(store => store.is_home);
  const isHome = Boolean(home && storeId === home.id);

  // Stores + our rentals; then the home store's stock.
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(''); setNotice('');
    Promise.all([inventoryApi.stores(), inventoryApi.rentals()]).then(([storeList, rentalList]) => {
      if (!active) return;
      setStores(storeList); setRentals(rentalList);
      setStoreId(current => current && storeList.some(store => store.id === current) ? current : storeList.find(store => store.is_home)?.id ?? storeList[0]?.id ?? '');
    }).catch(error => { if (active) setLoadError(codeOf(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!storeId) return;
    let active = true;
    setStockLoading(true); setStockError(''); setEditing(''); setRowErrors({});
    inventoryApi.stock(storeId).then(rows => { if (active) setStock(rows); })
      .catch(error => { if (active) { setStock([]); setStockError(codeOf(error)); } })
      .finally(() => { if (active) setStockLoading(false); });
    return () => { active = false; };
  }, [storeId, reloadKey]);

  const grouped = useMemo(() => {
    const groups: Record<RentalRole, RentalRow[]> = { sent: [], incoming: [], lending: [] };
    if (home) for (const rental of rentals) groups[rentalRole(rental, home.id)].push(rental);
    return groups;
  }, [rentals, home]);

  const startEdit = (row: StockRow) => { setEditing(row.model_id); setDraft(String(stockQtyOf(row))); setNotice(''); setRowErrors(current => ({ ...current, [row.model_id]: '' })); };
  const cancelEdit = () => { setEditing(''); setDraft(''); };
  const save = useCallback(async (row: StockRow) => {
    const text = draft;
    if (text.trim() === String(stockQtyOf(row))) { setEditing(''); return; }
    const invalid = validateStockInput(text, row);
    if (invalid) { setRowErrors(current => ({ ...current, [row.model_id]: invalid })); return; }
    setSaving(row.model_id); setRowErrors(current => ({ ...current, [row.model_id]: '' })); setNotice('');
    try {
      const updated = await inventoryApi.adjust(row.model_id, Number(text.trim()));
      // The adjust response has no maker/price; keep the listed values.
      setStock(current => current.map(item => item.model_id === row.model_id ? { ...item, ...updated, maker: item.maker, price: item.price } : item));
      setEditing('');
      setNotice(`${row.model_name} 재고를 ${stockQtyOf(updated)}대로 저장했습니다.`);
    } catch (error) {
      setRowErrors(current => ({ ...current, [row.model_id]: inventoryErrorMessage(codeOf(error)) }));
    } finally { setSaving(''); }
  }, [draft]);

  const heading = <div className="page-heading"><div><span className="eyebrow">매장관리</span><h1>스마트 재고</h1>
    <p>우리 매장과 다른 매장의 재고, 매장 간 대여 현황을 확인합니다.</p></div>
    <div className="heading-actions"><button className="button button-secondary" onClick={() => setReloadKey(key => key + 1)} disabled={loading}><Icon name="refresh" size={16}/>새로고침</button></div></div>;

  if (loading) return <>{heading}<div className="loading-view" role="status"><div className="loader"/><p>재고 정보를 불러오는 중입니다.</p></div></>;
  if (loadError) return <>{heading}
    <div className="notice-inline" role="alert" style={{ marginBottom: 16 }}><Icon name="alert" size={17}/><span>{inventoryErrorMessage(loadError)}</span></div>
    {fallback && <><p className="panel-note" style={{ marginBottom: 8 }}>아래는 샘플 화면입니다. 실제 재고가 아닙니다.</p>{fallback}</>}
  </>;

  const visibleRentals = grouped[role];
  return <>{heading}
    <div style={{ display: 'grid', gap: 20 }}>
      <section className="card appointments-card" aria-label="매장 재고">
        <div className="card-heading"><div className="title-with-icon"><span className="small-icon gray"><Icon name="box" size={18}/></span><h2>재고</h2><span className="count-label">{stock.length}</span></div>
          <label className="search-field" style={{ gap: 6, width: 'auto', maxWidth: '100%' }}><Icon name="store" size={15}/>
            <select aria-label="매장 선택" value={storeId} onChange={event => { setStoreId(event.target.value); setNotice(''); }} style={{ border: 0, background: 'transparent', font: 'inherit', paddingRight: 4, maxWidth: 260 }}>
              {stores.map(store => <option key={store.id} value={store.id}>{store.name}{store.is_home ? ' (우리 매장)' : ''}</option>)}
            </select></label></div>
        {notice && <div className="notice-inline" role="status" style={{ margin: '0 20px 12px' }}><Icon name="check" size={16}/><span>{notice}</span></div>}
        {stockError ? <div className="notice-inline" role="alert" style={{ margin: '0 20px 16px' }}><Icon name="alert" size={16}/><span>{inventoryErrorMessage(stockError)}</span></div>
          : <div className="table-scroll" role="region" aria-label="재고 표 · 좁은 화면에서 좌우 스크롤" tabIndex={0}><table className="appointment-table">
            <thead><tr><th scope="col" style={{ width: '26%' }}>모델</th><th scope="col" style={{ width: '10%' }}>가용</th><th scope="col" style={{ width: '30%' }}>재고</th><th scope="col" style={{ width: '10%' }}>예약</th><th scope="col" style={{ width: '10%' }}>이동 중</th><th scope="col" style={{ width: '16%' }}>상태</th></tr></thead>
            <tbody>{stockLoading ? <tr><td colSpan={6}>불러오는 중…</td></tr> : stock.length === 0 ? <tr><td colSpan={6}>재고 정보가 없습니다.</td></tr> : stock.map(row => {
              const level = stockLevel(row);
              const error = rowErrors[row.model_id];
              return <tr key={row.model_id} style={{ cursor: 'default' }}>
                <td><strong>{row.model_name}</strong><br/><small>{row.variant}</small></td>
                <td><strong>{availableOf(row)}</strong> 대</td>
                <td>{isHome ? <StockCell row={row} editing={editing === row.model_id} draft={draft} saving={saving === row.model_id} error={error}
                  onEdit={() => startEdit(row)} onDraft={setDraft} onSave={() => void save(row)} onCancel={cancelEdit}/>
                  : <><strong>{stockQtyOf(row)}</strong> 대</>}</td>
                <td>{row.reserved_qty ?? '-'}</td>
                <td>{row.transfer_qty ?? '-'}</td>
                <td><span className={`status-pill ${stockLevelPill[level]}`}>{stockLevelLabels[level]}</span></td>
              </tr>;
            })}</tbody></table></div>}
        <div className="table-footer"><span><Icon name="help" size={13}/>가용 = 재고 − 예약 − 이동 중 · 가용 1대 이하는 재고 부족</span><span>{isHome ? '우리 매장 재고만 수정할 수 있습니다 · Enter 저장 · Esc 취소' : '다른 매장은 조회만 가능합니다'}</span></div>
      </section>

      <section className="card appointments-card" aria-label="대여 목록">
        <div className="card-heading"><div className="title-with-icon"><span className="small-icon gray"><Icon name="truck" size={18}/></span><h2>대여</h2><span className="count-label">{rentals.length}</span></div>
          <div className="segmented-control" aria-label="대여 구분">{rentalRoles.map(item => <button key={item} aria-pressed={role === item} className={role === item ? 'selected' : ''} onClick={() => setRole(item)}>{rentalRoleLabels[item]} {grouped[item].length}</button>)}</div></div>
        <div className="table-scroll" role="region" aria-label="대여 표 · 좁은 화면에서 좌우 스크롤" tabIndex={0}><table className="appointment-table">
          <thead><tr><th scope="col" style={{ width: '16%' }}>대여번호</th><th scope="col" style={{ width: '28%' }}>모델</th><th scope="col" style={{ width: '10%' }}>수량</th><th scope="col" style={{ width: '20%' }}>{role === 'sent' ? '빌려주는 매장' : '요청 매장'}</th><th scope="col" style={{ width: '12%' }}>상태</th><th scope="col" style={{ width: '14%' }}>요청일</th></tr></thead>
          <tbody>{visibleRentals.length === 0 ? <tr><td colSpan={6}>{rentalRoleLabels[role]}이 없습니다.</td></tr> : visibleRentals.map(rental => <tr key={rental.rental_id} style={{ cursor: 'default' }}>
            <td><strong>{rental.rental_id}</strong></td>
            <td>{rental.model_name}{rental.variant ? <><br/><small>{rental.variant}</small></> : null}</td>
            <td>{rental.quantity}대</td>
            <td>{counterpartName(rental, role)}</td>
            <td><span className={`status-pill ${rental.status === 'returned' ? 'completed' : rental.status === 'requested' ? 'reserved' : 'neutral'}`}>{rentalStatusLabels[rental.status] ?? rental.status}</span></td>
            <td>{formatRequestedAt(rental.requested_at)}</td>
          </tr>)}</tbody></table></div>
        <div className="table-footer"><span><Icon name="help" size={13}/>승인·배송·반납 처리는 다음 단계에서 연결합니다.</span><span>{home?.name ?? ''} 기준</span></div>
      </section>
    </div>
  </>;
}
