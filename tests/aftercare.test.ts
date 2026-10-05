import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockData } from '../src/data/mockData.js';
import { createCallDemoState } from '../src/data/callMockData.js';
import { demoContactConsents } from '../src/data/aftercareMockData.js';
import { aftercareBlocker, aftercareItems, aftercareReviewed, recommendedAftercareMessage, reviewAftercare, sendAftercare } from '../src/lib/aftercare.js';
import { startCallConsultation } from '../src/lib/callConsultation.js';
import { completeDemoCall, updateCallDraft } from '../src/lib/callWorkflow.js';
import { applyCallSupport } from '../src/lib/callSupport.js';
import { getCallMetrics } from '../src/lib/callRisk.js';
import { saveConsultation, startConsultation } from '../src/lib/consultation.js';
import { getMetrics } from '../src/lib/domain.js';
const at = '2026-10-05T01:00:00.000Z', later = '2026-10-05T01:05:00.000Z', actor = '데모 직원';
const demo = () => createMockData('2026-10-05');
function completedCall(id = 'C-003') {
  let state = createCallDemoState();
  state = { ...state, calls: startCallConsultation(state.calls, id, at) };
  state = updateCallDraft(state, id, 'outcome', 'needs_check');
  state = updateCallDraft(state, id, 'content', '청구 항목을 확인하고 추가 확인 절차를 안내했습니다.');
  state = updateCallDraft(state, id, 'followUp', '청구 항목 확인 후 재안내 필요');
  return completeDemoCall(state, id, later, actor);
}
const completedItem = () => aftercareItems([], completedCall().calls, demoContactConsents)[0];
const reviewedState = () => { const item = completedItem(); return reviewAftercare({}, item, recommendedAftercareMessage(item, '테스트 매장'), at, actor); };

