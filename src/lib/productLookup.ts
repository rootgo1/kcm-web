import type { CatalogItem, ProductCarrier } from '../data/productCatalog.js';
import type { ProductTabId } from './navigation.js';

function normalized(value: string): string { return value.normalize('NFKC').toLocaleLowerCase('ko-KR').trim(); }

export function filterProducts(items: readonly CatalogItem[], tab: ProductTabId, query: string, carrier: ProductCarrier): CatalogItem[] {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (item.tab !== tab || (tab === 'plans' && item.plan?.carrier !== carrier)) return false;
    const searchable = normalized([item.name, item.summary, item.tag, ...item.sections.flatMap(section => [section.title, ...section.fields.flatMap(field => [field.label, field.value])])].join(' '));
    return terms.every(term => searchable.includes(term));
  });
}

export const productPageSize = 5;

/** Paginate an already filtered list and keep its page valid when that list changes. */
export function paginateProducts(items: readonly CatalogItem[], requestedPage: number): { items: CatalogItem[]; page: number; totalPages: number; totalItems: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / productPageSize));
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, totalPages) : 1;
  const offset = (page - 1) * productPageSize;
  return { items: items.slice(offset, offset + productPageSize), page, totalPages, totalItems: items.length };
}

/** Selection always belongs to the visible list; empty search results have no stale detail. */
export function selectedProduct(items: readonly CatalogItem[], id: string | undefined): CatalogItem | undefined {
  return items.find(item => item.id === id) ?? items[0];
}

export const maxComparedPlans = 3;
/** Returns unchanged selection for non-plans and a full comparison. Never mutates the input. */
export function toggleComparedPlan(items: readonly CatalogItem[], selectedIds: readonly string[], id: string): string[] {
  const validIds = [...new Set(selectedIds)].filter(selected => items.some(item => item.id === selected && item.tab === 'plans' && item.plan));
  if (validIds.includes(id)) return validIds.filter(selected => selected !== id);
  if (validIds.length >= maxComparedPlans || !items.some(item => item.id === id && item.tab === 'plans' && item.plan)) return validIds;
  return [...validIds, id];
}
