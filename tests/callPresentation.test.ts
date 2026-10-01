import test from 'node:test';
import assert from 'node:assert/strict';
import { maskCustomerName } from '../src/lib/customerName.js';
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
