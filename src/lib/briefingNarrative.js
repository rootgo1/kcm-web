// Only confirmed legacy placeholders are excluded; ordinary mentions of tests remain valid.
const legacyPlaceholders = new Set([
  'KCM AI 상담 DB 저장 테스트',
  'KCM AI 상담 연동 테스트 종료',
]);

/** @param {unknown} value */
export function isLegacyBriefingPlaceholder(value) {
  return typeof value === 'string'
    && legacyPlaceholders.has(value.normalize('NFC').trim().replace(/\s+/gu, ' '));
}

/** Display projection only. Never rewrite the stored narrative or invent a replacement summary.
 * @param {string | null} value
 * @returns {string | null}
 */
export function confirmedBriefingNarrative(value) {
  return isLegacyBriefingPlaceholder(value) ? null : value;
}
