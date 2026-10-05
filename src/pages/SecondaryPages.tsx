import type { DashboardData, PageId } from '../types';
import { ProductsPage } from './ProductsPage';
import { StoreManagementPage } from './StoreManagementPage';
import { SmartInventoryPage } from './SmartInventoryPage';
import { InventoryPanel } from '../components/InventoryPanel';
import { LiveConsultations } from '../live/LiveConsultations';
import { maskCustomerName } from '../lib/customerName';
export function SecondaryPages({ page, data }: { page: PageId; data: DashboardData }) {
  if (page === 'inventory') return <SmartInventoryPage fallback={<InventoryPanel data={data} expanded/>}/>;
  if (page === 'products') return <ProductsPage data={data}/>;
  if (page === 'stores') return <StoreManagementPage data={data}/>;
  if (page === 'customers') return <>
    <div className="page-heading"><div><span className="eyebrow">고객관리</span><h1>고객관리</h1><p>고객별 통화 이력과 방문 예약 정보를 확인하세요.</p></div><span className="small-badge">조회</span></div>
    <LiveConsultations view="history"/>
    <section className="card appointments-card" aria-label="방문 예약 고객"><div className="card-heading"><h2>방문 예약 고객</h2><span className="small-badge">예약 목록</span></div>
      <div className="table-scroll" role="region" aria-label="방문 예약 고객 목록" tabIndex={0}><table className="appointment-table"><thead><tr><th>예약 ID</th><th>고객</th><th>상담 목적</th><th>예약 시간</th></tr></thead><tbody>{data.appointments.map(item => <tr key={item.id}><td>{item.id}</td><td>{maskCustomerName(item.customerName)}</td><td>{item.purpose}</td><td>{item.time}</td></tr>)}</tbody></table></div>
      <p className="panel-note">방문 예약 정보는 상담 준비용 참고 자료입니다.</p>
    </section>
  </>;
  return null;
}
