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
