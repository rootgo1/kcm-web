import { useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { Tabs } from '../components/Tabs';
import { productTabs, type ProductTabId } from '../lib/navigation';

interface PlaceholderSection { title: string; icon: IconName; fields: string[] }
const sections: Record<ProductTabId, PlaceholderSection[]> = {
  plans: [
    { title: '요금제 기본 정보', icon: 'file', fields: ['요금제명', '통신사 / 통신망', '월정액'] },
    { title: '이용 조건', icon: 'phone', fields: ['데이터 제공량', '음성 / 문자', '가입 조건'] },
    { title: '제공 혜택', icon: 'sparkles', fields: ['포함 혜택', '적용 조건', '정보 갱신일'] },
  ],
  bundles: [
    { title: '결합 기본 정보', icon: 'file', fields: ['결합 상품명', '통신사', '유무선 구분'] },
    { title: '결합 조건', icon: 'users', fields: ['결합 대상', '필요 회선 수', '적용 조건'] },
    { title: '결합 혜택', icon: 'sparkles', fields: ['할인 안내', '유의 사항', '정보 갱신일'] },
  ],
  benefits: [
    { title: '혜택 기본 정보', icon: 'sparkles', fields: ['혜택명', '혜택 유형', '혜택 내용'] },
    { title: '적용 조건', icon: 'users', fields: ['대상 고객', '적용 조건', '유의 사항'] },
    { title: '제공 기간', icon: 'calendar', fields: ['시작일', '종료일', '정보 갱신일'] },
  ],
  devices: [
    { title: '제품 기본 정보', icon: 'box', fields: ['제품명', '제조사', '제품 구분'] },
    { title: '제품 사양', icon: 'file', fields: ['저장용량', '색상', '주요 사양'] },
    { title: '판매 정보', icon: 'store', fields: ['출고가', '판매 상태', '정보 갱신일'] },
  ],
};
const descriptions: Record<ProductTabId, string> = {
  plans: '자사와 타사 요금제를 구분해 확인하는 화면입니다.',
  bundles: '결합 상품과 적용 조건, 할인 내용을 확인하는 화면입니다.',
  benefits: '고객에게 안내할 혜택과 적용 조건, 제공 기간을 확인하는 화면입니다.',
  devices: '제품 사양과 판매 정보를 확인하는 화면입니다. 재고 수량은 스마트 재고에서 다룹니다.',
};
// Fictional catalog for read-only presentation; not KT offers or a DB schema.
const examples: Record<ProductTabId, string[][]> = {
  plans: [['시연 요금제 A', '가상 통신사', '45,000원 (가상)'], ['20GB (가상)', '통화 300분 · 문자 100건 (가상)', '시연용 조건'], ['가족 혜택 예시', '실제 가입 불가', '가상 상품 자료']],
  bundles: [['시연 가족결합', '가상 통신사', '휴대폰 + 인터넷 예시'], ['가상 가족 고객', '2회선 예시', '실제 가입 조건 아님'], ['결합 할인 안내 예시', '실제 할인 적용 불가', '가상 상품 자료']],
  benefits: [['시연 상담 혜택', '안내 예시', '혜택 비교용 샘플'], ['가상 상담 고객', '실제 제공되지 않음', '공식 프로모션 아님'], ['시연 시작일', '시연 종료일', '실제 제공 기간 아님']],
  devices: [['시연 단말 A', '가상 제조사', '스마트폰 예시'], ['256GB (가상)', '블랙 (가상)', '제품 비교용 샘플'], ['900,000원 (가상)', '조회 예시 · 구매 불가', '가상 상품 자료']],
};
export function ProductsPage() {
  const [active, setActive] = useState<ProductTabId>('plans');
  const [carrier, setCarrier] = useState<'own' | 'other'>('own');
  return <>
    <div className="page-heading"><div><span className="eyebrow">상담업무</span>
      <h1>상품관리</h1><p>요금제부터 제품까지, 상담에 필요한 정보를 한곳에서 확인하세요.</p>
    </div><span className="small-badge">가상 상품 · 조회 시연</span></div>
    <Tabs id="products" label="상품관리 탭" tabs={productTabs} active={active} onChange={setActive}/>
    {productTabs.map(tab => <section key={tab.id} role="tabpanel" hidden={active !== tab.id}
      id={`products-panel-${tab.id}`} aria-labelledby={`products-tab-${tab.id}`} tabIndex={0}>
      {active === tab.id && <>
        <div className="section-intro">
          <div><h2>{active === 'plans' ? `${carrier === 'own' ? '자사' : '타사'} 요금제` : tab.label}</h2><p>{descriptions[active]}</p></div>
          {active === 'plans' && <div className="carrier-toggle" role="group" aria-label="요금제 구분">
            <button type="button" aria-pressed={carrier === 'own'} onClick={() => setCarrier('own')}>자사</button>
            <button type="button" aria-pressed={carrier === 'other'} onClick={() => setCarrier('other')}>타사</button>
          </div>}
        </div>
        <div className="product-outline-grid">
          {sections[active].map((section, sectionIndex) => <section className="card product-outline-card" key={section.title}>
            <span className="small-icon gray"><Icon name={section.icon}/></span>
            <h3>{section.title}</h3><span className="outline-caption">가상 정보</span>
            <dl className="outline-fields">{section.fields.map((field, fieldIndex) => <div key={field}><dt>{field}</dt><dd>{active === 'plans' && sectionIndex === 0 && fieldIndex === 0 ? `${carrier === 'own' ? '자사' : '타사'} 시연 요금제 A` : examples[active][sectionIndex][fieldIndex]}</dd></div>)}</dl>
          </section>)}
        </div>
        <div className="card structure-note"><span className="small-icon red"><Icon name="file"/></span>
          <div><h3>상담 참고용 가상 상품입니다.</h3><p>금액·조건·혜택·사양은 시연용 예시이며 실제 KT 상품이 아닙니다. 가입·구매·수정 기능은 제공하지 않습니다.</p></div>
          <span className="status-pill neutral">조회 예시</span>
        </div>
      </>}
    </section>)}
  </>;
}