test('사후관리에는 실제 완료 상담만 투영하고 결과 없는 완료 샘플을 꾸며내지 않는다', () => {
  const appointments = demo().appointments, state = createCallDemoState(), snapshot = structuredClone({ appointments, state });
  const items = aftercareItems(appointments, state.calls, demoContactConsents);
  assert.equal(items.length, 1); assert.equal(items[0].sourceId, 'DEMO-R001');
  assert.equal(items[0].hasResult, false); assert.equal(items[0].summary, ''); assert.equal(items[0].completedAt, null);
  assert.equal(items[0].outcome, '결과 기록 없음'); assert.equal(recommendedAftercareMessage(items[0], '테스트'), '');
  assert.match(aftercareBlocker(items[0]), /결과 기록/); assert.deepEqual({ appointments, state }, snapshot);
});
test('통화 완료 결과·고객 ID·후속 메모를 읽고 원본 통화와 지원·위험값을 보존한다', () => {
  const state = completedCall(), snapshot = structuredClone(state), item = aftercareItems([], state.calls, demoContactConsents)[0];
  const call = state.calls[2];
  assert.equal(item.id, 'call:C-003'); assert.equal(item.customerId, call.customerId); assert.equal(item.summary, call.result!.content);
  assert.equal(item.outcome, '추가 확인 필요'); assert.equal(item.followUp, 'required'); assert.equal(item.followUpMemo, call.result!.followUp);
  assert.equal(item.completedAt, call.completedAt); assert.equal(item.consent, 'granted'); assert.equal(aftercareBlocker(item), '');
  assert.deepEqual(state, snapshot);
});
test('연락 동의는 이름·점수·후속 메모로 추측하지 않고 고객 ID별 명시적 데모 설정을 사용한다', () => {
  const state = completedCall();
  assert.equal(aftercareItems([], state.calls, {})[0].consent, 'unknown');
  assert.equal(aftercareItems([], state.calls, { 'CUSTOMER-003': 'declined' })[0].consent, 'declined');
  state.calls[2].customerId = null; assert.equal(aftercareItems([], state.calls, demoContactConsents)[0].consent, 'unknown');
  assert.equal(aftercareItems([], completedCall('C-002').calls, demoContactConsents)[0].consent, 'declined');
});
test('방문 예약 완료·수정 결과는 사후관리에 반영되고 최초 시각·집계·수정 이력은 보존된다', () => {
  const result = { summary: '기기변경 조건 안내', outcome: 'needs_check' as const, followUp: 'required' as const, followUpMemo: '입고 확인 후 재안내' };
  let data = startConsultation(demo(), 'DEMO-R002', at);
  data = saveConsultation(data, 'DEMO-R002', result, 'complete', later).data;
  const doneAt = data.appointments[1].consultation!.completedAt;
  assert.equal(getMetrics(data).completed, 2);
  data = saveConsultation(data, 'DEMO-R002', { ...result, summary: '수정된 기기변경 조건' }, 'amend', '2026-10-05T02:00:00Z').data;
  const item = aftercareItems(data.appointments, [], demoContactConsents).find(item => item.sourceId === 'DEMO-R002')!;
  assert.equal(item.summary, '수정된 기기변경 조건'); assert.equal(item.completedAt, doneAt);
  assert.equal(item.consent, 'granted'); assert.equal(data.appointments[1].consultation!.history.length, 2); assert.equal(getMetrics(data).completed, 2);
});
test('통화·예약 ID가 같거나 고객이 같아도 상담별 사후관리 기록은 독립적이다', () => {
  const state = completedCall(), data = demo(); data.appointments[0].id = 'C-003';
  const items = aftercareItems(data.appointments, state.calls, demoContactConsents);
  assert.deepEqual(new Set(items.map(item => item.id)), new Set(['call:C-003', 'appointment:C-003']));
  const item = completedItem(), second = { ...item, id: 'call:C-006', sourceId: 'C-006' };
  const records = sendAftercare(reviewAftercare({}, item, '후속 안내', at, actor), item, later, actor);
  assert.equal(aftercareReviewed(second, records[second.id]), false); assert.equal(records[second.id], undefined);
});
test('추천 메시지는 완료 후속 메모 템플릿이며 후속 안내가 필요 없으면 생성하지 않는다', () => {
  const item = completedItem(), message = recommendedAftercareMessage(item, '가상 매장');
  assert.ok(message.includes('가상 매장')); assert.ok(message.includes(item.inquiryType)); assert.ok(message.includes(item.followUpMemo));
  assert.equal(recommendedAftercareMessage({ ...item, followUp: 'none' }, '가상 매장'), '');
  assert.equal(recommendedAftercareMessage({ ...item, hasResult: false }, '가상 매장'), '');
});
test('해결된 통화의 선택적 후속 메모와 미해결·추가 확인 상담의 후속 안내를 구분한다', () => {
  const state = completedCall(), call = state.calls[2];
  call.result = { ...call.result!, outcome: 'resolved', followUp: '' };
  assert.equal(aftercareItems([], state.calls, demoContactConsents)[0].followUp, 'none');
  call.result.followUp = '약정 만료일 재안내'; assert.equal(aftercareItems([], state.calls, demoContactConsents)[0].followUp, 'required');
  call.result.outcome = 'unresolved'; assert.equal(aftercareItems([], state.calls, demoContactConsents)[0].followUp, 'required');
});
test('미동의·미확인·결과 없음·후속 안내 없음/미정은 확인과 발송을 막는다', () => {
  const item = completedItem();
  for (const blocked of [{ ...item, consent: 'declined' as const }, { ...item, consent: 'unknown' as const }, { ...item, hasResult: false }, { ...item, followUp: 'none' as const }, { ...item, followUp: 'unknown' as const }]) {
    const empty = {}; assert.ok(aftercareBlocker(blocked)); assert.equal(reviewAftercare(empty, blocked, '안내', at, actor), empty);
    const reviewed = reviewedState(); assert.equal(sendAftercare(reviewed, blocked, later, actor), reviewed);
  }
});
test('메시지 공백·1,000자 초과·잘못된 시각·작성자를 차단하고 HTML도 텍스트로 보존한다', () => {
  const item = completedItem(), empty = {};
  for (const message of ['', ' \n ', '가'.repeat(1001)]) assert.equal(reviewAftercare(empty, item, message, at, actor), empty);
  assert.equal(reviewAftercare(empty, item, '안내', 'invalid', actor), empty); assert.equal(reviewAftercare(empty, item, '안내', at, ' '), empty);
  assert.equal(reviewAftercare(empty, item, '가'.repeat(1000), at, actor)[item.id].message.length, 1000);
  const text = '<script>alert(1)</script> 안내'; assert.equal(reviewAftercare(empty, item, text, at, actor)[item.id].message, text);
});
test('메시지 확인 → 발송 처리 → 완료를 한 번만 반영하고 최초 기록을 덮어쓰지 않는다', () => {
  const item = completedItem(), empty = {};
  assert.equal(sendAftercare(empty, item, later, actor), empty);
  const reviewed = reviewedState(); assert.equal(aftercareReviewed(item, reviewed[item.id]), true);
  assert.equal(sendAftercare(reviewed, item, 'invalid', actor), reviewed);
  const sent = sendAftercare(reviewed, item, later, actor);
  assert.equal(sent[item.id].status, 'sent'); assert.equal(sent[item.id].sentAt, later); assert.equal(sent[item.id].reviewedAt, at);
  assert.equal(aftercareReviewed(item, sent[item.id]), false);
  assert.equal(sendAftercare(sent, item, '2026-10-05T03:00:00Z', '다른 직원'), sent);
  assert.equal(reviewAftercare(sent, item, '변경', later, actor), sent);
});
test('확인 후 상담 내용·연락 동의가 변경되면 재확인 전 발송을 막는다', () => {
  const item = completedItem(), reviewed = reviewedState();
  for (const changed of [{ ...item, summary: '수정된 내용' }, { ...item, inquiryType: '다른 문의' }, { ...item, followUpMemo: '새 메모' }, { ...item, consent: 'unknown' as const }]) {
    assert.equal(aftercareReviewed(changed, reviewed[item.id]), false); assert.equal(sendAftercare(reviewed, changed, later, actor), reviewed);
  }
  const changed = { ...item, summary: '새 결과' }, again = reviewAftercare(reviewed, changed, '새 메시지', later, actor);
  assert.equal(sendAftercare(again, changed, later, actor)[item.id].status, 'sent');
});
test('지원 미완료 상담을 완료해 사후관리해도 지원·위험·시각·다른 상담은 바뀌지 않는다', () => {
  const state = completedCall();
  // Existing independent support flow remains active after consultation completion.
  const withRequest = createCallDemoState();
  withRequest.calls = applyCallSupport(withRequest.calls, 'C-003', { type: 'request', requestId: 'test-support', reason: 'guidance', memo: '검토', actor }, at);
  withRequest.calls[2] = { ...state.calls[2], supportRequests: withRequest.calls[2].supportRequests };
  const snapshot = structuredClone(withRequest), item = aftercareItems([], withRequest.calls, demoContactConsents)[0];
  let records = reviewAftercare({}, item, '안내 메시지', at, actor); records = sendAftercare(records, item, later, actor);
  assert.equal(records[item.id].status, 'sent'); assert.deepEqual(withRequest, snapshot); assert.equal(getCallMetrics(withRequest.calls).pendingSupport, 2);
  const acknowledged = applyCallSupport(withRequest.calls, 'C-003', { type: 'acknowledge', requestId: 'test-support', actor: '데모 관리자' }, later);
  assert.equal(acknowledged[2].supportRequests[0].status, 'in_progress'); assert.equal(acknowledged[2].scoreRecord, withRequest.calls[2].scoreRecord);
  assert.equal(acknowledged[2].completedAt, withRequest.calls[2].completedAt); assert.equal(acknowledged[2].result, withRequest.calls[2].result);
});
