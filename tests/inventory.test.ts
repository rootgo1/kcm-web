import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableOf, counterpartName, describeRequest, formatRequestedAt, inventoryErrorCode, inventoryErrorMessage, lockedOf, nextRentalAction, rentalRole, rentalRoleLabels, rentalStatusLabels, stockLevel, stockLevelLabels, stockLevelPill, stockQtyOf, validateStockInput,
  type RentalRow, type StockRow,
} from '../src/lib/inventory.js';
import { InventoryApiError, inventoryApi } from '../src/services/inventoryApi.js';

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
  assert.match(inventoryErrorMessage('NETWORK'), /재고 서비스.*연결하지 못/);
  assert.equal(inventoryErrorMessage('SOMETHING_NEW'), '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  assert.equal(formatRequestedAt('2026-09-25T06:13:58.488Z'), '9/25 15:13');
  assert.equal(formatRequestedAt(null), '-');
  assert.equal(formatRequestedAt('not a date'), '-');
});

test('스마트 재고: 서비스 오류 안내는 기술 설정 대신 이용 가능한 다음 행동을 알려준다', () => {
  for (const code of ['NETWORK', 'DB_UNAVAILABLE', 'HOME_STORE_NOT_CONFIGURED', 'INVENTORY_NOT_CONFIGURED', 'NOT_IMPLEMENTED']) {
    const notice = inventoryErrorMessage(code);
    assert.match(notice, /다시 시도|관리자에게 문의/);
    assert.doesNotMatch(notice, /백엔드|DB|n8n|N8N|KCM_DEMO|npm|\.env/);
    assert.equal(inventoryErrorCode(code), code);
  }
});

test('스마트 재고 API: 목록의 잘못된 성공 JSON과 필수 ID·수량을 INVALID_RESPONSE로 거절한다', async () => {
  const originalFetch = globalThis.fetch;
  const invalid = (error: unknown) => { assert.ok(error instanceof InventoryApiError); assert.equal(error.code, 'INVALID_RESPONSE'); return true; };
  try {
    for (const body of [null, {}, 'wrong', [null], [{}]]) {
      globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
      for (const request of [() => inventoryApi.stores(), () => inventoryApi.stock(), () => inventoryApi.rentals()]) await assert.rejects(request(), invalid);
    }
    for (const body of [{ id: '', name: '테스트점', is_home: true }, { id: 'store_005', name: {}, is_home: true }]) {
      globalThis.fetch = async () => new Response(JSON.stringify([body]), { status: 200 });
      await assert.rejects(inventoryApi.stores(), invalid);
    }
    for (const over of [{ model_id: '' }, { store_id: null }, { quantity: '2' }, { quantity: -1 }, { quantity: 1.5 }, { quantity: null }, { available: {} }]) {
      globalThis.fetch = async () => new Response(JSON.stringify([{ ...dbRow, ...over }]), { status: 200 });
      await assert.rejects(inventoryApi.stock(), invalid);
    }
    for (const over of [{ rental_id: '' }, { to_store_id: null }, { quantity: 0 }, { status: '__proto__' }, { model_name: {} }]) {
      globalThis.fetch = async () => new Response(JSON.stringify([{ ...rental({}), ...over }]), { status: 200 });
      await assert.rejects(inventoryApi.rentals(), invalid);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('스마트 재고 API: 변경·대여 요청의 잘못된 성공 응답을 안전한 오류로 거절한다', async () => {
  const originalFetch = globalThis.fetch;
  const invalid = (error: unknown) => { assert.ok(error instanceof InventoryApiError); assert.equal(error.code, 'INVALID_RESPONSE'); return true; };
  try {
    for (const body of [null, {}, [], 'wrong', { rental: null, applied_radius_km: 3, candidates: [] }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
      await assert.rejects(inventoryApi.adjust('product_001', 5), invalid);
      await assert.rejects(inventoryApi.rentalAction('stock_001', 'approve', 'store_005'), invalid);
      await assert.rejects(inventoryApi.requestRental('product_001', 1), invalid);
    }
    const result = { rental: rental({}), applied_radius_km: 3, candidates: [] };
    for (const over of [{ candidates: null }, { candidates: [{}] }, { applied_radius_km: '3' }]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ ...result, ...over }), { status: 200 });
      await assert.rejects(inventoryApi.requestRental('product_001', 1), invalid);
    }
    globalThis.fetch = async () => new Response('not JSON', { status: 200 });
    await assert.rejects(inventoryApi.stock(), invalid);
  } finally { globalThis.fetch = originalFetch; }
});

test('스마트 재고 API: 정상 DB·메모리 응답과 선택 필드 없는 행의 호환성을 유지한다', async () => {
  const originalFetch = globalThis.fetch;
  const respond = (body: unknown) => { globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 }); };
  try {
    const stores = [{ id: 'store_005', name: '테스트점', is_home: true, extra: { optional: true } }];
    respond(stores); assert.deepEqual(await inventoryApi.stores(), stores);
    const sparseStores = [{ id: 'store_005', is_home: true }];
    respond(sparseStores); assert.deepEqual(await inventoryApi.stores(), sparseStores);
    for (const rows of [[], [dbRow], [memoryRow]]) { respond(rows); assert.deepEqual(await inventoryApi.stock(), rows); }
    const sparseStock = { store_id: 'store_005', is_home: true, model_id: 'product_001', quantity: 0 };
    respond([sparseStock]); assert.deepEqual(await inventoryApi.stock(), [sparseStock]);
    for (const row of [dbRow, memoryRow]) { respond(row); assert.deepEqual(await inventoryApi.adjust(row.model_id, row.quantity), row); }
    const row = rental({});
    respond([row]); assert.deepEqual(await inventoryApi.rentals(), [row]);
    const sparseRental = { rental_id: 'stock_001', model_id: 'product_001', quantity: 1, to_store_id: 'store_005', status: 'requested' };
    respond([sparseRental]); assert.deepEqual(await inventoryApi.rentals(), [sparseRental]);
    respond(row); assert.deepEqual(await inventoryApi.rentalAction(row.rental_id, 'approve', 'store_005'), row);
    respond(row); assert.deepEqual(await inventoryApi.requestRental(row.model_id, 1), { rental: row, applied_radius_km: null, candidates: [] });
    const result = { rental: row, applied_radius_km: 3, candidates: [{ store_id: 'store_001', store_name: '1호점', distance_km: 1.2, available: 2 }] };
    respond(result); assert.deepEqual(await inventoryApi.requestRental(row.model_id, 1), result);
    const noDistance = { rental: row, applied_radius_km: null, candidates: [{ store_id: 'store_001', store_name: '1호점', distance_km: null, available: null }] };
    respond(noDistance); assert.deepEqual(await inventoryApi.requestRental(row.model_id, 1), noDistance);
  } finally { globalThis.fetch = originalFetch; }
});

