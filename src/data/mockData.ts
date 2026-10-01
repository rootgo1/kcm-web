import type { Appointment, DashboardData } from '../types.js';
import { workspaceMock } from './workspaceMockData.js';

const makeBriefing = (purpose: string, preference: string, device: string): Appointment['briefing'] => ({
  status: 'ready',
  summary: `${purpose}을 희망하는 고객입니다. ${device}의 재고와 예상 부담 금액을 먼저 확인해 주세요. 기존 이용 조건을 확인한 뒤 두 가지 선택지를 비교해 안내하면 좋겠습니다.`,
  preference,
  checklist: ['희망 단말기의 색상·재고 확인', '현재 이용 조건과 약정 기간 확인', '월 예상 부담 금액을 항목별로 안내'],
  transcript: [
    { speaker: '상담 Agent', text: '어떤 상담을 도와드릴까요? 이 대화는 화면 검토용 가상 예시입니다.' },
    { speaker: '고객', text: `${purpose}을 알아보고 있습니다. ${device}도 매장에서 보고 싶어요.` },
    { speaker: '상담 Agent', text: '방문 전에 확인하고 싶은 내용이 있으실까요?' },
    { speaker: '고객', text: '월 납부금액과 재고를 먼저 알고 싶어요. 조건을 비교해서 설명해 주시면 좋겠습니다.' },
  ],
});

/** 날짜만 실행일(한국 시간)에 맞추며, 모든 사람·상담·재고 값은 시연용입니다. */
export function createMockData(date = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())): DashboardData {
  const appointments: Appointment[] = [
    { id: 'DEMO-R001', customerId: 'DEMO-C001', customerName: '박지훈', phoneMasked: '010-****-1001', time: '10:30', purpose: '요금제 변경', device: '기존 단말기 유지', budget: '월 6만 원 이내', employee: '이지은', status: 'completed', reviewed: true, briefing: makeBriefing('요금제 변경', '핵심 내용을 간결하게 안내', '기존 단말기 유지') },
    { id: 'DEMO-R002', customerId: 'DEMO-C002', customerName: '김서연', phoneMasked: '010-****-1002', time: '14:00', purpose: '기기변경 상담', device: 'Galaxy S 시리즈', budget: '월 8만 원 이내', employee: workspaceMock.employee.name, status: 'reserved', reviewed: false, briefing: makeBriefing('기기변경 상담', '조건을 차분하게 비교하는 상담 선호', 'Galaxy S 시리즈') },
    { id: 'DEMO-R003', customerId: 'DEMO-C003', customerName: '정도현', phoneMasked: '010-****-1003', time: '14:30', purpose: '가족결합 상담', device: '기존 단말기 유지', budget: '결합 후 금액 확인', employee: '이지은', status: 'in_progress', reviewed: true, briefing: makeBriefing('가족결합 상담', '가족 전체 요금을 비교해 안내', '기존 단말기 유지') },
    { id: 'DEMO-R004', customerId: 'DEMO-C004', customerName: '이수빈', phoneMasked: '010-****-1004', time: '15:00', purpose: '번호이동 상담', device: 'iPhone Pro', budget: '월 9만 원 이내', employee: workspaceMock.employee.name, status: 'reserved', reviewed: false, briefing: makeBriefing('번호이동 상담', '비용과 혜택을 표로 비교하는 상담 선호', 'iPhone Pro') },
    { id: 'DEMO-R005', customerId: 'DEMO-C005', customerName: '최윤서', phoneMasked: '010-****-1005', time: '15:30', purpose: '인터넷·TV 결합', device: '인터넷·TV', budget: '월 5만 원 이내', employee: '한지호', status: 'reserved', reviewed: false, briefing: { ...makeBriefing('인터넷·TV 결합', '선호 확인 중', '인터넷·TV'), status: 'processing', summary: '', checklist: [], transcript: [] } },
    { id: 'DEMO-R006', customerId: 'DEMO-C006', customerName: '오하준', phoneMasked: '010-****-1006', time: '16:00', purpose: '기기변경 상담', device: 'Galaxy Z 시리즈', budget: '매장에서 확인', employee: '이지은', status: 'reserved', reviewed: false, briefing: makeBriefing('기기변경 상담', '기기를 직접 비교하며 안내', 'Galaxy Z 시리즈') },
    { id: 'DEMO-R007', customerId: 'DEMO-C007', customerName: '윤서진', phoneMasked: '010-****-1007', time: '16:30', purpose: '요금제 변경', device: '기존 단말기 유지', budget: '월 7만 원 이내', employee: '한지호', status: 'reserved', reviewed: false, briefing: { ...makeBriefing('요금제 변경', '확인 필요', '기존 단말기 유지'), status: 'failed', summary: '', checklist: [], transcript: [] } },
    { id: 'DEMO-R008', customerId: 'DEMO-C008', customerName: '한시우', phoneMasked: '010-****-1008', time: '17:00', purpose: '신규 개통', device: '보급형 스마트폰', budget: '월 4만 원 이내', employee: workspaceMock.employee.name, status: 'reserved', reviewed: true, briefing: makeBriefing('신규 개통', '이용 방법을 상세하게 안내', '보급형 스마트폰') },
  ];
  appointments[1].briefing.summary = '현재 사용하는 휴대전화의 교체를 희망합니다. 월 8만 원 이내의 부담 금액을 우선 고려하며, 가족결합 적용 가능 여부를 함께 확인하고 싶어 합니다.';
  appointments[1].briefing.checklist = ['Galaxy S 시리즈 재고·색상 확인', '가족결합 적용 가능 여부 확인', '단말기 비용과 통신요금을 구분해 안내'];
  return {
    mode: 'mock', date, store: workspaceMock.store, employee: { ...workspaceMock.employee }, appointments,
    inventory: [
      { id: 'DEMO-I001', name: 'Galaxy S 시리즈', variant: '256GB · 블랙', stock: 3, reserved: 1, lowThreshold: 2 },
      { id: 'DEMO-I002', name: 'iPhone Pro', variant: '256GB · 내추럴', stock: 1, reserved: 1, lowThreshold: 2 },
      { id: 'DEMO-I003', name: 'Galaxy Z 시리즈', variant: '256GB · 실버', stock: 7, reserved: 2, lowThreshold: 2 },
    ],
    loans: [{ id: 'DEMO-L001', device: 'Galaxy S 시리즈', quantity: 2, store: 'KCM 수성 데모점', deadline: '오늘 17:00', status: 'due_today' }],
    activities: [
      { id: 'DEMO-A001', time: '13:42', label: '사전 브리핑 준비', description: '김서연 고객 · 기기변경 상담', kind: 'analysis' },
      { id: 'DEMO-A002', time: '13:35', label: '방문 예약 접수', description: '이수빈 고객 · 오늘 15:00', kind: 'reservation' },
      { id: 'DEMO-A003', time: '13:20', label: '재고 확인 필요', description: 'iPhone Pro · 가용 재고 0대', kind: 'inventory' },
    ],
  };
}
