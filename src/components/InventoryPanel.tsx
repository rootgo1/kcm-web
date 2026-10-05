import type { DashboardData } from '../types';
import { availableStock } from '../lib/domain';
import { Icon } from './Icon';
import { uiText } from '../lib/uiText';
export function InventoryPanel({ data, expanded = false, onOpen }: { data: DashboardData; expanded?: boolean; onOpen?: () => void }) {
  return <section className="card inventory-card"><div className="card-heading"><div className="title-with-icon"><span className="small-icon gray"><Icon name="box" size={18}/></span><h2>재고·반납 확인</h2></div>{onOpen && <button className="text-button" onClick={onOpen}>상세 보기<Icon name="chevron" size={14}/></button>}</div>
    <div className="inventory-list">{data.inventory.filter(i => expanded || availableStock(i) <= i.lowThreshold).map(item => <div className="inventory-item" key={item.id}><span className="device-icon"><Icon name="phone" size={18}/></span><div className="inventory-name"><strong>{item.name}</strong><small>{item.variant}</small></div><div className="inventory-count"><strong>{availableStock(item)}<small> 대</small></strong><span>가용 재고</span></div><span className={`status-pill ${availableStock(item) === 0 ? 'danger' : availableStock(item) <= item.lowThreshold ? 'warning' : 'completed'}`}>{availableStock(item) === 0 ? '재고 없음' : availableStock(item) <= item.lowThreshold ? '재고 부족' : '정상'}</span></div>)}</div>
    <div className="loan-list">{data.loans.map(loan => <div className="loan-notice" key={loan.id}><span className="small-icon amber"><Icon name="truck" size={19}/></span><div><strong>{loan.device} {loan.quantity}대 <span>반납 예정</span></strong><p>{uiText(loan.store)} <span>·</span> {loan.deadline}까지</p></div><span className="loan-tag">D-day</span></div>)}</div><p className="panel-note">수량은 참고 자료이며, 대여·반납은 담당자 확인이 필요합니다.</p>
  </section>;
}
