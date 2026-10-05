import type { DashboardData, PageId } from '../types';
import { ProductsPage } from './ProductsPage';
import { StoreManagementPage } from './StoreManagementPage';
import { Icon } from '../components/Icon';
import { InventoryPanel } from '../components/InventoryPanel';
import { LiveConsultations } from '../live/LiveConsultations';
import { maskCustomerName } from '../lib/customerName';
export function SecondaryPages({ page, data }: { page: PageId; data: DashboardData }) {
  if (page === 'inventory') return <><div className="page-heading"><div><span className="eyebrow">매장관리</span><h1>스마트 재고</h1><p>매장 재고와 반납 예정 내역을 확인하세요.</p></div><span className="small-badge">재고 현황</span></div><div className="inventory-page"><InventoryPanel data={data} expanded/><div className="card planned-card"><span className="small-icon red"><Icon name="truck"/></span><h2>매장 간 대여·반납</h2><p>재고 이동은 요청, 승인·배송,<br/>반납 순서로 진행합니다.</p><div className="flow-steps"><span>대여 요청</span><Icon name="chevron" size={14}/><span>승인·배송</span><Icon name="chevron" size={14}/><span>반납</span></div><div className="notice-inline"><Icon name="help" size={17}/><span>조회용 자료입니다. 수량 변경·알림 발송은 제공하지 않습니다.</span></div></div></div></>;
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
