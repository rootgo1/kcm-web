export const inventoryPageSize = 5;

export interface InventoryPage<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
}

/** Only divides an already filtered UI list; inventory rows and rental policies remain unchanged. */
export function paginateInventory<T>(items: readonly T[], requestedPage: number): InventoryPage<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / inventoryPageSize));
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, totalPages) : 1;
  const offset = (page - 1) * inventoryPageSize;
  return { items: items.slice(offset, offset + inventoryPageSize), page, totalPages, totalItems: items.length };
}
