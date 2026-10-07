import test from 'node:test';
import assert from 'node:assert/strict';
import { maskCustomerName, storedCustomerDisplayName } from '../src/lib/customerName.js';
import { callRiskLabel } from '../src/lib/callPresentation.js';
import { createCallDemoState } from '../src/data/callMockData.js';
import { callRisk, getCallMetrics } from '../src/lib/callRisk.js';
import { simulateCallEnd } from '../src/lib/callWorkflow.js';

test('고객 이름은 첫·마지막 글자를 남기고 가운데를 마스킹한다', () => {
  assert.equal(maskCustomerName('이도현'), '이*현');
  assert.equal(maskCustomerName('김철'), '김*');
  assert.equal(maskCustomerName('남궁민수'), '남**수');
  assert.equal(maskCustomerName('Alexandra'), 'A*******a');
  assert.equal(maskCustomerName('  박민수  '), '박*수');
});

test('짧거나 누락된 이름과 유니코드 글자를 안전하게 표시한다', () => {
  assert.equal(maskCustomerName('김'), '*');
  for (const name of ['', '  ', undefined, null]) assert.equal(maskCustomerName(name), '이름 미확인');
  assert.equal(maskCustomerName('𠮷田花'), '𠮷*花');
});

test('확인된 테스트고객 마스킹만 고객 ID 기반 중립 이름으로 표시한다', () => {
  assert.equal(storedCustomerDisplayName('테***객', 'customer_9999'), '고객 9999');
  for (const name of ['김*연', '박*훈', '남**수', '*', '비공개 고객', '이름 미확인', '테**객', '테****객', '테스트고객', '테*트']) {
    assert.equal(storedCustomerDisplayName(name, 'customer_9999'), name);
  }
  for (const id of ['', 'customer_99', 'customer_9999x', 'CUSTOMER-9999', 'employee_9999']) {
    assert.equal(storedCustomerDisplayName('테***객', id), '테***객');
  }
});

test('중립 표시 후에도 원본 DTO·마스킹·고객별 선택 ID와 검색 원문을 보존한다', () => {
  const customer = Object.freeze({ id: 'customer_9999', nameMasked: '테***객', phoneMasked: '***-****-9999', privacyConsent: true });
  const original = structuredClone(customer);
  const searchText = `${customer.id} ${customer.nameMasked} ${customer.phoneMasked}`;
  assert.equal(storedCustomerDisplayName(customer.nameMasked, customer.id), '고객 9999');
  assert.deepEqual(customer, original);
  assert.equal(`${customer.id} ${customer.nameMasked} ${customer.phoneMasked}`, searchText);
  assert.equal(maskCustomerName('테스트고객'), '테***객');
});

test('동일한 테스트 이름도 고객 식별 번호와 앞자리 0을 유지해 서로 구분한다', () => {
  const ids = ['customer_9999', 'customer_10000', 'customer_001', 'customer_0001'];
  const labels = ids.map(id => storedCustomerDisplayName('테***객', id));
  assert.deepEqual(labels, ['고객 9999', '고객 10000', '고객 001', '고객 0001']);
  assert.equal(new Set(labels).size, ids.length);
  assert.deepEqual(ids, ['customer_9999', 'customer_10000', 'customer_001', 'customer_0001']);
});

test('통화 이름 표시로 원본 이름·고객 ID·통화 ID·점수와 집계가 바뀌지 않는다', () => {
  const state = createCallDemoState();
  const original = structuredClone(state);
  assert.deepEqual(state.calls.map(call => maskCustomerName(call.customerLabel)), ['이*현', '박*수', '김*진', '최*우', '정*민']);
  state.calls.forEach(call => callRiskLabel(call, true));
  assert.deepEqual(state, original);
  assert.deepEqual(state.calls.map(call => [call.id, call.customerId]), [1, 2, 3, 4, 5].map(id => [`C-00${id}`, `CUSTOMER-00${id}`]));
  assert.deepEqual(getCallMetrics(state.calls), { aiResponding: 1, waiting: 3, dangerous: 1, pendingSupport: 1 });
});

test('live calls never display a combined score; known zero is displayed only after completion', () => {
  const state=createCallDemoState();
  for(const call of state.calls) assert.equal(callRisk(call).score,null);
  assert.equal(callRiskLabel(state.calls[2]),'통화 종료 후 확정');
  assert.equal(callRiskLabel(state.calls[4],true),'통화 종료 후 확정');
  const done=simulateCallEnd(state,'C-001','2026-10-01T00:00:00Z');
  assert.equal(callRiskLabel(done.calls[0]),'확정 0점 / 정상 / 1단계');
});
test('a threat is an immediate non-numeric warning, regardless of customer history', () => {
  const call=createCallDemoState().calls[3];
  call.historyStatus='unknown';call.customerId=null;
  assert.match(callRiskLabel(call),/위협 감지 · 매우 위험/);
  assert.equal(callRisk(call).score,null);
});
