import type { DashboardData, PageId } from '../types';
import { pageLabels } from '../lib/domain';
import { pageCategory } from '../lib/navigation';
import { ProductsPage } from './ProductsPage';
import { StoreManagementPage } from './StoreManagementPage';
import { Icon, type IconName } from '../components/Icon';
import { InventoryPanel } from '../components/InventoryPanel';
import { LiveConsultations } from '../live/LiveConsultations';
import { maskCustomerName } from '../lib/customerName';
const definitions: Partial<Record<PageId, { icon: IconName; title: string; desc: string; features: string[] }>> = {
  support: { icon: 'message', title: '상담에 필요한 정보를 빠르게', desc: '상담 전 브리핑과 통화 위험 신호를 확인하고 필요한 경우 관리자 지원을 요청하세요.', features: ['브리핑의 문의 내용과 AI 안내 확인', '위험 신호의 근거와 발생 시점 확인', '데모 상담 패널에서 관리자 지원 요청·처리'] },
  marketing: { icon: 'megaphone', title: '상담 이후의 고객 관리까지', desc: '완료 상담의 후속 조치 메모를 검토할 때 사용하는 확인 사항입니다.', features: ['추가 확인이 필요한 상담 내용 검토', '고객의 연락 동의와 안내 필요성 확인', '처리 결과에 후속 안내 메모 기록'] },
};
export function SecondaryPages({ page, data, onHome }: { page: PageId; data: DashboardData; onHome: () => void }) {
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
  const config = definitions[page];
  if (!config) return null;
  return <><div className="page-heading"><div><span className="eyebrow">{pageCategory(page)}</span><h1>{pageLabels[page]}</h1><p>{page === 'support' ? '직원 보호와 상담 대응을 위한 확인 사항입니다.' : '후속 안내 전 확인할 내용을 정리합니다.'}</p></div><span className="status-pill neutral">업무 참고</span></div><section className="card placeholder-page"><div className="placeholder-mark"><Icon name={config.icon} size={34}/></div><span className="eyebrow">상담 체크리스트</span><h2>{config.title}</h2><p>{config.desc}</p><div className="feature-list">{config.features.map(feature => <div key={feature}><Icon name="check" size={16}/><span>{feature}</span></div>)}</div><div className="placeholder-note">{page === 'support' ? '팀 시연용 참고 안내입니다. KT 공식 대응 매뉴얼이 아니며, 실제 관리자 알림은 전송하지 않습니다.' : '안내 문구·대상 자동 생성과 문자 발송은 연결하지 않았습니다. 고객 연락은 이 화면에서 실행되지 않습니다.'}</div><button className="button button-secondary" onClick={onHome}>대시보드에서 상담 확인<Icon name="arrow" size={16}/></button></section></>;
}
