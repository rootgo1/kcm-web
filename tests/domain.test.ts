import test from 'node:test';
import './callWorkflow.test.js';
import './callPresentation.test.js';
import './inventory.test.js';
import assert from 'node:assert/strict';
import { createMockData } from '../src/data/mockData.js';
import { availableStock, filterAppointments, getMetrics, markReviewed, parsePage } from '../src/lib/domain.js';
import { consultationTime, emptyResult, saveConsultation, startConsultation, validateConsultation } from '../src/lib/consultation.js';
import type { ConsultationResult, DashboardData } from '../src/types.js';
import { createCallMockData } from '../src/data/callMockData.js';
import { startCallConsultation } from '../src/lib/callConsultation.js';
import { applyCallSupport, validateSupportContent, validateSupportRequest, type SupportAction } from '../src/lib/callSupport.js';
import { callRisk, callTime, evidenceText, filterCalls, getCallMetrics, riskBand, signalEvidence } from '../src/lib/callRisk.js';

const demo = () => createMockData('2026-09-29');
test('메인 지표와 샘플 데이터가 일치한다', () => {
  assert.deepEqual(getMetrics(demo()), { reservations: 8, upcoming: 6, completed: 1, inProgress: 1, unreviewed: 3, lowStock: 2, returns: 1 });
});
test('가용 재고는 총 재고에서 예약 수량을 뺀다', () => assert.equal(availableStock(demo().inventory[0]), 2));
test('음수 가용 재고를 화면에 노출하지 않는다', () => assert.equal(availableStock({ ...demo().inventory[0], stock: 1, reserved: 5 }), 0));
test('예약 목록은 시간순으로 정렬된다', () => assert.deepEqual(filterAppointments(demo().appointments.reverse(), 'all', '').map(a => a.time), ['10:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00']));
test('예약 상태를 필터링한다', () => assert.equal(filterAppointments(demo().appointments, 'reserved', '').length, 6));
test('고객 이름으로 검색한다', () => assert.equal(filterAppointments(demo().appointments, 'all', '김서연')[0].id, 'DEMO-R002'));
test('상담 목적으로 검색한다', () => assert.equal(filterAppointments(demo().appointments, 'all', '기기변경').length, 2));
test('담당 직원으로 검색한다', () => assert.equal(filterAppointments(demo().appointments, 'all', '한지호').length, 2));
test('검색 앞뒤 공백을 제거한다', () => assert.equal(filterAppointments(demo().appointments, 'all', '  김서연  ').length, 1));
test('조회 결과가 없으면 빈 배열을 반환한다', () => assert.equal(filterAppointments(demo().appointments, 'all', '없는고객').length, 0));
test('필터와 검색 조건을 동시에 적용한다', () => assert.equal(filterAppointments(demo().appointments, 'completed', '김서연').length, 0));
test('브리핑 확인은 원본 데이터를 변경하지 않는다', () => { const data = demo(); const updated = markReviewed(data, 'DEMO-R002'); assert.equal(getMetrics(updated).unreviewed, 2); assert.equal(getMetrics(data).unreviewed, 3); });
test('분석 중인 브리핑은 확인 처리하지 않는다', () => assert.equal(markReviewed(demo(), 'DEMO-R005').appointments.find(a => a.id === 'DEMO-R005')?.reviewed, false));
test('없는 ID 확인 요청은 다른 예약을 변경하지 않는다', () => assert.deepEqual(markReviewed(demo(), 'NONE'), demo()));
test('메뉴 URL을 처리하고 잘못된 메뉴는 홈으로 돌아간다', () => { assert.equal(parsePage('#/inventory'), 'inventory'); assert.equal(parsePage('#/appointments?filter=all'), 'appointments'); assert.equal(parsePage('#/unknown'), 'home'); assert.equal(parsePage('#/toString'), 'home'); });
test('샘플 데이터 생성 시 객체를 공유하지 않는다', () => { const a = demo(); a.appointments[0].customerName = '변경'; assert.equal(demo().appointments[0].customerName, '박지훈'); });
test('고유 ID와 재고 수량이 일관된다', () => { const data = demo(); assert.equal(new Set(data.appointments.map(a => a.id)).size, data.appointments.length); assert.ok(data.inventory.every(i => i.stock >= i.reserved && i.stock >= 0)); });

