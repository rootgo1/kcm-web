import test from 'node:test';
import assert from 'node:assert/strict';
import { latestCompletedStoredConsultation } from '../src/lib/storedCustomerPresentation.js';
import { paginateCalls } from '../src/lib/callPagination.js';
import type { StoredConsultation } from '../src/services/realDataApi.js';

const item = (id: number, customerId = 'customer_9999'): StoredConsultation => ({
  id: `consultation_${1000 + id}`, customerId, storeId: 'store_005', callId: `fixture_call_${id}`,
  purpose: '요금 문의', status: '완료', startedAt: `2026-10-07T00:${String(id).padStart(2, '0')}:00Z`,
  endedAt: `2026-10-07T00:${String(id).padStart(2, '0')}:30Z`, summaryStatus: 'missing', summaryPreview: null,
  usedAi: true, usedPhone: false, usedVisit: false,
  risks: [{ id: `risk_${1000 + id}`, stage: 'AI', score: 60, level: '위험', createdAt: '2026-10-07T00:00:00Z' }],
});

test('고객 이력 표시: 순서와 무관하게 같은 고객의 가장 최근 완료 기록만 선택한다', () => {
  const recent = item(4), active = { ...item(5), status: '진행 중' as const, endedAt: null };
  const rows = [item(3), item(6, 'customer_8888'), recent, active, item(1)];
  const before = structuredClone(rows);
  assert.equal(latestCompletedStoredConsultation(rows, 'customer_9999'), recent);
  assert.deepEqual(rows, before);
});

test('고객 이력 표시: 최신 완료 기록의 점수 누락을 과거 60점으로 대체하지 않는다', () => {
  const missing = { ...item(2), risks: [] };
  assert.equal(latestCompletedStoredConsultation([item(1), missing], 'customer_9999'), missing);
  assert.deepEqual(missing.risks, []);
  assert.equal(latestCompletedStoredConsultation([item(1)], 'customer_8888'), undefined);
  assert.equal(latestCompletedStoredConsultation([], 'customer_9999'), undefined);
});

test('고객 이력 표시: 동시각은 최근 수신 순서이고 통화별·단계별 저장 점수는 보존한다', () => {
  const first = item(1), second = { ...item(1), id: 'consultation_2000', callId: 'fixture_second',
    risks: [...item(1).risks, { id: 'risk_2000', stage: 'VISIT' as const, score: 0, level: '정상' as const, createdAt: '2026-10-07T01:00:00Z' }] };
  assert.equal(latestCompletedStoredConsultation([first, second], 'customer_9999'), second);
  assert.deepEqual(second.risks.map(risk => risk.score), [60, 0]);
  assert.equal(first.risks[0].score, 60);
});

test('고객 이력 페이지: 20건 중 5건씩 표시해도 전체 최신 완료 기록과 상세 참조는 유지한다', () => {
  const rows = Array.from({ length: 20 }, (_, index) => item(index + 1));
  const before = structuredClone(rows);
  const detail = rows[1];
  const fourth = paginateCalls(rows, 4);
  assert.equal(fourth.totalPages, 4);
  assert.equal(fourth.items.length, 5);
  assert.equal(latestCompletedStoredConsultation(rows, 'customer_9999'), rows[19]);
  assert.equal(rows.find(row => row.id === detail.id), detail);
  assert.equal(paginateCalls(rows.slice(0, 5), 4).page, 1);
  assert.deepEqual(rows, before);
});
