/** Display notices only; never expose or rewrite the received error or call record. */
export function liveConnectionNotice(error: string | null | undefined): string {
  return error ? '통화 상태를 확인하지 못했습니다. 실제 통화 종료 여부는 별도로 확인해 주세요.' : '';
}

export function liveFinalizationNotice(reason: string | null | undefined): string {
  switch (reason) {
    case null:
    case undefined:
    case '':
      return '최종 위험도 정보를 기다리고 있습니다.';
    case '텍스트 분석 확인 필요 · 점수 보류':
      return '대화 분석 정보가 부족해 최종 위험도 확정을 보류합니다.';
    case '고성 최종 상태 수신 대기 · 점수 보류':
      return '통화 종료 후 음성 측정 결과를 기다리고 있습니다. 최종 위험도는 보류됩니다.';
    case '마이크 미측정·중단 구간 있음 · 점수 보류':
      return '일부 음성 구간을 측정하지 못해 최종 위험도 확정을 보류합니다.';
    default:
      return '최종 위험도 확인이 필요합니다. 수신 기록과 연결 상태를 확인해 주세요.';
  }
}