// v0.2 메뉴 구조와 디렉터리 샘플 일관성
import { pageLabels } from '../src/lib/domain.js';
import { navigationGroups, productTabs, storeTabs, pageCategory } from '../src/lib/navigation.js';
import { averageReviewScore, demoStores, demoStaff } from '../src/data/directoryMockData.js';
test('요청한 3개 대분류와 메뉴 순서를 유지한다', () => {
  assert.deepEqual(navigationGroups, [
    { label: '고객관리', pages: ['appointments', 'customers'] },
    { label: '상담업무', pages: ['support', 'products'] },
    { label: '매장관리', pages: ['inventory', 'marketing', 'stores'] },
  ]);
});
test('홈은 단독이며 8개 메뉴에 누락과 중복이 없다', () => {
  const pages = ['home', ...navigationGroups.flatMap(group => group.pages)];
  assert.equal(pages.length, 8); assert.equal(new Set(pages).size, 8);
  assert.deepEqual([...pages].sort(), Object.keys(pageLabels).sort());
});
test('상품관리와 매장관리, 이전 운영 정보 링크를 처리한다', () => {
  assert.equal(parsePage('#/products'), 'products');
  assert.equal(parsePage('#/stores'), 'stores');
  assert.equal(parsePage('#/operations'), 'stores');
});
test('상품관리의 상위 탭은 정확히 4개다', () => {
  assert.deepEqual(productTabs.map(tab => tab.label), ['요금제(자사/타사)', '결합정보', '혜택정보', '제품정보']);
});
test('매장관리는 매장정보·직원정보 2개 탭이다', () => {
  assert.deepEqual(storeTabs.map(tab => tab.label), ['매장정보', '직원정보']);
});
test('화면별 대분류가 정확하다', () => {
  assert.equal(pageCategory('home'), '홈'); assert.equal(pageCategory('customers'), '고객관리');
  assert.equal(pageCategory('products'), '상담업무'); assert.equal(pageCategory('stores'), '매장관리');
});
test('예시 매장은 우리 매장 1개를 포함해 5개다', () => {
  assert.equal(demoStores.length, 5); assert.equal(demoStores.filter(store => store.isHome).length, 1);
  assert.equal(new Set(demoStores.map(store => store.id)).size, 5);
  assert.equal(demoStores.find(store => store.isHome)?.name, demo().store);
});
test('직원 샘플은 우리 매장 소속이며 기존 담당 직원과 일치한다', () => {
  const home = demoStores.find(store => store.isHome)!;
  assert.ok(demoStaff.every(employee => employee.storeId === home.id));
  assert.equal(new Set(demoStaff.map(employee => employee.id)).size, demoStaff.length);
  assert.deepEqual(demoStaff.map(employee => employee.name).sort(), [...new Set(demo().appointments.map(item => item.employee))].sort());
});
test('가상 주소와 리뷰 표시를 누락하지 않는다', () => {
  assert.ok(demoStores.every(store => store.address.includes('가상 주소')));
  assert.ok([...demoStores, ...demoStaff].every(item => item.reviews.length > 0 && item.reviews.every(review => review.author.startsWith('샘플 고객'))));
});
test('평점은 샘플 리뷰에서 계산하며 빈 리뷰도 처리한다', () => {
  assert.equal(averageReviewScore(demoStores[0].reviews), '4.5');
  assert.equal(averageReviewScore([]), '—');
});

// v0.3 프로필·현재 매장 일관성
import { avatarLabel, avatarTone, formatReviewScore } from '../src/lib/profile.js';
test('현재 매장과 사용자 프로필이 지정한 값이다', () => {
  const data = demo();
  assert.equal(data.store, 'KT플라자 동성로점');
  assert.equal(data.employee.name, '이소현');
  assert.equal(data.employee.givenName, '소현');
  assert.equal(data.employee.position, '점장');
  assert.equal(data.employee.gender, 'female');
  assert.equal(data.employee.reviewScore, 4.7);
});
test('아바타에 성이 아닌 이름 두 글자를 표시한다', () => assert.equal(avatarLabel('소현'), '소현'));
test('외자 이름은 한 글자로 유지한다', () => assert.equal(avatarLabel('준'), '준'));
test('복성도 분리된 givenName으로 안전하게 표시한다', () => assert.equal(avatarLabel('민'), '민'));
test('이름 앞뒤 공백을 제거한다', () => assert.equal(avatarLabel(' 소현 '), '소현'));
test('세 글자 이상 이름은 최대 두 글자만 표시한다', () => assert.equal(avatarLabel('하나비'), '하나'));
test('빈 이름은 대체 표시한다', () => assert.equal(avatarLabel('  '), '?'));
test('남성은 블랙·여성은 레드·미설정은 중립 색상이다', () => {
  assert.equal(avatarTone('male'), 'dark'); assert.equal(avatarTone('female'), 'red'); assert.equal(avatarTone('unspecified'), 'neutral');
});
test('평점은 소수점 한 자리로 표시한다', () => { assert.equal(formatReviewScore(4.7), '4.7'); assert.equal(formatReviewScore(5), '5.0'); });
test('없거나 유효하지 않은 평점을 0점으로 오인시키지 않는다', () => {
  for (const score of [null, NaN, Infinity, -1, 6]) assert.equal(formatReviewScore(score), '—');
});
test('프로필과 우리 매장 직원정보의 이름·직급·평점이 일치한다', () => {
  const employee = demo().employee;
  const staff = demoStaff.find(item => item.id === employee.id)!;
  assert.equal(staff.name, employee.name); assert.equal(staff.role, employee.position);
  assert.equal(averageReviewScore(staff.reviews), formatReviewScore(employee.reviewScore));
});
test('새 데이터는 다른 실행의 사용자 객체를 공유하지 않는다', () => {
  const first = demo(); first.employee.givenName = '수정'; assert.equal(demo().employee.givenName, '소현');
});

// 1차 상담 처리: 상태·집계·수정 이력의 업무 규칙
const startAt = '2026-09-30T05:00:00.000Z';
const completeAt = '2026-09-30T05:15:00.000Z';
const editAt = '2026-09-30T05:30:00.000Z';
const consultationId = 'DEMO-R002';
const validResult = (): ConsultationResult => ({ summary: '요금제와 기기변경 조건 안내', outcome: 'guided', followUp: 'required', followUpMemo: '금요일 추가 확인' });
const appointmentOf = (data: DashboardData, id = consultationId) => data.appointments.find(item => item.id === id)!;
const inProgress = () => startConsultation(demo(), consultationId, startAt);
const finished = () => saveConsultation(inProgress(), consultationId, validResult(), 'complete', completeAt).data;

