# 스마트 재고 통합 기록 — 2026-10-06

스마트 재고 기능을 기존 최종 polish 위에 통합하고, 서버 매장 고정과 잘못된 성공 응답 차단을 보강했습니다. **자동 검사 392/392, 프런트·백엔드 타입 검사와 production build가 통과했습니다.** 실제 n8n·DB·알림·Retell 외부 연동 성공을 확인한 결과는 아닙니다.

## 통합 기준과 범위

| 항목 | 기록 |
|---|---|
| 작업 브랜치 | `integration/smart-inventory-final` |
| 기준 main | `bf84b62e13baa3c5c205773f70a87c9ed58b9f47` |
| 통합 feature | `origin/feature/smart-inventory` / `8484affa746b1e66c40b9b1711c9982175516bfa` |
| 병합 방식 | Fast-forward, 충돌 없음 |
| 자동 검증 | `npm.cmd run check`: **392/392 통과**, 프런트·백엔드 타입 검사 및 Vite production build 통과 |
| 재고 서버 개별 검증 | `node --test server/tests/inventory.test.mjs`: **21/21 통과** |
| 브라우저 검증 | Chrome에서 격리 n8n 응답 + production dist, 1920×1080 / 1366×768 / 390×844 직접 확인 |

읽기 전용 비교에서 기존 Retell Web Call·Monitor·SSE·위험 분석·상담 ID·상담 결과 n8n 전송 처리는 보존됨을 확인했습니다. 재고 API 연결과 서버 종료 시 재고 요청 정리만 추가했습니다. 기존 상품·고객·예약·상담지원·마케팅·매장 화면과 polish를 유지하며, 스마트 재고 분기와 재고 전용 표시를 연결했습니다.

이 문서 작성에서 실제 `.env` 값은 읽거나 출력하지 않았으며, 환경변수·환경설정·기존 SPEC·DB 문서를 수정하지 않았습니다.

## 서버 설정 의존성

| 변수 | 현재 코드의 역할 | 미설정·잘못된 설정 동작 |
|---|---|---|
| `N8N_INVENTORY_BASE_URL` | 서버가 사용하는 n8n 재고 Webhook 공통 base. 공백과 끝 `/`를 제거한 뒤 아래 endpoint를 **base 경로 뒤에 붙임** | 비어 있으면 정상 형식의 `/api/inventory/*` 요청에 **503 `INVENTORY_NOT_CONFIGURED`**. 값이 있지만 HTTPS URL 형식이 잘못되면 DB 호출을 하지 않고 **502 `DB_UNAVAILABLE`** |
| `KCM_DEMO_STORE_ID` | 기존 상담 전송 설정의 `demoStoreId`를 재고의 서버 home 매장으로 함께 사용. 형식은 `store_` + 숫자 3자리 이상 | 모든 재고·대여 변경은 미설정·잘못된 형식이면 **503 `HOME_STORE_NOT_CONFIGURED`**. `GET /rentals`도 `store_id`와 home이 모두 없으면 같은 503 |

base가 `https://<n8n-host>/<production-base>`라면 DB 주소는 `https://<n8n-host>/<production-base>/kcm-inventory-db`가 됩니다. base에 최종 `/kcm-inventory-db` endpoint를 넣는 방식이 아닙니다. root 경로로 치환하지 않고 기존 base 경로를 그대로 보존합니다. HTTPS만 허용하며 URL에 사용자명·비밀번호·query·fragment를 넣은 값은 거절합니다. 실제 주소와 ID는 이 문서에 기록하지 않습니다.

`GET /stores`와 `GET /stock`은 home 없이도 조회할 수 있습니다. `GET /stock?store_id=...`, `GET /rentals?store_id=...`의 유효한 타 매장 조회도 유지합니다. 잘못된 조회 매장 형식은 404 `STORE_NOT_FOUND`입니다.

**모든 변경의 실제 actor는 서버 home입니다.** 요청 body의 `store_id`를 생략하거나 home과 같은 값을 보낼 수 있고, 다른 값이면 403 `STORE_NOT_ALLOWED`입니다. 브라우저의 매장 선택이나 body 변경으로 타 매장의 actor를 대신할 수 없습니다. 이 고정은 운영 사용자 인증·매장별 로그인 권한 전체를 구현했다는 의미는 아닙니다.

`KCM_DEMO_STORE_ID`는 기존 상담 결과 전송에서도 사용하므로 재고만을 위해 별도 값으로 덮어쓰지 않습니다. 기존 상담용 `N8N_WEBHOOK_URL`의 계약은 재고 base와 별개로 유지합니다.

