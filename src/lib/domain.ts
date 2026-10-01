import type { Appointment, AppointmentFilter, DashboardData, InventoryItem, PageId } from '../types.js';
export const pageLabels: Record<PageId, string> = {
  home: '홈', appointments: '예약·상담관리', customers: '고객관리', inventory: '스마트 재고',
  support: '상담지원', products: '상품관리', marketing: '마케팅', stores: '매장관리',
};
export function parsePage(hash: string): PageId {
  const value = hash.replace(/^#\/?/, '').split(/[?\/]/)[0];
  // v0.1의 운영 정보 링크는 새 매장관리 화면으로 연결합니다.
  if (value === 'operations') return 'stores';
  return Object.prototype.hasOwnProperty.call(pageLabels, value) ? value as PageId : 'home';
}
export function availableStock(item: InventoryItem): number { return Math.max(0, item.stock - item.reserved); }
export function getMetrics(data: DashboardData) {
  return {
    reservations: data.appointments.length,
    upcoming: data.appointments.filter(a => a.status === 'reserved').length,
    completed: data.appointments.filter(a => a.status === 'completed').length,
    inProgress: data.appointments.filter(a => a.status === 'in_progress').length,
    unreviewed: data.appointments.filter(a => a.briefing.status === 'ready' && !a.reviewed).length,
    lowStock: data.inventory.filter(i => availableStock(i) <= i.lowThreshold).length,
    returns: data.loans.filter(l => l.status === 'due_today' || l.status === 'overdue').length,
  };
}
export function filterAppointments(items: Appointment[], filter: AppointmentFilter, query: string): Appointment[] {
  const search = query.trim().toLocaleLowerCase('ko');
  return items.filter(item => (filter === 'all' || item.status === filter) &&
    (!search || [item.customerName, item.purpose, item.employee, item.time, item.phoneMasked].join(' ').toLocaleLowerCase('ko').includes(search)))
    .sort((a, b) => a.time.localeCompare(b.time));
}
export function markReviewed(data: DashboardData, id: string): DashboardData {
  return { ...data, appointments: data.appointments.map(item => item.id === id && item.briefing.status === 'ready' ? { ...item, reviewed: true } : item) };
}
export const statusLabels = { reserved: '방문 예정', in_progress: '상담 중', completed: '상담 완료' } as const;