test('상담 시작은 선택한 예약만 바꾸고 홈 집계와 브리핑을 일관되게 유지한다', () => {
  const original = demo(); const next = startConsultation(original, consultationId, startAt);
  assert.equal(appointmentOf(original).status, 'reserved');
  assert.equal(appointmentOf(next).status, 'in_progress');
  assert.equal(appointmentOf(next).consultation?.startedAt, startAt);
  assert.equal(appointmentOf(next).briefing, appointmentOf(original).briefing);
  assert.deepEqual(next.appointments.filter(a => a.id !== consultationId), original.appointments.filter(a => a.id !== consultationId));
  assert.deepEqual(getMetrics(next), { ...getMetrics(original), upcoming: 5, inProgress: 2 });
});
test('상담 시작을 반복하거나 완료·없는 예약에 요청하면 변경하지 않는다', () => {
  const data = inProgress();
  for (const id of [consultationId, 'DEMO-R001', 'NONE']) assert.equal(startConsultation(data, id, editAt), data);
});
test('준비 중·실패 브리핑에서도 상담을 시작하고 완료할 수 있다', () => {
  for (const id of ['DEMO-R005', 'DEMO-R007']) {
    const data = demo(); const next = saveConsultation(startConsultation(data, id, startAt), id, validResult(), 'complete', completeAt).data;
    assert.equal(appointmentOf(next, id).status, 'completed');
    assert.equal(appointmentOf(next, id).briefing, appointmentOf(data, id).briefing);
    assert.equal(appointmentOf(next, id).reviewed, false);
  }
});
test('임시 반영은 필수값 누락을 허용하고 상태·완료 시각·이력을 유지한다', () => {
  const input = { ...emptyResult(), summary: '작성 중' };
  const saved = saveConsultation(inProgress(), consultationId, input, 'draft', editAt);
  assert.equal(saved.changed, true);
  assert.equal(appointmentOf(saved.data).status, 'in_progress');
  assert.deepEqual(appointmentOf(saved.data).consultation?.result, input);
  assert.equal(appointmentOf(saved.data).consultation?.completedAt, null);
  assert.deepEqual(appointmentOf(saved.data).consultation?.history, []);
});
test('상담 완료 시 공백 요약·결과 누락은 기존 데이터와 집계를 유지한다', () => {
  const data = inProgress(); const saved = saveConsultation(data, consultationId, { ...emptyResult(), summary: ' \n ' }, 'complete', completeAt);
  assert.ok(saved.errors.summary); assert.ok(saved.errors.outcome);
  assert.equal(saved.data, data); assert.equal(saved.changed, false);
});
test('임시 반영·완료·수정 모두 입력 길이 초과를 차단한다', () => {
  for (const mode of ['draft', 'complete', 'amend'] as const) {
    const errors = validateConsultation({ ...validResult(), summary: '가'.repeat(1001), followUpMemo: '나'.repeat(501) }, mode);
    assert.ok(errors.summary); assert.ok(errors.followUpMemo);
    assert.deepEqual(validateConsultation({ ...validResult(), summary: '가'.repeat(1000), followUpMemo: '나'.repeat(500) }, mode), {});
  }
});
test('허용되지 않은 결과·후속 연락 선택값은 반영하지 않는다', () => {
  const errors = validateConsultation({ ...validResult(), outcome: 'toString', followUp: 'invalid' } as unknown as ConsultationResult, 'complete');
  assert.ok(errors.outcome); assert.ok(errors.followUp);
});
test('최초 완료는 시각·샘플 작성자·결과를 함께 반영하고 완료 건수를 한 번 증가시킨다', () => {
  const data = inProgress(); const next = saveConsultation(data, consultationId, validResult(), 'complete', completeAt).data;
  const record = appointmentOf(next).consultation!;
  assert.equal(appointmentOf(next).status, 'completed'); assert.equal(record.startedAt, startAt); assert.equal(record.completedAt, completeAt);
  assert.deepEqual(record.result, validResult()); assert.equal(record.history.length, 1);
  assert.equal(record.history[0].kind, 'completed'); assert.equal(record.history[0].before, null);
  assert.equal(record.history[0].actor.name, data.employee.name); assert.equal(record.history[0].at, completeAt);
  assert.deepEqual(getMetrics(next), { ...getMetrics(data), inProgress: 1, completed: 2 });
});
test('중복 완료 요청은 첫 결과·시각·이력·집계를 덮어쓰지 않는다', () => {
  const data = finished(); const saved = saveConsultation(data, consultationId, { ...validResult(), summary: '중복 입력' }, 'complete', editAt);
  assert.equal(saved.data, data); assert.equal(saved.changed, false);
  assert.equal(appointmentOf(data).consultation?.history.length, 1);
});
test('방문 예정에서 직접 완료하거나 상담 중 기록을 완료 수정으로 처리할 수 없다', () => {
  const data = demo(); assert.equal(saveConsultation(data, consultationId, validResult(), 'complete', completeAt).data, data);
  const started = inProgress(); assert.equal(saveConsultation(started, consultationId, validResult(), 'amend', editAt).data, started);
  assert.equal(saveConsultation(data, 'NONE', validResult(), 'complete', completeAt).data, data);
});
test('완료 후 네 가지 항목을 수정해도 최초 완료·예약 정보·집계가 유지된다', () => {
  const data = finished();
  const amended = { summary: '고객이 추가 검토 예정', outcome: 'considering' as const, followUp: 'none' as const, followUpMemo: '고객 요청 시 연락' };
  const next = saveConsultation(data, consultationId, amended, 'amend', editAt).data;
  const before = appointmentOf(data); const after = appointmentOf(next);
  assert.deepEqual({ ...after, consultation: undefined }, { ...before, consultation: undefined });
  assert.equal(after.consultation?.completedAt, completeAt); assert.equal(after.consultation?.startedAt, startAt);
  assert.deepEqual(after.consultation?.result, amended); assert.deepEqual(getMetrics(next), getMetrics(data));
  assert.deepEqual(after.consultation?.history[1], { id: `${consultationId}-2`, kind: 'amended', before: validResult(), after: amended, actor: { id: data.employee.id, name: data.employee.name, position: data.employee.position }, at: editAt });
});
test('여러 번 수정하면 변경 전후와 각 수정 시각을 순서대로 보존한다', () => {
  const first = saveConsultation(finished(), consultationId, { ...validResult(), summary: '첫 정정' }, 'amend', editAt).data;
  const secondAt = '2026-09-30T05:45:00.000Z';
  const second = saveConsultation(first, consultationId, { ...validResult(), summary: '둘째 정정' }, 'amend', secondAt).data;
  const history = appointmentOf(second).consultation!.history;
  assert.equal(history.length, 3); assert.equal(history[1].before?.summary, validResult().summary); assert.equal(history[1].after.summary, '첫 정정');
  assert.equal(history[2].before?.summary, '첫 정정'); assert.equal(history[2].after.summary, '둘째 정정'); assert.equal(history[2].at, secondAt);
  assert.equal(appointmentOf(first).consultation?.history.length, 2);
});
test('완료 기록 수정의 필수값·길이 오류는 기존 결과와 이력을 손상하지 않는다', () => {
  const data = finished();
  for (const input of [{ ...validResult(), summary: '' }, { ...validResult(), outcome: '' as const }, { ...validResult(), followUpMemo: 'x'.repeat(501) }]) {
    const saved = saveConsultation(data, consultationId, input, 'amend', editAt);
    assert.ok(Object.keys(saved.errors).length); assert.equal(saved.data, data);
  }
});
test('변경 없는 수정·공백 정리·동일 수정 재전송은 이력을 늘리지 않는다', () => {
  const data = finished();
  assert.equal(saveConsultation(data, consultationId, { ...validResult(), summary: `  ${validResult().summary}  ` }, 'amend', editAt).data, data);
  const input = { ...validResult(), summary: '정정' };
  const next = saveConsultation(data, consultationId, input, 'amend', editAt).data;
  assert.equal(saveConsultation(next, consultationId, input, 'amend', editAt).data, next);
});
test('기록 없는 기존 완료 샘플은 과거 시각을 만들지 않고 최초 입력 이력을 남긴다', () => {
  const data = demo(); const next = saveConsultation(data, 'DEMO-R001', validResult(), 'amend', editAt).data;
  const record = appointmentOf(next, 'DEMO-R001').consultation!;
  assert.equal(record.completedAt, null); assert.equal(record.startedAt, null); assert.equal(record.history[0].before, null);
  assert.equal(record.history[0].kind, 'amended'); assert.equal(record.history[0].at, editAt);
  assert.equal(consultationTime(record.completedAt), '기록 없음'); assert.deepEqual(getMetrics(next), getMetrics(data));
});
test('입력 객체와 현재 결과·사용자 변경이 보존된 이력을 바꾸지 않는다', () => {
  const input = validResult(); const data = saveConsultation(inProgress(), consultationId, input, 'complete', completeAt).data;
  input.summary = '외부 입력 객체 변경'; data.employee.name = '변경된 사용자';
  const record = appointmentOf(data).consultation!;
  assert.equal(record.result?.summary, validResult().summary);
  record.result!.summary = '현재 결과 객체 변경';
  assert.equal(record.history[0].after.summary, validResult().summary); assert.equal(record.history[0].actor.name, demo().employee.name);
});
test('추가 입력 속성으로 완료 상태·시각·예약을 변경할 수 없다', () => {
  const next = saveConsultation(finished(), consultationId, { ...validResult(), summary: '정정', completedAt: editAt, status: 'reserved' } as ConsultationResult, 'amend', editAt).data;
  assert.equal(appointmentOf(next).status, 'completed'); assert.equal(appointmentOf(next).consultation?.completedAt, completeAt);
  assert.deepEqual(Object.keys(appointmentOf(next).consultation!.result!).sort(), ['followUp', 'followUpMemo', 'outcome', 'summary']);
});
test('상담 완료와 브리핑 확인은 서로 독립적이다', () => {
  const data = finished(); assert.equal(appointmentOf(data).reviewed, false); assert.equal(getMetrics(data).unreviewed, 3);
  const reviewed = markReviewed(data, consultationId);
  assert.equal(appointmentOf(reviewed).consultation, appointmentOf(data).consultation); assert.equal(getMetrics(reviewed).completed, 2); assert.equal(getMetrics(reviewed).unreviewed, 2);
});
test('상태 필터는 시작·완료 결과에 따라 해당 예약을 제외한다', () => {
  assert.ok(!filterAppointments(inProgress().appointments, 'reserved', '').some(a => a.id === consultationId));
  assert.ok(!filterAppointments(finished().appointments, 'in_progress', '').some(a => a.id === consultationId));
  assert.equal(filterAppointments(finished().appointments, 'in_progress', '김서연').length, 0);
});
test('새 샘플 로드·초기화는 상담 결과와 이력을 유지하지 않는다', () => {
  finished(); const fresh = demo();
  assert.ok(fresh.appointments.every(a => a.consultation === undefined));
  assert.equal(appointmentOf(fresh).status, 'reserved'); assert.equal(getMetrics(fresh).completed, 1);
});

