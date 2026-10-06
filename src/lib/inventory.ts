/** Smart inventory screen helpers. Field names follow the backend /api/inventory responses (memory and DB mode share them). */

export interface InventoryStore { id: string; name: string; is_home: boolean }
export interface StockRow {
  store_id: string; store_name: string; is_home: boolean;
  model_id: string; model_name: string; variant: string;
  /** Available units (DB mode: stock − reserved − transfer; memory mode: the single count). */
  quantity: number;
  stock_qty?: number; reserved_qty?: number; transfer_qty?: number; available?: number;
  maker?: string | null; price?: number | null;
}
export type RentalStatus = 'requested' | 'approved' | 'shipping' | 'delivered' | 'returning' | 'returned' | 'cancelled' | 'rejected' | 'unknown';
export type RentalRole = 'sent' | 'incoming' | 'lending';
export interface RentalRow {
  rental_id: string; model_id: string; model_name: string; variant?: string; quantity: number;
  from_store_id: string | null; from_store_name: string | null;
  to_store_id: string; to_store_name: string;
  status: RentalStatus; role?: RentalRole | null; requested_at?: string | null;
}

/** Team rule: alert when only 1 unit (or none) is available. */
export const LOW_STOCK_THRESHOLD = 1;

const ownLabels = <Key extends string>(labels: Record<Key, string>): Record<Key, string> =>
  Object.assign(Object.create(null) as Record<Key, string>, labels);

export const rentalStatusLabels: Record<RentalStatus, string> = ownLabels({
  requested: '요청 중', approved: '승인', shipping: '배송 중', delivered: '도착', returning: '반납 중', returned: '반납 완료', cancelled: '취소됨', rejected: '거절', unknown: '확인 필요',
});
export const rentalRoleLabels: Record<RentalRole, string> = ownLabels({ sent: '보낸 요청', incoming: '받은 요청', lending: '빌려준 건' });
export const rentalRoles: RentalRole[] = ['sent', 'incoming', 'lending'];

export function availableOf(row: StockRow): number { return row.available ?? row.quantity; }
/** The editable count: DB `stock_qty`, or the single count in memory mode. */
export function stockQtyOf(row: StockRow): number { return row.stock_qty ?? row.quantity; }
/** Units that can't be removed by a manual correction (reserved + moving to another store). */
export function lockedOf(row: StockRow): number { return (row.reserved_qty ?? 0) + (row.transfer_qty ?? 0); }

export type StockLevel = 'empty' | 'low' | 'ok';
export function stockLevel(row: StockRow): StockLevel {
  const available = availableOf(row);
  return available <= 0 ? 'empty' : available <= LOW_STOCK_THRESHOLD ? 'low' : 'ok';
}
export const stockLevelLabels: Record<StockLevel, string> = ownLabels({ empty: '재고 없음', low: '재고 부족', ok: '정상' });
export const stockLevelPill: Record<StockLevel, string> = ownLabels({ empty: 'danger', low: 'warning', ok: 'completed' });

/** DB mode sends `role`; memory mode doesn't, so derive it from the stores. */
export function rentalRole(rental: RentalRow, homeStoreId: string): RentalRole {
  if (rental.role && rentalRoles.includes(rental.role)) return rental.role;
  if (rental.to_store_id === homeStoreId) return 'sent';
  return rental.status === 'requested' ? 'incoming' : 'lending';
}
/** The other store from our point of view. An open request has no lender yet. */
export function counterpartName(rental: RentalRow, role: RentalRole): string {
  return role === 'sent' ? rental.from_store_name ?? '승인 대기' : rental.to_store_name;
}

/** Returns an error message, or null when the text is a valid new stock count for this row. */
export function validateStockInput(text: string, row: StockRow): string | null {
  if (!/^\d{1,4}$/.test(text.trim())) return '0~9999 사이의 정수로 입력해 주세요.';
  const value = Number(text.trim());
  const locked = lockedOf(row);
  if (value < locked) return `예약·이동 중인 ${locked}대보다 적게 입력할 수 없습니다.`;
  return null;
}