## API ↔ n8n DB action 계약

백엔드는 DB에 직접 접속하지 않습니다. 아래 모든 DB action은 **`POST <base>/kcm-inventory-db`**, `Content-Type: application/json`, `{ action, ...fields }` 형식입니다. 표의 home은 서버 설정에서 검증한 매장 ID입니다. 기존 DB 계약에서 `inventories`는 매장별 재고, `stocks`는 대여를 뜻합니다.

| 브라우저 API | n8n action | n8n으로 보내는 필드 | 응답·동작 |
|---|---|---|---|
| `GET /api/inventory/stores` | `GET_STORES` | 없음 | 매장 배열. `is_home`은 서버 home과 비교하여 표시 |
| `GET /api/inventory/stock?store_id=...` | `GET_INVENTORY` | `storeId`: 지정 매장 또는 미지정 시 `''` | 재고 배열. 화면 `quantity`는 가용 수량 `available` |
| `GET /api/inventory/rentals?store_id=...` | `GET_RENTALS` | `storeId`: 지정 매장 또는 home | 대여 배열. body actor가 아닌 조회 query 기준 |
| `POST /api/inventory/stock/adjust` | `ADJUST_INVENTORY` | `storeId: home`, `productId: body.model_id`, `stockQty: body.quantity` | 수정된 재고 한 행. 수량은 정수 0~9999 |
| `POST /api/inventory/rentals` | `CREATE_RENTAL` | `requestStoreId: home`, `productId: body.model_id`, `quantity`, 선택 `radiusKm: body.radius_km` | `{ rental, applied_radius_km, candidates }`. 수량은 정수 1~99, 지정 반경은 유한한 숫자 `0 < radius_km <= 50` |
| `POST /api/inventory/rentals/:id/approve` | `APPROVE_RENTAL` | `rentalId: :id`, `storeId: home` | 제공 매장이 actor. 반환 상태 `approved` 확인 |
| `POST /api/inventory/rentals/:id/cancel` | `CANCEL_RENTAL` | `rentalId: :id`, `storeId: home` | 요청 매장이 actor. 삭제 전 `requested` 행을 받아 API 상태를 `cancelled`로 표시 |
| `POST /api/inventory/rentals/:id/ship` | `SHIP_RENTAL` | `rentalId: :id`, `storeId: home` | 제공 매장이 actor. 반환 상태 `shipping` 확인 |
| `POST /api/inventory/rentals/:id/deliver` | `DELIVER_RENTAL` | `rentalId: :id`, `storeId: home` | 요청 매장이 actor. 반환 상태 `delivered` 확인 |
| `POST /api/inventory/rentals/:id/return` | `RETURN_RENTAL` | `rentalId: :id`, `storeId: home` | 제공 매장이 actor. 반환 상태 `returned` 확인 |

ID 형식은 매장 `store_\d{3,}`, 상품 `product_\d{3,}`, 대여 `stock_\d{3,}`입니다. `POST /api/inventory/reset`은 DB 모드에서 501 `NOT_IMPLEMENTED`이며, 알 수 없는 재고 경로는 404입니다. 변경 요청에는 허용된 Origin과 JSON 본문이 필요합니다. Origin이 없으면 403 `ORIGIN_REQUIRED`, JSON Content-Type이 아니면 415 `JSON_REQUIRED`, 올바른 JSON 객체가 아니면 400 `INVALID_REQUEST_BODY`입니다.

### n8n 응답과 방어 검사

- DB Webhook의 성공 envelope는 `{ ok: true, data }`, 실패는 `{ ok: false, code }`입니다. 단일 행 action은 `data`의 한 행 또는 배열의 첫 행을 사용하고, 행의 `code`가 `OK`가 아니면 오류로 처리합니다.
- 목록 응답은 배열이어야 합니다. 빈 조회의 `null`·빈 객체 항목은 제외하지만, 다른 불완전한 행을 성공 데이터로 표시하지 않습니다.
- 재고 필수 필드는 `storeId`, `productId`, `stockQty`, `reservedQty`, `transferQty`, `available`입니다. 수량은 모두 0 이상의 안전한 정수여야 합니다. 수정 응답의 매장·상품 ID도 요청과 일치해야 합니다.
- 대여 필수 필드는 `rentalId`, `productId`, `requestStoreId`, 양의 안전한 정수 `quantity`, 유효한 실제 배송·반납 상태입니다. 제공 매장 ID는 제공 매장이 필요한 상태에서 필수입니다. 생성·변경 응답은 요청 ID·실제 actor·예상 반환 상태와 일치해야 합니다.
- 상품명·매장명·직원 연락처 등 선택 표시 정보가 없다는 이유만으로 정상 행을 거절하지 않습니다. 직원 전화번호는 브라우저 응답에 포함하지 않고 서버의 알림 수신자 구성에만 사용합니다.
- 필수 필드·상태·요청 일치 검사에 실패하면 **502 `DB_UNAVAILABLE`**로 처리하고 알림을 보내지 않습니다. 이 검사는 외부 DB의 수량 계산식이나 동시 변경을 검증한 결과가 아닙니다.

