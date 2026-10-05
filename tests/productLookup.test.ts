import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockData } from '../src/data/mockData.js';
import { createProductCatalog } from '../src/data/productCatalog.js';
import { filterProducts, selectedProduct, toggleComparedPlan } from '../src/lib/productLookup.js';

const inventory = createMockData('2026-10-05').inventory;
const catalog = createProductCatalog(inventory);

test('상품 검색은 현재 탭과 자사·타사 범위를 유지하고 여러 검색어를 모두 확인한다', () => {
  const own = filterProducts(catalog, 'plans', '  데이터 ２０ＧＢ ', 'own');
  assert.equal(own.length, 1);
  assert.equal(own[0].name, '데이터 기본 20');
  assert.equal(filterProducts(catalog, 'plans', '20GB', 'other').length, 0);
  assert.equal(filterProducts(catalog, 'bundles', '인터넷 명의', 'other')[0].id, 'BUNDLE-INTERNET');
  assert.equal(filterProducts(catalog, 'plans', '해당없음', 'own').length, 0);
});

test('검색·통신사 전환 후 상세는 보이는 상품을 선택하며 빈 목록에서 이전 상품을 표시하지 않는다', () => {
  const own = filterProducts(catalog, 'plans', '', 'own');
  const other = filterProducts(catalog, 'plans', '', 'other');
  assert.equal(selectedProduct(own, own[1].id), own[1]);
  assert.equal(selectedProduct(other, own[1].id), other[0]);
  assert.equal(selectedProduct([], own[0].id), undefined);
});

test('요금제 비교는 자사·타사를 함께 최대 3개 선택하고 제거·재추가하며 원본을 보존한다', () => {
  const ids: string[] = [];
  const own = catalog.filter(item => item.plan?.carrier === 'own');
  const other = catalog.filter(item => item.plan?.carrier === 'other');
  let compared = toggleComparedPlan(catalog, ids, own[0].id);
  compared = toggleComparedPlan(catalog, compared, other[0].id);
  compared = toggleComparedPlan(catalog, compared, own[1].id);
  assert.deepEqual(compared, [own[0].id, other[0].id, own[1].id]);
  assert.deepEqual(toggleComparedPlan(catalog, compared, other[1].id), compared);
  const removed = toggleComparedPlan(catalog, compared, own[0].id);
  assert.deepEqual(toggleComparedPlan(catalog, removed, other[1].id), [other[0].id, own[1].id, other[1].id]);
  assert.deepEqual(ids, []);
  assert.equal(compared.length, 3);
});

test('제품·결합 항목과 존재하지 않는 항목은 요금제 비교에 들어가지 않고 중복·이전 선택을 정리한다', () => {
  const own = catalog.find(item => item.plan?.carrier === 'own')!;
  assert.deepEqual(toggleComparedPlan(catalog, [], catalog.find(item => item.tab === 'devices')!.id), []);
  assert.deepEqual(toggleComparedPlan(catalog, [], 'BUNDLE-FAMILY'), []);
  assert.deepEqual(toggleComparedPlan(catalog, [own.id, own.id, 'unknown'], 'unknown'), [own.id]);
});

test('제품정보는 기존 재고의 모델·용량·색상을 재사용하고 재고 원본과 수량을 변경하지 않는다', () => {
  const before = structuredClone(inventory);
  const devices = catalog.filter(item => item.tab === 'devices');
  assert.equal(devices.length, inventory.length);
  devices.forEach((device, index) => {
    assert.equal(device.name, inventory[index].name);
    assert.equal(device.summary, inventory[index].variant);
  });
  assert.equal(filterProducts(catalog, 'devices', 'iphone 내추럴', 'own').length, 1);
  assert.deepEqual(inventory, before);
});
