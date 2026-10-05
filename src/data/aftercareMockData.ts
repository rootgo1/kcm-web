import type { ContactConsent } from '../lib/aftercare.js';

/** Frontend-only fictional consent fixtures; never actual consent or DB records. */
export const demoContactConsents: Readonly<Record<string, ContactConsent>> = {
  'DEMO-C001': 'granted', 'DEMO-C002': 'granted', 'DEMO-C003': 'unknown', 'DEMO-C004': 'declined',
  'CUSTOMER-001': 'granted', 'CUSTOMER-002': 'declined', 'CUSTOMER-003': 'granted', 'CUSTOMER-004': 'granted', 'CUSTOMER-005': 'unknown',
};
