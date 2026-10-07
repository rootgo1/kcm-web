/** 원본 이름을 변경하지 않는 화면 표시용 마스킹입니다. */
export function maskCustomerName(name: string | null | undefined): string {
  const letters = Array.from(name?.trim() ?? '');
  if (letters.length === 0) return '이름 미확인';
  if (letters.length === 1) return '*';
  if (letters.length === 2) return `${letters[0]}*`;
  return `${letters[0]}${'*'.repeat(letters.length - 2)}${letters[letters.length - 1]}`;
}

/** 확인된 테스트고객 마스킹만 중립 표시합니다. DTO·원본 이름·고객 ID는 변경하지 않습니다. */
export function storedCustomerDisplayName(nameMasked: string, customerId: string): string {
  if (nameMasked !== '테***객') return nameMasked;
  const id = /^customer_([0-9]{3,})$/.exec(customerId);
  return id ? `고객 ${id[1]}` : nameMasked;
}

/** 승인된 시연 고객 1명의 화면 표시만 구분합니다. 식별·조회·권한 판단에는 사용하지 않습니다. */
export function isDemoDisplayCustomer(customerId: string | null | undefined): boolean {
  return customerId === 'customer_9999';
}

/** 이름 없는 실시간 DTO의 시연 고객만 마스킹 표시합니다. 나머지 고객 식별자는 보존합니다. */
export function liveCustomerDisplayName(customerId: string | null | undefined, fallback = '고객 확인 전'): string {
  return isDemoDisplayCustomer(customerId) ? '정*민' : customerId || fallback;
}
