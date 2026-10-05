import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateCalls } from '../src/lib/callPagination.js';
import { createCallMockData } from '../src/data/callMockData.js';
import { filterCalls } from '../src/lib/callRisk.js';

test('통화 목록은 5건씩 표시하며 마지막 페이지에 남은 행을 보존한다', () => {
  const calls = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }));
  assert.deepEqual(paginateCalls(calls, 1).items.map(call => call.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(paginateCalls(calls, 2).items.map(call => call.id), [6, 7, 8, 9, 10]);
  assert.deepEqual(paginateCalls(calls, 3), { page: 3, totalPages: 3, items: calls.slice(10) });
  assert.equal(calls.length, 12);
  assert.equal(paginateCalls(calls, 2).items[0], calls[5]);
});
test('통화 0~5건은 한 페이지이며 빈 결과도 유효한 페이지를 유지한다', () => {
  for (const length of [0, 1, 5]) {
    const items = Array.from({ length }, (_, i) => i);
    assert.deepEqual(paginateCalls(items, 1), { page: 1, totalPages: 1, items });
  }
  assert.equal(paginateCalls(Array(6).fill(0), 1).totalPages, 2);
});
test('목록 축소 후 초과한 페이지와 잘못된 페이지 값은 유효 범위로 보정한다', () => {
  const items = Array.from({ length: 7 }, (_, i) => i);
  assert.deepEqual(paginateCalls(items, 3), { page: 2, totalPages: 2, items: [5, 6] });
  assert.equal(paginateCalls([], 3).page, 1);
  for (const page of [0, -1, NaN]) assert.equal(paginateCalls(items, page).page, 1);
});
test('상담 상태·위험 필터를 먼저 적용한 결과에서 페이지를 나눈다', () => {
  const base = createCallMockData();
  const calls = Array.from({ length: 3 }, (_, group) => base.map(call => ({ ...call, id: `${call.id}-${group}` }))).flat();
  const filtered = filterCalls(calls, 'waiting', 'all');
  assert.equal(filtered.length, 9);
  const first = paginateCalls(filtered, 1);
  const second = paginateCalls(filtered, 2);
  assert.equal(first.items.length, 5);
  assert.equal(second.items.length, 4);
  assert.deepEqual([...first.items, ...second.items], filtered);
  assert.equal(paginateCalls(filterCalls(calls, 'completed', 'all'), 2).page, 1);
});
