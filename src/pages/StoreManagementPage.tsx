import { useState } from 'react';
import type { DashboardData } from '../types';
import { Icon } from '../components/Icon';
import { Tabs } from '../components/Tabs';
import { storeTabs, type StoreTabId } from '../lib/navigation';
import { averageReviewScore, demoStaff, demoStores, type DemoReview } from '../data/directoryMockData';

function ReviewSamples({ items, title }: { items: readonly DemoReview[]; title: string }) {
  return <section className="card review-samples"><div className="card-heading">
    <div className="title-with-icon"><Icon name="message" size={18}/><h2>{title}</h2></div>
    <span className="small-badge">가상 리뷰 {items.length}건</span>
  </div><div className="reviews-body">{items.map(review => <article className="review-sample" key={review.id}>
    <div><strong>{review.author}</strong><span className="review-score" aria-label={`${review.score}점 / 5점`}><span aria-hidden="true">★</span> {review.score.toFixed(1)} <small>/ 5</small></span></div>
    <p>{review.text}</p>
  </article>)}</div></section>;
}

export function StoreManagementPage({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<StoreTabId>('store-info');
  const [storeId, setStoreId] = useState(demoStores[0].id);
  const [staffId, setStaffId] = useState(demoStaff[0].id);
  const home = demoStores.find(store => store.isHome)!;
  const stores = demoStores.map(store => store.isHome ? { ...store, name: data.store } : store);
  const store = stores.find(item => item.id === storeId) ?? stores[0];
  const employees = demoStaff.filter(employee => employee.storeId === home.id);
  const employee = employees.find(item => item.id === staffId) ?? employees[0];
  return <>
    <div className="page-heading"><div><span className="eyebrow">매장관리</span>
      <h1>매장관리</h1><p>매장과 직원의 기본 정보, 상담 성향과 리뷰를 확인하세요.</p>
    </div><span className="small-badge">화면 구성 단계</span></div>
    <Tabs id="stores" label="매장관리 탭" tabs={storeTabs} active={tab} onChange={setTab}/>
    <div className="directory-demo-note"><Icon name="shield" size={16}/><span>매장·주소·직원·성향·평점·리뷰는 모두 화면 검토용 가상 예시입니다. 실제 조회·편집 기능은 연결 전입니다.</span></div>
    {storeTabs.map(item => <section key={item.id} role="tabpanel" hidden={tab !== item.id}
      id={`stores-panel-${item.id}`} aria-labelledby={`stores-tab-${item.id}`} tabIndex={0}>
      {tab === item.id && (tab === 'store-info' ? <>
        <div className="section-intro"><div><h2>매장정보</h2><p>우리 매장 1곳과 다른 매장 4곳의 정보 배치를 확인합니다.</p></div><span className="small-badge">예시 매장 {stores.length}곳</span></div>
        <div className="directory-grid">
          <section className="card directory-list"><div className="card-heading"><h2>매장 목록</h2><span className="muted-count">{stores.length}</span></div>
            <div className="directory-options" role="group" aria-label="샘플 매장 선택">
              {stores.map(item => <button type="button" key={item.id} aria-pressed={storeId === item.id}
                className={`directory-option ${storeId === item.id ? 'selected' : ''}`} onClick={() => setStoreId(item.id)}>
                <span className={`small-icon ${item.isHome ? 'red' : 'gray'}`}><Icon name="store" size={18}/></span>
                <span className="directory-option-text"><strong>{item.name}</strong><small>{item.area}{item.isHome && <span className="home-store-badge">우리 매장</span>}</small></span>
                <Icon name="chevron" size={14}/>
              </button>)}
            </div><p className="directory-list-note">매장을 선택하면 오른쪽 정보가 바뀝니다.</p>
          </section>
          <div className="directory-detail-stack">
            <section className="card directory-detail" aria-live="polite" aria-label="선택한 매장 정보">
              <div className="directory-detail-title"><span className="directory-emblem"><Icon name="store" size={25}/></span>
                <div><div className="directory-detail-kicker">{store.isHome ? '우리 매장' : '다른 매장'} <span>· 가상 예시</span></div><h2>{store.name}</h2></div>
                <span className="directory-rating"><span aria-hidden="true">★</span> {averageReviewScore(store.reviews)}<small>샘플 평점 · {store.reviews.length}건</small></span>
              </div>
              <dl className="directory-facts"><div><dt>주소</dt><dd>{store.address}</dd></div><div><dt>영업시간</dt><dd>{store.hours}</dd></div><div><dt>매장 구분</dt><dd>{store.isHome ? '우리 매장' : '다른 매장'} · 프로토타입 예시</dd></div></dl>
            </section>
            <ReviewSamples items={store.reviews} title="매장 리뷰"/>
          </div>
        </div>
      </> : <>
        <div className="section-intro"><div><h2>직원정보</h2><p>{data.store} 소속 직원의 프로필과 상담 성향을 확인합니다.</p></div><span className="small-badge">우리 매장 직원 {employees.length}명</span></div>
        <div className="directory-grid">
          <section className="card directory-list"><div className="card-heading"><h2>우리 매장 직원</h2><span className="muted-count">{employees.length}</span></div>
            <div className="directory-options" role="group" aria-label="샘플 직원 선택">
              {employees.map(item => <button type="button" key={item.id} aria-pressed={staffId === item.id}
                className={`directory-option ${staffId === item.id ? 'selected' : ''}`} onClick={() => setStaffId(item.id)}>
                <span className="avatar directory-avatar">{item.name.charAt(0)}</span>
                <span className="directory-option-text"><strong>{item.name}<span className="directory-role">{item.role}</span></strong><small>{item.specialty}</small></span><Icon name="chevron" size={14}/>
              </button>)}
            </div><p className="directory-list-note">직원 정보는 우리 매장 소속만 표시합니다.</p>
          </section>
          <div className="directory-detail-stack">
            <section className="card directory-detail" aria-live="polite" aria-label="선택한 직원 정보">
              <div className="directory-detail-title"><span className="avatar directory-profile-avatar">{employee.name.charAt(0)}</span>
                <div><div className="directory-detail-kicker">{data.store} <span>· 가상 직원</span></div><h2>{employee.name}<span className="directory-role">{employee.role}</span></h2></div>
                <span className="directory-rating"><span aria-hidden="true">★</span> {averageReviewScore(employee.reviews)}<small>샘플 평점 · {employee.reviews.length}건</small></span>
              </div>
              <dl className="directory-facts"><div><dt>전문분야</dt><dd>{employee.specialty}</dd></div><div><dt>상담 성향</dt><dd>{employee.style}</dd></div><div><dt>자기소개</dt><dd>{employee.introduction}</dd></div></dl>
              <div className="staff-traits">{employee.traits.map(trait => <span key={trait}>{trait}</span>)}</div>
              <p className="directory-subnote">성향은 임시 샘플 태그이며, 유형 분류·매칭 기준은 아직 적용하지 않았습니다.</p>
            </section>
            <ReviewSamples items={employee.reviews} title="직원 리뷰"/>
          </div>
        </div>
      </>)}
    </section>)}
  </>;
}
