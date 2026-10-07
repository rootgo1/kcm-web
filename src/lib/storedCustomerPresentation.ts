import type { StoredConsultation } from '../services/realDataApi.js';

/** A display-only choice: never recalculate risk or substitute an older scored call. */
export function latestCompletedStoredConsultation(items: readonly StoredConsultation[], customerId: string): StoredConsultation | undefined {
  return items.filter(item => item.customerId === customerId && item.status === '완료')
    .slice().reverse().sort((a, b) => Date.parse(b.endedAt ?? b.startedAt) - Date.parse(a.endedAt ?? a.startedAt))[0];
}