test('스마트 재고: 알 수 없는 오류 원문과 상속 속성 이름은 사용자 안내에 노출하지 않는다', () => {
  const raw = ['Error: https://inventory.invalid/hook?token=private_fixture_token', 'Authorization: Bearer private_fixture_token\nAPI_KEY=private_fixture_key', '<script>private_fixture_payload</script>', 'toString', '__proto__', 'constructor'];
  for (const value of raw) {
    const error = new InventoryApiError(value);
    assert.equal(error.code, 'UNKNOWN_ERROR');
    assert.equal(error.message, 'UNKNOWN_ERROR');
    const notice = inventoryErrorMessage(value);
    assert.equal(notice, '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    assert.doesNotMatch(notice, /private_fixture|https?:|Bearer|API_KEY|<script>|toString|__proto__|constructor/);
  }
  for (const value of [null, undefined, {}, 502]) assert.equal(inventoryErrorCode(value), 'UNKNOWN_ERROR');
  assert.equal(new InventoryApiError('OUT_OF_STOCK').code, 'OUT_OF_STOCK');
  assert.match(inventoryErrorMessage('OUT_OF_STOCK'), /가용 재고가 부족/);
});

test('스마트 재고 API: 수신 오류 원문은 일반 오류로 제한하고 알려진 코드는 유지한다', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const code of ['https://inventory.invalid/?token=private_fixture_token', 'toString', '__proto__', 'constructor', 'OUT_OF_STOCK']) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error_message: code }), { status: 409 });
      await assert.rejects(inventoryApi.stores(), error => {
        assert.ok(error instanceof InventoryApiError);
        assert.equal(error.code, code === 'OUT_OF_STOCK' ? code : 'UNKNOWN_ERROR');
        assert.equal(error.message, error.code);
        return true;
      });
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('스마트 재고: 대여 구분과 라벨은 객체 상속 속성을 enum 값으로 사용하지 않는다', () => {
  for (const key of ['toString', '__proto__', 'constructor']) {
    for (const labels of [rentalStatusLabels, rentalRoleLabels, stockLevelLabels, stockLevelPill]) {
      assert.equal((labels as Record<string, string>)[key], undefined);
    }
    assert.equal(rentalRole(rental({ role: key as RentalRow['role'] }), 'store_005'), 'sent');
    assert.equal(rentalRole(rental({ role: key as RentalRow['role'], to_store_id: 'store_001' }), 'store_005'), 'incoming');
    assert.equal(rentalRole(rental({ role: key as RentalRow['role'], to_store_id: 'store_001', status: 'shipping' }), 'store_005'), 'lending');
  }
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