| 오류 종류 | HTTP |
|---|---|
| `INVALID_QUANTITY`, `INVALID_RADIUS` | 400 |
| `STORE_NOT_ALLOWED` | 403 |
| `RENTAL_NOT_FOUND`, `INVENTORY_NOT_FOUND`, `STORE_NOT_FOUND`, `MODEL_NOT_FOUND` | 404 |
| `SAME_STORE`, `INVALID_RENTAL_STATUS`, `OUT_OF_STOCK`, `NO_LENDER_AVAILABLE` | 409 |
| `NOT_IMPLEMENTED` | 501 |
| `INVENTORY_NOT_CONFIGURED`, `HOME_STORE_NOT_CONFIGURED` | 503 |
| `DB_UNAVAILABLE` 및 알려지지 않은 n8n 오류 코드 | 502 |

DB 요청은 1회만 보내며 자동 재시도하지 않습니다. 기본 제한 시간은 10초, `CREATE_RENTAL`은 후보 매장 검색을 고려하여 25초입니다. 네트워크·timeout·비2xx·리디렉션·잘못된 envelope는 `DB_UNAVAILABLE`로 처리합니다. 서버 종료 시 진행 중 재고 요청을 취소합니다. 로그에 실제 URL·응답 본문·전화번호를 출력하지 않습니다.

## 대여 상태 응답 계약

| DB `deliveryStatus` | DB `returnStatus` | API `status` |
|---|---|---|
| `요청 중` | 미설정 | `requested` |
| `요청 승인` | 미설정 | `approved` |
| `배송 중` | 미설정 | `shipping` |
| `배송 완료` | 미설정 또는 `반납 전` | `delivered` |
| `배송 완료` | `반납 중` | `returning` |
| `배송 완료` | `반납 완료` | `returned` |

배송 완료 전에는 반납 상태를 허용하지 않습니다. `cancel`은 별도의 DB 배송 상태가 아니라 삭제된 요청의 마지막 행을 이용한 API 응답입니다. 취소도 HTTP POST이며, DB 모드의 DELETE는 405 `METHOD_NOT_ALLOWED`입니다. 각 action의 이전 상태·참여 매장·수량 변경 조건은 **n8n SQL이 최종 검사해야 하는 계약**이며, 서버가 해당 SQL이나 거래를 대신 실행하지 않습니다.

## 알림 endpoint·event 계약

알림은 성공 응답을 검증한 뒤 서버에서 보냅니다. 두 endpoint 모두 `POST <base><endpoint>`, JSON 본문이며 DB action envelope로 감싸지 않습니다.

| 발생 조건 | endpoint | event | 수신자 |
|---|---|---|---|
| 대여 요청 생성 | `/kcm-rental-status` | `RENTAL_REQUESTED` | n8n이 반환한 후보 매장들의 manager. 이름·전화번호와 선택 매장명·거리 포함 |
| 대여 승인 | `/kcm-rental-status` | `RENTAL_APPROVED` | 요청 매장의 requester |
| 발송 처리 | `/kcm-rental-status` | `RENTAL_SHIPPED` | 요청 매장의 requester |
| 반납 완료 처리 | `/kcm-rental-status` | `RENTAL_RETURNED` | 요청 매장의 requester |
| 재고 수정 또는 대여 승인으로 가용 수량이 새로 임계값을 통과 | `/kcm-inventory-changed` | `INVENTORY_CHANGED` | 해당 매장 manager. 승인 시 제공 매장 approver |
| 요청 취소·수령 처리 | 없음 | 없음 | 알림 없음 |

대여 payload는 `event`, `rentalId`, `productName`, `quantity`, 선택 `fromStore`, `toStore`, `recipients`입니다. 일반 수신자는 `{ name, phone }`이며 요청 생성의 후보 수신자에는 매장명과 숫자 거리를 추가할 수 있습니다.

