import { workspaceMock } from './workspaceMockData.js';

/** 화면 배치 확인용 가상 데이터입니다. 실제 매장·주소·직원·고객 리뷰가 아닙니다. */
export interface DemoReview { id: string; author: string; score: number; text: string }
export interface DemoStore {
  id: string; name: string; area: string; address: string;
  hours: string; isHome: boolean; reviews: DemoReview[];
}
export interface DemoStaff {
  id: string; storeId: string; name: string; role: string;
  specialty: string; style: string; traits: string[]; introduction: string; reviews: DemoReview[];
}
const reviews = (prefix: string, first: string, second: string): DemoReview[] => [
  { id: `${prefix}-R1`, author: '샘플 고객 01', score: 5, text: first },
  { id: `${prefix}-R2`, author: '샘플 고객 02', score: 4, text: second },
];
export const demoStores: DemoStore[] = [
  { id: 'DEMO-S001', name: workspaceMock.store, area: '대구 북구', address: '대구광역시 북구 예시로 101 (가상 주소)', hours: '10:00–19:00 (예시)', isHome: true,
    reviews: reviews('S1', '방문 전에 문의한 내용이 공유되어 상담을 편하게 시작했습니다.', '매장 위치와 방문 시간을 미리 확인할 수 있어서 좋았습니다.') },
  { id: 'DEMO-S002', name: 'KCM 수성 데모점', area: '대구 수성구', address: '대구광역시 수성구 예시로 202 (가상 주소)', hours: '10:00–19:00 (예시)', isHome: false,
    reviews: reviews('S2', '요금제와 결합 조건을 한 번에 설명해 주셨습니다.', '예약한 시간에 상담을 진행할 수 있었습니다.') },
  { id: 'DEMO-S003', name: 'KCM 동성로 데모점', area: '대구 중구', address: '대구광역시 중구 예시로 303 (가상 주소)', hours: '10:00–19:00 (예시)', isHome: false,
    reviews: reviews('S3', '관심 있는 단말기의 차이를 이해하기 쉽게 안내받았습니다.', '방문 전 상담과 매장 상담이 자연스럽게 이어졌습니다.') },
  { id: 'DEMO-S004', name: 'KCM 성서 데모점', area: '대구 달서구', address: '대구광역시 달서구 예시로 404 (가상 주소)', hours: '10:00–19:00 (예시)', isHome: false,
    reviews: reviews('S4', '가족이 함께 이용할 수 있는 조건을 꼼꼼하게 안내받았습니다.', '궁금한 내용을 충분히 질문할 수 있었습니다.') },
  { id: 'DEMO-S005', name: 'KCM 구미 데모점', area: '경북 구미시', address: '경상북도 구미시 예시로 505 (가상 주소)', hours: '10:00–19:00 (예시)', isHome: false,
    reviews: reviews('S5', '예산에 맞는 선택지를 차근차근 설명해 주셨습니다.', '매장 정보와 예약 내용을 확인하기 편했습니다.') },
];
export const demoStaff: DemoStaff[] = [
  { id: 'DEMO-E001', storeId: 'DEMO-S001', name: workspaceMock.employee.name, role: workspaceMock.employee.position, specialty: workspaceMock.employee.specialty,
    style: '차분한 설명형', traits: ['차분한', '꼼꼼한', '비교 중심'], introduction: '고객의 예산과 이용 조건을 듣고 선택지를 차근차근 안내합니다.',
    reviews: [...reviews('E1', '조건별 차이를 차분하게 설명해 주셔서 선택에 도움이 됐습니다.', '필요한 정보부터 정리해 주셔서 이해하기 쉬웠습니다.'), { id: 'E1-R3', author: '샘플 고객 03', score: 5, text: '궁금한 조건을 꼼꼼하게 비교해 주셨습니다.' }] },
  { id: 'DEMO-E002', storeId: 'DEMO-S001', name: '이지은', role: '상담 직원', specialty: '요금제 · 가족결합',
    style: '명확한 핵심형', traits: ['명확한', '간결한', '조건 중심'], introduction: '복잡한 요금과 결합 조건을 핵심부터 정리해 안내합니다.',
    reviews: reviews('E2', '가족결합 조건을 보기 쉽게 정리해 주셨습니다.', '질문에 핵심부터 답해 주셔서 상담이 편했습니다.') },
  { id: 'DEMO-E003', storeId: 'DEMO-S001', name: '한지호', role: '상담 직원', specialty: '인터넷·TV · 이용 안내',
    style: '친근한 소통형', traits: ['친근한', '경청하는', '안내 중심'], introduction: '낯선 통신 용어도 쉽게 풀어 설명하고 충분히 질문받습니다.',
    reviews: reviews('E3', '모르는 내용을 부담 없이 질문할 수 있었습니다.', '설치와 이용 과정을 쉽게 풀어서 알려주셨습니다.') },
];
export function averageReviewScore(items: readonly DemoReview[]): string {
  return items.length ? (items.reduce((sum, item) => sum + item.score, 0) / items.length).toFixed(1) : '—';
}
