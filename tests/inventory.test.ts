import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableOf, counterpartName, describeRequest, formatRequestedAt, inventoryErrorMessage, lockedOf, nextRentalAction, rentalRole, stockLevel, stockQtyOf, validateStockInput,
  type RentalRow, type StockRow,
} from '../src/lib/inventory.js';

// Synthetic rows only.
const dbRow: StockRow = { store_id: 'store_005', store_name: '테스트점', is_home: true, model_id: 'product_001', model_name: '모델 A', variant: '256GB · 블랙',
  quantity: 2, stock_qty: 5, reserved_qty: 1, transfer_qty: 2, available: 2 };
const memoryRow: StockRow = { store_id: 'DEMO-S001', store_name: '데모점', is_home: true, model_id: 'DEMO-I001', model_name: '데모 모델', variant: '', quantity: 3 };
const rental = (over: Partial<RentalRow>): RentalRow => ({ rental_id: 'stock_001', model_id: 'product_001', model_name: '모델 A', quantity: 1,
  from_store_id: null, from_store_name: null, to_store_id: 'store_005', to_store_name: '테스트점', status: 'requested', ...over });

test('스마트 재고: DB 행과 메모리 행 모두 가용·재고 수량을 읽는다', () => {
  assert.equal(availableOf(dbRow), 2); assert.equal(stockQtyOf(dbRow), 5); assert.equal(lockedOf(dbRow), 3);
  assert.equal(availableOf(memoryRow), 3); assert.equal(stockQtyOf(memoryRow), 3); assert.equal(lockedOf(memoryRow), 0);
});

test('스마트 재고: 가용 1대 이하는 부족, 0대는 없음', () => {
  assert.equal(stockLevel({ ...dbRow, available: 0 }), 'empty');
  assert.equal(stockLevel({ ...dbRow, available: 1 }), 'low');
  assert.equal(stockLevel({ ...dbRow, available: 2 }), 'ok');
});

test('스마트 재고: 수량 입력은 0~9999 정수이고 예약+이동 중보다 작을 수 없다', () => {
  assert.equal(validateStockInput('5', dbRow), null);
  assert.equal(validateStockInput(' 3 ', dbRow), null);
  assert.match(validateStockInput('2', dbRow) ?? '', /3대보다/);
  for (const text of ['', '-1', '1.5', 'abc', '10000']) assert.ok(validateStockInput(text, dbRow), text);
  assert.equal(validateStockInput('0', memoryRow), null);
});

test('스마트 재고: 대여 구분은 DB role을 쓰고, 없으면(메모리 모드) 매장으로 판단한다', () => {
  assert.equal(rentalRole(rental({ role: 'incoming' }), 'store_005'), 'incoming');
  assert.equal(rentalRole(rental({}), 'store_005'), 'sent');
  assert.equal(rentalRole(rental({ to_store_id: 'store_001', from_store_id: 'store_005' }), 'store_005'), 'incoming');
  assert.equal(rentalRole(rental({ to_store_id: 'store_001', from_store_id: 'store_005', status: 'shipping' }), 'store_005'), 'lending');
  assert.equal(counterpartName(rental({}), 'sent'), '승인 대기');
  assert.equal(counterpartName(rental({ from_store_name: '대구점' }), 'sent'), '대구점');
  assert.equal(counterpartName(rental({}), 'incoming'), '테스트점');
});

test('스마트 재고: 오류 코드는 한국어 안내로, 요청일은 한국 시간으로 표시한다', () => {
  assert.match(inventoryErrorMessage('NETWORK'), /백엔드/);
  assert.match(inventoryErrorMessage('SOMETHING_NEW'), /SOMETHING_NEW/);
  assert.equal(formatRequestedAt('2026-09-25T06:13:58.488Z'), '9/25 15:13');
  assert.equal(formatRequestedAt(null), '-');
  assert.equal(formatRequestedAt('not a date'), '-');
});

test('스마트 재고: 우리 매장이 할 수 있는 다음 처리만 버튼으로 나온다', () => {
  const name = (over: Partial<RentalRow>, role: 'sent' | 'incoming' | 'lending') => nextRentalAction(rental(over), role)?.name ?? null;
  assert.equal(name({ status: 'requested' }, 'sent'), 'cancel');
  assert.equal(name({ status: 'approved' }, 'sent'), null, '빌려주는 매장의 배송을 기다림');
  assert.equal(name({ status: 'shipping' }, 'sent'), 'deliver');
  assert.equal(name({ status: 'delivered' }, 'sent'), null, '반납 완료는 빌려준 매장이 처리');
  assert.equal(name({ status: 'requested' }, 'incoming'), 'approve');
  assert.equal(name({ status: 'approved' }, 'lending'), 'ship');
  assert.equal(name({ status: 'shipping' }, 'lending'), null, '요청 매장의 도착 확인을 기다림');
  assert.equal(name({ status: 'delivered' }, 'lending'), 'return');
  assert.equal(name({ status: 'returning' }, 'lending'), 'return');
  assert.equal(name({ status: 'returned' }, 'lending'), null);
  assert.ok(nextRentalAction(rental({ status: 'requested' }), 'sent')?.confirm, '취소는 한 번 더 확인');
  assert.ok(nextRentalAction(rental({ status: 'delivered' }), 'lending')?.confirm, '반납 완료는 한 번 더 확인');
  assert.equal(nextRentalAction(rental({ status: 'requested' }), 'incoming')?.confirm, undefined);
});

test('스마트 재고: 대여 요청 결과 문구', () => {
  const r = rental({ rental_id: 'stock_042' });
  const c = (n: number) => ({ store_id: `store_00${n}`, store_name: `${n}호점`, distance_km: n * 1.1, available: 3 });
  assert.equal(describeRequest({ rental: r, applied_radius_km: 3, candidates: [c(1), c(2)] }), 'stock_042 · 3km 안 2개 매장에 요청했습니다: 1호점(1.1km), 2호점(2.2km)');
  assert.match(describeRequest({ rental: r, applied_radius_km: null, candidates: [c(1), c(2), c(3), c(4)] }), /거리 제한 없이 4개 매장.* 외$/);
  assert.equal(describeRequest({ rental: r, applied_radius_km: null, candidates: [] }), 'stock_042 요청을 보냈습니다.');
  assert.match(inventoryErrorMessage('NO_LENDER_AVAILABLE'), /빌려줄 수 있는 매장이 없습니다/);
});
