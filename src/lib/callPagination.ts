export const CALLS_PER_PAGE = 5;

/** Filter first; pagination only selects visible rows and never changes call data. */
export function paginateCalls<T>(items: readonly T[], requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / CALLS_PER_PAGE));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(requestedPage) || 1));
  return {
    page,
    totalPages,
    items: items.slice((page - 1) * CALLS_PER_PAGE, page * CALLS_PER_PAGE),
  };
}
