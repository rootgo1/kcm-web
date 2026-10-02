/** Numeric, monotonic IDs for the current single-process demo (not a DB sequence). */
export function createConsultationIdFactory(/** @type {() => number} */ now = Date.now) {
  let last = 0;
  return () => {
    last = Math.max(now(), last + 1);
    return `consultation_${last}`;
  };
}

export const createConsultationId = createConsultationIdFactory();
