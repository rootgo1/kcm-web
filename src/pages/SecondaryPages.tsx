import type { DashboardData, PageId } from '../types';
import { pageLabels } from '../lib/domain';
import { pageCategory } from '../lib/navigation';
import { ProductsPage } from './ProductsPage';
import { StoreManagementPage } from './StoreManagementPage';
import { Icon, type IconName } from '../components/Icon';
import { InventoryPanel } from '../components/InventoryPanel';
const definitions: Partial<Record<PageId, { icon: IconName; title: string; desc: string; features: string[] }>> = {
  customers: { icon: 'users', title: '고객 정보를 한곳에서', desc: '고객 기본 정보와 상담 이력을 함께 확인하는 화면을 구성할 예정입니다.', features: ['고객 기본 정보 조회', '상담·구매 이력 확인', '예약 내역과 사전 상담 연결'] },
  support: { icon: 'message', title: '상담에 필요한 정보를 빠르게', desc: '등록된 요금제·상품·혜택 정보를 바탕으로 상담을 지원하는 영역입니다.', features: ['요금제·결합·혜택 정보 조회', '상담 내용과 연관된 정보 안내', '체감가 계산 · 선택 기능'] },
  marketing: { icon: 'megaphone', title: '상담 이후의 고객 관리까지', desc: '고객별 맞춤 안내와 발송 내역을 확인하는 선택 기능입니다.', features: ['구매 이력·약정 만료 기반 대상 확인', '맞춤 안내 문구 검토', '안내 동의·발송 결과 확인'] },
};
export function SecondaryPages({ page, data, onHome }: { page: PageId; data: DashboardData; onHome: () => void }) {
  if (page === 'inventory') return <><div className="page-heading"><div><span className="eyebrow">매장관리</span><h1>스마트 재고</h1><p>매장 재고와 대여·반납 흐름을 확인하는 샘플 화면입니다.</p></div><span className="small-badge">조회 시연</span></div><div className="inventory-page"><InventoryPanel data={data} expanded/><div className="card planned-card"><span className="small-icon red"><Icon name="truck"/></span><h2>매장 간 재고 연결</h2><p>요청 → 승인 → 배송 → 반납 흐름을<br/>다음 개발 단계에서 연결합니다.</p><div className="flow-steps"><span>대여 요청</span><Icon name="chevron" size={14}/><span>승인·배송</span><Icon name="chevron" size={14}/><span>반납</span></div><div className="notice-inline"><Icon name="help" size={17}/><span>현재 수량은 샘플이며 실제 재고 변경이나 알림 발송은 하지 않습니다.</span></div></div></div></>;
  if (page === 'products') return <ProductsPage/>;
  if (page === 'stores') return <StoreManagementPage data={data}/>;
  const config = definitions[page];
  if (!config) return null;
  return <><div className="page-heading"><div><span className="eyebrow">{pageCategory(page)}</span><h1>{pageLabels[page]}</h1><p>전체 기능 구성을 확인하기 위한 메뉴입니다.</p></div><span className="status-pill neutral">상세 기능 준비 중</span></div><section className="card placeholder-page"><div className="placeholder-mark"><Icon name={config.icon} size={34}/></div><span className="eyebrow">다음 개발 단계</span><h2>{config.title}</h2><p>{config.desc}</p><div className="feature-list">{config.features.map(feature => <div key={feature}><Icon name="check" size={16}/><span>{feature}</span></div>)}</div><div className="placeholder-note">현재는 메뉴 이동만 구현되어 있으며, 실제 조회·계산·발송 기능은 실행되지 않습니다.</div><button className="button button-secondary" onClick={onHome}>대시보드로 돌아가기<Icon name="arrow" size={16}/></button></section></>;
}
