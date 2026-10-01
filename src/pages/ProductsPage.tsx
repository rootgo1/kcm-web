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
export function ProductsPage() {
  const [active, setActive] = useState<ProductTabId>('plans');
  const [carrier, setCarrier] = useState<'own' | 'other'>('own');
  return <>
    <div className="page-heading"><div><span className="eyebrow">상담업무</span>
      <h1>상품관리</h1><p>요금제부터 제품까지, 상담에 필요한 정보를 한곳에서 확인하세요.</p>
    </div><span className="small-badge">화면 구성 단계</span></div>
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
          {sections[active].map(section => <section className="card product-outline-card" key={section.title}>
            <span className="small-icon gray"><Icon name={section.icon}/></span>
            <h3>{section.title}</h3><span className="outline-caption">정보 배치 예시</span>
            <dl className="outline-fields">{section.fields.map(field => <div key={field}><dt>{field}</dt><dd>표시 예정</dd></div>)}</dl>
          </section>)}
        </div>
        <div className="card structure-note"><span className="small-icon red"><Icon name="file"/></span>
          <div><h3>지금은 화면의 틀을 먼저 확인합니다.</h3><p>탭별 정보 배치만 구성했습니다. 실제 상품 조회·검색·등록·수정·비교 기능은 아직 연결하지 않았습니다.</p></div>
          <span className="status-pill neutral">상세 기능 준비 중</span>
        </div>
      </>}
    </section>)}
  </>;
}
