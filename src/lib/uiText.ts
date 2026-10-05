/** Presentation only: preserve the original records and their identifiers. */
export function uiText(value: string): string {
  return value
    .replace('어떤 상담을 도와드릴까요? 이 대화는 화면 검토용 가상 예시입니다.', '어떤 상담을 도와드릴까요?')
    .replace('동일 고객의 다음 통화 가상 샘플입니다. ', '')
    .replace('관리자 지원 요청이 미처리 상태인 가상 예시입니다.', '관리자 지원 요청을 기다리고 있습니다.')
    .replace(/\s*\((?:데모 직원|데모|가상 샘플|가상 주소|고성 예시|예시)\)/g, '')
    .replace(/샘플 고객/g, '고객')
    .replace(/데모 직원/g, '직원')
    .replace(/데모 관리자/g, '지원 담당')
    .replace(/\s*데모점/g, '점')
    .trim();
}