// 통화 위험도는 고객 성향·예약 상태와 독립적인 조회용 시연 결과입니다.
for (const [score, expected] of [[0, 'normal'], [19, 'normal'], [20, 'caution'], [39, 'caution'], [40, 'boundary'], [59, 'boundary'], [60, 'danger'], [79, 'danger'], [80, 'critical'], [99, 'critical']] as const) {
  test(`통화 위험 등급 경계 ${score}점 → ${expected}`, () => assert.equal(riskBand(score)?.grade, expected));
}
test('범위 밖·숫자가 아닌 점수에는 위험 등급을 배정하지 않는다', () => {
  for (const value of [-1, -0.01, 100, 100.01, 101, NaN, Infinity, -Infinity, null, undefined, '72', '', true, {}]) assert.equal(riskBand(value), null);
  assert.equal(riskBand(29.9), null); assert.equal(riskBand(79.9), null);
});
test('기본 통화 5건의 실제 데이터로 현재 현황 1·3·1·1을 계산한다', () => {
  const calls = createCallMockData();
  assert.deepEqual(calls.map(call => call.id), ['C-001', 'C-002', 'C-003', 'C-004', 'C-005']);
  assert.deepEqual(getCallMetrics(calls), { aiResponding: 1, waiting: 3, dangerous: 1, pendingSupport: 1 });
});
test('live threat metrics exclude AI-only/ended calls and do not use prior scores', () => {
  const calls=createCallMockData();calls[3].status='ended';
  assert.equal(getCallMetrics(calls).dangerous,0);
  calls[1].analysis.threatCount=1;assert.equal(getCallMetrics(calls).dangerous,1);
  calls[1].status='ai_responding';assert.equal(getCallMetrics(calls).dangerous,0);
});
test('support metrics count only open requests independently of score availability', () => {
  const calls=createCallMockData();calls[3].supportRequests[0].status='completed';
  assert.equal(getCallMetrics(calls).pendingSupport,0);
  calls[1].supportRequests=[{...calls[3].supportRequests[0],id:'other',callId:'C-002',status:'pending'}];
  assert.equal(getCallMetrics(calls).pendingSupport,1);
});
test('status/risk filters use live threat alerts or finalized grades; unfinalized stays unavailable', () => {
  const calls=createCallMockData();
  assert.deepEqual(filterCalls(calls,'waiting','boundary'),[]);
  assert.deepEqual(filterCalls(calls,'all','critical').map(c=>c.id),['C-004']);
  assert.equal(filterCalls(calls,'all','unavailable').length,4);
  assert.equal(filterCalls(calls,'all','all').length,5);
});
test('filtering preserves source and overall metrics', () => {
  const calls=createCallMockData(),copy=structuredClone(calls),metrics=getCallMetrics(calls);
  filterCalls(calls,'waiting','boundary');assert.deepEqual(calls,copy);assert.deepEqual(getCallMetrics(calls),metrics);
});
for(const status of ['processing','failed','not_analyzed'] as const) test(status+' does not invent zero signal counts',()=>{
  const call=createCallMockData()[2];const analysis={...call.analysis,status};
  assert.equal(callRisk({...call,analysis}).score,null);
  for(const signal of ['profanity','threat','blame','sexual','shouting'] as const) assert.equal(signalEvidence(analysis,signal),null);
});
test('sample evidence uses five categories and no discomfort signal',()=>{
  const analysis=createCallMockData()[2].analysis;
  assert.deepEqual((['profanity','threat','blame','sexual','shouting'] as const).map(s=>signalEvidence(analysis,s)?.length),[3,0,0,0,4]);
  assert.ok(!('discomfort' in analysis.signals!));
  for(const evidence of Object.values(analysis.signals!).flat()) assert.ok(Number.isInteger(evidence.atSeconds)&&evidence.atSeconds>=0);
  assert.equal(callTime(39),'00:39');assert.equal(callTime(158),'02:38');
});
test('zero evidence is distinct from absent analysis and profanity stays masked',()=>{
  const calls=createCallMockData();assert.deepEqual(signalEvidence(calls[2].analysis,'threat'),[]);
  assert.equal(signalEvidence(calls[4].analysis,'threat'),null);
  assert.equal(signalEvidence({...calls[2].analysis,signals:null},'threat'),null);
  assert.equal(evidenceText('profanity',{atSeconds:12,text:'원문',maskedText:'[욕설 가림]'}),'[욕설 가림]');
  assert.equal(evidenceText('profanity',{atSeconds:12,text:'숨길 원문'}),'[욕설 가림]');
  assert.equal(evidenceText('blame',{atSeconds:12,text:'일을 왜 이렇게 못해요?'}),'일을 왜 이렇게 못해요?');
});
test('통화 샘플은 실행 간 객체를 공유하지 않으며 기존 예약·상담 기록과 독립적이다', () => {
  const appointments = finished(); const snapshot = structuredClone(appointments); const calls = createCallMockData();
  calls[2].analysis.signals!.profanity.push({ atSeconds: 200, maskedText: '[욕설 가림]' });
  assert.equal(createCallMockData()[2].analysis.signals!.profanity.length, 3);
  assert.deepEqual(appointments, snapshot); assert.equal(getMetrics(appointments).completed, 2);
  assert.deepEqual(getCallMetrics(createCallMockData()), { aiResponding: 1, waiting: 3, dangerous: 1, pendingSupport: 1 });
});
test('통화가 없을 때 모든 현황 집계는 0이며 목록도 비어 있다', () => {
  assert.deepEqual(getCallMetrics([]), { aiResponding: 0, waiting: 0, dangerous: 0, pendingSupport: 0 });
  assert.deepEqual(filterCalls([], 'all', 'all'), []);
});

