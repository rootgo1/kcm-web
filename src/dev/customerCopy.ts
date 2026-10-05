/** Translate existing controller notices for customers without changing call handling. */
export function customerCallNotice(message: string): string {
  if (!message) return '';
  if (/권한|허용/.test(message)) return '마이크 사용 권한이 필요합니다. 주소창의 사이트 권한에서 마이크를 허용한 뒤 다시 시작해 주세요.';
  if (/마이크/.test(message)) return '마이크를 사용할 수 없습니다. 장치 연결과 다른 앱의 마이크 사용 상태를 확인해 주세요.';
  if (/종료 처리/.test(message)) return '통화 종료를 확인하지 못했습니다. 이 탭을 닫아 마이크 연결을 해제해 주세요.';
  return '상담을 연결하지 못했습니다. 네트워크를 확인한 뒤 잠시 후 다시 시도해 주세요.';
}
