# KCM 최종 통합 검증 — 2026-10-06

## 병합 대상과 범위

| 항목 | commit |
| --- | --- |
| 기준 main | `86508324e33a59e4a74e508bb354f9ef09c86a96` |
| 실제 데이터 feature | `e557081695502f7f5d8ee1298091402513345f96` |
| 위험탐지 fix | `64507d9aec39fdbfe0561dc9b7266f8a6130d9de` |

통합 브랜치는 `integration/kcm-final-release`입니다. 첫 브랜치는 fast-forward,
두 번째 브랜치는 merge했습니다. STATUS.md 기록 충돌만 양쪽 내용을 보존해 해결했습니다.
기능 코드에는 충돌이나 통합을 위한 추가 수정을 하지 않았습니다.
기본 checkout의 사용자 변경, main, 기존 브랜치, Render, 실제 환경값과 외부 데이터는 보존했습니다.

실제 데이터 API·UI는 feature 원본, 위험 규칙·정책은 fix 원본과 동일합니다.
Retell/Monitor/SSE/RMS/최종화/기존 n8n 전송/스마트재고/고객 전화/배포 설정은 main의 구현을 유지합니다.

## 추가 통합 검증

`server/tests/final-release-integration.test.mjs`의 11개 검증은 하나의 Backend에서 다음 경로를 함께 실행합니다.

- 저장 예약·고객·상담 이력·사전 브리핑과 DB catalog/서버 가격 계산
- 재고의 GET_STORES/GET_INVENTORY/GET_RENTALS 모의 조회
- Fake Monitor WebSocket→실제 analyzer/store→HTTP SSE→최종 audio/점수 확정
- 동시 조회·SSE 재접속·분절/정정·공급자 오류 격리·동의/매장 범위·요청 보호

모든 업무 공급자는 합성 데이터로 주입하며 예기치 않은 외부 fetch는 차단합니다.
HTTP는 임시 loopback 서버만 사용하고 실제 .env는 읽지 않습니다.
전체 테스트 **683/683**, 실패·건너뜀0입니다. 프런트/백엔드 타입 검사와 production build가 통과했습니다.
기존 Retell SDK 청크 크기 경고는 유지합니다. 기존 테스트 삭제·약화는 없습니다.

| 시나리오 | 욕설 | 위협 | 항목 합계 | 최종 점수/등급 |
| --- | ---: | ---: | ---: | --- |
| 영상 기본 | 2 | 1 | 26 | 40 / 경계 |
| 영상 강한 버전 | 2 | 2 | 36 | 60 / 위험 |
| 너 찾아가서 팬다 | 0 | 1 | 20 | 40 / 경계 |
| 정상 매장 방문 | 0 | 0 | 0 | 0 / 정상 |

위협 3회 최소80·욕설 단독 최소20 및 전체 ASR 정정 사례는 보존된 기존 테스트에 포함됩니다.
점수는 통화별 독립 기록이며 데이터 조회나 다른 통화 기록을 열어도 재계산해 덮어쓰지 않습니다.

## 브라우저 확인과 한계

격리 Backend와 production dist로 home/appointments/customers/support/products/inventory/marketing/stores/retell-test
9개 route의 직접 진입·기본 표시·메뉴 이동·직원/고객 title를 확인했습니다.
저장 예약/브리핑·마스킹 고객/동의 제한·상품 자료와 SSE 통화 기록이 함께 동작했습니다.
55,000−3,000=52,000원 소계와 확인 필요인 총부담, 재고/매장/보낸 요청 조회,
위 표의 통화별 최종 점수·Agent 배지 제외를 확인했습니다.
이번 검증 탭 console error/warn0, 기본 viewport 바깥 가로 넘침 없음, 고객 avatar점0입니다.
전체 업무 버튼·여러 해상도의 전수 검증은 이번에 반복하지 않았습니다.

독립 미리보기 HTML은 최신 src로 재생성했지만 직접 실행하지 않았습니다.
합성 통화의 n8n failed는 URL 미설정 검증 환경의 예상 결과이며 실제 Production 전송 판단이 아닙니다.
임시 서버와 브라우저 탭은 정상 종료했습니다.

## 배포 전에 남은 확인

- 공개 배포의 직원 인증 부재: 개인자료 API/고객 지정 가격 계산의503 `REAL_DATA_ACCESS_RESTRICTED` 보호 유지
- 서버 SUPABASE_URL/SUPABASE_READ_KEY 설정·읽기 권한/RLS·실제 REST 조회 검증
- 실제 Retell 음성/STT/고성·customer_9999 반복·최종 위험점수와 n8n/Supabase 저장 E2E
- Production 스마트재고 조회와 승인된 별도 데이터 변경 검증
- 통합본 검토 후 별도 main 병합·Render 배포

이번 작업에서 실제 전화·Production DB 요청/변경·n8n workflow·Render 설정/환경변수/배포는 실행하지 않았습니다.
