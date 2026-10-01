import type { PageId } from '../types.js';

/** 홈은 대분류에 속하지 않는 단독 메뉴입니다. */
export const navigationGroups: { label: string; pages: PageId[] }[] = [
  { label: '고객관리', pages: ['appointments', 'customers'] },
  { label: '상담업무', pages: ['support', 'products'] },
  { label: '매장관리', pages: ['inventory', 'marketing', 'stores'] },
];
export const productTabs = [
  { id: 'plans', label: '요금제(자사/타사)' },
  { id: 'bundles', label: '결합정보' },
  { id: 'benefits', label: '혜택정보' },
  { id: 'devices', label: '제품정보' },
] as const;
export const storeTabs = [
  { id: 'store-info', label: '매장정보' },
  { id: 'staff-info', label: '직원정보' },
] as const;
export type ProductTabId = typeof productTabs[number]['id'];
export type StoreTabId = typeof storeTabs[number]['id'];
export function pageCategory(page: PageId): string {
  return navigationGroups.find(group => group.pages.includes(page))?.label ?? '홈';
}
