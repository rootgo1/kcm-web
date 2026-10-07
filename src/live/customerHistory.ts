import { paginateCalls } from '../lib/callPagination.js';
import { liveCustomerHistory } from './livePresentation.js';
import type { LiveCall } from './types.js';

export type CustomerHistoryStatus = 'all' | LiveCall['status'];

/** Filters and pages affect visible rows only; the customer's latest result uses all received calls. */
export function customerCallHistory(calls: readonly LiveCall[], customerKey: string, status: CustomerHistoryStatus, requestedPage: number) {
  const groups = liveCustomerHistory(calls);
  const selectedGroup = groups.find(group => group.key === customerKey) ?? null;
  const selectedIds = new Set(selectedGroup?.calls.map(call => call.call_id));
  const customerCalls = customerKey ? calls.filter(call => selectedIds.has(call.call_id)) : calls;
  const filtered = customerCalls.slice().reverse()
    .sort((a, b) => (Date.parse(b.ended_at ?? b.started_at ?? b.updated_at) || 0) - (Date.parse(a.ended_at ?? a.started_at ?? a.updated_at) || 0))
    .filter(call => status === 'all' || call.status === status);
  return { groups, selectedGroup, filtered, pagination: paginateCalls(filtered, requestedPage) };
}