재고 payload는 `event`, `storeName`, `productName`, 선택 `storageGb`·`color`, `stockQuantity`, `reservedQuantity`, `transferQuantity`, `threshold: 1`, `recipients`입니다. 가용 수량이 **이전 1 초과 → 이후 1 이하**일 때만 새 알림을 보냅니다. 계속 1 이하인 상태에는 반복 알림을 보내지 않습니다. 승인 응답의 선택 `provideInventory` 수량이 없거나 유효하지 않으면 재고 부족 알림은 생략합니다.

전화번호가 있는 수신자가 없으면 전송을 생략합니다. 알림은 응답 완료를 기다리지 않는 별도 요청이며 1회·10초 제한, 자동 재시도 없음입니다. 실패해도 이미 성공한 재고 API 응답을 되돌리지 않습니다. 알림 Webhook의 2xx는 HTTP 수신 확인이며 실제 문자·알림 배달 성공을 뜻하지 않습니다.

## 확인한 범위와 실제 연동 전 확인할 항목

자동 검사는 대역 n8n·로컬 HTTP·격리 데이터를 사용했습니다. 서버 actor 우회 차단, 필수 응답 검증, 잘못된 성공 응답의 알림 차단, 기존 action·알림 payload, 타 매장 조회, 기존 상담 회귀를 확인했습니다. **실제 n8n 실행·DB 읽기/쓰기·알림 수신·Retell 음성 통화 등 외부 테스트는 수행하지 않았습니다.**

실제 연동 전에는 다음을 확인해야 합니다.

1. Production base와 세 Webhook endpoint가 의도한 경로에 활성화되어 있고 위 action·JSON 응답 계약을 사용하는지 확인합니다.
2. n8n SQL의 상태 전이와 actor 조건, 취소의 삭제·마지막 행 반환, 동시에 승인할 때 첫 제공 매장만 확정되는 동작을 확인합니다.
3. 재고 수정·승인·발송·수령·반납의 stock/reserved/transfer/available 수량 계산, 음수 방지와 동시 변경 원자성을 확인합니다. DB 변경과 알림 POST가 하나의 원자적 거래라는 보장은 없습니다.
4. DB의 실제 ID·외래 키·유일성·수량·배송/반납 제약과 반환 필드가 서버 검사에 맞는지 확인합니다.
5. 후보 매장·요청자·제공자·관리자 수신자 정보와 실제 알림 수신을 확인합니다. 잘못된 수신자나 누락을 모의 성공으로 판단하지 않습니다.
6. 기존 Retell·Monitor·SSE·통화 종료 결과와 상담용 n8n 저장도 실제 환경에서 별도로 회귀 확인합니다.

## 브라우저 검증

- 1920×1080 / 1366×768에서는 재고·대여 표와 제목 controls의 가로 넘침이 없었습니다. 390×844에서는 매장 선택·대여 탭이 줄바꿈되고, 표 내부의 가로 스크롤을 유지합니다. 바깥 페이지 넘침·버튼 겹침은 없었습니다. 요청 모달은 화면 안에 들어오며 닫기/Escape와 모바일40px 클릭 영역을 확인했습니다.
- 격리 fixture에서 매장 목록/선택/읽기 전용, 수량 수정 성공/소수·예약 수량 제한/편집 취소, 저장 중 매장 전환의 지연 응답 분리, 대여 요청/승인/취소/배송/도착/반납 완료와 상태별 버튼을 확인했습니다. 첫 도착 모의 응답이 계약상 `delivered` 대신 `returning`을 반환하여 오류 처리됐고, fixture를 `반납 전`으로 수정한 뒤 정상 도착을 확인했습니다. 실제 n8n 응답이나 제품 정책을 변경하지 않았습니다.
- 빈 재고·DB 오류·복구, base 미설정503의 읽기 전용 참고 화면을 확인했습니다. 정상 재고 화면의 브라우저 오류 로그0입니다. 직원8메뉴와 고객 전화9개 route의 직접 진입/제목/title/빈 화면 없음을 확인했습니다. 실제 통화는 시작하지 않았습니다.
- 독립 HTML은 갱신했지만 HTTP 직접 진입이 브라우저의 `ERR_BLOCKED_BY_CLIENT`로 막혀 직접 실행 미검증입니다. production dist 검증 결과와 구분합니다. 캡처/fixture/log는 Git 제외 `.cache/inventory-integration/`에 있습니다.

실제 외부 연동 결과가 추가되기 전까지 자동 검사·모의 브라우저 통과를 운영 DB 저장·알림 배달·음성 통화 성공으로 해석하지 않습니다.
