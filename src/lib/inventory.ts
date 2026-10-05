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
export type RentalStatus = 'requested' | 'approved' | 'shipping' | 'delivered' | 'returned' | 'rejected' | 'unknown';
export type RentalRole = 'sent' | 'incoming' | 'lending';
export interface RentalRow {
  rental_id: string; model_id: string; model_name: string; variant?: string; quantity: number;
  from_store_id: string | null; from_store_name: string | null;
  to_store_id: string; to_store_name: string;
  status: RentalStatus; role?: RentalRole | null; requested_at?: string | null;
}

/** Team rule: alert when only 1 unit (or none) is available. */
export const LOW_STOCK_THRESHOLD = 1;

export const rentalStatusLabels: Record<RentalStatus, string> = {
  requested: '요청 중', approved: '승인', shipping: '배송 중', delivered: '도착', returned: '반납 완료', rejected: '거절', unknown: '확인 필요',
};
export const rentalRoleLabels: Record<RentalRole, string> = { sent: '보낸 요청', incoming: '받은 요청', lending: '빌려준 건' };
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
export const stockLevelLabels: Record<StockLevel, string> = { empty: '재고 없음', low: '재고 부족', ok: '정상' };
export const stockLevelPill: Record<StockLevel, string> = { empty: 'danger', low: 'warning', ok: 'completed' };

/** DB mode sends `role`; memory mode doesn't, so derive it from the stores. */
export function rentalRole(rental: RentalRow, homeStoreId: string): RentalRole {
  if (rental.role) return rental.role;
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
  NETWORK: '백엔드에 연결하지 못했습니다. 백엔드 서버(npm run server)가 실행 중인지 확인해 주세요.',
  DB_UNAVAILABLE: '재고 DB(n8n)에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  INVALID_QUANTITY: '수량을 확인해 주세요. 예약·이동 중인 수량보다 적게 입력할 수 없습니다.',
  STORE_NOT_ALLOWED: '우리 매장 재고만 수정할 수 있습니다.',
  STORE_NOT_FOUND: '매장을 찾을 수 없습니다.',
  MODEL_NOT_FOUND: '모델을 찾을 수 없습니다.',
  INVENTORY_NOT_FOUND: '이 매장에는 해당 모델의 재고 정보가 없습니다.',
  HOME_STORE_NOT_CONFIGURED: '우리 매장 설정(KCM_DEMO_STORE_ID)이 없습니다.',
  NOT_IMPLEMENTED: '아직 연결되지 않은 기능입니다.',
};
export function inventoryErrorMessage(code: string): string { return errorMessages[code] ?? `요청을 처리하지 못했습니다. (${code})`; }

/** e.g. "10/2 15:00" in Korea time. */
export function formatRequestedAt(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}
