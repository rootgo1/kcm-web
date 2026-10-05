import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableOf, counterpartName, formatRequestedAt, inventoryErrorMessage, lockedOf, rentalRole, stockLevel, stockQtyOf, validateStockInput,
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
