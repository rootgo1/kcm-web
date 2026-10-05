import test from 'node:test';
import assert from 'node:assert/strict';
import { uiText } from '../src/lib/uiText.js';
import { customerCallNotice } from '../src/dev/customerCopy.js';
import { createCallDemoState } from '../src/data/callMockData.js';
import { getCallMetrics } from '../src/lib/callRisk.js';

test('표시 문구 정리는 원본 통화와 집계·식별자를 변경하지 않는다', () => {
  const state = createCallDemoState();
  const before = structuredClone(state);
  state.calls.forEach(call => {
    uiText(call.inquiryType); uiText(call.analysis.summary ?? '');
    call.supportRequests.forEach(request => uiText(request.requestedBy));
  });
  assert.deepEqual(state, before);
  assert.deepEqual(getCallMetrics(state.calls), getCallMetrics(before.calls));
  assert.equal(uiText('C-003'), 'C-003');
  assert.equal(uiText('customer_9999'), 'customer_9999');
});
test('기존 자료의 사용자 표시 문구만 자연스럽게 정리한다', () => {
  assert.equal(uiText('동일 고객 후속 문의 (데모)'), '동일 고객 후속 문의');
  assert.equal(uiText('이소현 점장 (데모 직원)'), '이소현 점장');
  assert.equal(uiText('데모 관리자'), '지원 담당');
  assert.equal(uiText('KCM 수성 데모점'), 'KCM 수성점');
  assert.equal(uiText('요금을 확인해 주세요! (고성 예시)'), '요금을 확인해 주세요!');
  assert.equal(uiText('상담 완료 / 추가 확인 필요'), '상담 완료 / 추가 확인 필요');
});
test('고객 오류 표시는 설정 이름을 노출하지 않고 권한·장치 조치를 안내한다', () => {
  assert.equal(customerCallNotice(''), '');
  assert.match(customerCallNotice('RETELL_API_KEY가 없습니다. 백엔드 설정'), /다시 시도/);
  assert.doesNotMatch(customerCallNotice('RETELL_API_KEY가 없습니다. 백엔드 설정'), /RETELL|백엔드|API/);
  assert.match(customerCallNotice('보조 마이크 사용 권한이 거부되었습니다.'), /권한.*허용/);
  assert.match(customerCallNotice('사용 가능한 마이크가 없습니다.'), /장치 연결/);
  assert.match(customerCallNotice('종료 처리에 실패했습니다. 이 테스트 탭을 닫아'), /탭을 닫아/);
});
