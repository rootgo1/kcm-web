import type { InventoryItem } from '../types.js';
import type { ProductTabId } from '../lib/navigation.js';

export type ProductCarrier = 'own' | 'other';
export interface CatalogField { label: string; value: string }
export interface CatalogSection { title: string; fields: readonly CatalogField[] }
export interface PlanTerms {
  carrier: ProductCarrier;
  monthlyFee: number;
  data: string;
  voice: string;
  messages: string;
  condition: string;
  benefit: string;
}
export interface CatalogItem {
  id: string;
  tab: ProductTabId;
  name: string;
  summary: string;
  tag: string;
  sections: readonly CatalogSection[];
  plan?: PlanTerms;
}

export const productReferenceNote = '공식 상품정보가 아닌 상담 비교 자료입니다. 가입·구매 전 요금·조건·사양을 별도로 확인하세요.';
export function formatProductPrice(value: number): string { return `${value.toLocaleString('ko-KR')}원`; }

// Read-only consultation reference values. They do not represent official offers.
function plan(id: string, name: string, summary: string, terms: PlanTerms): CatalogItem {
  return {
    id, tab: 'plans', name, summary, tag: terms.carrier === 'own' ? '자사' : '타사', plan: terms,
    sections: [
      { title: '요금제 기본 정보', fields: [{ label: '요금제명', value: name }, { label: '구분', value: terms.carrier === 'own' ? '자사' : '타사' }, { label: '월정액', value: formatProductPrice(terms.monthlyFee) }] },
      { title: '이용 조건', fields: [{ label: '데이터 제공량', value: terms.data }, { label: '음성', value: terms.voice }, { label: '문자', value: terms.messages }, { label: '가입 조건', value: terms.condition }] },
      { title: '제공 혜택', fields: [{ label: '혜택 확인', value: terms.benefit }, { label: '안내 기준', value: '약정·결합 할인 전 월정액' }, { label: '상담 확인사항', value: '사용량, 할인 자격, 초과 이용 조건 확인' }] },
    ],
  };
}

