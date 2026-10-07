import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockData } from '../src/data/mockData.js';
import { createProductCatalog } from '../src/data/productCatalog.js';
import { filterProducts, paginateProducts, productPageSize, selectedProduct, toggleComparedPlan } from '../src/lib/productLookup.js';

const inventory = createMockData('2026-10-05').inventory;
const catalog = createProductCatalog(inventory);

function planList(count: number) {
  const plan = catalog.find(item => item.plan?.carrier === 'own')!;
  return Array.from({ length: count }, (_, index) => ({ ...plan, id: `PAGED-PLAN-${index + 1}` }));
}

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

test('상품 5건은 한 페이지이며 6건·11건은 순서대로 5건씩 나누고 마지막 나머지도 조회된다', () => {
  assert.equal(productPageSize, 5);
  for (const count of [5, 6, 11]) {
    const items = planList(count);
    const expectedPages = Math.ceil(count / 5);
    const pages = Array.from({ length: expectedPages }, (_, index) => paginateProducts(items, index + 1));
    assert.equal(pages[0].totalItems, count);
    assert.equal(pages[0].totalPages, expectedPages);
    assert.equal(pages[0].items.length, 5);
    assert.equal(pages.at(-1)!.items.length, count === 5 ? 5 : 1);
    assert.deepEqual(pages.flatMap(result => result.items), items);
  }
});

test('목록이 줄면 현재 페이지를 마지막 페이지로 제한하며 빈 목록과 잘못된 페이지는 1페이지로 처리한다', () => {
  const items = planList(11);
  assert.equal(paginateProducts(items, 3).page, 3);
  assert.deepEqual(paginateProducts(items.slice(0, 6), 3), { items: [items[5]], page: 2, totalPages: 2, totalItems: 6 });
  assert.deepEqual(paginateProducts([], 3), { items: [], page: 1, totalPages: 1, totalItems: 0 });
  for (const page of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(paginateProducts(items, page).page, 1);
    assert.deepEqual(paginateProducts(items, page).items, items.slice(0, 5));
  }
  assert.equal(paginateProducts(items, Number.MAX_SAFE_INTEGER).page, 3);
});

test('상품 페이지는 검색·탭·통신사 필터 결과를 기준으로 계산하고 원본 및 순서를 유지한다', () => {
  const own = planList(11).map((item, index) => ({ ...item, name: `${index < 6 ? '선택대상' : '다른상품'} ${index + 1}` }));
  const other = catalog.find(item => item.plan?.carrier === 'other')!;
  const items = Object.freeze([...own, other, catalog.find(item => item.tab === 'devices')!]);
  const before = structuredClone(items);
  const filtered = filterProducts(items, 'plans', '선택대상', 'own');
  assert.equal(filtered.length, 6);
  const page = paginateProducts(filtered, 2);
  assert.equal(page.totalPages, 2);
  assert.equal(page.totalItems, 6);
  assert.deepEqual(page.items.map(item => item.id), [own[5].id]);
  assert.deepEqual(items, before);
  assert.deepEqual(filtered, own.slice(0, 6));
});

test('페이지 이동 후 상세는 해당 페이지의 상품으로 전환되며 전체 목록의 비교 선택은 유지된다', () => {
  const items = planList(11);
  const first = paginateProducts(items, 1);
  const second = paginateProducts(items, 2);
  const selected = selectedProduct(first.items, items[2].id)!;
  assert.equal(selected.id, items[2].id);
  assert.equal(selectedProduct(second.items, selected.id), items[5]);
  assert.equal(selectedProduct(second.items, items[8].id), items[8]);
  assert.equal(selectedProduct(paginateProducts([], 1).items, selected.id), undefined);

  const compared = toggleComparedPlan(items, [], selected.id);
  paginateProducts(items, 3);
  assert.deepEqual(compared, [selected.id]);
  assert.deepEqual(toggleComparedPlan(items, compared, items[8].id), [selected.id, items[8].id]);
  assert.deepEqual(compared, [selected.id]);
});
