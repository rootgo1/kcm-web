# 최종 Production 비파괴 진단 — 2026-10-06

## 결론과 작업 경계

현재 Production 스마트재고 조회는 정상입니다. 이전 `502 DB_UNAVAILABLE`은 Render 로그의 **upstream `HTTP_404`**와 연결됩니다. 당시 Webhook 경로 등록·게시 문제(A)가 유력하지만, 미게시인지 잘못된 경로인지까지는 확정하지 않았습니다. 현재 DB 자격증명·query·응답 계약 오류를 뒷받침하는 증거는 없습니다.

고객 전화 avatar의 작은 상태 점만 제거했습니다. 상태 텍스트 옆의 별도 표시와 전화 원형·중앙 아이콘·버튼은 유지합니다. 업무 코드, 실제 환경값, n8n workflow, DB 데이터, main, Render 배포는 변경하지 않았습니다. Production은 계속 `eef5648758d3358bb856bf11b43c7f714d3103da`이며 **아직 점이 표시됩니다**. 아래 수정 검증은 격리된 로컬 코드 기준입니다.

기존 작업 폴더의 사용자 `STATUS.md` 변경과 미추적 산출물을 보존하기 위해 같은 저장소의 별도 worktree에서 `fix/final-production-diagnostics`를 만들었습니다. 테스트 fixture·응답 요약·캡처는 Git 제외 `.cache/production-diagnostics/`에만 기록하며 실제 응답·비밀값은 저장하지 않았습니다.

## Production API 읽기 결과

각 요청은 재시도 없이 1회 실행했습니다. 응답 내용 대신 HTTP·고정 코드·배열 구조만 기록했습니다.

| 요청 | HTTP | 안전 결과 |
|---|---:|---|
| GET `/health` | 200 | 정상 |
| GET `/retell/config` | 200 | `configured: true`; 실제 통화 성공 판정 아님 |
| GET `/api/inventory/stores` | 200 | 매장 배열 5개 |
| GET `/api/inventory/stock?store_id=store_005` | 200 | 재고 배열 12개 |
| GET `/api/inventory/rentals` | 200 | 대여 배열 27개 |
| n8n POST `GET_STORES` | 200 | `{ok:true,data:배열}`; 필수 행 5/5 유효 |
| n8n POST `GET_INVENTORY`, `storeId: store_005` | 200 | 같은 계약; 필수 행 12/12 유효 |
| n8n POST `GET_RENTALS`, `storeId: store_005` | 200 | 같은 계약; 필수 행 27/27 유효 |

공개 재고 조회는 약 5.1~5.3초, 직접 n8n 조회는 약 0.9~1.5초였습니다. 한 번의 관측값이며 원인·성능 보장이 아닙니다. 조회 외 action, 알림 endpoint, 실제 Retell 통화, 상담 저장 Webhook, Supabase 접근은 실행하지 않았습니다.

## DB_UNAVAILABLE 코드 경로

`server/inventory.mjs`의 현재 계약을 변경 없이 확인했습니다.

- 설정을 trim하고 끝의 `/`를 제거한 base에 고정 `/kcm-inventory-db`를 붙입니다. 사용자가 지정한 base의 결과가 요청한 Production DB Webhook 경로와 일치함을 확인했습니다. HTTPS만 허용하며 URL의 사용자정보·query·fragment는 거절합니다.
- `POST`, `Content-Type: application/json`, `{action,...fields}`이며 읽기 요청의 매장 필드는 `storeId`입니다. 본문에 별도 `body` wrapper를 넣지 않습니다. 리디렉션을 따라가지 않으며 재시도하지 않습니다.
- 읽기 timeout은 10초입니다. URL 오류, 네트워크 실패, 서버 종료, timeout, 비2xx(리디렉션 포함), JSON 파싱 실패, 성공·오류 envelope 불일치는 `DB_UNAVAILABLE`로 통합됩니다.
- `{ok:true,data}` 이후에도 `data`가 배열이 아니거나 필수 행 검증이 실패하면 같은 502가 됩니다. 빈 결과 placeholder는 제외하지만 잘못된 ID·모델·안전하지 않은 수량·필수 상태 등은 성공 데이터로 취급하지 않습니다.
- upstream `{ok:false,code}`는 허용된 대문자 코드 형식일 때 전달되며, 알려진 코드만 지정 HTTP로 매핑됩니다. 알 수 없는 오류 코드의 기본 HTTP는 502입니다.
- 변경 action의 단일 행·ID·actor·상태 결과 검증 실패도 해당 오류 경로에 포함됩니다. 이는 코드만 확인했으며 실제 변경 요청을 실행하지 않았습니다.
- base 미설정은 503 `INVENTORY_NOT_CONFIGURED`입니다. home 매장 누락·형식 오류는 해당 API에서 503 `HOME_STORE_NOT_CONFIGURED`로 구분됩니다.