const callStartAt = '2026-09-30T05:00:00.000Z';
test('C-003만 시작하고 분석·근거·다른 통화·원본을 보존하며 집계는 1·2·1·1이다', () => {
  const calls = createCallMockData(); const snapshot = structuredClone(calls);
  const next = startCallConsultation(calls, 'C-003', callStartAt);
  assert.deepEqual(calls, snapshot);
  assert.equal(next[2].status, 'staff_consulting'); assert.equal(next[2].startedAt, callStartAt);
  assert.deepEqual(next[2], { ...calls[2], status: 'staff_consulting', startedAt: callStartAt });
  assert.equal(next[2].analysis, calls[2].analysis);
  for (const index of [0, 1, 3, 4]) assert.equal(next[index], calls[index]);
  assert.deepEqual(getCallMetrics(next), { aiResponding: 1, waiting: 2, dangerous: 1, pendingSupport: 1 });
});
test('같은 통화의 연속 시작 호출은 최초 시각과 상태 객체를 유지한다', () => {
  const calls = startCallConsultation(createCallMockData(), 'C-003', callStartAt);
  for (let index = 0; index < 10; index++) assert.equal(startCallConsultation(calls, 'C-003', '2026-09-30T06:00:00.000Z'), calls);
  assert.equal(calls[2].startedAt, callStartAt);
});
test('C-004의 명시적인 샘플 시작 시각은 다시 시작하거나 샘플을 읽어도 동일하다', () => {
  const calls = createCallMockData();
  assert.equal(calls[3].startedAt, '2026-09-30T13:20:00+09:00');
  assert.equal(startCallConsultation(calls, 'C-004', callStartAt), calls);
  assert.equal(createCallMockData()[3].startedAt, calls[3].startedAt);
});
test('AI 응대·종료·존재하지 않는 통화는 시작하지 않는다', () => {
  const calls = createCallMockData(); calls[0].status = 'ended';
  for (const id of ['C-005', 'C-001', 'missing']) assert.equal(startCallConsultation(calls, id, callStartAt), calls);
  assert.equal(calls[4].startedAt, null); assert.equal(calls[4].status, 'ai_responding');
});
for (const status of ['processing', 'failed', 'not_analyzed', 'completed'] as const) {
  test(`직원 연결 대기이면 ${status} 분석·점수 누락 상태에서도 시작할 수 있다`, () => {
    const calls = createCallMockData(); calls[0].analysis = { ...calls[4].analysis, status };
    const next = startCallConsultation(calls, 'C-001', callStartAt);
    assert.equal(next[0].status, 'staff_consulting'); assert.equal(next[0].startedAt, callStartAt);
    assert.equal(next[0].analysis, calls[0].analysis); assert.equal(callRisk(next[0]).grade, null);
  });
}
test('점수 유효성이나 등급은 시작의 필수 조건이 아니다', () => {
  for (const score of [0, 18, 45, 72, 91, NaN, 101]) {
    const calls = createCallMockData(); calls[0].analysis.threatCount = typeof score === 'number' && score >= 60 ? 1 : 0;
    const next = startCallConsultation(calls, 'C-001', callStartAt);
    assert.equal(next[0].status, 'staff_consulting'); assert.equal(next[0].analysis, calls[0].analysis);
  }
});
test('필터 변경·다른 통화 시작 후에도 첫 통화의 상태와 시각을 보존한다', () => {
  const calls = startCallConsultation(createCallMockData(), 'C-003', callStartAt);
  assert.ok(!filterCalls(calls, 'waiting', 'all').some(call => call.id === 'C-003'));
  assert.equal(filterCalls(calls, 'staff_consulting', 'unavailable')[0], calls[2]);
  const next = startCallConsultation(calls, 'C-001', '2026-09-30T06:00:00.000Z');
  assert.equal(next[2], calls[2]); assert.equal(next[2].startedAt, callStartAt);
});
test('새 실행의 통화 샘플은 초기 상태이며 기존 예약 완료·수정 기록과 독립적이다', () => {
  const reservations = finished(); const snapshot = structuredClone(reservations);
  startCallConsultation(createCallMockData(), 'C-003', callStartAt);
  const fresh = createCallMockData(); assert.equal(fresh[2].status, 'waiting'); assert.equal(fresh[2].startedAt, null);
  assert.deepEqual(reservations, snapshot); assert.equal(getMetrics(reservations).completed, 2);
});
test('대기 데이터에 최초 시작 시각이 이미 있다면 덮어쓰지 않는다', () => {
  const calls = createCallMockData(); calls[0].startedAt = callStartAt;
  assert.equal(startCallConsultation(calls, 'C-001', '2026-09-30T06:00:00.000Z')[0].startedAt, callStartAt);
});