const errorMessages: Record<string, string> = {
  NETWORK: '재고 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  DB_UNAVAILABLE: '재고 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  INVALID_QUANTITY: '수량을 확인해 주세요. 예약·이동 중인 수량보다 적게 입력할 수 없습니다.',
  STORE_NOT_ALLOWED: '우리 매장이 할 수 없는 작업입니다.',
  NO_LENDER_AVAILABLE: '빌려줄 수 있는 매장이 없습니다. 주변 매장에 재고가 없거나 부족합니다.',
  INVALID_RENTAL_STATUS: '이미 처리된 대여입니다. 새로고침해서 최신 상태를 확인해 주세요.',
  SAME_STORE: '우리 매장이 보낸 요청은 승인할 수 없습니다.',
  OUT_OF_STOCK: '가용 재고가 부족해 승인할 수 없습니다.',
  RENTAL_NOT_FOUND: '대여 건을 찾을 수 없습니다. 이미 취소됐을 수 있습니다.',
  INVALID_RADIUS: '검색 반경을 확인해 주세요.',
  STORE_NOT_FOUND: '매장을 찾을 수 없습니다.',
  MODEL_NOT_FOUND: '모델을 찾을 수 없습니다.',
  INVENTORY_NOT_FOUND: '이 매장에는 해당 모델의 재고 정보가 없습니다.',
  HOME_STORE_NOT_CONFIGURED: '우리 매장 정보를 확인할 수 없습니다. 관리자에게 문의해 주세요.',
  INVENTORY_NOT_CONFIGURED: '재고 서비스를 이용할 수 없습니다. 관리자에게 문의해 주세요.',
  NOT_IMPLEMENTED: '현재 이 작업을 이용할 수 없습니다. 관리자에게 문의해 주세요.',
  INVALID_RESPONSE: '재고 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN_ERROR: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
};
/** Only documented codes may cross into user-facing errors; received details can contain private data. */
export function inventoryErrorCode(value: unknown): string {
  return typeof value === 'string' && Object.hasOwn(errorMessages, value) ? value : 'UNKNOWN_ERROR';
}
export function inventoryErrorMessage(code: string): string { return errorMessages[inventoryErrorCode(code)]; }

/** e.g. "10/2 15:00" in Korea time. */
export function formatRequestedAt(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export type RentalActionName = 'approve' | 'cancel' | 'ship' | 'deliver' | 'return';
export interface RentalActionSpec { name: RentalActionName; label: string; done: string; confirm?: string }

/** The one thing our store can do next with a rental, or null. Mirrors who may act in the n8n SQL. */
export function nextRentalAction(rental: RentalRow, role: RentalRole): RentalActionSpec | null {
  if (role === 'sent' && rental.status === 'requested') return { name: 'cancel', label: '요청 취소', done: '대여 요청을 취소했습니다.',
    confirm: '이 대여 요청을 취소할까요? 취소한 요청은 목록에서 사라집니다.' };
  if (role === 'sent' && rental.status === 'shipping') return { name: 'deliver', label: '도착 확인', done: '도착을 확인했습니다. 다 쓰면 빌려준 매장에 돌려주세요.' };
  if (role === 'incoming' && rental.status === 'requested') return { name: 'approve', label: '승인', done: '승인했습니다. 빌려줄 수량이 이동 중으로 잡혔습니다.' };
  if (role === 'lending' && rental.status === 'approved') return { name: 'ship', label: '배송 시작', done: '배송을 시작했습니다.' };
  if (role === 'lending' && (rental.status === 'delivered' || rental.status === 'returning')) return { name: 'return', label: '반납 완료', done: '반납 완료 처리했습니다. 이동 중 수량이 가용 재고로 돌아왔습니다.',
    confirm: '단말을 돌려받았나요? 반납 완료하면 이동 중 수량이 다시 가용 재고로 돌아옵니다.' };
  return null;
}

export interface RentalCandidate { store_id: string; store_name: string; distance_km: number | null; available: number | null }
export interface RentalRequestResult { rental: RentalRow; applied_radius_km: number | null; candidates: RentalCandidate[] }

/** e.g. "3km 안 2개 매장에 요청했습니다: 대구점(1.2km), 서대구점(2.8km)". */
export function describeRequest(result: RentalRequestResult): string {
  const { candidates, applied_radius_km: radius } = result;
  if (!candidates.length) return `${result.rental.rental_id} 요청을 보냈습니다.`;
  const scope = radius === null ? '거리 제한 없이' : `${radius}km 안`;
  const names = candidates.slice(0, 3).map(c => c.distance_km === null ? c.store_name : `${c.store_name}(${c.distance_km}km)`).join(', ');
  return `${result.rental.rental_id} · ${scope} ${candidates.length}개 매장에 요청했습니다: ${names}${candidates.length > 3 ? ' 외' : ''}`;
}