## Render 로그와 원인 분류

최신 배포는 위 eef5648 SHA, `Live`·`Deploy succeeded`·`Build successful`입니다. runtime `Application logs / Last hour`에서 10월 6일 표시 시각 **12:53:37~13:24:36**, `GET_STORES`·`GET_RENTALS` 실패 **18건의 `HTTP_404`**를 확인했습니다. 시간대는 UI 표시 기준이며 별도 변환하지 않았습니다. URL·응답 본문·credential은 복사하지 않았습니다.

| 분류 | 현재 판단 |
|---|---|
| A 미게시/404 | 과거 404 로그에 근거한 유력 범위. 현재 endpoint는 200 |
| B workflow 오류 | 현재 조회에서 미관측 |
| C DB credential/query | 현재 조회에서 미관측; `DB_UNAVAILABLE` 이름만으로 DB 오류라고 단정 불가 |
| D 응답 형식 | 현재 envelope·필수 행 모두 유효 |
| E timeout | 현재 조회에서 미관측 |
| F KCM backend 계약 | 현재 공개 API·직접 n8n 응답 모두 통과 |
| G 기타 | 과거 404의 세부 원인은 미확정 |

n8n 담당자는 **당시 배포 시각과 Production endpoint 등록/게시 상태, POST path, 실제 실행 시작 여부**를 대조해야 합니다. 실행 자체가 없었다면 URL/등록을, 실행이 있었다면 종료 상태·Respond to Webhook·DB 노드 오류를 확인합니다. 이번 작업에서는 workflow를 열어 수정하거나 Publish하지 않았습니다. 현재 성공을 과거 원인 해결 행위로 보고하지 않습니다.

## 메시지 채널 오류 6건

이전의 비동기 응답 대기 후 메시지 채널 종료 문구는 Chromium의 확장 메시지 계층에서 사용하는 오류입니다. KCM 소스·주요 runtime 의존성에서 관련 확장 메시지 API·문구 사용은 발견되지 않았습니다. **확장/브라우저 통합 계층으로 분류하되, 특정 확장이나 영향 없는 warning으로 단정하지 않습니다.**

이번 새 Production 탭의 9개 route 확인에서는 콘솔 error/warning **0/0**, 해당 오류는 재현되지 않았습니다. 이전 6건의 전체 stack·확장 context는 확보하지 못해 구체 발신자는 미확정입니다. 재발 시 같은 시각의 source/stack·실행 context와 KCM HTTP/SSE 실패 여부를 대조합니다. 로그를 숨기거나 확장을 비활성화하는 변경은 하지 않았습니다.