const supportAt = '2026-09-30T05:05:00.000Z';
const supportAckAt = '2026-09-30T05:06:00.000Z';
const supportDoneAt = '2026-09-30T05:07:00.000Z';
const supportRequest: SupportAction = { type: 'request', requestId: 'C003-S-1', reason: 'abuse', memo: '  대응 방법 확인 요청  ', actor: '데모 직원' };
const supportAck: SupportAction = { type: 'acknowledge', requestId: 'C003-S-1', actor: '데모 관리자' };
const supportDone: SupportAction = { type: 'complete', requestId: 'C003-S-1', content: '주의 안내 문구를 함께 확인했습니다.', actor: '데모 관리자' };
const startedCalls = () => startCallConsultation(createCallMockData(), 'C-003', callStartAt);
const requestedCalls = () => applyCallSupport(startedCalls(), 'C-003', supportRequest, supportAt);
const acknowledgedCalls = () => applyCallSupport(requestedCalls(), 'C-003', supportAck, supportAckAt);
const supportedCalls = () => applyCallSupport(acknowledgedCalls(), 'C-003', supportDone, supportDoneAt);

test('C-003 시작·지원 요청·확인·완료·재요청 집계가 1/2/1/1→2→2→1→2다', () => {
  const started = startedCalls();
  const requested = applyCallSupport(started, 'C-003', supportRequest, supportAt);
  const acknowledged = applyCallSupport(requested, 'C-003', supportAck, supportAckAt);
  const completed = applyCallSupport(acknowledged, 'C-003', supportDone, supportDoneAt);
  const again = applyCallSupport(completed, 'C-003', { ...supportRequest, requestId: 'C003-S-2' }, '2026-09-30T05:08:00.000Z');
  [started, requested, acknowledged, completed, again].forEach((calls, index) => {
    assert.deepEqual(getCallMetrics(calls), { aiResponding: 1, waiting: 2, dangerous: 1, pendingSupport: [1, 2, 2, 1, 2][index] });
    assert.equal(calls[3], started[3]);
  });
});
test('사유 미선택·알 수 없는 사유·301자 메모는 상태 변경 전에 거부된다', () => {
  const calls = startedCalls();
  for (const reason of ['', 'unknown', 'toString', '__proto__']) {
    assert.ok(validateSupportRequest(reason, ''));
    assert.equal(applyCallSupport(calls, 'C-003', { ...supportRequest, reason } as SupportAction, supportAt), calls);
  }
  assert.equal(applyCallSupport(calls, 'C-003', { ...supportRequest, memo: '가'.repeat(301) }, supportAt), calls);
  assert.equal(validateSupportRequest('other', '가'.repeat(300)), '');
});
test('사유 4종과 선택 메모는 유효하며 요청에 ID·통화·최초 시각·요청자를 기록한다', () => {
  for (const reason of ['guidance', 'abuse', 'policy', 'other'] as const) {
    const calls = applyCallSupport(startedCalls(), 'C-003', { ...supportRequest, reason, memo: '' }, supportAt);
    assert.deepEqual(calls[2].supportRequests[0], { id: 'C003-S-1', callId: 'C-003', status: 'pending', reason, memo: '', requestedAt: supportAt, requestedBy: '데모 직원', acknowledgedAt: null, acknowledgedBy: null, completedAt: null, completedBy: null, content: null });
  }
});
test('요청 대기·지원 중에서 같은 ID와 다른 ID로 반복 요청해도 미완료는 하나다', () => {
  for (const calls of [requestedCalls(), acknowledgedCalls()]) {
    for (let index = 0; index < 10; index++) {
      assert.equal(applyCallSupport(calls, 'C-003', supportRequest, supportDoneAt), calls);
      assert.equal(applyCallSupport(calls, 'C-003', { ...supportRequest, requestId: `duplicate-${index}` }, supportDoneAt), calls);
    }
    assert.equal(calls[2].supportRequests.length, 1);
    assert.equal(calls[2].supportRequests[0].requestedAt, supportAt);
  }
});
test('요청 없는 통화 확인/완료와 대기에서 바로 완료, 다른 요청 ID 처리를 거부한다', () => {
  const none = startedCalls(); const pending = requestedCalls();
  for (const action of [supportAck, supportDone]) assert.equal(applyCallSupport(none, 'C-003', action, supportAckAt), none);
  assert.equal(applyCallSupport(pending, 'C-003', supportDone, supportDoneAt), pending);
  assert.equal(applyCallSupport(pending, 'C-003', { ...supportAck, requestId: 'DEMO-S-C004-1' }, supportAckAt), pending);
});
test('반복 확인·완료는 최초 처리자·시각·지원 내용을 덮어쓰지 않는다', () => {
  const acknowledged = acknowledgedCalls(); const completed = supportedCalls();
  for (let index = 0; index < 10; index++) {
    assert.equal(applyCallSupport(acknowledged, 'C-003', { ...supportAck, actor: '다른 데모 관리자' }, supportDoneAt), acknowledged);
    assert.equal(applyCallSupport(completed, 'C-003', { ...supportDone, content: '덮어쓰기' }, supportDoneAt), completed);
    assert.equal(applyCallSupport(completed, 'C-003', supportAck, supportDoneAt), completed);
  }
  const record = completed[2].supportRequests[0];
  assert.equal(record.acknowledgedAt, supportAckAt); assert.equal(record.completedAt, supportDoneAt);
  assert.equal(record.acknowledgedBy, '데모 관리자'); assert.equal(record.completedBy, '데모 관리자');
  assert.equal(record.content, supportDone.content);
});
test('지원 내용 공백·301자를 거부하고 정확히 300자는 허용한다', () => {
  const calls = acknowledgedCalls();
  for (const content of ['', '  \n\t ', '가'.repeat(301)]) {
    assert.ok(validateSupportContent(content));
    assert.equal(applyCallSupport(calls, 'C-003', { ...supportDone, content }, supportDoneAt), calls);
  }
  assert.equal(applyCallSupport(calls, 'C-003', { ...supportDone, content: '가'.repeat(300) }, supportDoneAt)[2].supportRequests[0].status, 'completed');
});
test('지원 완료 후 새 ID로 재요청하며 이전 완료 기록과 시각은 보존한다', () => {
  const calls = supportedCalls(); const old = structuredClone(calls[2].supportRequests[0]);
  const next = applyCallSupport(calls, 'C-003', { ...supportRequest, requestId: 'C003-S-2', reason: 'policy' }, '2026-09-30T05:08:00.000Z');
  assert.equal(next[2].supportRequests.length, 2); assert.equal(next[2].supportRequests[0], calls[2].supportRequests[0]);
  assert.deepEqual(next[2].supportRequests[0], old);
  assert.notEqual(next[2].supportRequests[1].id, old.id); assert.notEqual(next[2].supportRequests[1].requestedAt, old.requestedAt);
  assert.equal(applyCallSupport(next, 'C-003', supportDone, supportDoneAt), next);
  assert.equal(applyCallSupport(calls, 'C-003', supportRequest, supportDoneAt), calls);
});
test('요청 ID는 다른 통화의 기존 요청과 중복될 수 없다', () => {
  const calls = startedCalls();
  assert.equal(applyCallSupport(calls, 'C-003', { ...supportRequest, requestId: 'DEMO-S-C004-1' }, supportAt), calls);
});
for (const status of ['waiting', 'staff_consulting'] as const) {
  test(`${status} 상담은 일반 등급·0점·점수 오류·분석 없음에도 지원 요청할 수 있다`, () => {
    for (const analysisStatus of ['completed', 'processing', 'failed', 'not_analyzed'] as const) {
      for (const score of [0, 18, 45, null, NaN, 101]) {
        const calls = createCallMockData(); calls[0].status = status;
        calls[0].analysis = { ...calls[0].analysis, status: analysisStatus }; calls[0].analysis.threatCount = typeof score === 'number' && score >= 60 ? 1 : 0;
        const next = applyCallSupport(calls, 'C-001', supportRequest, supportAt);
        assert.equal(next[0].supportRequests[0].status, 'pending'); assert.equal(next[0].status, status);
      }
    }
  });
}
test('AI 응대·종료·없는 통화에는 요청할 수 없다', () => {
  const calls = createCallMockData(); calls[0].status = 'ended';
  for (const id of ['C-005', 'C-001', 'missing']) assert.equal(applyCallSupport(calls, id, supportRequest, supportAt), calls);
});
test('C-004의 기존 요청은 고정 시각의 요청 대기이며 분석과 분리되어 있다', () => {
  const calls = createCallMockData(); const request = calls[3].supportRequests[0];
  assert.equal(request.status, 'pending'); assert.equal(request.reason, 'abuse');
  assert.equal(request.requestedAt, '2026-09-30T13:22:00+09:00');
  assert.deepEqual(createCallMockData()[3].supportRequests[0], request);
  assert.equal(applyCallSupport(calls, 'C-004', supportRequest, supportAt), calls);
});
test('지원 처리 전 과정은 상담 상태·시작 시각·분석·AI 내용·다른 통화·원본을 보존한다', () => {
  let calls = startedCalls(); const original = structuredClone(calls);
  for (const action of [supportRequest, supportAck, supportDone]) {
    const snapshot = structuredClone(calls); const next = applyCallSupport(calls, 'C-003', action, supportDoneAt);
    assert.deepEqual(calls, snapshot);
    const { supportRequests: ignored, ...rest } = next[2];
    const { supportRequests: originalIgnored, ...originalRest } = original[2];
    assert.deepEqual(rest, originalRest); assert.equal(next[2].analysis, calls[2].analysis); assert.equal(next[2].aiActions, calls[2].aiActions);
    for (const index of [0, 1, 3, 4]) assert.equal(next[index], calls[index]);
    calls = next;
  }
});
test('필터는 미완료 집계·지원 기록을 변경하지 않고 새 실행은 기본 샘플이다', () => {
  const calls = supportedCalls(); const snapshot = structuredClone(calls);
  filterCalls(calls, 'waiting', 'normal'); filterCalls(calls, 'staff_consulting', 'boundary');
  assert.deepEqual(calls, snapshot); assert.equal(getCallMetrics(calls).pendingSupport, 1);
  assert.equal(createCallMockData()[2].supportRequests.length, 0);
});
test('지원 입력의 HTML 모양 텍스트는 문자열로 보관하며 다른 필드로 해석하지 않는다', () => {
  const memo = '<img src=x onerror=alert(1)> & "메모"';
  const calls = applyCallSupport(startedCalls(), 'C-003', { ...supportRequest, memo }, supportAt);
  assert.equal(calls[2].supportRequests[0].memo, memo);
});
test('지원 기록은 기존 예약 완료·수정 이력과 독립적이다', () => {
  const reservations = finished(); const snapshot = structuredClone(reservations);
  supportedCalls(); assert.deepEqual(reservations, snapshot); assert.equal(getMetrics(reservations).completed, 2);
});