const referenceItems: readonly CatalogItem[] = [
  plan('PLAN-OWN-20', '데이터 기본 20', '월 데이터 사용량이 적은 고객의 비용 비교', { carrier: 'own', monthlyFee: 45000, data: '20GB', voice: '300분', messages: '100건', condition: '휴대전화 회선 · 가입 자격 별도 확인', benefit: '가족결합 적용 여부 확인' }),
  plan('PLAN-OWN-60', '데이터 충분 60', '영상과 음악을 자주 이용하는 고객의 사용량 비교', { carrier: 'own', monthlyFee: 59000, data: '60GB', voice: '500분', messages: '200건', condition: '휴대전화 회선 · 가입 자격 별도 확인', benefit: '결합 할인과 추가 데이터 조건 확인' }),
  plan('PLAN-OWN-100', '데이터 중심 100', '데이터 사용량이 많은 고객의 월 부담 비교', { carrier: 'own', monthlyFee: 69000, data: '100GB', voice: '500분', messages: '200건', condition: '휴대전화 회선 · 가입 자격 별도 확인', benefit: '공유 데이터와 콘텐츠 혜택 조건 확인' }),
  plan('PLAN-OTHER-30', '데이터 균형 30', '데이터 제공량과 월정액을 함께 비교', { carrier: 'other', monthlyFee: 42000, data: '30GB', voice: '300분', messages: '100건', condition: '번호이동 시 가입 자격 별도 확인', benefit: '번호이동 혜택과 결합 가능 여부 확인' }),
  plan('PLAN-OTHER-70', '데이터 여유 70', '중간 사용량 구간의 데이터와 비용 비교', { carrier: 'other', monthlyFee: 57000, data: '70GB', voice: '500분', messages: '200건', condition: '번호이동 시 가입 자격 별도 확인', benefit: '약정과 콘텐츠 혜택 조건 확인' }),
  plan('PLAN-OTHER-110', '데이터 집중 110', '높은 데이터 사용량 구간의 조건 비교', { carrier: 'other', monthlyFee: 67000, data: '110GB', voice: '500분', messages: '200건', condition: '번호이동 시 가입 자격 별도 확인', benefit: '데이터 공유와 인터넷 결합 조건 확인' }),
  {
    id: 'BUNDLE-FAMILY', tab: 'bundles', name: '가족 회선 결합', summary: '가족의 휴대전화 회선을 함께 확인', tag: '휴대전화',
    sections: [
      { title: '결합 기본 정보', fields: [{ label: '결합 대상', value: '가족 휴대전화 회선' }, { label: '회선 수', value: '2회선 이상 비교' }] },
      { title: '결합 조건', fields: [{ label: '필요 확인', value: '가족관계, 명의, 현재 결합 여부' }, { label: '적용 조건', value: '회선별 요금제와 할인 자격 확인' }] },
      { title: '결합 혜택', fields: [{ label: '할인 안내', value: '회선 구성에 따라 개별 확인' }, { label: '유의 사항', value: '기존 할인과 중복 적용 여부 확인' }] },
    ],
  },
  {
    id: 'BUNDLE-INTERNET', tab: 'bundles', name: '인터넷·휴대전화 결합', summary: '유무선 요금을 묶어 월 부담 확인', tag: '유무선',
    sections: [
      { title: '결합 기본 정보', fields: [{ label: '결합 대상', value: '인터넷 + 휴대전화' }, { label: '회선 수', value: '인터넷 1회선 · 휴대전화 1회선 이상' }] },
      { title: '결합 조건', fields: [{ label: '필요 확인', value: '설치 주소, 이용 속도, 명의' }, { label: '적용 조건', value: '인터넷 및 휴대전화의 결합 자격 확인' }] },
      { title: '결합 혜택', fields: [{ label: '할인 안내', value: '속도와 회선 구성별 할인 확인' }, { label: '유의 사항', value: '약정 기간과 해지 조건 별도 확인' }] },
    ],
  },
  {
    id: 'BUNDLE-TV', tab: 'bundles', name: '인터넷·TV 결합', summary: '인터넷 속도와 TV 구성을 함께 비교', tag: '인터넷·TV',
    sections: [
      { title: '결합 기본 정보', fields: [{ label: '결합 대상', value: '인터넷 + TV' }, { label: '회선 수', value: '인터넷 1회선 · TV 1대 이상' }] },
      { title: '결합 조건', fields: [{ label: '필요 확인', value: '설치 가능 여부, 채널, 셋톱박스' }, { label: '적용 조건', value: '설치 주소와 상품 구성별 확인' }] },
      { title: '결합 혜택', fields: [{ label: '할인 안내', value: '속도·채널·약정별 월요금 확인' }, { label: '유의 사항', value: '설치비와 장비 비용 구분 안내' }] },
    ],
  },
  {
    id: 'BENEFIT-FAMILY', tab: 'benefits', name: '가족결합 혜택 확인', summary: '가족 회선에 적용할 수 있는 할인 확인', tag: '결합 할인',
    sections: [
      { title: '혜택 기본 정보', fields: [{ label: '혜택 유형', value: '회선 결합 할인' }, { label: '혜택 내용', value: '가족 전체 월요금과 할인 내역 비교' }] },
      { title: '적용 조건', fields: [{ label: '대상 고객', value: '가족 회선을 함께 이용하는 고객' }, { label: '필요 확인', value: '가족관계와 회선별 가입 조건' }, { label: '유의 사항', value: '다른 할인과 중복 가능 여부 확인' }] },
      { title: '제공 기간', fields: [{ label: '적용 기간', value: '결합 유지 및 가입 조건에 따라 확인' }, { label: '종료 조건', value: '회선 변경·해지 시 할인 변동 확인' }] },
    ],
  },
  {
    id: 'BENEFIT-CONTENT', tab: 'benefits', name: '콘텐츠 혜택 확인', summary: '요금제에 포함된 콘텐츠 이용 조건 확인', tag: '콘텐츠',
    sections: [
      { title: '혜택 기본 정보', fields: [{ label: '혜택 유형', value: '콘텐츠 이용 혜택' }, { label: '혜택 내용', value: '선택한 요금제의 콘텐츠 포함 여부 확인' }] },
      { title: '적용 조건', fields: [{ label: '대상 고객', value: '해당 혜택이 포함된 요금제 이용 고객' }, { label: '필요 확인', value: '이용권 등록과 계정 연결 방법' }, { label: '유의 사항', value: '별도 구독의 중복 결제 여부 확인' }] },
      { title: '제공 기간', fields: [{ label: '적용 기간', value: '요금제별 제공 기간 확인' }, { label: '종료 조건', value: '혜택 종료 후 유료 전환 여부 확인' }] },
    ],
  },
];

/** Model and variant are projected from the same inventory records as the stock screen. */
export function createProductCatalog(inventory: readonly InventoryItem[]): CatalogItem[] {
  const devices: CatalogItem[] = inventory.map(item => ({
    id: `DEVICE-${item.id}`, tab: 'devices', name: item.name, summary: item.variant, tag: '스마트폰',
    sections: [
      { title: '제품 기본 정보', fields: [{ label: '제품명', value: item.name }, { label: '제품 구분', value: '스마트폰' }, { label: '세부 모델', value: '정확한 모델 번호 확인 후 안내' }] },
      { title: '제품 사양', fields: [{ label: '용량·색상', value: item.variant }, { label: '주요 사양', value: '세부 모델별 제조사 안내 확인' }] },
      { title: '판매 정보', fields: [{ label: '가격 안내', value: '모델·가입 조건별 확인' }, { label: '재고 확인', value: '스마트 재고에서 조회' }, { label: '상담 확인사항', value: '단말기 비용과 통신요금 구분 안내' }] },
    ],
  }));
  return [...referenceItems, ...devices];
}