근거: [Chrome 메시지 채널 문서](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [Chromium CloseChannel 구현](https://github.com/chromium/chromium/blob/main/extensions/browser/api/messaging/extension_message_port.cc), [Chromium SendMessageDisconnect 테스트](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/extensions/api/messaging/messaging_apitest.cc).

## UI와 자동 검증

- 제거: `src/dev/RetellTestPage.tsx`의 `.retell-avatar-dot` 요소 1개와 `src/dev/retell-test.css`의 기본/live 규칙 2개. 기존 `.retell-status-dot`는 유지합니다. 통화·마이크·분석 handler 변경 0입니다.
- `npm.cmd run check`: **392/392 통과**, 실패·건너뜀 0. 프런트 `tsc --noEmit`, 백엔드 `tsc -p tsconfig.server.json`, Vite production build 성공. SDK 청크 500kB 경고는 기존과 동일합니다.
- 기존 테스트를 삭제·수정·약화하지 않았습니다. 최소 DOM 요소 삭제는 별도 구현 복제 unit test 대신 아래 직접 UI 검증으로 확인했습니다.
- 외부 접속·실제 마이크가 없는 SDK/오디오 fixture로 **1920×1080, 1366×768, 390×844, 320×720** CSS viewport에서 대기→연결→통화→종료 중→종료→재상담을 확인했습니다. 각 상태의 avatar 점 0개, 별도 상태 표시 1개, 중앙 정렬·50% 원형 유지, 버튼 위치 변화·바깥 overflow·세로 스크롤 증가 0입니다. 종료 후 fixture track/AudioContext는 0/0입니다. 실제 Retell 동작 성공으로 확대하지 않습니다.
- 같은 네 CSS 화면 크기에서 현재 Production 대기 화면과 수정본을 비교해 avatar·버튼 위치(1px 이내)와 문서 스크롤 크기가 유지됨을 확인했습니다. 배포본 점 1개와 수정본 점 0개를 구분했습니다. 측정 과정의 사이트별 배율 차이는 실제 CSS viewport를 읽어 보정했으며 사용자 배율 설정은 바꾸지 않았습니다.
- 브라우저의 기존 배율을 바꾸지 않고 viewport override만 보정해 CSS 화면 크기를 확인했으며 검증 후 override를 해제합니다. 첫 비동기 locator 대기 제한은 실제 UI가 정상 전환된 것을 확인한 뒤 결정적인 fixture 상태 제어로 검증했습니다. 제품 코드 오류로 오인해 수정하지 않았습니다.
- `npm.cmd run preview:standalone`으로 `00_KCM_미리보기.html`을 갱신했습니다. 직원용 독립 HTML의 직접 실행은 이번에 미검증이며 고객 전화 화면 검증과 구분합니다.

## Production route smoke test

접속과 표시만 확인했으며 업무 저장·통화 시작·재고 변경 버튼은 누르지 않았습니다.

| route | 결과 |
|---|---|
| `#/home` | 대시보드·현황·목록 표시 |
| `#/appointments` | 예약·상담 화면 표시 |
| `#/customers` | 고객관리 표시 |
| `#/support` | 통화·지원 화면 표시 |
| `#/products` | 상품관리 표시 |
| `#/inventory` | 로딩 후 재고·대여 표 2개, 18행, 오류 안내 없음 |
| `#/marketing` | 사후관리 목록 표시 |
| `#/stores` | 매장정보·직원정보 탭 표시 |
| `#/retell-test` | 대기 화면·고객 title 표시. Production avatar 점은 아직 1개 |

9개 모두 빈 화면·로그인창·관측 runtime 오류 없이 표시됩니다. 이 smoke는 전체 실제 업무 E2E나 변경 action 검증을 대신하지 않습니다.

## 내일 인계

[단계별 E2E 체크리스트](FINAL_PRODUCTION_E2E_CHECKLIST.md)에 기대 결과와 실패 확인 위치를 기록했습니다. 현재 화면 촬영 자체를 막는 재고 502는 재현되지 않았지만, 실제 통화·n8n 저장·Supabase 전문/요약 및 재고 변경 동작은 아직 미검증입니다. 제공 매장 역할의 처리 환경이 없으면 승인·배송·반납 E2E를 대신 실행할 수 없습니다.

다음 순서: (1) 이 브랜치의 UI 수정 검토 후 별도 main/배포 작업, (2) `customer_9999` 실제 통화 A~D 및 재고 조회 gate, (3) 담당자와 승인된 요청·제공 매장으로 재고 E1~E5 확인 후 촬영. 이번 작업에는 해당 실행을 포함하지 않습니다.
