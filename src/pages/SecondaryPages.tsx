import type { DashboardData, PageId } from '../types';
import { ProductsPage } from './ProductsPage';
import { StoreManagementPage } from './StoreManagementPage';
import { Icon } from '../components/Icon';
import { InventoryPanel } from '../components/InventoryPanel';
import { LiveConsultations } from '../live/LiveConsultations';
import { maskCustomerName } from '../lib/customerName';
export function SecondaryPages({ page, data }: { page: PageId; data: DashboardData }) {
  if (page === 'inventory') return <><div className="page-heading"><div><span className="eyebrow">매장관리</span><h1>스마트 재고</h1><p>매장 재고와 대여·반납 흐름을 확인하는 샘플 화면입니다.</p></div><span className="small-badge">조회 시연</span></div><div className="inventory-page"><InventoryPanel data={data} expanded/><div className="card planned-card"><span className="small-icon red"><Icon name="truck"/></span><h2>매장 간 재고 연결</h2><p>요청 → 승인 → 배송 → 반납 흐름을<br/>다음 개발 단계에서 연결합니다.</p><div className="flow-steps"><span>대여 요청</span><Icon name="chevron" size={14}/><span>승인·배송</span><Icon name="chevron" size={14}/><span>반납</span></div><div className="notice-inline"><Icon name="help" size={17}/><span>현재 수량은 샘플이며 실제 재고 변경이나 알림 발송은 하지 않습니다.</span></div></div></div></>;
  if (page === 'products') return <ProductsPage/>;
  if (page === 'stores') return <StoreManagementPage data={data}/>;
  if (page === 'customers') return <>
    <div className="page-heading"><div><span className="eyebrow">고객관리</span><h1>고객관리</h1><p>고객 식별 정보와 통화별 상담·위험 이력을 확인하세요.</p></div><span className="small-badge">조회</span></div>
    <LiveConsultations view="history"/>
    <section className="card appointments-card" aria-label="방문 예약 고객 예시"><div className="card-heading"><h2>방문 예약 고객</h2><span className="small-badge">가상 예약 · 실제 통화와 별도</span></div>
      <div className="table-scroll" role="region" aria-label="방문 예약 고객 목록" tabIndex={0}><table className="appointment-table"><thead><tr><th>예약 ID</th><th>고객</th><th>상담 목적</th><th>예약 시간</th></tr></thead><tbody>{data.appointments.map(item => <tr key={item.id}><td>{item.id}</td><td>{maskCustomerName(item.customerName)}</td><td>{item.purpose}</td><td>{item.time}</td></tr>)}</tbody></table></div>
    </section>
  </>;
  return null;
}
